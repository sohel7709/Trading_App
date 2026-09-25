'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/authenticate');
const {
    WalletModel, HoldingsModel, PositionsModel, OptionPositionsModel,
    ClosedPositionModel, OrdersModel, NotificationModel, PLRecordModel
} = require('../../shared/db');
const redis = require('../../shared/redis');
const CacheService = require('../../services/cacheService');
const orderEngine = require('../../orderEngine');
const marketDataService = require('../../marketDataService');
const { executeOptionOrder, getLiveOptionLTP } = require('../../index'); // or helper

// ============ UNIFIED PORTFOLIO ============
router.get('/portfolio', authenticate, async (req, res) => {
    try {
        const userId = req.user._id.toString();

        // 1. Check Redis cache first
        if (!req.query.fresh && !req.query.nocache) {
            const cached = await CacheService.getPortfolio(userId);
            if (cached) {
                return res.status(200).json(cached);
            }
        }

        const [wallet, holdings, eqPositions, optPositions, closedPositions, userOrders] = await Promise.all([
            WalletModel.findOne({ userId }).lean(),
            HoldingsModel.find({ userId }).lean(),
            PositionsModel.find({ userId }).lean(),
            OptionPositionsModel.find({ userId }).lean(),
            ClosedPositionModel.find({ userId }).sort({ closedAt: -1 }).lean(),
            OrdersModel.find({ userId }).sort({ createdAt: -1 }).limit(50).lean()
        ]);

        const startingCapital = req.user.startingCapitalPaise ? req.user.startingCapitalPaise / 100 : (wallet?.balance || 500000);
        const balance = wallet ? (wallet.balancePaise ? wallet.balancePaise / 100 : wallet.balance) : startingCapital;
        const totalUsedMargin = Math.round((wallet?.usedMargin || 0) + (wallet?.misMargin || 0) + (wallet?.optionMargin || 0));
        const availableMargin = wallet?.availableMargin ?? Math.max(0, balance - totalUsedMargin);
        const usedMargin = totalUsedMargin;
        const blockedMargin = wallet?.blockedMarginPaise ? wallet.blockedMarginPaise / 100 : (wallet?.blockedMargin || 0);

        let realizedPnl = closedPositions.reduce((sum, c) => sum + (c.pnl || 0), 0);
        let winCount = closedPositions.filter(c => (c.pnl || 0) > 0).length;
        const winRate = closedPositions.length > 0 ? Math.round((winCount / closedPositions.length) * 100) : 0;

        let unrealizedPnl = 0;
        const enrichedEq = await Promise.all(eqPositions.map(async (p) => {
            // Read from Redis price cache first (zero broker call)
            const cachedPrice = await redis.getPrice(p.stockSymbol);
            const avg = Number(p.avgPrice || 0);
            const curPrice = Number(cachedPrice?.ltp ?? p.ltp ?? avg);
            const side = p.side || (p.quantity >= 0 ? 'BUY' : 'SELL');
            const dir = side.toUpperCase() === 'BUY' ? 1 : -1;
            const posPnl = Math.round((curPrice - avg) * (p.quantity || 1) * dir * 100) / 100;
            unrealizedPnl += (isNaN(posPnl) ? 0 : posPnl);
            const pnlPct = avg > 0 ? Math.round(((curPrice - avg) / avg) * dir * 10000) / 100 : 0;
            return {
                ...(p.toObject ? p.toObject() : p),
                kind: 'equity',
                side,
                symbol: p.stockSymbol,
                avgPrice: avg,
                ltp: curPrice,
                pnl: isNaN(posPnl) ? 0 : posPnl,
                pnlPercent: isNaN(pnlPct) ? 0 : pnlPct
            };
        }));

        // Fetch live LTP for option positions (async, like equity positions above)
        const enrichedOpt = await Promise.all(optPositions.map(async (p) => {
            let liveLtp = null;
            if (marketDataService.getOptionLTPSync) {
                liveLtp = marketDataService.getOptionLTPSync(
                    p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry
                );
            }
            if (!liveLtp && marketDataService.getOptionLTP) {
                try {
                    liveLtp = await marketDataService.getOptionLTP(
                        p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry
                    );
                } catch {}
            }
            // Use 0 (not 100) when avgPremium/avgPrice unavailable — shows '--' not fake 100
            const avg = Number(p.avgPremium || p.avgPrice || 0);
            const livePrem = typeof liveLtp === 'number' ? liveLtp
                : (typeof liveLtp?.ltp === 'number' ? liveLtp.ltp : null);
            const curPrice = livePrem !== null && livePrem > 0
                ? livePrem
                : Number(p.ltp || avg);
            const side = p.side || (p.quantity >= 0 ? 'BUY' : 'SELL');
            const dir = side.toUpperCase() === 'BUY' ? 1 : -1;
            const posPnl = avg > 0 ? Math.round((curPrice - avg) * (p.quantity || 1) * dir * 100) / 100 : 0;
            unrealizedPnl += (isNaN(posPnl) ? 0 : posPnl);
            const pnlPct = avg > 0 ? Math.round(((curPrice - avg) / avg) * dir * 10000) / 100 : 0;
            return {
                ...(p.toObject ? p.toObject() : p),
                kind: 'option',
                side,
                symbol: `${p.underlyingSymbol} ${p.strikePrice} ${p.optionType}`,
                contractSymbol: p.symbol,
                stockSymbol: p.symbol,
                productType: p.productType || 'NRML',
                avgPrice: avg,
                avgPremium: avg,
                ltp: curPrice,
                pnl: isNaN(posPnl) ? 0 : posPnl,
                pnlPercent: isNaN(pnlPct) ? 0 : pnlPct
            };
        }));

        const enrichedHoldings = await Promise.all(holdings.map(async (h) => {
            const cachedPrice = await redis.getPrice(h.stockSymbol);
            const avg = Number(h.avgPrice || 0);
            const curPrice = Number(cachedPrice?.ltp ?? h.ltp ?? avg);
            const posPnl = Math.round((curPrice - avg) * (h.quantity || 1) * 100) / 100;
            unrealizedPnl += (isNaN(posPnl) ? 0 : posPnl);
            const pnlPct = avg > 0 ? Math.round(((curPrice - avg) / avg) * 10000) / 100 : 0;
            return {
                ...(h.toObject ? h.toObject() : h),
                kind: 'holding',
                side: 'BUY',
                symbol: h.stockSymbol,
                stockSymbol: h.stockSymbol,
                productType: 'CNC',
                avgPrice: avg,
                ltp: curPrice,
                pnl: isNaN(posPnl) ? 0 : posPnl,
                pnlPercent: isNaN(pnlPct) ? 0 : pnlPct
            };
        }));

        const allOpenPositions = [...enrichedEq, ...enrichedOpt, ...enrichedHoldings];
        const totalPnl = Math.round((realizedPnl + unrealizedPnl) * 100) / 100;
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayClosed = closedPositions.filter(c => c.dateStr === todayStr);
        const todayRealized = todayClosed.reduce((sum, c) => sum + (c.pnl || 0), 0);
        const todayPnl = Math.round((todayRealized + unrealizedPnl) * 100) / 100;

        const portfolioPayload = {
            success: true,
            balance,
            availableMargin,
            usedMargin,
            totalUsedMargin,
            blockedMargin,
            totalCapital: balance + blockedMargin,
            startingCapital,
            totalPnl,
            pnl: totalPnl,
            todayPnl,
            realizedPnl: Math.round(realizedPnl * 100) / 100,
            unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
            winRate,
            openPositionsCount: allOpenPositions.length,
            totalTrades: userOrders.length,
            positions: allOpenPositions,
            closedTrades: closedPositions.slice(0, 50),
            holdings: enrichedHoldings,
            orders: userOrders.slice(0, 50)
        };

        // Cache in Redis for 30s
        CacheService.setPortfolio(userId, portfolioPayload, 30).catch(() => {});

        res.status(200).json(portfolioPayload);
    } catch (err) {
        console.error('[Portfolio API Error]:', err);
        res.status(500).json({ message: 'Error fetching portfolio', error: err.message });
    }
});

// ============ COMBINED DASHBOARD SUMMARY (ZERO REDUNDANT QUERIES) ============
router.get('/dashboard-summary', authenticate, async (req, res) => {
    try {
        const userId = req.user._id.toString();

        // 1. Check Redis cache first (5-second TTL)
        if (!req.query.fresh && !req.query.nocache) {
            const cached = await CacheService.getDashboardSummary(userId);
            if (cached) return res.status(200).json(cached);
        }

        const dateStr = require('../../marketRules').istDateStr();

        const [wallet, closedTrades, eqPositions, optPositions, notifs, plRecords] = await Promise.all([
            WalletModel.findOne({ userId }).lean(),
            ClosedPositionModel.find({ userId }).sort({ closedAt: -1 }).limit(50).lean(),
            PositionsModel.find({ userId }).lean(),
            OptionPositionsModel.find({ userId }).lean(),
            NotificationModel ? NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(20).lean() : [],
            PLRecordModel ? PLRecordModel.find({ userId }).sort({ date: -1 }).limit(7).lean() : []
        ]);

        const startingCapital = req.user.startingCapitalPaise ? req.user.startingCapitalPaise / 100 : (wallet?.balance || 500000);
        const balance = wallet ? (wallet.balancePaise ? wallet.balancePaise / 100 : wallet.balance) : startingCapital;
        const totalUsedMargin = Math.round((wallet?.usedMargin || 0) + (wallet?.misMargin || 0) + (wallet?.optionMargin || 0));
        const availableMargin = wallet?.availableMargin ?? Math.max(0, balance - totalUsedMargin);
        const usedMargin = totalUsedMargin;
        const blockedMargin = wallet?.blockedMarginPaise ? wallet.blockedMarginPaise / 100 : (wallet?.blockedMargin || 0);

        // Realized & Win rate
        let realizedPnl = closedTrades.reduce((sum, c) => sum + (c.pnl || 0), 0);
        const todayClosed = closedTrades.filter(c => c.dateStr === dateStr || (c.closedAt && new Date(c.closedAt).toISOString().slice(0, 10) === dateStr));
        const todayRealized = todayClosed.reduce((sum, c) => sum + (c.pnl || 0), 0);

        let winCount = closedTrades.filter(c => (c.pnl || 0) > 0).length;
        const winRate = closedTrades.length > 0 ? Math.round((winCount / closedTrades.length) * 100) : 0;

        // Unrealized PnL from Redis price cache
        let unrealizedPnl = 0;
        for (const p of eqPositions) {
            const cachedPrice = await redis.getPrice(p.stockSymbol);
            const avg = Number(p.avgPrice || 0);
            const cur = Number(cachedPrice?.ltp ?? p.ltp ?? avg);
            const dir = (p.side || 'BUY').toUpperCase() === 'BUY' ? 1 : -1;
            unrealizedPnl += Math.round((cur - avg) * (p.quantity || 1) * dir * 100) / 100;
        }
        for (const p of optPositions) {
            let liveLtp = null;
            if (marketDataService.getOptionLTPSync) {
                liveLtp = marketDataService.getOptionLTPSync(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry);
            }
            if (!liveLtp && marketDataService.getOptionLTP) {
                try { liveLtp = await marketDataService.getOptionLTP(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry); } catch {}
            }
            const avg = Number(p.avgPremium || p.avgPrice || 0); // 0, not 100 — prevents fake LTP display
            const cur = Number(typeof liveLtp === 'number' ? liveLtp : (liveLtp?.ltp ?? (typeof p.ltp === 'number' ? p.ltp : avg)));
            const dir = (p.side || 'BUY').toUpperCase() === 'BUY' ? 1 : -1;
            const diff = Math.round((cur - avg) * (p.quantity || 1) * dir * 100) / 100;
            unrealizedPnl += isNaN(diff) ? 0 : diff;
        }

        const totalPnl = Math.round((realizedPnl + unrealizedPnl) * 100) / 100;
        const todayPnl = Math.round((todayRealized + unrealizedPnl) * 100) / 100;

        const unreadNotifs = (notifs || []).filter(n => !n.read).length;
        const latestRisk = (notifs || []).find(n => n.type === 'RISK' && !n.read);

        const timeline = (plRecords || []).map(r => ({
            date: r.dateStr || (r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''),
            pnl: (r.netPnl || 0) / 100,
        }));

        const indexes = marketDataService.getIndexData ? marketDataService.getIndexData() : {};

        const summary = {
            success: true,
            balance,
            availableMargin,
            usedMargin,
            blockedMargin,
            totalPnl,
            todayPnl,
            winRate,
            openPositionsCount: eqPositions.length + optPositions.length,
            portfolio: {
                balance,
                availableMargin,
                usedMargin,
                blockedMargin,
                totalPnl,
                todayPnl,
                winRate,
                openPositionsCount: eqPositions.length + optPositions.length,
            },
            indexes,
            unreadNotifs,
            riskAlert: latestRisk ? { message: latestRisk.message, isHardStop: latestRisk.message?.toLowerCase().includes('max loss') } : null,
            pnlTimeline: timeline,
            timestamp: Date.now()
        };

        // Cache in Redis for 5 seconds
        CacheService.setDashboardSummary(userId, summary, 5).catch(() => {});

        res.status(200).json(summary);
    } catch (err) {
        console.error('[DashboardSummary Error]:', err);
        res.status(500).json({ message: 'Error generating dashboard summary', error: err.message });
    }
});

// ============ HOLDINGS ============
router.get('/allHoldings', authenticate, async (req, res) => {
    try {
        const allHoldings = await HoldingsModel.find({ userId: req.user._id });
        const enriched = await Promise.all(allHoldings.map(async (h) => {
            const cached = await redis.getPrice(h.stockSymbol);
            return { ...(h.toObject ? h.toObject() : h), ltp: cached?.ltp ?? h.ltp };
        }));
        res.status(200).json(enriched);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching holdings', error: err.message });
    }
});

// ============ POSITIONS ============
router.get(['/allPositions', '/positions'], authenticate, async (req, res) => {
    try {
        const positions = await PositionsModel.find({ userId: req.user._id });
        const enriched = await Promise.all(positions.map(async (p) => {
            const cached = await redis.getPrice(p.stockSymbol);
            return { ...(p.toObject ? p.toObject() : p), ltp: cached?.ltp ?? p.ltp };
        }));
        res.status(200).json(enriched);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching positions', error: err.message });
    }
});

// ============ CLOSED POSITIONS ============
router.get('/closedPositions', authenticate, async (req, res) => {
    try {
        const closed = await ClosedPositionModel.find({ userId: req.user._id }).sort({ closedAt: -1 }).limit(100);
        res.status(200).json(closed);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching closed positions', error: err.message });
    }
});

// ============ SQUARE OFF ============
router.post('/positions/:id/squareoff', authenticate, async (req, res) => {
    try {
        let position = await PositionsModel.findById(req.params.id);
        let isHolding = false;
        if (!position) {
            position = await HoldingsModel.findById(req.params.id);
            if (position) isHolding = true;
        }
        if (!position) return res.status(404).json({ message: 'Position not found' });

        if (req.user.role === 'STUDENT' && position.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized to square off this position' });
        }

        const isShort = isHolding ? false : position.quantity < 0;
        const side = isShort ? 'BUY' : 'SELL';
        const positionQty = isHolding ? position.quantity : Math.abs(position.quantity);
        const requestedQty = req.body?.quantity ? Number(req.body.quantity) : positionQty;
        const quantity = Math.min(requestedQty, positionQty);
        const productType = isHolding ? 'CNC' : position.productType;

        const cached = await redis.getPrice(position.stockSymbol);
        const liveLtp = cached?.ltp ?? position.ltp;

        const result = await orderEngine.placeOrder(position.userId, {
            stockSymbol: position.stockSymbol, quantity, price: liveLtp,
            type: 'MARKET', side, productType,
        });

        // Invalidate Redis portfolio cache & publish event
        CacheService.invalidatePortfolio(position.userId.toString()).catch(() => {});
        redis.publishOrderUpdate(position.userId.toString(), 'orderExecuted', { order: result.order, trade: result.trade });

        res.status(201).json({ message: 'Position squared off', order: result.order, trade: result.trade });
    } catch (err) {
        if (err instanceof orderEngine.OrderRejectedError) return res.status(400).json({ message: err.message });
        res.status(500).json({ message: 'Error squaring off position', error: err.message });
    }
});

// Universal square-off (POST /trade/square-off)
router.post('/trade/square-off', authenticate, async (req, res) => {
    try {
        const targetId = req.body?.positionId || req.body?.id;
        if (!targetId) return res.status(400).json({ message: 'positionId is required' });

        const userIdStr = req.user._id.toString();

        let optPos = await OptionPositionsModel.findById(targetId);
        if (optPos) {
            if (req.user.role === 'STUDENT' && optPos.userId.toString() !== userIdStr) {
                return res.status(403).json({ message: 'Unauthorized' });
            }
            const isShort = optPos.quantity < 0;
            const action = isShort ? 'BUY' : 'SELL';
            const requestedLots = req.body?.lots ? Number(req.body.lots) : Math.abs(optPos.lots || 1);
            const lots = Math.min(requestedLots, Math.abs(optPos.lots || 1));

            const rawLive = await getLiveOptionLTP(optPos.underlyingSymbol, optPos.strikePrice, optPos.optionType, optPos.expiry);
            let premium = typeof rawLive === 'number' ? rawLive
                : (rawLive?.ltp ?? (typeof optPos.ltp === 'number' ? optPos.ltp : (optPos.avgPremium || 0)));
            if (!Number.isFinite(Number(premium)) || Number(premium) <= 0) {
                // Reject square-off if we can't determine real market price
                if (!optPos.avgPremium || Number(optPos.avgPremium) <= 0) {
                    return res.status(422).json({ message: 'Live price unavailable for this option. Please retry in a moment.' });
                }
                premium = Number(optPos.avgPremium);
            }

            const result = await executeOptionOrder(optPos.userId, {
                underlyingSymbol: optPos.underlyingSymbol, strikePrice: optPos.strikePrice,
                optionType: optPos.optionType, expiry: optPos.expiry,
                lots, premium, action,
            });

            CacheService.invalidatePortfolio(userIdStr).catch(() => {});
            redis.publishOrderUpdate(userIdStr, 'optionOrderExecuted', result.body);
            return res.status(result.status).json(result.body);
        }

        let eqPos = await PositionsModel.findById(targetId);
        let isHolding = false;
        if (!eqPos) {
            eqPos = await HoldingsModel.findById(targetId);
            if (eqPos) isHolding = true;
        }
        if (!eqPos) return res.status(404).json({ message: 'Position not found' });

        if (req.user.role === 'STUDENT' && eqPos.userId.toString() !== userIdStr) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const isShort = isHolding ? false : eqPos.quantity < 0;
        const side = isShort ? 'BUY' : 'SELL';
        const positionQty = isHolding ? eqPos.quantity : Math.abs(eqPos.quantity);
        const requestedQty = req.body?.quantity ? Number(req.body.quantity) : positionQty;
        const quantity = Math.min(requestedQty, positionQty);
        const productType = isHolding ? 'CNC' : eqPos.productType;

        const cached = await redis.getPrice(eqPos.stockSymbol);
        const liveLtp = cached?.ltp ?? eqPos.ltp;

        const result = await orderEngine.placeOrder(eqPos.userId, {
            stockSymbol: eqPos.stockSymbol, quantity, price: liveLtp,
            type: 'MARKET', side, productType,
        });

        CacheService.invalidatePortfolio(userIdStr).catch(() => {});
        redis.publishOrderUpdate(userIdStr, 'orderExecuted', { order: result.order, trade: result.trade });
        return res.status(201).json({ message: 'Position squared off', order: result.order, trade: result.trade });

    } catch (err) {
        if (err instanceof orderEngine.OrderRejectedError) return res.status(400).json({ message: err.message });
        res.status(500).json({ message: 'Error squaring off position', error: err.message });
    }
});

module.exports = router;
