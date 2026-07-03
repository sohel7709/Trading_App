'use strict';

// Central order-execution + trigger engine.
//
// Every equity order (MARKET, LIMIT, SL, SL-M) funnels through
// `applyEquityFill` for the holdings/positions/wallet mutation, and through
// `executeOrder` for the order-document lifecycle (EXECUTED + trade record +
// broadcast). MARKET orders call `executeOrder` immediately; LIMIT/SL/SL-M
// orders are saved PENDING and picked up by `evaluatePendingOrders`, which
// runs on every fast market tick.

const { HoldingsModel }  = require('./model/HoldingsModel');
const { PositionsModel } = require('./model/PositionsModel');
const { OrdersModel }    = require('./model/OrdersModel');
const { TradeModel }     = require('./model/TradeModel');
const { WalletModel }    = require('./model/WalletModel');
const { PriceAlertModel } = require('./model/PriceAlertModel');
const { ClosedPositionModel } = require('./model/ClosedPositionModel');
const marketDataService  = require('./marketDataService');
const { calcCharges, equitySegment } = require('./chargesService');
const rules = require('./marketRules');

let _io = null;
function init(io) { _io = io; }

class OrderRejectedError extends Error {}

// Blocked margin = funds reserved by resting PENDING BUY orders. Recomputed
// fresh (not incrementally tracked) so it can never drift, same pattern the
// codebase already uses for usedMargin vs holdings cost basis.
async function recomputeBlockedMargin(wallet) {
    const w = wallet || await WalletModel.findOne({});
    if (!w) return null;
    const pending = await OrdersModel.find({ status: 'PENDING', side: 'BUY' });
    const blocked = pending.reduce((s, o) => {
        const notional = o.quantity * o.price;
        return s + (o.productType === 'MIS' ? notional / rules.MIS_LEVERAGE : notional);
    }, 0);
    w.blockedMargin = Math.round(blocked);
    w.availableMargin = Math.max(0, w.balance - w.usedMargin - (w.misMargin || 0) - (w.optionMargin || 0) - w.blockedMargin);
    await w.save();
    return w;
}

// ─── Holdings / positions mutation ────────────────────────────────────────

// Frozen snapshot for the Positions screen's "squared off" section — taken
// the instant a leg fully closes (quantity nets to zero). Never recomputed
// afterwards, so it stays exactly what was booked at close time even though
// the live trade log / total P&L keeps evolving with the rest of the day.
async function recordClosedEquityPosition({ symbol, productType, quantity, avgPrice, exitPrice, pnl }) {
    try {
        await new ClosedPositionModel({
            kind: 'equity', symbol, productType, quantity, avgPrice, exitPrice,
            pnl: Math.round(pnl * 100) / 100, dateStr: rules.istDateStr(),
        }).save();
    } catch (e) { console.error('[OrderEngine] recordClosedEquityPosition error:', e.message); }
}

async function applyEquityFillCNC(side, symbol, quantity, execPrice) {
    let realizedPnl = 0;
    if (side === 'BUY') {
        let holding = await HoldingsModel.findOne({ stockSymbol: symbol });
        const today = rules.istNow();
        if (holding) {
            const totalQty = holding.quantity + quantity;
            holding.avgPrice = Math.round(((holding.avgPrice * holding.quantity) + (execPrice * quantity)) / totalQty * 100) / 100;
            holding.quantity = totalQty;
            holding.ltp = marketDataService.getStockPrice(symbol)?.ltp ?? execPrice;
            // Freshly bought quantity joins T1 (unsettled) — rolls to sellable at next BOD prep
            holding.t1Quantity = (holding.t1Quantity || 0) + quantity;
            holding.t1Date = today;
        } else {
            holding = new HoldingsModel({
                stockSymbol: symbol, quantity, avgPrice: execPrice,
                ltp: marketDataService.getStockPrice(symbol)?.ltp ?? execPrice,
                productType: 'CNC', t1Quantity: quantity, t1Date: today,
            });
        }
        await holding.save();
    } else {
        const holding = await HoldingsModel.findOne({ stockSymbol: symbol });
        if (!holding) {
            throw new OrderRejectedError(`Insufficient holdings — you don't own ${symbol}. Naked short selling isn't allowed for delivery (CNC).`);
        }
        const sellable = holding.quantity - (holding.t1Quantity || 0);
        if (quantity > holding.quantity) {
            throw new OrderRejectedError(`Cannot sell ${quantity} — you only hold ${holding.quantity} of ${symbol}.`);
        }
        if (quantity > sellable) {
            throw new OrderRejectedError(`${holding.t1Quantity} of your ${symbol} shares are in T1 settlement and can't be sold until tomorrow. Max sellable: ${sellable}.`);
        }
        realizedPnl = (execPrice - holding.avgPrice) * quantity;
        holding.quantity -= quantity;
        // Selling settled quantity first; only reduce t1Quantity if it would otherwise exceed the new total
        holding.t1Quantity = Math.min(holding.t1Quantity || 0, holding.quantity);
        if (holding.quantity <= 0) {
            await HoldingsModel.deleteOne({ _id: holding._id });
        } else {
            await holding.save();
        }
    }
    return realizedPnl;
}

// MIS supports genuine long AND short positions (quantity can go negative).
async function applyEquityFillMIS(side, symbol, quantity, execPrice) {
    let realizedPnl = 0;
    let position = await PositionsModel.findOne({ stockSymbol: symbol, productType: 'MIS' });

    if (side === 'BUY') {
        if (position && position.quantity < 0) {
            // Covering (part or all of) an existing short
            const shortQty = Math.abs(position.quantity);
            const coverQty = Math.min(quantity, shortQty);
            const coverPnl = (position.avgPrice - execPrice) * coverQty;
            realizedPnl += coverPnl;
            const overflow = quantity - shortQty;
            const oldAvgPrice = position.avgPrice;
            if (overflow > 0) {
                // Fully covered the short and bought through into a new long
                await recordClosedEquityPosition({
                    symbol, productType: 'MIS', quantity: -shortQty,
                    avgPrice: oldAvgPrice, exitPrice: execPrice, pnl: coverPnl,
                });
                position.quantity = overflow;
                position.avgPrice = execPrice;
            } else {
                position.quantity += quantity; // still <= 0
            }
            position.ltp = execPrice;
            if (position.quantity === 0) {
                await recordClosedEquityPosition({
                    symbol, productType: 'MIS', quantity: -shortQty,
                    avgPrice: oldAvgPrice, exitPrice: execPrice, pnl: coverPnl,
                });
                await PositionsModel.deleteOne({ _id: position._id });
            } else await position.save();
        } else if (position) {
            // Adding to an existing long
            const totalQty = position.quantity + quantity;
            position.avgPrice = ((position.avgPrice * position.quantity) + (execPrice * quantity)) / totalQty;
            position.quantity = totalQty;
            position.ltp = execPrice;
            await position.save();
        } else {
            await new PositionsModel({
                stockSymbol: symbol, quantity, avgPrice: execPrice, ltp: execPrice,
                productType: 'MIS', isIntraday: true,
            }).save();
        }
    } else {
        // SELL
        if (position && position.quantity > 0) {
            const closeQty = Math.min(quantity, position.quantity);
            const closePnl = (execPrice - position.avgPrice) * closeQty;
            realizedPnl += closePnl;
            const remainder = quantity - position.quantity;
            const oldAvgPrice = position.avgPrice;
            if (remainder > 0) {
                // Sold through the whole long into a fresh short
                await recordClosedEquityPosition({
                    symbol, productType: 'MIS', quantity: closeQty,
                    avgPrice: oldAvgPrice, exitPrice: execPrice, pnl: closePnl,
                });
                await PositionsModel.deleteOne({ _id: position._id });
                await new PositionsModel({
                    stockSymbol: symbol, quantity: -remainder, avgPrice: execPrice, ltp: execPrice,
                    productType: 'MIS', isIntraday: true,
                }).save();
            } else {
                position.quantity -= quantity;
                position.ltp = execPrice;
                if (position.quantity === 0) {
                    await recordClosedEquityPosition({
                        symbol, productType: 'MIS', quantity: closeQty,
                        avgPrice: oldAvgPrice, exitPrice: execPrice, pnl: closePnl,
                    });
                    await PositionsModel.deleteOne({ _id: position._id });
                } else await position.save();
            }
        } else if (position) {
            // Extending an existing short
            const newAbsQty = Math.abs(position.quantity) + quantity;
            position.avgPrice = ((position.avgPrice * Math.abs(position.quantity)) + (execPrice * quantity)) / newAbsQty;
            position.quantity -= quantity; // more negative
            position.ltp = execPrice;
            await position.save();
        } else {
            // Opening a fresh short — real Kite allows this for MIS (auto square-off same day)
            await new PositionsModel({
                stockSymbol: symbol, quantity: -quantity, avgPrice: execPrice, ltp: execPrice,
                productType: 'MIS', isIntraday: true,
            }).save();
        }
    }
    return realizedPnl;
}

async function applyEquityFill(side, symbol, quantity, execPrice, productType) {
    return productType === 'MIS'
        ? applyEquityFillMIS(side, symbol, quantity, execPrice)
        : applyEquityFillCNC(side, symbol, quantity, execPrice);
}

// ─── Funds check (pre-trade, mirrors what the pending-order engine re-validates at fill time) ──

async function checkFunds(side, quantity, execPrice, productType) {
    if (side !== 'BUY') return;
    // Defense-in-depth: any NaN/zero/negative execPrice must fail closed, not
    // open. `available < NaN` (and any other NaN comparison) is always
    // false in JS, so without this explicit check a bad price would sail
    // straight through the funds gate instead of being rejected by it.
    if (!Number.isFinite(execPrice) || execPrice <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
        throw new OrderRejectedError('Invalid order price or quantity.');
    }
    const wallet = await WalletModel.findOne({});
    const notional = quantity * execPrice;
    const required = productType === 'MIS' ? notional / rules.MIS_LEVERAGE : notional;
    const available = wallet ? wallet.availableMargin : 0;
    if (!wallet || available < required) {
        throw new OrderRejectedError(`Insufficient funds. Required: ₹${required.toFixed(2)}, available: ₹${available.toFixed(2)}.`);
    }
}

// ─── Order execution (order doc → filled + trade + wallet + broadcast) ───

async function executeOrder(orderDoc, execPrice) {
    const symbol = orderDoc.stockSymbol;
    const segment = equitySegment(orderDoc.productType);
    const turnover = orderDoc.quantity * execPrice;
    const charges = calcCharges({ segment, side: orderDoc.side, turnover });

    const realizedPnl = await applyEquityFill(orderDoc.side, symbol, orderDoc.quantity, execPrice, orderDoc.productType);

    const trade = await new TradeModel({
        stockSymbol: symbol, quantity: orderDoc.quantity, price: execPrice,
        side: orderDoc.side, productType: orderDoc.productType,
        orderId: orderDoc._id, charges: charges.total, totalValue: turnover,
    }).save();

    orderDoc.status = 'EXECUTED';
    orderDoc.price = execPrice;
    await orderDoc.save();

    const [positions, holdings, wallet] = await Promise.all([
        PositionsModel.find({}), HoldingsModel.find({}), WalletModel.findOne({}),
    ]);

    if (wallet) {
        if (realizedPnl !== 0 || charges.total !== 0) {
            wallet.balance += Math.round((realizedPnl - charges.total) * 100) / 100;
        }
        const actualUsed = holdings.reduce((s, h) => s + h.avgPrice * h.quantity, 0);
        wallet.usedMargin = Math.round(actualUsed);
        // MIS (intraday) positions previously contributed nothing to margin
        // accounting at all — a user could open unlimited MIS exposure past
        // their actual capital. Recomputed fresh from the live position book
        // every time, same "never drift" approach as usedMargin/blockedMargin.
        // Written to its own field (not `usedMargin`) so it can't collide
        // with the CNC-only holdings recompute above.
        const misPositions = positions.filter(p => p.productType === 'MIS');
        const misMargin = misPositions.reduce(
            (s, p) => s + (Math.abs(p.quantity) * p.avgPrice) / rules.MIS_LEVERAGE, 0
        );
        wallet.misMargin = Math.round(misMargin);
        // `optionMargin` is deliberately left untouched here — it's tracked
        // independently by executeOptionOrder()/day-prep settlement in
        // index.js, and this equity-only fill has no information about open
        // option positions to safely recompute it from.
        await recomputeBlockedMargin(wallet);
    }

    const holdingsWithLiveLtp = holdings.map(h => {
        const live = marketDataService.getStockPrice(h.stockSymbol);
        return { ...h.toObject(), ltp: live?.ltp ?? h.ltp };
    });

    if (_io) {
        _io.emit('orderExecuted', {
            order: orderDoc.toObject(),
            positions, holdings: holdingsWithLiveLtp,
            wallet: wallet?.toObject(),
        });
    }

    return { order: orderDoc, trade, wallet, realizedPnl, charges };
}

async function rejectOrder(orderDoc, reason) {
    orderDoc.status = 'REJECTED';
    orderDoc.rejectionReason = reason;
    await orderDoc.save();
    if (_io) _io.emit('orderRejected', { order: orderDoc.toObject(), reason });
}

// ─── Place a new order (called from the /newOrder route) ─────────────────

async function placeOrder({ stockSymbol, quantity, price, triggerPrice, type, side, productType, exchange }) {
    const symbol = stockSymbol.toUpperCase();
    // Guard here too (not just in the /newOrder route) since basket
    // execution (`/baskets/:id/execute`) calls placeOrder() directly with
    // each leg's stored quantity/price, bypassing the route-level check. A
    // non-positive quantity on a SELL leg would otherwise slip past
    // checkFunds (which only gates BUY) and invert the holdings math.
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
        throw new OrderRejectedError('Quantity must be a positive number.');
    }
    const liveQuote = marketDataService.getStockPrice(symbol);
    const ltp = liveQuote?.ltp ?? Number(price);

    // `liveQuote?.ltp ?? Number(price)` only falls back on null/undefined —
    // a stale/glitched quote with `ltp: 0` (or a malformed `price`) sails
    // through as 0/NaN. That poisons every downstream calc: `checkFunds`
    // computes `required = quantity * execPrice`, and any comparison against
    // NaN is always false, so a NaN price order was never being rejected —
    // and a zero price would pass funds-checking as "free", both of which
    // permanently corrupt the resulting holding's avgPrice. Reject outright.
    if (!Number.isFinite(ltp) || ltp <= 0) {
        throw new OrderRejectedError(`No valid live price available for ${symbol}. Try again in a moment.`);
    }

    // Tick-size + circuit-band validation (skipped for MARKET, whose price is just a reference)
    if (type !== 'MARKET') {
        if (!rules.isValidTick(Number(price))) {
            throw new OrderRejectedError(`Price must be in multiples of ₹${rules.TICK_SIZE} (NSE tick size).`);
        }
        if (liveQuote?.previousClose && !rules.isWithinCircuitBand(Number(price), liveQuote.previousClose)) {
            throw new OrderRejectedError(`Price is outside the ${rules.CIRCUIT_BAND * 100}% circuit band for ${symbol}.`);
        }
    }
    if ((type === 'SL' || type === 'SLM') && !triggerPrice) {
        throw new OrderRejectedError('Trigger price is required for SL / SL-M orders.');
    }

    const execPriceForCheck = type === 'MARKET' ? ltp : Number(price);
    await checkFunds(side, Number(quantity), execPriceForCheck, productType);

    const orderDoc = new OrdersModel({
        stockSymbol: symbol, quantity: Number(quantity), price: Number(price),
        triggerPrice: triggerPrice ? Number(triggerPrice) : null,
        type: type || 'MARKET', side, productType: productType || 'CNC',
        exchange: exchange || 'NSE',
        status: type === 'MARKET' ? 'PENDING' : 'PENDING', // both start PENDING; MARKET resolves instantly below
    });
    await orderDoc.save();

    if (type === 'MARKET' || !type) {
        const result = await executeOrder(orderDoc, ltp);
        return { ...result, immediate: true };
    }
    // LIMIT / SL / SL-M rest until evaluatePendingOrders picks them up
    return { order: orderDoc, immediate: false };
}

// ─── Trigger engine — runs on every fast market tick ──────────────────────

async function evaluatePendingOrders() {
    const pending = await OrdersModel.find({ status: 'PENDING' });
    for (const order of pending) {
        try {
            const quote = marketDataService.getStockPrice(order.stockSymbol);
            if (!quote?.ltp) continue;
            const ltp = quote.ltp;

            if (order.type === 'LIMIT') {
                const touched = order.side === 'BUY' ? ltp <= order.price : ltp >= order.price;
                if (touched) await executeOrder(order, order.price);
            } else if (order.type === 'SLM') {
                const triggered = order.side === 'BUY' ? ltp >= order.triggerPrice : ltp <= order.triggerPrice;
                if (triggered) await executeOrder(order, ltp);
            } else if (order.type === 'SL') {
                if (!order.slTriggered) {
                    const triggered = order.side === 'BUY' ? ltp >= order.triggerPrice : ltp <= order.triggerPrice;
                    if (triggered) { order.slTriggered = true; await order.save(); }
                }
                if (order.slTriggered) {
                    const touched = order.side === 'BUY' ? ltp <= order.price : ltp >= order.price;
                    if (touched) await executeOrder(order, order.price);
                }
            }
        } catch (e) {
            if (e instanceof OrderRejectedError) await rejectOrder(order, e.message);
            else console.error('[OrderEngine] evaluatePendingOrders error:', e.message);
        }
    }
}

// ─── Alerts + GTT engine — runs on every fast market tick ─────────────────

function conditionMet(condition, ltp, target) {
    return condition === 'ABOVE' ? ltp >= target : ltp <= target;
}

async function evaluateAlerts() {
    const alerts = await PriceAlertModel.find({ active: true });
    for (const alert of alerts) {
        try {
            const quote = marketDataService.getStockPrice(alert.stockSymbol);
            if (!quote?.ltp) continue;
            const ltp = quote.ltp;

            const primaryHit = conditionMet(alert.condition, ltp, alert.targetPrice);
            const ocoHit = alert.triggerType === 'oco' && alert.ocoCondition && alert.ocoTargetPrice != null
                ? conditionMet(alert.ocoCondition, ltp, alert.ocoTargetPrice)
                : false;
            if (!primaryHit && !ocoHit) continue;

            if (alert.gtt) {
                // Place a real order at the GTT's configured limit price
                const execPrice = alert.limitPrice ?? ltp;
                const orderDoc = new OrdersModel({
                    stockSymbol: alert.stockSymbol, quantity: alert.quantity, price: execPrice,
                    type: 'LIMIT', side: alert.side, productType: alert.productType || 'CNC',
                    status: 'PENDING',
                });
                await orderDoc.save();
                try {
                    await checkFunds(alert.side, alert.quantity, execPrice, alert.productType);
                    await executeOrder(orderDoc, execPrice);
                } catch (e) {
                    await rejectOrder(orderDoc, e.message);
                }
            }

            alert.active = false;
            alert.triggered = true;
            alert.triggeredAt = new Date();
            await alert.save();
            if (_io) _io.emit('alertTriggered', { alert: alert.toObject(), ltp });
        } catch (e) {
            console.error('[OrderEngine] evaluateAlerts error:', e.message);
        }
    }
}

// ─── Same-day MIS auto square-off (runs at 3:20 PM IST, matches real RMS) ─

async function squareOffAllMIS(reason = 'EOD auto square-off') {
    const positions = await PositionsModel.find({ productType: 'MIS' });
    if (positions.length === 0) return 0;
    const wallet = await WalletModel.findOne({});

    for (const pos of positions) {
        const ltp = marketDataService.getStockPrice(pos.stockSymbol)?.ltp ?? pos.ltp;
        const isShort = pos.quantity < 0;
        const qty = Math.abs(pos.quantity);
        const side = isShort ? 'BUY' : 'SELL'; // cover a short by buying, exit a long by selling
        const pnl = isShort ? (pos.avgPrice - ltp) * qty : (ltp - pos.avgPrice) * qty;
        const turnover = qty * ltp;
        const charges = calcCharges({ segment: 'equity_intraday', side, turnover });

        await new TradeModel({
            stockSymbol: pos.stockSymbol, quantity: qty, price: ltp, side,
            productType: 'MIS', charges: charges.total, totalValue: turnover,
        }).save();
        if (wallet) wallet.balance += Math.round((pnl - charges.total) * 100) / 100;
        await recordClosedEquityPosition({
            symbol: pos.stockSymbol, productType: 'MIS', quantity: pos.quantity,
            avgPrice: pos.avgPrice, exitPrice: ltp, pnl,
        });
        await PositionsModel.deleteOne({ _id: pos._id });
    }

    if (wallet) {
        // All MIS positions were just deleted above — misMargin must be
        // recomputed (to 0, since none remain) rather than left at its last
        // value, which would otherwise permanently overstate usedMargin
        // (and understate availableMargin) after every EOD square-off.
        const remainingMis = await PositionsModel.find({ productType: 'MIS' });
        wallet.misMargin = Math.round(
            remainingMis.reduce((s, p) => s + (Math.abs(p.quantity) * p.avgPrice) / rules.MIS_LEVERAGE, 0)
        );
        wallet.availableMargin = Math.max(0, wallet.balance - wallet.usedMargin - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
        await wallet.save();
    }
    if (_io) _io.emit('misSquaredOff', { count: positions.length, reason });
    console.log(`[OrderEngine] ${reason}: squared off ${positions.length} MIS position(s)`);
    return positions.length;
}

let _misSquaredOffToday = null; // dateStr guard so it only fires once per day
async function checkSameDayMisSquareOff() {
    if (!rules.isPastMisSquareOffTime()) return;
    const today = rules.istDateStr();
    if (_misSquaredOffToday === today) return;
    _misSquaredOffToday = today;
    await squareOffAllMIS('Same-day 3:20 PM MIS auto square-off');
}

module.exports = {
    init,
    OrderRejectedError,
    applyEquityFill,
    checkFunds,
    executeOrder,
    rejectOrder,
    placeOrder,
    evaluatePendingOrders,
    evaluateAlerts,
    squareOffAllMIS,
    checkSameDayMisSquareOff,
    recomputeBlockedMargin,
};
