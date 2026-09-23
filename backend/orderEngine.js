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
const { EnrollmentModel } = require('./model/EnrollmentModel');
const { RiskRuleModel } = require('./model/RiskRuleModel');
const { PLRecordModel } = require('./model/PLRecordModel');
const { UserModel } = require('./model/UserModel');
const { logAudit } = require('./services/auditService');
const CacheService = require('./services/cacheService');
const marketDataService  = require('./marketDataService');
const { calcCharges, equitySegment } = require('./chargesService');
const rules = require('./marketRules');

let _io = null;
let _optionExecutor = null;
function init(io) { _io = io; }
function registerOptionExecutor(fn) { _optionExecutor = fn; }

class OrderRejectedError extends Error {}

// Blocked margin = funds reserved by resting PENDING BUY orders. Recomputed
// fresh (not incrementally tracked) so it can never drift, same pattern the
// codebase already uses for usedMargin vs holdings cost basis.
async function recomputeBlockedMargin(walletOrUid, maybeWallet) {
    let wallet = maybeWallet || walletOrUid;
    if (wallet && typeof wallet.save !== 'function') {
        wallet = await WalletModel.findOne({ userId: walletOrUid });
    }
    if (!wallet) return null;
    const pending = await OrdersModel.find({ userId: wallet.userId, status: 'PENDING', side: 'BUY' });
    const blocked = pending.reduce((s, o) => {
        const notional = o.quantity * o.price;
        return s + (o.productType === 'MIS' ? notional / rules.MIS_LEVERAGE : notional);
    }, 0);
    wallet.blockedMargin = Math.round(blocked);
    wallet.availableMargin = Math.max(0, wallet.balance - wallet.usedMargin - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - wallet.blockedMargin);
    await wallet.save();
    return wallet;
}

// ─── Holdings / positions mutation ────────────────────────────────────────

// Frozen snapshot for the Positions screen's "squared off" section — taken
// the instant a leg fully closes (quantity nets to zero). Never recomputed
// afterwards, so it stays exactly what was booked at close time even though
// the live trade log / total P&L keeps evolving with the rest of the day.
async function recordClosedEquityPosition(userId, { symbol, productType, quantity, avgPrice, exitPrice, pnl, instituteId }) {
    try {
        await new ClosedPositionModel({
            userId, instituteId: instituteId || null, kind: 'equity', symbol, productType, quantity, avgPrice, exitPrice,
            pnl: Math.round(pnl * 100) / 100, dateStr: rules.istDateStr(),
        }).save();
    } catch (e) { console.error('[OrderEngine] recordClosedEquityPosition error:', e.message); }
}

async function applyEquityFillCNC(userId, side, symbol, quantity, execPrice, instituteId) {
    let realizedPnl = 0;
    if (side === 'BUY') {
        let holding = await HoldingsModel.findOne({ userId, stockSymbol: symbol });
        const today = rules.istNow();
        if (holding) {
            const totalQty = holding.quantity + quantity;
            holding.avgPrice = Math.round(((holding.avgPrice * holding.quantity) + (execPrice * quantity)) / totalQty * 100) / 100;
            holding.quantity = totalQty;
            holding.ltp = marketDataService.getStockPrice(symbol)?.ltp ?? execPrice;
            if (!holding.instituteId && instituteId) holding.instituteId = instituteId;
            // Freshly bought quantity joins T1 (unsettled) — rolls to sellable at next BOD prep
            holding.t1Quantity = (holding.t1Quantity || 0) + quantity;
            holding.t1Date = today;
        } else {
            holding = new HoldingsModel({
                userId, instituteId: instituteId || null, stockSymbol: symbol, quantity, avgPrice: execPrice,
                ltp: marketDataService.getStockPrice(symbol)?.ltp ?? execPrice,
                productType: 'CNC', t1Quantity: quantity, t1Date: today, isDematted: true,
            });
        }
        await holding.save();
    } else {
        const holding = await HoldingsModel.findOne({ userId, stockSymbol: symbol });
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

async function applyEquityFillMIS(userId, side, symbol, quantity, execPrice, instituteId) {
    let realizedPnl = 0;
    let position = await PositionsModel.findOne({ userId, stockSymbol: symbol, productType: 'MIS' });

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
                await recordClosedEquityPosition(userId, {
                    symbol, productType: 'MIS', quantity: -shortQty,
                    avgPrice: oldAvgPrice, exitPrice: execPrice, pnl: coverPnl, instituteId,
                });
                position.quantity = overflow;
                position.avgPrice = execPrice;
            } else {
                position.quantity += quantity; // still <= 0
            }
            position.ltp = execPrice;
            if (position.quantity === 0) {
                await recordClosedEquityPosition(userId, {
                    symbol, productType: 'MIS', quantity: -shortQty,
                    avgPrice: oldAvgPrice, exitPrice: execPrice, pnl: coverPnl, instituteId,
                });
                await PositionsModel.deleteOne({ _id: position._id });
            } else await position.save();
        } else if (position) {
            // Adding to an existing long
            const totalQty = position.quantity + quantity;
            position.avgPrice = ((position.avgPrice * position.quantity) + (execPrice * quantity)) / totalQty;
            position.quantity = totalQty;
            position.ltp = execPrice;
            if (!position.instituteId && instituteId) position.instituteId = instituteId;
            await position.save();
        } else {
            await new PositionsModel({
                userId, instituteId: instituteId || null, stockSymbol: symbol, quantity, avgPrice: execPrice, ltp: execPrice,
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
                await recordClosedEquityPosition(userId, {
                    symbol, productType: 'MIS', quantity: closeQty,
                    avgPrice: oldAvgPrice, exitPrice: execPrice, pnl: closePnl, instituteId,
                });
                await PositionsModel.deleteOne({ _id: position._id });
                await new PositionsModel({
                    userId, instituteId: instituteId || null, stockSymbol: symbol, quantity: -remainder, avgPrice: execPrice, ltp: execPrice,
                    productType: 'MIS', isIntraday: true,
                }).save();
            } else {
                position.quantity -= quantity;
                position.ltp = execPrice;
                if (position.quantity === 0) {
                    await recordClosedEquityPosition(userId, {
                        symbol, productType: 'MIS', quantity: closeQty,
                        avgPrice: oldAvgPrice, exitPrice: execPrice, pnl: closePnl, instituteId,
                    });
                    await PositionsModel.deleteOne({ _id: position._id });
                } else await position.save();
            }
        } else if (position) {
            // Extending an existing short
            const newAbsQty = Math.abs(position.quantity) + quantity;
            position.avgPrice = ((position.avgPrice * Math.abs(position.quantity)) + (execPrice * quantity)) / newAbsQty;
            position.quantity = -newAbsQty;
            position.ltp = execPrice;
            if (!position.instituteId && instituteId) position.instituteId = instituteId;
            await position.save();
        } else {
            // Opening a fresh short — real Kite allows this for MIS (auto square-off same day)
            await new PositionsModel({
                userId, instituteId: instituteId || null, stockSymbol: symbol, quantity: -quantity, avgPrice: execPrice, ltp: execPrice,
                productType: 'MIS', isIntraday: true,
            }).save();
        }
    }
    return realizedPnl;
}

async function applyEquityFill(userId, side, symbol, quantity, execPrice, productType, instituteId) {
    return productType === 'MIS'
        ? applyEquityFillMIS(userId, side, symbol, quantity, execPrice, instituteId)
        : applyEquityFillCNC(userId, side, symbol, quantity, execPrice, instituteId);
}

// ─── Funds check (pre-trade, mirrors what the pending-order engine re-validates at fill time) ──

async function checkFunds(userId, side, quantity, execPrice, productType) {
    if (side !== 'BUY') return;
    // Defense-in-depth: any NaN/zero/negative execPrice must fail closed, not
    // open. `available < NaN` (and any other NaN comparison) is always
    // false in JS, so without this explicit check a bad price would sail
    // straight through the funds gate instead of being rejected by it.
    if (!Number.isFinite(execPrice) || execPrice <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
        throw new OrderRejectedError('Invalid order price or quantity.');
    }
    const wallet = await WalletModel.findOne({ userId });
    const notional = quantity * execPrice;
    const required = productType === 'MIS' ? notional / rules.MIS_LEVERAGE : notional;
    const available = wallet ? wallet.availableMargin : 0;
    if (!wallet || available < required) {
        throw new OrderRejectedError(`Insufficient funds. Required: ₹${required.toFixed(2)}, available: ₹${available.toFixed(2)}.`);
    }
}

// ─── Order execution (order doc → filled + trade + wallet + broadcast) ───

async function executeOrder(orderDoc, execPrice) {
    const userId = orderDoc.userId;
    const symbol = orderDoc.stockSymbol;
    const segment = equitySegment(orderDoc.productType);
    const turnover = orderDoc.quantity * execPrice;
    const charges = calcCharges({ segment, side: orderDoc.side, turnover });

    const realizedPnl = await applyEquityFill(userId, orderDoc.side, symbol, orderDoc.quantity, execPrice, orderDoc.productType, orderDoc.instituteId);

    const trade = await new TradeModel({
        userId, instituteId: orderDoc.instituteId || null, stockSymbol: symbol, quantity: orderDoc.quantity, price: execPrice,
        side: orderDoc.side, productType: orderDoc.productType,
        orderId: orderDoc._id, charges: charges.total, totalValue: turnover,
    }).save();

    orderDoc.status = 'EXECUTED';
    orderDoc.price = execPrice;
    await orderDoc.save();

    logAudit({
        userId,
        instituteId: orderDoc.instituteId,
        action: 'ORDER_EXECUTED',
        details: { orderId: orderDoc._id, tradeId: trade._id, symbol, quantity: orderDoc.quantity, price: execPrice }
    }).catch(() => {});

    const [positions, holdings, wallet] = await Promise.all([
        PositionsModel.find({ userId }), HoldingsModel.find({ userId }), WalletModel.findOne({ userId }),
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
        return { ...(h.toObject ? h.toObject() : h), ltp: live?.ltp ?? h.ltp, change: live?.change ?? 0, changePercent: live?.changePercent ?? 0 };
    });

    const totalUsed = Math.round((wallet?.usedMargin || 0) + (wallet?.misMargin || 0) + (wallet?.optionMargin || 0));
    const walletPayload = wallet ? {
        ...(wallet.toObject ? wallet.toObject() : wallet),
        totalUsedMargin: totalUsed,
        usedMargin: totalUsed,
    } : null;

    CacheService.invalidateDashboardSummary(userId).catch(() => {});
    CacheService.invalidatePortfolio(userId).catch(() => {});

    if (_io) {
        const uid = String(userId);
        const orderObj = orderDoc.toObject ? orderDoc.toObject() : orderDoc;
        const payload = {
            order: orderObj,
            positions, holdings: holdingsWithLiveLtp,
            wallet: walletPayload,
        };
        // Emit to user's private rooms
        _io.to(`user:${uid}`).emit('orderExecuted', payload);
        _io.to(uid).emit('orderExecuted', payload);
        _io.to(`user:${uid}`).emit('walletUpdated', { wallet: walletPayload });
        _io.to(uid).emit('walletUpdated', { wallet: walletPayload });
        _io.to(`user:${uid}`).emit('trade_update', payload);
        _io.to(uid).emit('trade_update', payload);

        // Also notify batch room if student is in a batch (for instructor live grid & leaderboard)
        const { EnrollmentModel } = require('./model/EnrollmentModel');
        EnrollmentModel.findOne({ userId, status: { $ne: 'DROPPED' } }).then(async enr => {
            if (enr && _io) {
                const { UserModel } = require('./model/UserModel');
                const student = await UserModel.findById(userId).select('name');
                _io.to(`batch:${enr.batchId}`).emit('instructorFeed:order', {
                    studentId: uid,
                    order: orderObj,
                });
                const { sendNotification } = require('./services/notificationService');
                sendNotification({
                    userId,
                    batchId: enr.batchId,
                    type: 'TRADE',
                    title: 'Trade Executed',
                    message: `${student?.name || 'Student'} placed ${orderDoc.side} ${orderDoc.quantity} ${orderDoc.stockSymbol || ''} @ ₹${(orderDoc.price || execPrice || 0).toLocaleString('en-IN')}`,
                    data: { orderId: orderDoc._id, studentId: uid, studentName: student?.name, symbol: orderDoc.stockSymbol, side: orderDoc.side, quantity: orderDoc.quantity }
                }).catch(() => {});
                const { broadcastInstructorFeed } = require('./services/instructorFeedService');
                broadcastInstructorFeed(_io);
            }
        }).catch(() => {});
    }

    return { order: orderDoc, trade, wallet, realizedPnl, charges };
}

async function rejectOrder(orderDoc, reason) {
    orderDoc.status = 'REJECTED';
    orderDoc.rejectionReason = reason;
    await orderDoc.save();
    if (_io) {
        _io.to(`user:${String(orderDoc.userId)}`).emit('orderRejected', { order: orderDoc.toObject ? orderDoc.toObject() : orderDoc, reason });
    }
}


// ─── Place a new order (called from the /newOrder route) ─────────────────

async function placeOrder(userId, { stockSymbol, quantity, price, triggerPrice, type, side, productType, exchange }) {
    const marketControlService = require('./services/marketControlService');
    if (marketControlService.isHalted()) {
        const state = marketControlService.getMarketState();
        throw new OrderRejectedError(`Trading is halted${state.haltReason ? ': ' + state.haltReason : ''}. New orders are blocked.`);
    }

    const symbol = stockSymbol.toUpperCase();
    // Guard here too (not just in the /newOrder route) since basket
    // execution (`/baskets/:id/execute`) calls placeOrder() directly with
    // each leg's stored quantity/price, bypassing the route-level check. A
    // non-positive quantity on a SELL leg would otherwise slip past
    // checkFunds (which only gates BUY) and invert the holdings math.
    if (!quantity || Number(quantity) <= 0 || !Number.isFinite(Number(quantity))) {
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
    const orderNotional = Number(quantity) * execPriceForCheck;

    // --- RISK RULES & BATCH HALT VALIDATION ---
    const enrollment = await EnrollmentModel.findOne({ userId, status: 'ACTIVE' });
    if (enrollment?.batchId) {
        const batchHalt = await marketControlService.isBatchHalted(enrollment.batchId);
        if (batchHalt.isHalted) {
            throw new OrderRejectedError(`Trading is halted for your batch: ${batchHalt.reason || 'Instructor circuit breaker active'}`);
        }
    }
    if (enrollment) {
        const riskRule = await RiskRuleModel.findOne({ batchId: enrollment.batchId });
        if (riskRule) {
            // 1. Max Leverage Check (modifies margin requirement)
            const leverage = riskRule.maxLeverage || rules.MIS_LEVERAGE;
            if (productType === 'MIS' && leverage < rules.MIS_LEVERAGE) {
                // Future: we might want to store this dynamically, for now just note it
                // We'll enforce it in checkFunds if needed.
            }

            // 2. Max Position Value
            if (riskRule.maxPositionValuePaise && orderNotional > (riskRule.maxPositionValuePaise / 100)) {
                const msg = `Order value (₹${orderNotional.toFixed(2)}) exceeds max allowed position value of ₹${(riskRule.maxPositionValuePaise / 100).toFixed(2)}.`;
                await recordRiskBreach(userId, enrollment.batchId, 'MAX_POSITION_VALUE', msg);
                throw new OrderRejectedError(`Risk Rule Breach: ${msg}`);
            }

            // 3. Allowed Segments
            // For now, mapping productType 'MIS' / 'CNC' to segment concepts if needed, or by symbol
            // assuming all stocks are EQUITY
            if (riskRule.allowedSegments && riskRule.allowedSegments.length > 0 && !riskRule.allowedSegments.includes('EQUITY')) {
                const msg = `Trading in EQUITY segment is disabled for this batch.`;
                await recordRiskBreach(userId, enrollment.batchId, 'SEGMENT_DISABLED', msg);
                throw new OrderRejectedError(`Risk Rule Breach: ${msg}`);
            }

            // 4. Max Open Positions
            if (riskRule.maxOpenPositions && side === 'BUY') {
                const openPosCount = await PositionsModel.countDocuments({ userId });
                const openHoldingsCount = await HoldingsModel.countDocuments({ userId });
                if ((openPosCount + openHoldingsCount) >= riskRule.maxOpenPositions) {
                    const msg = `Maximum open positions limit (${riskRule.maxOpenPositions}) reached.`;
                    await recordRiskBreach(userId, enrollment.batchId, 'MAX_OPEN_POSITIONS', msg);
                    throw new OrderRejectedError(`Risk Rule Breach: ${msg}`);
                }
            }

            // 5. Max Daily Loss
            if (riskRule.maxDailyLossPaise) {
                // Calculate current Net PnL (realized + unrealized)
                const plRecord = await PLRecordModel.findOne({ userId, dateStr: rules.istDateStr() });
                const realizedPnl = plRecord ? plRecord.netPnl : 0;
                
                let unrealizedPnl = 0;
                const positions = await PositionsModel.find({ userId });
                for (const pos of positions) {
                    const currentPrice = marketDataService.getStockPrice(pos.stockSymbol)?.ltp || pos.ltp;
                    unrealizedPnl += (currentPrice - pos.avgPrice) * pos.quantity;
                }
                
                const totalPnl = realizedPnl + unrealizedPnl;
                const maxLossAllowed = -Math.abs(riskRule.maxDailyLossPaise / 100);
                if (totalPnl <= maxLossAllowed && side === 'BUY') { // Prevent new positions, allow closing
                    const msg = `Max daily loss limit of ₹${(-maxLossAllowed).toFixed(2)} exceeded. New positions blocked.`;
                    await recordRiskBreach(userId, enrollment.batchId, 'MAX_DAILY_LOSS', msg);
                    throw new OrderRejectedError(`Risk Rule Breach: ${msg}`);
                }
            }
        }
    }
    // --- END RISK RULES VALIDATION ---

    await checkFunds(userId, side, Number(quantity), execPriceForCheck, productType);

    const userDoc = await UserModel.findById(userId).select('instituteId').lean();
    const instituteId = userDoc?.instituteId || null;

    const orderDoc = new OrdersModel({
        userId, instituteId, stockSymbol: symbol, quantity: Number(quantity), price: Number(price),
        triggerPrice: triggerPrice ? Number(triggerPrice) : null,
        type: type || 'MARKET', side, productType: productType || 'CNC',
        exchange: exchange || 'NSE',
        status: 'PENDING',
    });
    await orderDoc.save();

    logAudit({
        userId,
        instituteId,
        action: 'ORDER_PLACED',
        details: { orderId: orderDoc._id, symbol, quantity: Number(quantity), price: Number(price), side, type, productType }
    }).catch(() => {});

    if (type === 'MARKET' || !type) {
        const result = await executeOrder(orderDoc, ltp);
        return { ...result, immediate: true };
    }
    // LIMIT / SL / SL-M rest until evaluatePendingOrders picks them up
    return { order: orderDoc, immediate: false };
}

// ─── Trigger engine — runs on every fast market tick ──────────────────────

async function evaluatePendingOrders() {
    const marketControlService = require('./services/marketControlService');
    if (marketControlService.isHalted()) return;

    const pending = await OrdersModel.find({ status: 'PENDING' });
    for (const order of pending) {
        try {
            let ltp = null;
            const quote = marketDataService.getStockPrice(order.stockSymbol);
            if (quote?.ltp) {
                ltp = quote.ltp;
            } else if (order.productType === 'NRML' || order.underlyingSymbol || order.optionType || order.stockSymbol?.includes(' CE') || order.stockSymbol?.includes(' PE')) {
                if (order.underlyingSymbol && order.strikePrice && order.optionType) {
                    ltp = marketDataService.getOptionLTPSync ? marketDataService.getOptionLTPSync(order.underlyingSymbol, order.strikePrice, order.optionType, order.expiry) : null;
                    if (!ltp && marketDataService.getOptionLTP) {
                        ltp = await marketDataService.getOptionLTP(order.underlyingSymbol, order.strikePrice, order.optionType, order.expiry);
                    }
                } else {
                    const optMatch = order.stockSymbol?.match(/([A-Z\s0-9]+?)\s*(\d{4,6})\s*(CE|PE)/i);
                    if (optMatch) {
                        ltp = marketDataService.getOptionLTPSync ? marketDataService.getOptionLTPSync(optMatch[1].trim(), Number(optMatch[2]), optMatch[3].toUpperCase()) : null;
                    }
                }
            }
            if (!ltp || !Number.isFinite(ltp)) continue;

            const isOption = order.productType === 'NRML' || order.underlyingSymbol || order.optionType || order.stockSymbol?.includes(' CE') || order.stockSymbol?.includes(' PE');

            if (order.type === 'LIMIT') {
                const touched = order.side === 'BUY' ? ltp <= order.price : ltp >= order.price;
                if (touched) {
                    if (isOption && _optionExecutor) {
                        await _optionExecutor(order.userId, {
                            underlyingSymbol: order.underlyingSymbol,
                            strikePrice: order.strikePrice,
                            optionType: order.optionType,
                            expiry: order.expiry,
                            lots: order.lots || 1,
                            premium: order.price,
                            action: order.side,
                            existingOrderId: order._id,
                        });
                    } else {
                        await executeOrder(order, order.price);
                    }
                }
            } else if (order.type === 'SLM') {
                const triggered = order.side === 'BUY' ? ltp >= order.triggerPrice : ltp <= order.triggerPrice;
                if (triggered) {
                    if (isOption && _optionExecutor) {
                        await _optionExecutor(order.userId, {
                            underlyingSymbol: order.underlyingSymbol,
                            strikePrice: order.strikePrice,
                            optionType: order.optionType,
                            expiry: order.expiry,
                            lots: order.lots || 1,
                            premium: ltp,
                            action: order.side,
                            existingOrderId: order._id,
                        });
                    } else {
                        await executeOrder(order, ltp);
                    }
                }
            } else if (order.type === 'SL') {
                if (!order.slTriggered) {
                    const triggered = order.side === 'BUY' ? ltp >= order.triggerPrice : ltp <= order.triggerPrice;
                    if (triggered) { order.slTriggered = true; await order.save(); }
                }
                if (order.slTriggered) {
                    const touched = order.side === 'BUY' ? ltp <= order.price : ltp >= order.price;
                    if (touched) {
                        if (isOption && _optionExecutor) {
                            await _optionExecutor(order.userId, {
                                underlyingSymbol: order.underlyingSymbol,
                                strikePrice: order.strikePrice,
                                optionType: order.optionType,
                                expiry: order.expiry,
                                lots: order.lots || 1,
                                premium: order.price,
                                action: order.side,
                                existingOrderId: order._id,
                            });
                        } else {
                            await executeOrder(order, order.price);
                        }
                    }
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
                    userId: alert.userId, stockSymbol: alert.stockSymbol, quantity: alert.quantity, price: execPrice,
                    type: 'LIMIT', side: alert.side, productType: alert.productType || 'CNC',
                    status: 'PENDING',
                });
                await orderDoc.save();
                try {
                    await checkFunds(alert.userId, alert.side, alert.quantity, execPrice, alert.productType);
                    await executeOrder(orderDoc, execPrice);
                } catch (e) {
                    await rejectOrder(orderDoc, e.message);
                }
            }

            alert.active = false;
            alert.triggered = true;
            alert.triggeredAt = new Date();
            await alert.save();
            if (_io) _io.to(`user:${String(alert.userId)}`).emit('alertTriggered', { alert: alert.toObject(), ltp });
        } catch (e) {

            console.error('[OrderEngine] evaluateAlerts error:', e.message);
        }
    }
}

// ─── Same-day MIS auto square-off (runs at 3:20 PM IST, matches real RMS) ─

async function squareOffAllMIS(reason = 'EOD auto square-off') {
    const positions = await PositionsModel.find({ productType: 'MIS' });
    if (positions.length === 0) return 0;
    
    // Group positions by user so we can process wallet updates per user
    const users = [...new Set(positions.map(p => p.userId.toString()))];

    for (const pos of positions) {
        const ltp = marketDataService.getStockPrice(pos.stockSymbol)?.ltp ?? pos.ltp;
        const isShort = pos.quantity < 0;
        const qty = Math.abs(pos.quantity);
        const side = isShort ? 'BUY' : 'SELL'; // cover a short by buying, exit a long by selling
        const pnl = isShort ? (pos.avgPrice - ltp) * qty : (ltp - pos.avgPrice) * qty;
        const turnover = qty * ltp;
        const charges = calcCharges({ segment: 'equity_intraday', side, turnover });

        await new TradeModel({
            userId: pos.userId, stockSymbol: pos.stockSymbol, quantity: qty, price: ltp, side,
            productType: 'MIS', charges: charges.total, totalValue: turnover,
        }).save();

        const wallet = await WalletModel.findOne({ userId: pos.userId });
        if (wallet) {
            wallet.balance += Math.round((pnl - charges.total) * 100) / 100;
            await wallet.save();
        }

        await recordClosedEquityPosition(pos.userId, {
            symbol: pos.stockSymbol, productType: 'MIS', quantity: pos.quantity,
            avgPrice: pos.avgPrice, exitPrice: ltp, pnl,
        });
        await PositionsModel.deleteOne({ _id: pos._id });
    }

    for (const uid of users) {
        const wallet = await WalletModel.findOne({ userId: uid });
        if (wallet) {
            const remainingMis = await PositionsModel.find({ userId: uid, productType: 'MIS' });
            wallet.misMargin = Math.round(
                remainingMis.reduce((s, p) => s + (Math.abs(p.quantity) * p.avgPrice) / rules.MIS_LEVERAGE, 0)
            );
            wallet.availableMargin = Math.max(0, wallet.balance - wallet.usedMargin - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
            await wallet.save();
        }
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
    registerOptionExecutor,
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
