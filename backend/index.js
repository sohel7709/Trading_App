require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { HoldingsModel } = require('./model/HoldingsModel');
const { PositionsModel } = require('./model/PositionsModel');
const { OrdersModel } = require('./model/OrdersModel');
const { TradeModel } = require('./model/TradeModel');
const { WalletModel } = require('./model/WalletModel');
const { WatchlistModel } = require('./model/WatchlistModel');
const { FundTransactionModel } = require('./model/FundTransactionModel');
const { PriceAlertModel } = require('./model/PriceAlertModel');
const { BasketModel } = require('./model/BasketModel');
const { CorporateActionModel } = require('./model/CorporateActionModel');
const marketDataService  = require('./marketDataService');
const tokenService       = require('./tokenService');
const dhanAutoRenew      = require('./dhanAutoRenew');
let ioInstance = null; // set after io is created
const candleDataService = require('./candleDataService');
const { ChatModel } = require('./model/ChatModel');
const { PLRecordModel } = require('./model/PLRecordModel');
const { OptionPositionsModel } = require('./model/OptionPositionsModel');
const { ClosedPositionModel } = require('./model/ClosedPositionModel');
const dhanDataService = require('./dhanDataService');
const rules = require('./marketRules');
const orderEngine = require('./orderEngine');
const { calcCharges } = require('./chargesService');
const { authRouter } = require('./auth');
const { authenticate } = require('./middleware/authenticate');
const { UserModel } = require('./model/UserModel');
const { InstituteModel } = require('./model/InstituteModel');

const { startMTMEngine, redisClient } = require('./mtmEngine');
const InstituteDataManager = require('./services/InstituteDataManager');
const CacheService = require('./services/cacheService');

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.DATABASE_URL;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});
ioInstance = io;
app.set('io', io);
orderEngine.init(io);
const marketControlService = require('./services/marketControlService');
marketControlService.init(io);

app.get('/market/state', async (req, res) => {
    try {
        let batchId = req.query.batchId || req.user?.batchId;
        if (!batchId && req.user?._id) {
            const { EnrollmentModel } = require('./model/EnrollmentModel');
            const enr = await EnrollmentModel.findOne({ userId: req.user._id, status: 'ACTIVE' });
            batchId = enr?.batchId;
        }
        const globalState = marketControlService.getMarketState();
        if (batchId) {
            const batchState = await marketControlService.getBatchMarketState(batchId);
            if (batchState) {
                return res.json({
                    success: true,
                    mode: batchState.mode || globalState.mode,
                    isHalted: globalState.isHalted || Boolean(batchState.isHalted),
                    globalHalted: globalState.isHalted,
                    batchHalted: Boolean(batchState.isHalted),
                    haltReason: globalState.isHalted ? globalState.haltReason : (batchState.haltReason || null),
                    scope: globalState.isHalted ? 'GLOBAL' : (batchState.isHalted ? 'BATCH' : null),
                    batchId: batchState.batchId,
                    batchCode: batchState.batchCode,
                    globalState,
                });
            }
        }
        res.json({ success: true, ...globalState });
    } catch (e) {
        res.json({ success: true, ...marketControlService.getMarketState() });
    }
});

const { initNotificationSocket, sendNotification } = require('./services/notificationService');
const { NotificationModel } = require('./model/NotificationModel');
const { RiskLogModel } = require('./model/RiskLogModel');
initNotificationSocket(io);
marketDataService.initOptionChainBroadcaster(io);

// ── Decoupled Architecture Integration: Redis Pub/Sub & 300ms Throttler ──
const socketHandler = require('./socket-server/socketHandler');
socketHandler.init(io);
const dhanMarketService = require('./market-data-worker/dhanService');
dhanMarketService.start().catch((e) => console.warn('[MarketWorker] Start note:', e.message));
const preAggregationWorker = require('./services/preAggregationWorker');
preAggregationWorker.start(3000);

// ── Authenticate Socket.IO connections ──────────────────────────────────────
const jwt = require('jsonwebtoken');
const { ACCESS_SECRET } = require('./auth');

io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token 
            || socket.handshake.query?.token 
            || socket.handshake.headers?.authorization?.replace('Bearer ', '');
        if (token) {
            const payload = jwt.verify(token, ACCESS_SECRET);
            const user = await UserModel.findById(payload.sub).select('-passwordHash');
            if (user && user.isActive) {
                socket.user = user;
                socket.userId = user._id.toString();
                // Join private user rooms for strict tenant data isolation
                socket.join(`user:${user._id.toString()}`);
                socket.join(user._id.toString());
                // Auto-join institute-scoped socket room for market data isolation
                if (user.instituteCode) {
                    socket.join(`institute:${user.instituteCode}`);
                }
            }
        }
        next();
    } catch (err) {
        // Allow unauthenticated connection for public ticker quotes
        next();
    }
});

// ── Institute Data Manager (multi-tenant market data) ─────────────────────
let instituteDataManager = null;

// Handle explicit room join requests (e.g., from mobile app after login)
io.on('connection', (socket) => {
    // Ensure socket is joined to user-specific private rooms
    if (socket.user?._id) {
        const uid = socket.user._id.toString();
        socket.join(`user:${uid}`);
        socket.join(uid);
    }

    if (socket.user?.instituteCode && instituteDataManager) {
        const data = instituteDataManager.getPrices(socket.user.instituteCode);
        socket.emit('marketData', data);
    }

    socket.on('join_institute', ({ instituteCode }) => {
        const code = instituteCode || socket.user?.instituteCode;
        if (code) {
            socket.join(`institute:${code}`);
            if (instituteDataManager) {
                const data = instituteDataManager.getPrices(code);
                socket.emit('marketData', data);
            }
        }
    });

    socket.on('join_user', ({ userId }) => {
        const uid = userId || socket.userId;
        if (uid) {
            socket.join(`user:${uid}`);
            socket.join(uid.toString());
        }
    });

    // 1-Second Option Chain Room Subscription
    socket.on('subscribeOptionChain', (data) => {
        const indexName = typeof data === 'object' ? data?.indexName : data;
        const expiry = typeof data === 'object' ? data?.expiry : null;
        const norm = normalizeIndexName(indexName || 'NIFTY 50');
        socket.join(`chain:${norm}`);
        if (expiry) {
            socket.join(`chain:${norm}:${expiry}`);
        }
        marketDataService.getOptionChain(norm, expiry).then(chain => {
            if (chain) socket.emit('optionChain', chain);
        }).catch(() => {});
    });

    socket.on('unsubscribeOptionChain', (data) => {
        const indexName = typeof data === 'object' ? data?.indexName : data;
        const expiry = typeof data === 'object' ? data?.expiry : null;
        const norm = normalizeIndexName(indexName || 'NIFTY 50');
        socket.leave(`chain:${norm}`);
        if (expiry) {
            socket.leave(`chain:${norm}:${expiry}`);
        }
    });
});


const compression = require('compression');
const { ensureIndexes } = require('./scripts/ensureIndexes');

// Start BullMQ MTM background job for Module 2
startMTMEngine(io);

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'TradeLab API', version: '1.0.0' }));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'TradeLab API', version: '1.0.0' }));

// ── Auth routes (public — no token required) ──────────────────────────────
app.use('/auth', authRouter);

// ── Protect all data routes below this line ───────────────────────────────
app.use(authenticate);

const { instituteRouter } = require('./routes/instituteRoutes');
app.use('/institutes', instituteRouter);
app.use('/institute', instituteRouter);

const { superAdminRouter } = require('./routes/superAdminRoutes');
app.use('/super-admin', superAdminRouter);

const userRoutes = require('./routes/userRoutes');
const { batchRouter } = require('./routes/batchRoutes');
const replayRoutes = require('./routes/replayRoutes');
const brokerRoutes = require('./routes/brokerRoutes');
const marketRoutes = require('./routes/marketRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { broadcastInstructorFeed } = require('./services/instructorFeedService');
const notificationService = require('./services/notificationService');
const replayEngine = require('./services/replayEngineService');

app.use('/batches', batchRouter);
app.use('/batch', batchRouter);
app.use('/users', userRoutes);
app.use('/replay', replayRoutes);
app.use('/brokers', brokerRoutes);
app.use('/market', marketRoutes);
app.use('/leaderboard', leaderboardRoutes);
app.use('/analytics', analyticsRoutes);
app.use(marketRoutes);

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('Connected to MongoDB');
        await ensureIndexes();
        await tokenService.loadTokenFromDB();
        dhanAutoRenew.startAutoRenewCron();
        const { initBrokerTokenCron } = require('./jobs/brokerTokenCron');
        initBrokerTokenCron();
        // Initialize real-time ecosystem services
        notificationService.init(io);
        replayEngine.init(io);
        // Initialize multi-institute data manager
        instituteDataManager = new InstituteDataManager(io);
        app.set('instituteDataManager', instituteDataManager);
        await instituteDataManager.startAll();
        console.log(`[InstDataMgr] Active institute feeds: ${instituteDataManager.activeCount}`);
    })
    .catch(err => console.error('Error connecting to MongoDB:', err));

// Merge live market price into a DB document — the stored `ltp` is only a
// snapshot from the last BUY/SELL and goes stale immediately, which was
// causing P&L to flicker to a wrong value on every refresh before the next
// socket tick corrected it.
function withLiveLtp(doc) {
    const live = marketDataService.getStockPrice(doc.stockSymbol);
    const plain = doc.toObject ? doc.toObject() : doc;
    return {
        ...plain,
        ltp: live?.ltp ?? doc.ltp,
        change: live?.change ?? 0,
        changePercent: live?.changePercent ?? 0,
    };
}

// ============ UNIFIED STUDENT PORTFOLIO ============
app.get('/portfolio', async (req, res) => {
    try {
        const userId = req.user._id.toString();

        // 1. Check Redis cache first (unless ?fresh=true or ?nocache=true)
        if (!req.query.fresh && !req.query.nocache) {
            const cached = await CacheService.getPortfolio(userId);
            if (cached) {
                return res.status(200).json(cached);
            }
        }

        const [wallet, holdings, eqPositions, optPositions, closedPositions, userOrders] = await Promise.all([
            WalletModel.findOne({ userId }).lean().catch(() => null),
            HoldingsModel.find({ userId }).lean().catch(() => []),
            PositionsModel.find({ userId }).lean().catch(() => []),
            OptionPositionsModel.find({ userId }).lean().catch(() => []),
            ClosedPositionModel.find({ userId }).sort({ closedAt: -1 }).lean().catch(() => []),
            OrdersModel.find({ userId }).sort({ createdAt: -1 }).limit(50).lean().catch(() => [])
        ]);

        const safeHoldings = Array.isArray(holdings) ? holdings : [];
        const safeEqPositions = Array.isArray(eqPositions) ? eqPositions : [];
        const safeOptPositions = Array.isArray(optPositions) ? optPositions : [];
        const safeClosedPositions = Array.isArray(closedPositions) ? closedPositions : [];
        const safeUserOrders = Array.isArray(userOrders) ? userOrders : [];

        const startingCapital = req.user.startingCapitalPaise ? req.user.startingCapitalPaise / 100 : (wallet?.balance || 500000);
        const balance = wallet ? (wallet.balancePaise ? wallet.balancePaise / 100 : wallet.balance) : startingCapital;
        const totalUsedMargin = Math.round((wallet?.usedMargin || 0) + (wallet?.misMargin || 0) + (wallet?.optionMargin || 0));
        const availableMargin = wallet?.availableMargin ?? Math.max(0, balance - totalUsedMargin);
        const usedMargin = totalUsedMargin;
        const blockedMargin = wallet?.blockedMarginPaise ? wallet.blockedMarginPaise / 100 : (wallet?.blockedMargin || 0);

        // Calculate realized PnL
        let realizedPnl = safeClosedPositions.reduce((sum, c) => sum + (c?.pnl || 0), 0);
        let winCount = safeClosedPositions.filter(c => (c?.pnl || 0) > 0).length;
        const winRate = safeClosedPositions.length > 0 ? Math.round((winCount / safeClosedPositions.length) * 100) : 0;

        // Calculate unrealized PnL across open positions
        let unrealizedPnl = 0;
        const enrichedEq = safeEqPositions.map(p => {
            const live = marketDataService.getStockPrice(p.stockSymbol);
            const avg = Number(p.avgPrice || 0);
            const curPrice = Number(live?.ltp ?? (typeof p.ltp === 'number' ? p.ltp : avg));
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
        });

        const enrichedOpt = await Promise.all(safeOptPositions.map(async p => {
            let rawLtp = null;
            if (marketDataService.getOptionLTPSync && p.underlyingSymbol) {
                rawLtp = marketDataService.getOptionLTPSync(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry);
            }
            if (!rawLtp && marketDataService.getOptionLTP && p.underlyingSymbol) {
                try { rawLtp = await marketDataService.getOptionLTP(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry); } catch {}
            }
            const avg = Number(p.avgPremium || p.avgPrice || 100);
            const curPrice = Number(typeof rawLtp === 'number' ? rawLtp : (rawLtp?.ltp ?? (typeof p.ltp === 'number' && p.ltp > 0 ? p.ltp : avg)));
            const side = p.side || (p.quantity >= 0 ? 'BUY' : 'SELL');
            const dir = side.toUpperCase() === 'BUY' ? 1 : -1;
            const posPnl = Math.round((curPrice - avg) * (p.quantity || 1) * dir * 100) / 100;
            unrealizedPnl += (isNaN(posPnl) ? 0 : posPnl);
            const pnlPct = avg > 0 ? Math.round(((curPrice - avg) / avg) * dir * 10000) / 100 : 0;
            return {
                ...(p.toObject ? p.toObject() : p),
                kind: 'option',
                side,
                symbol: `${p.underlyingSymbol || 'OPTION'} ${p.strikePrice || ''} ${p.optionType || ''}`.trim(),
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

        const enrichedHoldings = safeHoldings.map(h => {
            const live = marketDataService.getStockPrice(h.stockSymbol);
            const avg = Number(h.avgPrice || 0);
            const curPrice = Number(live?.ltp ?? (typeof h.ltp === 'number' ? h.ltp : avg));
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
        });

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

        // Cache in Redis for 30s to absorb rapid re-renders/polling
        CacheService.setPortfolio(userId, portfolioPayload, 30).catch(() => {});

        res.status(200).json(portfolioPayload);
    } catch (err) {
        console.error('[Portfolio API Error]:', err);
        res.status(500).json({ message: 'Error fetching portfolio', error: err.message });
    }
});

// ============ COMBINED DASHBOARD SUMMARY (ZERO REDUNDANT CALLS) ============
app.get('/dashboard-summary', async (req, res) => {
    try {
        const userId = req.user._id.toString();

        // Check Redis cache (5s TTL)
        if (!req.query.fresh && !req.query.nocache) {
            const cached = await CacheService.getDashboardSummary(userId);
            if (cached) return res.status(200).json(cached);
        }

        const dateStr = require('./marketRules').istDateStr();
        const { NotificationModel } = require('./model/NotificationModel');
        const { PLRecordModel } = require('./model/PLRecordModel');

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
        const blockedMargin = wallet?.blockedMarginPaise ? wallet.blockedMarginPaise / 100 : (wallet?.blockedMargin || 0);
        const availableMargin = (wallet && typeof wallet.availableMargin === 'number' && wallet.availableMargin > 0)
            ? wallet.availableMargin
            : Math.max(0, balance - totalUsedMargin - blockedMargin);
        const usedMargin = totalUsedMargin;

        let realizedPnl = closedTrades.reduce((sum, c) => sum + (c.pnl || 0), 0);
        const todayClosed = closedTrades.filter(c => c.dateStr === dateStr || (c.closedAt && new Date(c.closedAt).toISOString().slice(0, 10) === dateStr));
        const todayRealized = todayClosed.reduce((sum, c) => sum + (c.pnl || 0), 0);

        let winCount = closedTrades.filter(c => (c.pnl || 0) > 0).length;
        const winRate = closedTrades.length > 0 ? Math.round((winCount / closedTrades.length) * 100) : 0;

        let unrealizedPnl = 0;
        for (const p of eqPositions) {
            const live = marketDataService.getStockPrice(p.stockSymbol);
            const avg = Number(p.avgPrice || 0);
            const cur = Number(live?.ltp ?? p.ltp ?? avg);
            const dir = (p.side || 'BUY').toUpperCase() === 'BUY' ? 1 : -1;
            unrealizedPnl += Math.round((cur - avg) * (p.quantity || 1) * dir * 100) / 100;
        }
        for (const p of optPositions) {
            let liveLtp = marketDataService.getOptionLTPSync ? marketDataService.getOptionLTPSync(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry) : null;
            if (!liveLtp && marketDataService.getOptionLTP) {
                try { liveLtp = await marketDataService.getOptionLTP(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry); } catch {}
            }
            const avg = Number(p.avgPremium || p.avgPrice || 100);
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

        CacheService.setDashboardSummary(userId, summary, 5).catch(() => {});
        res.status(200).json(summary);
    } catch (err) {
        console.error('[DashboardSummary Error]:', err);
        res.status(500).json({ message: 'Error generating dashboard summary', error: err.message });
    }
});

// ============ HOLDINGS ============
app.get('/allHoldings', async (req, res) => {
    try {
        const allHoldings = await HoldingsModel.find({ userId: req.user._id });
        res.status(200).json(allHoldings.map(withLiveLtp));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching holdings', error: err.message });
    }
});

// ============ POSITIONS ============
// Live LTP + realised (today's matched round-trips) + unrealised (mark-to-
// market on the still-open quantity) for one equity position.
async function enrichEquityPosition(doc) {
    const p = withLiveLtp(doc);
    const side = p.side || (p.quantity >= 0 ? 'BUY' : 'SELL');
    const dir = side.toUpperCase() === 'BUY' ? 1 : -1;
    const unrealizedPnl = Math.round((p.ltp - p.avgPrice) * p.quantity * dir * 100) / 100;
    const realizedPnl   = await computeRealizedPnlToday(doc.userId, p.stockSymbol, p.productType);
    return {
        ...p,
        kind: 'equity',
        symbol: p.stockSymbol,
        side,
        avgPrice: p.avgPrice,
        productType: p.productType || 'MIS',
        unrealizedPnl,
        realizedPnl,
        pnl: Math.round((unrealizedPnl + realizedPnl) * 100) / 100
    };
}

app.get(['/allPositions', '/positions'], async (req, res) => {
    try {
        const [allPositions, optPositions] = await Promise.all([
            PositionsModel.find({ userId: req.user._id }),
            OptionPositionsModel.find({ userId: req.user._id })
        ]);
        const enrichedEq = await Promise.all(allPositions.map(enrichEquityPosition));
        const enrichedOpt = await enrichOptionPositions(req.user._id, optPositions);
        res.status(200).json([...enrichedEq, ...enrichedOpt]);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching positions', error: err.message });
    }
});

// Positions-screen "Total P&L" — realised P&L from EVERY symbol traded today
// (including ones already fully squared off and removed from Positions/
// OptionPositions) plus unrealised mark-to-market on whatever is still open.
app.get('/positions/dayPnl', async (req, res) => {
    try {
        const [equityPositions, optionPositionsRaw, totalRealizedPnl] = await Promise.all([
            PositionsModel.find({ userId: req.user._id }),
            OptionPositionsModel.find({ userId: req.user._id }),
            computeTotalRealizedPnlToday(req.user._id),
        ]);
        const equity  = await Promise.all(equityPositions.map(enrichEquityPosition));
        const options = await enrichOptionPositions(req.user._id, optionPositionsRaw);
        const totalUnrealizedPnl = Math.round(
            (equity.reduce((s, p) => s + p.unrealizedPnl, 0) + options.reduce((s, p) => s + p.unrealizedPnl, 0)) * 100
        ) / 100;
        const totalPnl = Math.round((totalRealizedPnl + totalUnrealizedPnl) * 100) / 100;
        res.status(200).json({ totalRealizedPnl, totalUnrealizedPnl, totalPnl });
    } catch (err) {
        res.status(500).json({ message: 'Error computing day P&L', error: err.message });
    }
});

// Today's squared-off positions for the Positions screen — frozen P&L
// (booked at close time), with a live reference LTP merged in for display
// only (never used to recompute pnl). Scoped to today's dateStr so the
// screen naturally starts fresh each trading day without deleting history —
// the ClosedPositionModel rows themselves are kept forever for the trade
// book / overall P&L reports.
app.get('/closedPositions', async (req, res) => {
    try {
        const { dateStr } = istDayRange();
        const closed = await ClosedPositionModel.find({ userId: req.user._id, dateStr: req.query.date || dateStr })
            .sort({ closedAt: -1 }).lean();
        const withLtp = await Promise.all(closed.map(async (c) => {
            if (c.kind === 'option' && c.underlyingSymbol) {
                const liveLtp = await getLiveOptionLTP(c.underlyingSymbol, c.strikePrice, c.optionType, c.expiry);
                return { ...c, ltp: liveLtp ?? c.exitPrice };
            }
            const live = marketDataService.getStockPrice(c.symbol);
            return { ...c, ltp: live?.ltp ?? c.exitPrice };
        }));
        res.status(200).json(withLtp);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching closed positions', error: err.message });
    }
});

// Square off (fully or partially close) an equity MIS/NRML position at the
// current live LTP — the long-press "Square off" action in the app.
app.post('/positions/:id/squareoff', async (req, res) => {
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
        const side = isShort ? 'BUY' : 'SELL'; // cover a short, exit a long
        const positionQty = isHolding ? position.quantity : Math.abs(position.quantity);
        const requestedQty = req.body?.quantity ? Number(req.body.quantity) : positionQty;
        const quantity = Math.min(requestedQty, positionQty);
        const productType = isHolding ? 'CNC' : position.productType;

        const liveLtp = marketDataService.getStockPrice(position.stockSymbol)?.ltp ?? position.ltp;

        const result = await orderEngine.placeOrder(position.userId, {
            stockSymbol: position.stockSymbol, quantity, price: liveLtp,
            type: 'MARKET', side, productType,
        });
        CacheService.invalidatePortfolio(position.userId.toString()).catch(() => {});
        res.status(201).json({ message: 'Position squared off', order: result.order, trade: result.trade });

    } catch (err) {
        if (err instanceof orderEngine.OrderRejectedError) return res.status(400).json({ message: err.message });
        res.status(500).json({ message: 'Error squaring off position', error: err.message });
    }
});

// Universal Square-Off endpoint (POST /trade/square-off)
// Supports Option, Equity, and Holding positions with auto-detection
app.post('/trade/square-off', async (req, res) => {
    try {
        const targetId = req.body?.positionId || req.body?.id;
        if (!targetId) return res.status(400).json({ message: 'positionId is required' });

        const userIdStr = req.user._id.toString();

        // 1. Try Option position first
        const optPos = await OptionPositionsModel.findById(targetId);
        if (optPos) {
            if (req.user.role === 'STUDENT' && optPos.userId.toString() !== userIdStr) {
                return res.status(403).json({ message: 'Unauthorized to square off this position' });
            }
            const isShort = optPos.quantity < 0;
            const action  = isShort ? 'BUY' : 'SELL';
            const requestedLots = req.body?.lots ? Number(req.body.lots) : Math.abs(optPos.lots || 1);
            const lots = Math.min(requestedLots, Math.abs(optPos.lots || 1));

            const rawLive = await getLiveOptionLTP(optPos.underlyingSymbol, optPos.strikePrice, optPos.optionType, optPos.expiry);
            let premium = typeof rawLive === 'number' ? rawLive : (rawLive?.ltp ?? (typeof optPos.ltp === 'number' ? optPos.ltp : (optPos.ltp?.ltp ?? optPos.avgPremium ?? 100)));
            if (!Number.isFinite(Number(premium)) || Number(premium) <= 0) {
                premium = Number(optPos.avgPremium || 100);
            }

            const result = await executeOptionOrder(optPos.userId, {
                underlyingSymbol: optPos.underlyingSymbol, strikePrice: optPos.strikePrice,
                optionType: optPos.optionType, expiry: optPos.expiry,
                lots, premium, action,
            });
            CacheService.invalidatePortfolio(userIdStr).catch(() => {});
            return res.status(result.status).json(result.body);
        }

        // 2. Try Equity or Holding position
        let eqPos = await PositionsModel.findById(targetId);
        let isHolding = false;
        if (!eqPos) {
            eqPos = await HoldingsModel.findById(targetId);
            if (eqPos) isHolding = true;
        }
        if (!eqPos) return res.status(404).json({ message: 'Position not found' });

        if (req.user.role === 'STUDENT' && eqPos.userId.toString() !== userIdStr) {
            return res.status(403).json({ message: 'Unauthorized to square off this position' });
        }

        const isShort = isHolding ? false : eqPos.quantity < 0;
        const side = isShort ? 'BUY' : 'SELL';
        const positionQty = isHolding ? eqPos.quantity : Math.abs(eqPos.quantity);
        const requestedQty = req.body?.quantity ? Number(req.body.quantity) : positionQty;
        const quantity = Math.min(requestedQty, positionQty);
        const productType = isHolding ? 'CNC' : eqPos.productType;
        const liveLtp = marketDataService.getStockPrice(eqPos.stockSymbol)?.ltp ?? eqPos.ltp;

        const result = await orderEngine.placeOrder(eqPos.userId, {
            stockSymbol: eqPos.stockSymbol, quantity, price: liveLtp,
            type: 'MARKET', side, productType,
        });
        CacheService.invalidatePortfolio(userIdStr).catch(() => {});
        return res.status(201).json({ message: 'Position squared off', order: result.order, trade: result.trade });

    } catch (err) {
        if (err instanceof orderEngine.OrderRejectedError) return res.status(400).json({ message: err.message });
        res.status(500).json({ message: 'Error squaring off position', error: err.message });
    }
});

// ============ ORDERS ============
// Orders strictly scoped to authenticated user, supporting optional status filter
app.get(['/allOrders', '/orders'], async (req, res) => {
    try {
        const query = { userId: req.user._id };
        if (req.query.status) {
            query.status = req.query.status.toUpperCase();
        }
        if (req.query.today === 'true') {
            const { start } = istDayRange();
            query.createdAt = { $gte: start };
        }
        const page = req.query.page ? Math.max(1, parseInt(req.query.page, 10)) : null;
        const limit = req.query.limit ? Math.min(200, Math.max(1, parseInt(req.query.limit, 10))) : (page ? 20 : 200);

        if (page) {
            const skip = (page - 1) * limit;
            const [orders, total] = await Promise.all([
                OrdersModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
                OrdersModel.countDocuments(query)
            ]);
            return res.status(200).json({
                data: orders,
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            });
        }

        const allOrders = await OrdersModel.find(query).sort({ createdAt: -1 }).limit(limit).lean();
        res.status(200).json(allOrders);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching orders', error: err.message });
    }
});

// NSE market hours: Mon–Fri 09:15 IST start, excluding NSE holidays — single
// source of truth lives in marketRules.js (was duplicated inline before).
const isMarketOpen = rules.isMarketOpen;
const isActualMarketHours = rules.isActualMarketHours;

function isLiveMarketActive(segment = 'FO') {
    try {
        const marketControlService = require('./services/marketControlService');
        const state = marketControlService.getMarketState ? marketControlService.getMarketState() : null;
        if (state?.isHalted) return false;
        if (state?.mode === 'SYNTHETIC' || state?.mode === 'REPLAY') return true;
    } catch { /* ignore */ }
    return isActualMarketHours(segment);
}

// Today's date boundaries in IST (works regardless of server timezone)
function istDayRange(d = new Date()) {
    const ist = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const dateStr = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`;
    return {
        start: new Date(`${dateStr}T00:00:00.000+05:30`),
        end:   new Date(`${dateStr}T23:59:59.999+05:30`),
        dateStr,
    };
}

// A PositionsModel/OptionPositionsModel document only holds the still-OPEN
// net quantity — it has no memory of round-trips already closed earlier
// today. "Realised" P&L for the position screen has to come from FIFO-
// matching today's actual BUY/SELL trade log for that exact symbol.
async function computeRealizedPnlToday(userId, stockSymbol, productType) {
    const { start, end } = istDayRange();
    const trades = await TradeModel.find({
        userId, stockSymbol, productType, createdAt: { $gte: start, $lte: end },
    }).sort({ createdAt: 1 }).lean();

    const buyQueue = trades.filter(t => t.side === 'BUY').map(b => ({ price: b.price, remaining: b.quantity }));
    const sells = trades.filter(t => t.side === 'SELL');

    let realized = 0;
    for (const sell of sells) {
        let remainToMatch = sell.quantity;
        for (const buy of buyQueue) {
            if (remainToMatch <= 0) break;
            if (buy.remaining <= 0) continue;
            const matchQty = Math.min(remainToMatch, buy.remaining);
            realized += (sell.price - buy.price) * matchQty;
            buy.remaining -= matchQty;
            remainToMatch -= matchQty;
        }
    }
    return Math.round(realized * 100) / 100;
}

// Realised P&L for a symbol only exists while today's trades are still on
// the books — but a position document is DELETED once its quantity nets to
// zero (see applyEquityFillMIS / executeOptionOrder), so a fully squared-off
// symbol drops out of enrichEquityPosition/enrichOptionPositions entirely.
// The Positions-screen "Total P&L" has to include those closed round-trips
// too, so it's computed from the full trade log for today — independent of
// which positions are still open — rather than summed off currently-open
// position docs.
async function computeTotalRealizedPnlToday(userId) {
    const { start, end } = istDayRange();
    const trades = await TradeModel.find({ userId, createdAt: { $gte: start, $lte: end } })
        .select('stockSymbol productType').lean();

    const seen = new Set();
    let total = 0;
    for (const t of trades) {
        const key = `${t.stockSymbol}|${t.productType}`;
        if (seen.has(key)) continue;
        seen.add(key);
        total += await computeRealizedPnlToday(userId, t.stockSymbol, t.productType);
    }
    return Math.round(total * 100) / 100;
}

// Frozen snapshot for the Positions screen's "squared off" section — see
// orderEngine.recordClosedEquityPosition for the equity-side counterpart.
async function recordClosedOptionPosition({ userId, symbol, productType, quantity, lots, avgPrice, exitPrice, pnl, underlyingSymbol, strikePrice, optionType, expiry }) {
    try {
        await new ClosedPositionModel({
            userId, kind: 'option', symbol, productType, quantity, lots, avgPrice, exitPrice,
            pnl: Math.round(pnl * 100) / 100, dateStr: istDayRange().dateStr,
            underlyingSymbol, strikePrice, optionType, expiry,
        }).save();
    } catch (e) { console.error('[Index] recordClosedOptionPosition error:', e.message); }
}

// Places MARKET orders instantly; LIMIT/SL/SL-M rest as PENDING and are
// picked up by orderEngine.evaluatePendingOrders() on the next market tick —
// a real resting order book instead of "everything fills immediately".
app.post('/newOrder', async (req, res) => {
    let userBatchId = req.user?.batchId;
    if (!userBatchId && req.user?._id) {
        const { EnrollmentModel } = require('./model/EnrollmentModel');
        const enr = await EnrollmentModel.findOne({ userId: req.user._id, status: 'ACTIVE' });
        userBatchId = enr?.batchId;
    }
    const haltCheck = await marketControlService.isBatchHalted(userBatchId);
    if (haltCheck.isHalted) {
        return res.status(403).json({ message: `Trading is halted: ${haltCheck.reason || 'Trading paused'}` });
    }

    const { stockSymbol, triggerPrice, side, productType, exchange } = req.body;
    const quantity = req.body.qty ?? req.body.quantity;
    const type = req.body.mode ?? req.body.orderType;
    let price = req.body.price;
    if (!price || Number(price) <= 0) {
        const live = marketDataService.getStockPrice(stockSymbol);
        price = live?.ltp || 1000;
    }

    if (!stockSymbol || !quantity || !price) {
        return res.status(400).json({ message: 'Missing required fields: stockSymbol, qty, price' });
    }
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || !Number.isFinite(Number(price)) || Number(price) <= 0) {
        return res.status(400).json({ message: 'qty and price must be positive numbers' });
    }

    try {
        marketDataService.trackSymbol(stockSymbol);
        const orderType = ['MARKET', 'LIMIT', 'SL', 'SLM'].includes(type) ? type : 'MARKET';

        const result = await orderEngine.placeOrder(req.user._id, {
            stockSymbol, quantity, price, triggerPrice,
            type: orderType, side: side || 'BUY',
            productType: productType || 'CNC', exchange,
        });

        if (result.immediate) {
            res.status(201).json({
                message: 'Order executed successfully',
                order: result.order,
                trade: result.trade,
            });
        } else {
            res.status(201).json({
                message: `${orderType} order placed — resting until triggered`,
                order: result.order,
            });
        }
    } catch (err) {
        if (err instanceof orderEngine.OrderRejectedError) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: 'Error creating order', error: err.message });
    }
});

// Modify a resting PENDING order's price/qty/trigger
app.patch('/orders/:id', async (req, res) => {
    try {
        const order = await OrdersModel.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        if (req.user.role === 'STUDENT' && order.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized to modify this order' });
        }
        if (order.status !== 'PENDING') {
            return res.status(400).json({ message: `Cannot modify a ${order.status.toLowerCase()} order` });
        }
        const { qty, price, triggerPrice } = req.body;
        if (qty != null) order.quantity = Number(qty);
        if (price != null) {
            if (!rules.isValidTick(Number(price))) {
                return res.status(400).json({ message: `Price must be in multiples of ₹${rules.TICK_SIZE}` });
            }
            order.price = Number(price);
        }
        if (triggerPrice != null) order.triggerPrice = Number(triggerPrice);
        order.slTriggered = false; // re-arm SL if trigger/price changed
        await order.save();
        io.to(`user:${order.userId}`).emit('orderModified', { order: order.toObject ? order.toObject() : order });

        res.json({ message: 'Order modified', order });
    } catch (err) {
        res.status(500).json({ message: 'Error modifying order', error: err.message });
    }
});

// ============ BASKET ORDERS ============
// Bundle multiple legs and place them together. Each leg still goes through
// the normal order engine — MARKET legs fill immediately, LIMIT/SL/SL-M legs
// rest as PENDING, exactly like placing them one at a time.
app.get('/baskets', async (req, res) => {
    try {
        res.json(await BasketModel.find({ userId: req.user._id }).sort({ createdAt: -1 }));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching baskets', error: err.message });
    }
});

app.post('/baskets', async (req, res) => {
    const { name, legs } = req.body;
    if (!name || !Array.isArray(legs) || legs.length === 0) {
        return res.status(400).json({ message: 'name and a non-empty legs array are required' });
    }
    try {
        const basket = new BasketModel({
            userId: req.user._id,
            name,
            legs: legs.map(l => ({
                stockSymbol: String(l.stockSymbol).toUpperCase(),
                quantity: Number(l.quantity), price: Number(l.price),
                triggerPrice: l.triggerPrice ? Number(l.triggerPrice) : null,
                type: l.type || 'MARKET', side: l.side, productType: l.productType || 'CNC',
                exchange: l.exchange || 'NSE',
            })),
        });
        await basket.save();
        res.status(201).json(basket);
    } catch (err) {
        res.status(500).json({ message: 'Error creating basket', error: err.message });
    }
});

app.delete('/baskets/:id', async (req, res) => {
    try {
        await BasketModel.findByIdAndDelete(req.params.id);
        res.json({ message: 'Basket deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting basket', error: err.message });
    }
});

app.post('/baskets/:id/execute', async (req, res) => {
    if (!isMarketOpen()) {
        return res.status(400).json({ message: 'Market is closed', marketClosed: true });
    }
    try {
        const basket = await BasketModel.findById(req.params.id);
        if (!basket) return res.status(404).json({ message: 'Basket not found' });
        if (basket.executed) return res.status(400).json({ message: 'Basket already executed' });

        const results = [];
        for (const leg of basket.legs) {
            try {
                marketDataService.trackSymbol(leg.stockSymbol);
                const result = await orderEngine.placeOrder(req.user._id, {
                    stockSymbol: leg.stockSymbol, quantity: leg.quantity, price: leg.price,
                    triggerPrice: leg.triggerPrice, type: leg.type, side: leg.side,
                    productType: leg.productType, exchange: leg.exchange,
                });
                results.push({ stockSymbol: leg.stockSymbol, status: 'ok', immediate: result.immediate, orderId: result.order._id });
            } catch (e) {
                results.push({ stockSymbol: leg.stockSymbol, status: 'failed', error: e.message });
            }
        }
        basket.executed = true;
        basket.executedAt = new Date();
        await basket.save();
        res.json({ message: 'Basket executed', results });
    } catch (err) {
        res.status(500).json({ message: 'Error executing basket', error: err.message });
    }
});

// ============ COVER ORDERS ============
// A Cover Order is always a MARKET entry paired with a compulsory SL-M exit
// leg — the whole point is extra intraday leverage in exchange for a
// guaranteed stop-loss. If the entry order can't fill, no SL leg is created.
const COVER_ORDER_LEVERAGE = 20; // approximation — real Kite CO margin is exchange-published and varies by scrip

app.post('/newCoverOrder', async (req, res) => {
    const { stockSymbol, quantity, price, stopLossTriggerPrice, side, exchange } = req.body;
    if (!stockSymbol || !quantity || !price || !stopLossTriggerPrice || !side) {
        return res.status(400).json({ message: 'Missing required fields: stockSymbol, quantity, price, stopLossTriggerPrice, side' });
    }
    // Same class of bug as /newOrder: `!quantity`/`!price` don't catch
    // negative values, which would corrupt the margin/notional math below.
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || !Number.isFinite(Number(price)) || Number(price) <= 0) {
        return res.status(400).json({ message: 'quantity and price must be positive numbers' });
    }
    if (!isMarketOpen()) {
        return res.status(400).json({ message: 'Market is closed', marketClosed: true, detail: 'NSE trading hours: Mon–Fri, 9:15 AM – 3:30 PM IST.' });
    }

    try {
        marketDataService.trackSymbol(stockSymbol);
        const ltp = marketDataService.getStockPrice(stockSymbol.toUpperCase())?.ltp ?? Number(price);
        const notional = Number(quantity) * ltp;
        const required = notional / COVER_ORDER_LEVERAGE;
        const wallet = await WalletModel.findOne({ userId: req.user._id });
        if (!wallet || wallet.availableMargin < required) {
            return res.status(400).json({ message: 'Insufficient funds for cover order', required, available: wallet?.availableMargin ?? 0 });
        }

        // Main leg — always MARKET, always MIS (cover orders are intraday-only)
        const mainResult = await orderEngine.placeOrder(req.user._id, {
            stockSymbol, quantity, price: ltp, type: 'MARKET', side,
            productType: 'MIS', exchange,
        });
        mainResult.order.isCoverOrder = true;
        await mainResult.order.save();

        // Compulsory SL-M exit leg, opposite side, rests until the stop is hit
        const slSide = side === 'BUY' ? 'SELL' : 'BUY';
        const slOrder = new OrdersModel({
            userId: req.user._id,
            stockSymbol: stockSymbol.toUpperCase(), quantity: Number(quantity),
            price: Number(stopLossTriggerPrice), triggerPrice: Number(stopLossTriggerPrice),
            type: 'SLM', side: slSide, productType: 'MIS', exchange: exchange || 'NSE',
            status: 'PENDING', isCoverOrder: true, linkedOrderId: mainResult.order._id,
        });
        await slOrder.save();
        mainResult.order.linkedOrderId = slOrder._id;
        await mainResult.order.save();

        io.to(`user:${req.user._id}`).emit('coverOrderPlaced', { mainOrder: mainResult.order, slOrder });
        res.status(201).json({ message: 'Cover order placed', mainOrder: mainResult.order, slOrder, trade: mainResult.trade });

    } catch (err) {
        if (err instanceof orderEngine.OrderRejectedError) return res.status(400).json({ message: err.message });
        res.status(500).json({ message: 'Error placing cover order', error: err.message });
    }
});

// ============ TRADES ============
app.get('/trades', async (req, res) => {
    try {
        const { from, to } = req.query;
        let query = { userId: req.user._id };
        if (from || to) {
            query.createdAt = {};
            if (from) query.createdAt.$gte = new Date(from);
            if (to) query.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
        }
        const trades = await TradeModel.find(query).sort({ createdAt: -1 });
        res.status(200).json(trades);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching trades', error: err.message });
    }
});

// ============ P&L STATEMENT ============
app.get('/pnl', async (req, res) => {
    try {
        const { segment, from, to } = req.query;

        // Build date filter
        const dateFilter = {};
        if (from) dateFilter.$gte = new Date(from + 'T00:00:00.000Z');
        if (to) {
            const toDate = new Date(to + 'T23:59:59.999Z');
            dateFilter.$lte = toDate;
        }

        // Map segment name to productType(s)
        const segmentProductTypeMap = {
            equity:       ['CNC'],
            fno:          ['NRML'],
            'futures & options': ['NRML'],
            currency:     ['CNC'],
            commodity:    ['NRML'],
            mtf:          ['MIS'],
            mutualfunds:  ['CNC'],
        };

        const tradeQuery = { userId: req.user._id };
        if (Object.keys(dateFilter).length > 0) tradeQuery.createdAt = dateFilter;

        const segKey = (segment || '').toLowerCase().replace(/\s+/g, '');
        if (segKey && segKey !== 'combined') {
            const mapped = segmentProductTypeMap[segKey];
            if (mapped) tradeQuery.productType = { $in: mapped };
        }

        const trades = await TradeModel.find(tradeQuery).sort({ createdAt: 1 });

        // Group trades by stockSymbol
        const tradesBySymbol = {};
        trades.forEach(trade => {
            if (!tradesBySymbol[trade.stockSymbol]) {
                tradesBySymbol[trade.stockSymbol] = { buys: [], sells: [], charges: 0 };
            }
            if (trade.side === 'BUY') {
                tradesBySymbol[trade.stockSymbol].buys.push(trade);
            } else {
                tradesBySymbol[trade.stockSymbol].sells.push(trade);
            }
            tradesBySymbol[trade.stockSymbol].charges += (trade.charges || 0);
        });

        let totalRealizedPL = 0;
        let totalCharges = 0;
        const tradeDetails = [];

        Object.entries(tradesBySymbol).forEach(([symbol, { buys, sells, charges }]) => {
            const totalBuyQty   = buys.reduce((s, t) => s + t.quantity, 0);
            const totalSellQty  = sells.reduce((s, t) => s + t.quantity, 0);
            const totalBuyValue = buys.reduce((s, t) => s + t.totalValue, 0);
            const totalSellValue= sells.reduce((s, t) => s + t.totalValue, 0);

            const buyAvg  = totalBuyQty  > 0 ? totalBuyValue  / totalBuyQty  : 0;
            const sellAvg = totalSellQty > 0 ? totalSellValue / totalSellQty : 0;

            // FIFO-matched realized P&L
            const matchedQty  = Math.min(totalBuyQty, totalSellQty);
            const realizedPL  = matchedQty > 0 ? (sellAvg - buyAvg) * matchedQty : 0;
            const realizedPct = buyAvg > 0 && matchedQty > 0
                ? parseFloat(((sellAvg - buyAvg) / buyAvg * 100).toFixed(2))
                : 0;

            totalRealizedPL += realizedPL;
            totalCharges    += charges;

            // Last trade timestamp
            const allTrades = [...buys, ...sells].sort(
                (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            );

            if (totalBuyQty > 0 || totalSellQty > 0) {
                tradeDetails.push({
                    stockSymbol:  symbol,
                    quantity:     Math.max(totalBuyQty, totalSellQty),
                    buyQty:       totalBuyQty,
                    sellQty:      totalSellQty,
                    buyAvg:       parseFloat(buyAvg.toFixed(2)),
                    sellAvg:      parseFloat(sellAvg.toFixed(2)),
                    buyValue:     parseFloat(totalBuyValue.toFixed(2)),
                    sellValue:    parseFloat(totalSellValue.toFixed(2)),
                    realizedPL:   parseFloat(realizedPL.toFixed(2)),
                    realizedPct,
                    charges:      parseFloat(charges.toFixed(2)),
                    lastTrade:    allTrades[0]?.createdAt || new Date(),
                });
            }
        });

        // Unrealized P&L from current holdings
        let holdingsQuery = { userId: req.user._id };
        if (segKey === 'equity') holdingsQuery.productType = { $in: ['CNC'] };
        else if (segKey === 'mtf')  holdingsQuery.productType = 'MIS';

        const holdings = (await HoldingsModel.find(holdingsQuery)).map(withLiveLtp);
        const totalInvestment = holdings.reduce((s, h) => s + h.avgPrice * h.quantity, 0);
        const currentValue    = holdings.reduce((s, h) => s + h.ltp    * h.quantity, 0);
        const unrealizedPL    = parseFloat((currentValue - totalInvestment).toFixed(2));

        const otherCreditsDebits = 0; // placeholder — extend with a ledger model as needed
        const netRealizedPL = parseFloat((totalRealizedPL - totalCharges + otherCreditsDebits).toFixed(2));

        // Sort by lastTrade desc
        tradeDetails.sort((a, b) => new Date(b.lastTrade) - new Date(a.lastTrade));

        res.status(200).json({
            summary: {
                realizedPL:        parseFloat(totalRealizedPL.toFixed(2)),
                unrealizedPL,
                chargesAndTaxes:   parseFloat(totalCharges.toFixed(2)),
                otherCreditsDebits,
                netRealizedPL,
            },
            trades:      tradeDetails,
            totalTrades: tradeDetails.length,
            lastUpdated: new Date().toISOString().slice(0, 10),
            segment:     segment || 'combined',
            from:        from  || null,
            to:          to    || null,
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching P&L data', error: err.message });
    }
});

// ============ P&L RECORDS (from imported trade log) ============

// Helper: detect segment from symbol name
function detectSegment(symbol) {
    const s = symbol.toUpperCase();
    if (s.startsWith('SENSEX') || s.startsWith('BANKNIFTY') || s.startsWith('NIFTY')) return 'fno';
    if (s.includes('USD') || s.includes('EUR') || s.includes('GBP')) return 'currency';
    return 'equity';
}

// GET /pnl/records — filtered PLRecord query
app.get('/pnl/records', async (req, res) => {
    try {
        const { segment, from, to, page = 1, limit = 50 } = req.query;
        const query = { userId: req.user._id };
        if (from) query.tradeDate = { ...query.tradeDate, $gte: new Date(from) };
        if (to)   query.tradeDate = { ...query.tradeDate, $lte: new Date(to + 'T23:59:59.999Z') };
        const segKey = (segment || '').toLowerCase();
        if (segKey && segKey !== 'combined') query.segment = segKey;

        const skip = (Number(page) - 1) * Number(limit);
        const [records, total] = await Promise.all([
            PLRecordModel.find(query).sort({ tradeDate: -1 }).skip(skip).limit(Number(limit)),
            PLRecordModel.countDocuments(query),
        ]);

        // Aggregate summary
        const agg = await PLRecordModel.aggregate([
            { $match: query },
            { $group: {
                _id: null,
                totalRealizedPL:  { $sum: '$realizedPL' },
                totalCharges:     { $sum: '$charges' },
                totalNetPL:       { $sum: '$netPL' },
                winningTrades:    { $sum: { $cond: [{ $gt: ['$realizedPL', 0] }, 1, 0] } },
                losingTrades:     { $sum: { $cond: [{ $lt: ['$realizedPL', 0] }, 1, 0] } },
            }},
        ]);

        const summary = agg[0] || { totalRealizedPL: 0, totalCharges: 0, totalNetPL: 0, winningTrades: 0, losingTrades: 0 };

        // Unrealized from holdings. Holdings are equity (CNC) positions, so
        // only the equity / combined segments carry an unrealized leg —
        // other segments (fno, currency, commodity, …) have none.
        let unrealizedPL = 0;
        if (segKey === '' || segKey === 'combined' || segKey === 'equity') {
            const holdings = (await HoldingsModel.find({
                userId: req.user._id,
                ...(segKey === 'equity' ? { productType: 'CNC' } : {})
            })).map(withLiveLtp);
            unrealizedPL = holdings.reduce((s, h) => s + (h.ltp - h.avgPrice) * h.quantity, 0);
        }

        const otherCreditsDebits = 0;
        const netRealizedPL = parseFloat((summary.totalRealizedPL - summary.totalCharges + otherCreditsDebits).toFixed(2));

        res.status(200).json({
            summary: {
                realizedPL:        parseFloat((summary.totalRealizedPL || 0).toFixed(2)),
                unrealizedPL:      parseFloat(unrealizedPL.toFixed(2)),
                chargesAndTaxes:   parseFloat((summary.totalCharges || 0).toFixed(2)),
                otherCreditsDebits,
                netRealizedPL,
                winningTrades:     summary.winningTrades || 0,
                losingTrades:      summary.losingTrades  || 0,
            },
            trades: records.map(r => ({
                stockSymbol:   r.symbol,
                tradeDate:     r.tradeDate,
                quantity:      r.quantity,
                buyValue:      r.buyValue,
                sellValue:     r.sellValue,
                realizedPL:    r.realizedPL,
                realizedPct:   r.realizedPLPct,
                charges:       r.charges,
                netPL:         r.netPL,
                buyAvg:        r.quantity > 0 ? parseFloat((r.buyValue  / r.quantity).toFixed(2)) : 0,
                sellAvg:       r.quantity > 0 ? parseFloat((r.sellValue / r.quantity).toFixed(2)) : 0,
            })),
            totalTrades:  total,
            page:         Number(page),
            totalPages:   Math.ceil(total / Number(limit)),
            lastUpdated:  new Date().toISOString().slice(0, 10),
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching P&L records', error: err.message });
    }
});

// POST /pnl/seed — insert imported trade-log records (idempotent via upsert)
app.post('/pnl/seed', async (req, res) => {
    try {
        const { records, clear } = req.body;
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ message: 'records array is required' });
        }

        if (clear) {
            await PLRecordModel.deleteMany({ userId: req.user._id, source: 'import' });
        }

        const docs = records.map(r => ({
            userId:        req.user._id,
            tradeDate:     new Date(r.tradeDate),
            symbol:        String(r.symbol).toUpperCase(),
            quantity:      Number(r.quantity),
            buyValue:      Number(r.buyValue),
            sellValue:     Number(r.sellValue),
            realizedPL:    Number(r.realizedPL),
            charges:       Number(r.charges),
            netPL:         Number(r.netPL),
            realizedPLPct: Number(r.realizedPLPct),
            segment:       detectSegment(String(r.symbol)),
            source:        'import',
        }));

        const result = await PLRecordModel.insertMany(docs, { ordered: false });
        res.status(201).json({ message: `Seeded ${result.length} records successfully` });
    } catch (err) {
        res.status(500).json({ message: 'Error seeding P&L records', error: err.message });
    }
});

// GET /pnl/summary — quick aggregate summary from PLRecords
app.get('/pnl/summary', async (req, res) => {
    try {
        const { from, to } = req.query;
        const match = { userId: req.user._id };
        if (from) match.tradeDate = { $gte: new Date(from) };
        if (to)   match.tradeDate = { $lte: new Date(to + 'T23:59:59.999Z') };

        const [agg] = await PLRecordModel.aggregate([
            { $match: match },
            { $group: {
                _id: null,
                totalRealizedPL:  { $sum: '$realizedPL' },
                totalCharges:     { $sum: '$charges' },
                totalNetPL:       { $sum: '$netPL' },
                totalTrades:      { $sum: 1 },
                winningTrades:    { $sum: { $cond: [{ $gt: ['$realizedPL', 0] }, 1, 0] } },
                losingTrades:     { $sum: { $cond: [{ $lt: ['$realizedPL', 0] }, 1, 0] } },
            }},
        ]);
        res.status(200).json(agg || { totalRealizedPL: 0, totalCharges: 0, totalNetPL: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0 });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching summary', error: err.message });
    }
});

// ============ P&L CHARGES BREAKDOWN ============
app.get('/pnl/charges', async (req, res) => {
    try {
        const { from, to, segment } = req.query;

        // Real per-component charges aggregated from the seeded trade sheet (PLRecords)
        const query = { userId: req.user._id };
        if (from) query.tradeDate = { $gte: new Date(from) };
        if (to)   query.tradeDate = { $lte: new Date(to + 'T23:59:59.999Z') };
        const segKey = (segment || '').toLowerCase();
        if (segKey && segKey !== 'combined') query.segment = segKey;

        const agg = await PLRecordModel.aggregate([
            { $match: query },
            { $group: {
                _id: null,
                brokerage:       { $sum: '$brokerage' },
                stt:             { $sum: '$stt' },
                exchangeCharges: { $sum: '$exchangeCharges' },
                gst:             { $sum: '$gst' },
                sebiCharges:     { $sum: '$sebiCharges' },
                stampDuty:       { $sum: '$stampDuty' },
                charges:         { $sum: '$charges' },
                turnover:        { $sum: { $add: ['$buyValue', '$sellValue'] } },
                trades:          { $sum: 1 },
            }},
        ]);

        const a = agg[0] || { brokerage:0, stt:0, exchangeCharges:0, gst:0, sebiCharges:0, stampDuty:0, charges:0, turnover:0, trades:0 };
        const r2 = (n) => parseFloat((n || 0).toFixed(2));

        // Total of real components; fall back to stored `charges` sum if components are empty
        const componentSum = a.brokerage + a.stt + a.exchangeCharges + a.gst + a.sebiCharges + a.stampDuty;
        const total = componentSum > 0 ? componentSum : a.charges;

        res.status(200).json({
            breakdown: [
                { label: 'Brokerage',        amount: r2(a.brokerage)       },
                { label: 'STT/CTT',          amount: r2(a.stt)             },
                { label: 'Exchange charges', amount: r2(a.exchangeCharges) },
                { label: 'GST',              amount: r2(a.gst)             },
                { label: 'SEBI charges',     amount: r2(a.sebiCharges)     },
                { label: 'Stamp duty',       amount: r2(a.stampDuty)       },
            ],
            total:    r2(total),
            turnover: r2(a.turnover),
            trades:   a.trades,
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching charges breakdown', error: err.message });
    }
});

// ============ P&L MONTHLY BREAKDOWN ============
app.get('/pnl/monthly-breakdown', async (req, res) => {
    try {
        const { from, to, segment, initialBalance = '34000000' } = req.query;

        const match = { userId: req.user._id };
        if (from) match.tradeDate = { $gte: new Date(from) };
        if (to)   match.tradeDate = { $lte: new Date(to + 'T23:59:59.999Z') };
        const segKey = (segment || '').toLowerCase();
        if (segKey && segKey !== 'combined') match.segment = segKey;

        const agg = await PLRecordModel.aggregate([
            { $match: match },
            { $group: {
                _id: { year: { $year: '$tradeDate' }, month: { $month: '$tradeDate' } },
                realizedPL:  { $sum: '$realizedPL' },
                charges:     { $sum: '$charges' },
                netPL:       { $sum: '$netPL' },
                turnover:    { $sum: { $add: ['$buyValue', '$sellValue'] } },
                tradeCount:  { $sum: 1 },
                winTrades:   { $sum: { $cond: [{ $gt: ['$realizedPL', 0] }, 1, 0] } },
                lossTrades:  { $sum: { $cond: [{ $lt: ['$realizedPL', 0] }, 1, 0] } },
            }},
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);

        let runningBalance = Number(initialBalance);
        const months = agg.map(m => {
            const openingBalance = parseFloat(runningBalance.toFixed(2));
            const realizedPL     = parseFloat((m.realizedPL || 0).toFixed(2));
            const charges        = parseFloat((m.charges    || 0).toFixed(2));
            const netPL          = parseFloat((m.netPL      || 0).toFixed(2));
            const closingBalance = parseFloat((openingBalance + netPL).toFixed(2));
            runningBalance = closingBalance;

            return {
                month:           `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
                openingBalance,
                realizedPL,
                charges,
                netPL,
                closingBalance,
                turnover:    parseFloat((m.turnover    || 0).toFixed(2)),
                tradeCount:  m.tradeCount,
                winTrades:   m.winTrades,
                lossTrades:  m.lossTrades,
            };
        });

        const totalNetPL     = parseFloat(months.reduce((s, m) => s + m.netPL, 0).toFixed(2));
        const totalCharges   = parseFloat(months.reduce((s, m) => s + m.charges, 0).toFixed(2));
        const totalRealizedPL= parseFloat(months.reduce((s, m) => s + m.realizedPL, 0).toFixed(2));
        const totalTrades    = months.reduce((s, m) => s + m.tradeCount, 0);
        const totalTurnover  = parseFloat(months.reduce((s, m) => s + m.turnover, 0).toFixed(2));

        res.json({
            months,
            initialBalance: Number(initialBalance),
            finalBalance:   parseFloat(runningBalance.toFixed(2)),
            totals: { totalNetPL, totalCharges, totalRealizedPL, totalTrades, totalTurnover },
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching monthly breakdown', error: err.message });
    }
});

// ============ TAX P&L ============
// POST /tax-pnl/seed-equity — adds sample CNC equity trades for STCG/LTCG demo
// SECURITY: restricted to development only — destructive (deletes all CNC trades)
app.post('/tax-pnl/seed-equity', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: 'Seed endpoint disabled in production' });
    }
    try {
        // Remove old equity trades first
        await TradeModel.deleteMany({ userId: req.user._id, productType: 'CNC' });

        const equityTrades = [
            // STCG trades (held < 365 days) — FY 2025-26
            { sym: 'RELIANCE', qty: 50, buyPrice: 2450.00, sellPrice: 2780.50, buyDate: '2025-06-10', sellDate: '2025-12-15', charges: 320 },
            { sym: 'INFY',     qty: 100, buyPrice: 1380.00, sellPrice: 1520.00, buyDate: '2025-08-05', sellDate: '2026-01-20', charges: 410 },
            { sym: 'TCS',      qty: 30,  buyPrice: 3900.00, sellPrice: 4210.00, buyDate: '2025-09-12', sellDate: '2026-03-08', charges: 290 },
            { sym: 'HDFCBANK', qty: 80,  buyPrice: 1620.00, sellPrice: 1480.00, buyDate: '2025-10-01', sellDate: '2026-02-14', charges: 360 },
            { sym: 'WIPRO',    qty: 200, buyPrice: 420.00,  sellPrice: 510.00,  buyDate: '2025-11-20', sellDate: '2026-04-15', charges: 280 },
            { sym: 'BAJFINANCE',qty:20,  buyPrice: 6800.00, sellPrice: 7350.00, buyDate: '2025-07-18', sellDate: '2026-01-05', charges: 410 },
            { sym: 'SBIN',     qty: 150, buyPrice: 780.00,  sellPrice: 710.00,  buyDate: '2025-12-01', sellDate: '2026-04-10', charges: 260 },
            { sym: 'MARUTI',   qty: 15,  buyPrice: 10200.00,sellPrice: 11500.00,buyDate: '2026-01-08', sellDate: '2026-05-25', charges: 330 },

            // LTCG trades (held >= 365 days) — bought before Apr 2025
            { sym: 'ASIANPAINT',qty:40,  buyPrice: 2850.00, sellPrice: 3200.00, buyDate: '2024-03-15', sellDate: '2025-06-20', charges: 380 },
            { sym: 'ITC',      qty: 500, buyPrice: 430.00,  sellPrice: 480.00,  buyDate: '2024-01-10', sellDate: '2025-08-30', charges: 460 },
            { sym: 'TITAN',    qty: 25,  buyPrice: 3200.00, sellPrice: 3650.00, buyDate: '2023-11-05', sellDate: '2025-05-12', charges: 310 },
            { sym: 'NESTLEIND',qty:10,   buyPrice: 22000.00,sellPrice: 24500.00,buyDate: '2024-02-20', sellDate: '2025-07-18', charges: 290 },
            { sym: 'DRREDDY',  qty: 30,  buyPrice: 5400.00, sellPrice: 5100.00, buyDate: '2024-04-08', sellDate: '2025-09-22', charges: 420 },
            { sym: 'SUNPHARMA',qty:60,   buyPrice: 1050.00, sellPrice: 1380.00, buyDate: '2023-12-01', sellDate: '2025-06-05', charges: 340 },
        ];

        const docs = [];
        equityTrades.forEach(t => {
            const buyTime  = new Date(t.buyDate  + 'T09:15:00.000Z');
            const sellTime = new Date(t.sellDate + 'T15:20:00.000Z');
            docs.push({
                userId: req.user._id,
                stockSymbol: t.sym, quantity: t.qty, price: t.buyPrice,
                side: 'BUY', productType: 'CNC',
                charges: parseFloat((t.charges * 0.3).toFixed(2)),
                totalValue: parseFloat((t.qty * t.buyPrice).toFixed(2)),
                createdAt: buyTime, updatedAt: buyTime,
            });
            docs.push({
                userId: req.user._id,
                stockSymbol: t.sym, quantity: t.qty, price: t.sellPrice,
                side: 'SELL', productType: 'CNC',
                charges: parseFloat((t.charges * 0.7).toFixed(2)),
                totalValue: parseFloat((t.qty * t.sellPrice).toFixed(2)),
                createdAt: sellTime, updatedAt: sellTime,
            });
        });

        await TradeModel.insertMany(docs, { timestamps: false });
        res.json({ message: `Seeded ${docs.length} equity trade documents`, count: docs.length });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /tax-pnl — STCG/LTCG/F&O/Speculative breakdown
app.get('/tax-pnl', async (req, res) => {
    try {
        const { fy = '2025-26' } = req.query;
        // Validate FY format: must be YYYY-YY (e.g. 2025-26)
        if (!/^\d{4}-\d{2}$/.test(fy)) {
            return res.status(400).json({ message: 'Invalid fy format. Use YYYY-YY (e.g. 2025-26)' });
        }
        const [startYear] = fy.split('-').map(Number);
        if (startYear < 2000 || startYear > 2100) {
            return res.status(400).json({ message: 'FY year out of range' });
        }
        const fyFrom = new Date(`${startYear}-04-01T00:00:00.000Z`);
        const fyTo   = new Date(`${startYear + 1}-03-31T23:59:59.999Z`);

        // Tax rates by FY (changed post-Budget July 2024 for FY 2024-25+)
        const TAX_RATES = startYear >= 2024
            ? { stcg: 20, ltcg: 12.5, ltcgExempt: 125000 }
            : { stcg: 15, ltcg: 10,   ltcgExempt: 100000 };

        // All SELL trades within FY (these are realization events)
        const sells = await TradeModel.find({
            userId: req.user._id,
            side: 'SELL',
            createdAt: { $gte: fyFrom, $lte: fyTo },
        }).lean().sort({ createdAt: 1 });

        // All BUY trades (need full history for FIFO lot matching)
        const allBuys = await TradeModel.find({ userId: req.user._id, side: 'BUY' }).lean().sort({ createdAt: 1 });

        // Group buys by symbol → FIFO queue
        const buyQueues = {};
        allBuys.forEach(b => {
            if (!buyQueues[b.stockSymbol]) buyQueues[b.stockSymbol] = [];
            buyQueues[b.stockSymbol].push({
                date:  new Date(b.createdAt),
                price: b.price,
                qty:   b.quantity,
                remaining: b.quantity,
                productType: b.productType,
                charges: b.charges || 0,
            });
        });

        // Helper: F&O symbol?
        const isFnO = (sym, pt) => pt === 'NRML' && /^(NIFTY|BANKNIFTY|SENSEX|FINNIFTY|MIDCPNIFTY|\w+\d+(CE|PE|FUT))/.test(sym);

        const tradeLots = [];  // individual matched lots
        const summaries = {
            stcg:        { realizedPL: 0, charges: 0, trades: 0 },
            ltcg:        { realizedPL: 0, charges: 0, trades: 0 },
            fno:         { realizedPL: 0, charges: 0, trades: 0 },
            speculative: { realizedPL: 0, charges: 0, trades: 0 },
        };

        for (const sell of sells) {
            const sym   = sell.stockSymbol;
            const queue = buyQueues[sym];
            if (!queue || queue.length === 0) continue;

            let remainToMatch = sell.quantity;
            const sellDate    = new Date(sell.createdAt);

            while (remainToMatch > 0 && queue.length > 0) {
                const buy = queue[0];
                if (buy.remaining <= 0) { queue.shift(); continue; }

                const matchQty = Math.min(remainToMatch, buy.remaining);
                buy.remaining -= matchQty;
                remainToMatch -= matchQty;

                const buyDate     = buy.date;
                const holdingDays = Math.floor((sellDate - buyDate) / 86400000);
                const pnlAmt      = parseFloat(((sell.price - buy.price) * matchQty).toFixed(2));
                const charges     = parseFloat(((buy.charges + sell.charges) * (matchQty / sell.quantity)).toFixed(2));

                // Categorize — use both buy and sell productType for accuracy
                const effectivePT = (sell.productType === 'MIS' || buy.productType === 'MIS') ? 'MIS' : sell.productType;
                let category;
                if (effectivePT === 'MIS') {
                    category = 'speculative';
                } else if (isFnO(sym, sell.productType) || isFnO(sym, buy.productType)) {
                    category = 'fno';
                } else if (holdingDays >= 365) {
                    category = 'ltcg';
                } else {
                    category = 'stcg';
                }

                summaries[category].realizedPL += pnlAmt;
                summaries[category].charges    += charges;
                summaries[category].trades     += 1;

                tradeLots.push({
                    stockSymbol:  sym,
                    category,
                    buyDate:      buyDate.toISOString().slice(0, 10),
                    sellDate:     sellDate.toISOString().slice(0, 10),
                    holdingDays,
                    qty:          matchQty,
                    buyPrice:     buy.price,
                    sellPrice:    sell.price,
                    buyValue:     parseFloat((buy.price * matchQty).toFixed(2)),
                    sellValue:    parseFloat((sell.price * matchQty).toFixed(2)),
                    realizedPL:   pnlAmt,
                    charges:      parseFloat(charges.toFixed(2)),
                    netPL:        parseFloat((pnlAmt - charges).toFixed(2)),
                    productType:  sell.productType,
                });

                if (buy.remaining <= 0) queue.shift();
            }
            // FIFO warning: sell qty exceeded available buy history
            if (remainToMatch > 0) {
                console.warn(`[tax-pnl] Unmatched sell qty ${remainToMatch} for ${sym} — missing buy history or short position`);
            }
        }

        // Round summaries
        Object.keys(summaries).forEach(k => {
            summaries[k].realizedPL = parseFloat(summaries[k].realizedPL.toFixed(2));
            summaries[k].charges    = parseFloat(summaries[k].charges.toFixed(2));
            summaries[k].netPL      = parseFloat((summaries[k].realizedPL - summaries[k].charges).toFixed(2));
        });

        // Tax computation — rates determined by TAX_RATES selected above based on FY
        const { stcg: STCG_RATE, ltcg: LTCG_RATE, ltcgExempt: LTCG_EXEMPT } = TAX_RATES;

        const stcgTaxable = Math.max(0, summaries.stcg.realizedPL);
        const ltcgTaxable = Math.max(0, summaries.ltcg.realizedPL - LTCG_EXEMPT);

        const taxEstimate = {
            stcg: {
                rate: STCG_RATE,
                taxable: stcgTaxable,
                tax:     parseFloat((stcgTaxable * STCG_RATE / 100).toFixed(2)),
                note:    `${STCG_RATE}% on equity gains held < 12 months`,
            },
            ltcg: {
                rate:     LTCG_RATE,
                taxable:  ltcgTaxable,
                tax:      parseFloat((ltcgTaxable * LTCG_RATE / 100).toFixed(2)),
                exemption: LTCG_EXEMPT,
                note:     `${LTCG_RATE}% on equity gains held > 12 months (₹${(LTCG_EXEMPT/100000).toFixed(2)}L exempt)`,
            },
            fno: {
                note: 'Taxed as non-speculative business income at slab rate',
                taxable: summaries.fno.realizedPL,
            },
            speculative: {
                note: 'Taxed as speculative business income at slab rate',
                taxable: summaries.speculative.realizedPL,
            },
            totalDirectTax: parseFloat(
                ((stcgTaxable * STCG_RATE / 100) + (ltcgTaxable * LTCG_RATE / 100)).toFixed(2)
            ),
        };

        tradeLots.sort((a, b) => new Date(b.sellDate) - new Date(a.sellDate));

        res.json({
            fy,
            fyFrom: fyFrom.toISOString().slice(0, 10),
            fyTo:   fyTo.toISOString().slice(0, 10),
            summaries,
            taxEstimate,
            trades: tradeLots,
            totalTrades: tradeLots.length,
        });
    } catch (err) {
        console.error('[tax-pnl]', err);
        res.status(500).json({ message: 'Failed to compute Tax P&L. Please try again.' });
    }
});

// ============ WALLET ============
app.get('/wallet', async (req, res) => {
    try {
        const uid = req.user._id;
        let wallet = await WalletModel.findOne({ userId: uid });
        if (!wallet) {
            const { EnrollmentModel } = require('./model/EnrollmentModel');
            const enrollment = await EnrollmentModel.findOne({ userId: uid, status: 'ACTIVE' }).populate('batchId');
            const capPaise = enrollment?.batchId?.startingCapitalPaise || 10000000;
            const capRupees = capPaise / 100;
            wallet = await WalletModel.create({
                userId: uid,
                balance: capRupees,
                balancePaise: capPaise,
                availableMargin: capRupees,
                usedMargin: 0,
                misMargin: 0,
                optionMargin: 0,
                blockedMargin: 0,
                blockedMarginPaise: 0,
            });
        }
        wallet = await orderEngine.recomputeBlockedMargin(wallet);
        const totalUsed = Math.round((wallet.usedMargin || 0) + (wallet.misMargin || 0) + (wallet.optionMargin || 0));
        const walletObj = wallet.toObject();
        walletObj.totalUsedMargin = totalUsed;
        walletObj.usedMargin = totalUsed;
        res.status(200).json(walletObj);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching wallet', error: err.message });
    }
});

// ============ CAPITAL ASSIGNMENT (INSTRUCTOR / ADMIN) ============
app.post('/wallet/assign', async (req, res) => {
    try {
        const { studentId, amount } = req.body;
        if (!studentId) {
            return res.status(400).json({ message: 'studentId is required' });
        }
        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount < 0) {
            return res.status(400).json({ message: 'Valid non-negative amount is required' });
        }

        // Authorization check
        if (!['INSTRUCTOR', 'INSTITUTE_ADMIN', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden: only instructors and admins can assign capital' });
        }

        const student = await UserModel.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Institute scoping check
        if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
            if (student.instituteCode && req.user.instituteCode && student.instituteCode !== req.user.instituteCode) {
                return res.status(403).json({ message: 'Unauthorized: student belongs to a different institute' });
            }
        }

        let wallet = await WalletModel.findOne({ userId: studentId });
        const oldBalance = wallet ? wallet.balance : 0;
        const capPaise = Math.round(numAmount * 100);

        if (!wallet) {
            wallet = await WalletModel.create({
                userId: studentId,
                balance: numAmount,
                balancePaise: capPaise,
                availableMargin: numAmount,
                usedMargin: 0,
                misMargin: 0,
                optionMargin: 0,
                blockedMargin: 0,
                blockedMarginPaise: 0,
            });
        } else {
            wallet.balance = numAmount;
            wallet.balancePaise = capPaise;
            wallet.availableMargin = Math.max(0, numAmount - (wallet.usedMargin || 0) - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
            await wallet.save();
        }

        // Also update student's starting capital on UserModel
        student.startingCapital = numAmount;
        student.startingCapitalPaise = capPaise;
        student.balance = numAmount;
        student.balancePaise = capPaise;
        await student.save();

        // Invalidate cached user session so /auth/me returns updated capital instantly
        try {
            const CacheService = require('./services/cacheService');
            await CacheService.invalidateUserSession(studentId.toString());
        } catch (e) { /* non-fatal */ }

        // Record fund transaction audit
        try {
            await FundTransactionModel.create({
                userId: studentId,
                type: 'CREDIT',
                amount: numAmount,
                amountPaise: capPaise,
                balanceAfter: numAmount,
                remark: `Capital assigned by ${req.user.name || req.user.role} (prev: ₹${oldBalance.toLocaleString()})`,
                createdBy: req.user._id,
            });
        } catch (e) { /* non-fatal transaction logging */ }

        // Find batch to broadcast socket events
        const { EnrollmentModel } = require('./model/EnrollmentModel');
        const enrollment = await EnrollmentModel.findOne({ userId: studentId, status: 'ACTIVE' });
        const batchId = enrollment?.batchId?.toString();

        const totalUsed = Math.round((wallet.usedMargin || 0) + (wallet.misMargin || 0) + (wallet.optionMargin || 0));
        const walletObj = {
            ...wallet.toObject(),
            totalUsedMargin: totalUsed,
            usedMargin: totalUsed,
        };

        const socketPayload = {
            studentId: studentId.toString(),
            balance: wallet.balance,
            balancePaise: wallet.balancePaise,
            availableMargin: wallet.availableMargin,
            usedMargin: totalUsed,
            totalUsedMargin: totalUsed,
            wallet: walletObj,
            batchId,
        };

        if (batchId) {
            io.to(`batch:${batchId}`).emit('pnl_update', socketPayload);
            io.to(`batch:${batchId}`).emit('wallet_updated', socketPayload);
            io.to(`batch:${batchId}`).emit('walletUpdated', { wallet: walletObj });
            sendNotification({
                userId: studentId,
                batchId,
                type: 'CAPITAL',
                title: 'Capital Assigned',
                message: `₹${numAmount.toLocaleString('en-IN')} virtual capital assigned to ${student.name}`,
                data: { studentId: studentId.toString(), amount: numAmount }
            }).catch(() => {});
        }
        io.to(`user:${studentId}`).emit('walletUpdated', { wallet: walletObj });
        io.to(studentId.toString()).emit('walletUpdated', { wallet: walletObj });
        io.to(`user:${studentId}`).emit('pnl_update', socketPayload);
        io.to(studentId.toString()).emit('pnl_update', socketPayload);
        io.to(`user:${studentId}`).emit('initialData', { wallet: walletObj });
        io.to(studentId.toString()).emit('initialData', { wallet: walletObj });
        io.emit('wallet_updated', socketPayload);

        res.status(200).json({
            success: true,
            balance: wallet.balance,
            balancePaise: wallet.balancePaise,
            availableMargin: wallet.availableMargin,
            studentId,
        });
    } catch (err) {
        res.status(500).json({ message: 'Error assigning capital', error: err.message });
    }
});

// ============ STUDENT ANALYTICS (INSTRUCTOR VIEW) ============
app.get('/student/:id/analytics', async (req, res) => {
    try {
        const studentId = req.params.id;
        const student = await UserModel.findById(studentId).select('-passwordHash');
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const { HoldingsModel } = require('./model/HoldingsModel');
        const [orders, closedPos, eqPos, optPos, userHoldings, wallet] = await Promise.all([
            OrdersModel.find({ userId: studentId }).sort({ createdAt: -1 }),
            ClosedPositionModel.find({ userId: studentId }).sort({ createdAt: -1 }),
            PositionsModel.find({ userId: studentId }),
            OptionPositionsModel.find({ userId: studentId }),
            HoldingsModel.find({ userId: studentId }),
            WalletModel.findOne({ userId: studentId }),
        ]);

        const totalTrades = orders.length;
        const closedCount = closedPos.length;

        let winTrades = 0;
        let lossTrades = 0;
        let realizedPnl = 0;
        let bestTrade = 0;
        let worstTrade = 0;

        closedPos.forEach(p => {
            const pnl = p.pnl || 0;
            realizedPnl += pnl;
            if (pnl > 0) winTrades++;
            else if (pnl < 0) lossTrades++;
            if (pnl > bestTrade) bestTrade = pnl;
            if (pnl < worstTrade) worstTrade = pnl;
        });

        // Unrealized PnL from CNC Holdings
        let unrealizedPnl = 0;
        userHoldings.forEach(h => {
            const live = marketDataService.getStockPrice(h.stockSymbol);
            const curPrice = live?.ltp ?? h.ltp ?? h.avgPrice;
            unrealizedPnl += (curPrice - h.avgPrice) * h.quantity;
        });

        // Unrealized PnL from open equity positions
        eqPos.forEach(p => {
            const live = marketDataService.getStockPrice(p.stockSymbol);
            const curPrice = live?.ltp ?? p.ltp ?? p.avgPrice;
            unrealizedPnl += (curPrice - p.avgPrice) * p.quantity;
        });

        // Unrealized PnL from open option positions
        optPos.forEach(p => {
            const liveLtp = marketDataService.getOptionLTPSync ? marketDataService.getOptionLTPSync(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry) : (p.ltp ?? p.avgPrice);
            const curPrice = Number(typeof liveLtp === 'number' ? liveLtp : (p.ltp ?? p.avgPrice));
            const dir = p.side === 'BUY' ? 1 : -1;
            const diff = (curPrice - p.avgPrice) * p.quantity * dir;
            unrealizedPnl += isNaN(diff) ? 0 : diff;
        });

        const totalPnl = Math.round((realizedPnl + unrealizedPnl) * 100) / 100;
        const winRate = closedCount > 0 ? Math.round((winTrades / closedCount) * 100) : 0;
        const currentBalance = wallet ? wallet.balance : 0;
        const currentBalancePaise = wallet?.balancePaise !== undefined ? wallet.balancePaise : Math.round(currentBalance * 100);
        const totalOpenPositions = userHoldings.length + eqPos.length + optPos.length;

        const summary = {
            totalTrades,
            closedTrades: closedCount,
            openPositions: totalOpenPositions,
            winningTrades: winTrades,
            losingTrades: lossTrades,
            winRate,
            pnl: totalPnl,
            netPnlPaise: Math.round(totalPnl * 100),
            realizedPnl: Math.round(realizedPnl * 100) / 100,
            realizedPnlPaise: Math.round(realizedPnl * 100),
            unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
            unrealizedPnlPaise: Math.round(unrealizedPnl * 100),
            bestTrade: bestTrade !== 0 ? { symbol: '', pnl: bestTrade } : null,
            worstTrade: worstTrade !== 0 ? { symbol: '', pnl: worstTrade } : null,
        };

        res.json({
            success: true,
            studentId,
            studentName: student.name,
            email: student.email,
            balance: currentBalance,
            balancePaise: currentBalancePaise,
            student: {
                _id: studentId,
                name: student.name,
                email: student.email,
                wallet: {
                    balance: currentBalance,
                    balancePaise: currentBalancePaise,
                },
            },
            summary,
            totalTrades,
            closedTrades: closedCount,
            openPositions: totalOpenPositions,
            winTrades,
            lossTrades,
            winRate,
            pnl: totalPnl,
            realizedPnl: Math.round(realizedPnl * 100) / 100,
            unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
            bestTrade: Math.round(bestTrade * 100) / 100,
            worstTrade: Math.round(worstTrade * 100) / 100,
            recentOrders: orders.slice(0, 10),
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching student analytics', error: err.message });
    }
});

// ============ STUDENT PnL HISTORY (FOR EQUITY CURVE & DAILY BARS) ============
app.get('/student/:id/pnl-history', async (req, res) => {
    try {
        const studentId = req.params.id;
        const student = await UserModel.findById(studentId);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const { HoldingsModel } = require('./model/HoldingsModel');
        const [closedPos, plRecords, holdings, positions, optPositions] = await Promise.all([
            ClosedPositionModel.find({ userId: studentId }).sort({ closedAt: 1 }),
            PLRecordModel.find({ userId: studentId }).sort({ tradeDate: 1 }),
            HoldingsModel.find({ userId: studentId }),
            PositionsModel.find({ userId: studentId }),
            OptionPositionsModel.find({ userId: studentId }),
        ]);

        // Today's live unrealized PnL
        let liveUnrealized = 0;
        holdings.forEach(h => {
            const curPrice = marketDataService.getStockPrice(h.stockSymbol)?.ltp ?? h.ltp ?? h.avgPrice;
            liveUnrealized += (curPrice - h.avgPrice) * h.quantity;
        });
        positions.forEach(p => {
            const curPrice = marketDataService.getStockPrice(p.stockSymbol)?.ltp ?? p.ltp ?? p.avgPrice;
            liveUnrealized += (curPrice - p.avgPrice) * p.quantity;
        });
        optPositions.forEach(p => {
            const liveLtp = marketDataService.getOptionLTPSync ? marketDataService.getOptionLTPSync(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry) : (p.ltp ?? p.avgPrice);
            const curPrice = Number(typeof liveLtp === 'number' ? liveLtp : (p.ltp ?? p.avgPrice));
            const dir = p.side === 'BUY' ? 1 : -1;
            const diff = (curPrice - p.avgPrice) * p.quantity * dir;
            liveUnrealized += isNaN(diff) ? 0 : diff;
        });

        // Group realized PnL by date
        const dayMap = {};
        closedPos.forEach(cp => {
            const d = cp.dateStr || (cp.closedAt ? cp.closedAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
            dayMap[d] = (dayMap[d] || 0) + (cp.pnl || 0);
        });

        plRecords.forEach(plr => {
            const d = plr.dateStr || (plr.tradeDate ? plr.tradeDate.toISOString().slice(0, 10) : null);
            if (d && dayMap[d] === undefined) {
                dayMap[d] = (plr.netPnl || 0) / 100;
            }
        });

        const todayStr = rules.istDateStr();
        dayMap[todayStr] = (dayMap[todayStr] || 0) + liveUnrealized;

        // Ensure 7-day continuity
        const datesToShow = new Set(Object.keys(dayMap));
        const todayDate = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(todayDate);
            d.setDate(d.getDate() - i);
            datesToShow.add(d.toISOString().slice(0, 10));
        }

        const allDates = Array.from(datesToShow).sort();
        const history = [];
        let runningCumulative = 0;

        allDates.forEach(d => {
            const dayPnl = Math.round((dayMap[d] || 0) * 100) / 100;
            runningCumulative = Math.round((runningCumulative + dayPnl) * 100) / 100;
            history.push({
                date: d,
                pnl: dayPnl,
                cumulativePnl: runningCumulative,
            });
        });

        res.json(history);
    } catch (err) {
        console.error('[pnl-history] Error:', err);
        res.status(500).json({ message: 'Error fetching PnL history', error: err.message });
    }
});

// ============ STUDENT ACTIVITY LOG (AUDIT TRAIL) ============
app.get('/student/:id/activity', async (req, res) => {
    try {
        const studentId = req.params.id;
        const student = await UserModel.findById(studentId);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const [fundTxs, orders, riskLogs] = await Promise.all([
            FundTransactionModel.find({ userId: studentId }).sort({ createdAt: -1 }).limit(30),
            OrdersModel.find({ userId: studentId }).sort({ createdAt: -1 }).limit(30),
            RiskLogModel.find({ userId: studentId }).sort({ createdAt: -1 }).limit(30),
        ]);

        const activities = [];

        fundTxs.forEach(f => {
            activities.push({
                id: f._id.toString(),
                type: 'CAPITAL',
                title: f.type === 'CREDIT' ? 'Capital Assigned' : 'Capital Adjusted',
                message: f.remark || `₹${(f.amount || 0).toLocaleString('en-IN')} ${f.type.toLowerCase()}`,
                amount: f.amount || 0,
                status: f.status || 'SUCCESS',
                timestamp: f.createdAt,
                time: new Date(f.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            });
        });

        orders.forEach(o => {
            activities.push({
                id: o._id.toString(),
                type: 'TRADE',
                title: `${o.side} ${o.stockSymbol || 'Order'}`,
                message: `${o.side} ${o.quantity} qty @ ₹${(o.price || 0).toLocaleString('en-IN')} (${o.productType || 'CNC'})`,
                symbol: o.stockSymbol,
                amount: (o.quantity || 0) * (o.price || 0),
                status: o.status || 'EXECUTED',
                timestamp: o.createdAt,
                time: new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            });
        });

        riskLogs.forEach(r => {
            activities.push({
                id: r._id.toString(),
                type: 'RISK',
                title: `Risk Alert: ${r.ruleType || 'Violation'}`,
                message: r.message,
                status: 'WARNING',
                timestamp: r.createdAt,
                time: new Date(r.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            });
        });

        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json(activities);
    } catch (err) {
        console.error('[student-activity] Error:', err);
        res.status(500).json({ message: 'Error fetching activity log', error: err.message });
    }
});

// ============ SYSTEM NOTIFICATIONS ============
app.get('/notifications', async (req, res) => {
    try {
        const userId = req.user._id;
        const query = {
            $or: [
                { userId },
                { userId: null },
            ]
        };

        const { EnrollmentModel } = require('./model/EnrollmentModel');
        const { BatchModel } = require('./model/BatchModel');

        if (req.user.role === 'STUDENT') {
            const enr = await EnrollmentModel.findOne({ userId, status: 'ACTIVE' });
            if (enr) query.$or.push({ batchId: enr.batchId });
        } else if (['INSTRUCTOR', 'INSTITUTE_ADMIN', 'ADMIN'].includes(req.user.role)) {
            const batchQuery = req.user.role === 'INSTRUCTOR' ? { instructorId: userId } : { instituteCode: req.user.instituteCode };
            const batches = await BatchModel.find(batchQuery).select('_id');
            const batchIds = batches.map(b => b._id);
            if (batchIds.length > 0) {
                query.$or.push({ batchId: { $in: batchIds } });
            }
        }

        const notifications = await NotificationModel.find(query).sort({ createdAt: -1 }).limit(40);
        res.json(notifications);
    } catch (err) {
        console.error('[notifications] Error:', err);
        res.status(500).json({ message: 'Error fetching notifications', error: err.message });
    }
});

app.patch('/notifications/mark-read', async (req, res) => {
    try {
        const { ids } = req.body;
        if (Array.isArray(ids) && ids.length > 0) {
            await NotificationModel.updateMany({ _id: { $in: ids } }, { $set: { read: true } });
        } else {
            await NotificationModel.updateMany(
                { $or: [{ userId: req.user._id }, { userId: null }] },
                { $set: { read: true } }
            );
        }
        res.json({ success: true, message: 'Notifications marked as read' });
    } catch (err) {
        res.status(500).json({ message: 'Error updating notifications', error: err.message });
    }
});

// ============ FUND TRANSACTIONS ============
app.get('/funds', async (req, res) => {
    try {
        const fundTxs = await FundTransactionModel.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.status(200).json(fundTxs);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching fund transactions', error: err.message });
    }
});

app.post('/funds/deposit', async (req, res) => {
    const { amount, method, upiApp } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
    }

    try {
        let wallet = await WalletModel.findOne({ userId: req.user._id });
        if (!wallet) {
            const { EnrollmentModel } = require('./model/EnrollmentModel');
            const enrollment = await EnrollmentModel.findOne({ userId: req.user._id, status: 'ACTIVE' }).populate('batchId');
            const capPaise = enrollment?.batchId?.startingCapitalPaise || 10000000;
            const capRupees = capPaise / 100;
            wallet = new WalletModel({
                userId: req.user._id,
                balance: capRupees,
                balancePaise: capPaise,
                availableMargin: capRupees,
                usedMargin: 0,
                blockedMargin: 0,
                blockedMarginPaise: 0,
            });
        }

        const numAmt = Number(amount);
        wallet.balance += numAmt;
        wallet.balancePaise = (wallet.balancePaise || 0) + Math.round(numAmt * 100);
        wallet.availableMargin = Math.max(0, wallet.balance - wallet.usedMargin - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
        await wallet.save();

        const txn = new FundTransactionModel({
            userId: req.user._id,
            type: 'DEPOSIT',
            amount: numAmt,
            status: 'SUCCESS',
            method: (method || 'NETBANKING').toUpperCase() === 'UPI' ? 'UPI' : 'NETBANKING',
            upiApp: upiApp || null,
            reference: `UTR${Date.now()}${Math.floor(Math.random() * 1000)}`,
        });
        await txn.save();

        io.to(`user:${req.user._id}`).emit('walletUpdated', { wallet: wallet.toObject(), transaction: txn });
        res.status(200).json({ message: 'Deposit successful', wallet, transaction: txn });
    } catch (err) {
        res.status(500).json({ message: 'Error processing deposit', error: err.message });
    }
});

app.post('/funds/withdraw', async (req, res) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
    }

    try {
        let wallet = await WalletModel.findOne({ userId: req.user._id });
        if (!wallet) {
            return res.status(400).json({ message: 'No wallet found. Add funds first.' });
        }

        if (wallet.availableMargin < Number(amount)) {
            return res.status(400).json({ message: 'Insufficient available balance' });
        }

        const numAmt = Number(amount);
        wallet.balance -= numAmt;
        wallet.balancePaise = Math.max(0, (wallet.balancePaise || 0) - Math.round(numAmt * 100));
        wallet.availableMargin = Math.max(0, wallet.balance - wallet.usedMargin - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
        await wallet.save();

        const txn = new FundTransactionModel({
            userId: req.user._id,
            type: 'WITHDRAW',
            amount: numAmt,
            status: 'SUCCESS',
            method: 'BANK',
            reference: `WDR${Date.now()}${Math.floor(Math.random() * 1000)}`,
        });
        await txn.save();

        io.to(`user:${req.user._id}`).emit('walletUpdated', { wallet: wallet.toObject(), transaction: txn });
        res.status(200).json({ message: 'Withdrawal successful', wallet, transaction: txn });
    } catch (err) {
        res.status(500).json({ message: 'Error processing withdrawal', error: err.message });
    }
});


// ============ WATCHLIST ============
app.get('/watchlists', async (req, res) => {
    try {
        const uid = req.user?._id;
        if (!uid) return res.status(401).json({ message: 'Unauthorized' });

        const uidStr = uid.toString();
        if (!req.query.fresh && !req.query.nocache) {
            const cached = await CacheService.getWatchlists(uidStr);
            if (cached) {
                return res.status(200).json(cached);
            }
        }

        let watchlists = await WatchlistModel.find({ userId: uid }).sort({ createdAt: 1 });
        if (!watchlists || watchlists.length === 0) {
            const defaultList = await WatchlistModel.create({
                userId: uid,
                name: 'My Watchlist',
                stocks: ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN'],
            });
            watchlists = [defaultList];
        } else if (watchlists.length === 1 && watchlists[0].name === 'My Watchlist' && (!watchlists[0].stocks || watchlists[0].stocks.length === 0)) {
            watchlists[0].stocks = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN'];
            await watchlists[0].save();
        }

        CacheService.setWatchlists(uidStr, watchlists, 120).catch(() => {});
        res.status(200).json(watchlists);
    } catch (err) {
        console.error('[Watchlists GET error]', err);
        res.status(500).json({ message: 'Error fetching watchlists', error: err.message });
    }
});

app.post('/watchlists', async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Watchlist name is required' });
    }

    try {
        const uid = req.user?._id;
        if (!uid) return res.status(401).json({ message: 'Unauthorized' });

        const trimmedName = name.trim();
        const watchlist = await WatchlistModel.create({
            userId: uid,
            name: trimmedName,
            stocks: [],
        });
        CacheService.invalidateWatchlists(uid.toString()).catch(() => {});
        res.status(201).json(watchlist);
    } catch (err) {
        res.status(500).json({ message: 'Error creating watchlist', error: err.message });
    }
});

app.post('/watchlists/:id/stock', async (req, res) => {
    const { id } = req.params;
    const stockSymbol = req.body.stockSymbol || req.body.symbol;

    if (!stockSymbol) {
        return res.status(400).json({ message: 'stockSymbol or symbol is required' });
    }

    try {
        let watchlist = null;
        if (mongoose.Types.ObjectId.isValid(id)) {
            watchlist = await WatchlistModel.findOne({ _id: id, userId: req.user._id });
            if (!watchlist) watchlist = await WatchlistModel.findById(id);
        }
        if (!watchlist) {
            // Fallback to user's first watchlist or create one
            watchlist = await WatchlistModel.findOne({ userId: req.user._id });
            if (!watchlist) {
                watchlist = await WatchlistModel.create({
                    userId: req.user._id,
                    name: 'My Watchlist',
                    stocks: [],
                });
            }
        }

        const symbol = stockSymbol.toUpperCase();
        if (!watchlist.stocks) watchlist.stocks = [];
        if (!watchlist.stocks.includes(symbol)) {
            watchlist.stocks.push(symbol);
            await watchlist.save();
        }

        // Start streaming live prices for this symbol right away
        if (marketDataService.trackSymbol(symbol)) {
            marketDataService.fetchAllStockPrices().catch(() => {});
        }

        CacheService.invalidateWatchlists(req.user._id.toString()).catch(() => {});
        res.status(200).json(watchlist);
    } catch (err) {
        res.status(500).json({ message: 'Error adding stock to watchlist', error: err.message });
    }
});

app.delete('/watchlists/:id/stock/:symbol', async (req, res) => {
    const { id, symbol } = req.params;

    try {
        let watchlist = null;
        if (mongoose.Types.ObjectId.isValid(id)) {
            watchlist = await WatchlistModel.findOne({ _id: id, userId: req.user._id });
            if (!watchlist) watchlist = await WatchlistModel.findById(id);
        }
        if (!watchlist) {
            return res.status(404).json({ message: 'Watchlist not found' });
        }

        const symUpper = symbol.toUpperCase();
        watchlist.stocks = (watchlist.stocks || []).filter(s => s !== symUpper);
        await watchlist.save();

        CacheService.invalidateWatchlists(req.user._id.toString()).catch(() => {});
        res.status(200).json(watchlist);
    } catch (err) {
        res.status(500).json({ message: 'Error removing stock from watchlist', error: err.message });
    }
});

app.delete('/watchlists/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await WatchlistModel.findByIdAndDelete(id);
        const remaining = await WatchlistModel.countDocuments({ userId: req.user._id });
        if (remaining === 0) {
            await WatchlistModel.create({
                userId: req.user._id,
                name: 'My Watchlist',
                stocks: ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN'],
            });
        }
        CacheService.invalidateWatchlists(req.user._id.toString()).catch(() => {});
        res.status(200).json({ message: 'Watchlist deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting watchlist', error: err.message });
    }
});

// ============ STOCK SEARCH ============
const NSE_STOCKS = [
    { symbol: "RELIANCE", name: "Reliance Industries Ltd", sector: "Oil & Gas" },
    { symbol: "TCS", name: "Tata Consultancy Services Ltd", sector: "IT" },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd", sector: "Banking" },
    { symbol: "INFY", name: "Infosys Ltd", sector: "IT" },
    { symbol: "ICICIBANK", name: "ICICI Bank Ltd", sector: "Banking" },
    { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd", sector: "FMCG" },
    { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd", sector: "Banking" },
    { symbol: "SBIN", name: "State Bank of India", sector: "Banking" },
    { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", sector: "Telecom" },
    { symbol: "ITC", name: "ITC Ltd", sector: "FMCG" },
    { symbol: "LT", name: "Larsen & Toubro Ltd", sector: "Construction" },
    { symbol: "WIPRO", name: "Wipro Ltd", sector: "IT" },
    { symbol: "AXISBANK", name: "Axis Bank Ltd", sector: "Banking" },
    { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd", sector: "Pharma" },
    { symbol: "M&M", name: "Mahindra & Mahindra Ltd", sector: "Automobile" },
    { symbol: "TITAN", name: "Titan Company Ltd", sector: "Consumer" },
    { symbol: "ADANIENT", name: "Adani Enterprises Ltd", sector: "Diversified" },
    { symbol: "ADANIPORTS", name: "Adani Ports and Special Economic Zone Ltd", sector: "Infrastructure" },
    { symbol: "NTPC", name: "NTPC Ltd", sector: "Power" },
    { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", sector: "Automobile" },
    { symbol: "POWERGRID", name: "Power Grid Corporation of India Ltd", sector: "Power" },
    { symbol: "TATAMOTORS", name: "Tata Motors Ltd", sector: "Automobile" },
    { symbol: "HCLTECH", name: "HCL Technologies Ltd", sector: "IT" },
    { symbol: "TATASTEEL", name: "Tata Steel Ltd", sector: "Metal" },
    { symbol: "ULTRACEMCO", name: "UltraTech Cement Ltd", sector: "Cement" },
    { symbol: "ASIANPAINT", name: "Asian Paints Ltd", sector: "Consumer" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", sector: "Finance" },
    { symbol: "NESTLEIND", name: "Nestle India Ltd", sector: "FMCG" },
    { symbol: "ONGC", name: "Oil & Natural Gas Corporation Ltd", sector: "Oil & Gas" },
    { symbol: "JSWSTEEL", name: "JSW Steel Ltd", sector: "Metal" },
    { symbol: "TECHM", name: "Tech Mahindra Ltd", sector: "IT" },
    { symbol: "DIVISLAB", name: "Divi's Laboratories Ltd", sector: "Pharma" },
    { symbol: "CIPLA", name: "Cipla Ltd", sector: "Pharma" },
    { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories Ltd", sector: "Pharma" },
    { symbol: "GRASIM", name: "Grasim Industries Ltd", sector: "Cement" },
    { symbol: "HDFCLIFE", name: "HDFC Life Insurance Company Ltd", sector: "Insurance" },
    { symbol: "SBILIFE", name: "SBI Life Insurance Company Ltd", sector: "Insurance" },
    { symbol: "BPCL", name: "Bharat Petroleum Corporation Ltd", sector: "Oil & Gas" },
    { symbol: "BAJAJFINSV", name: "Bajaj Finserv Ltd", sector: "Finance" },
    { symbol: "TATAPOWER", name: "Tata Power Company Ltd", sector: "Power" },
    { symbol: "KPITTECH", name: "KPIT Technologies Ltd", sector: "IT" },
    { symbol: "COALINDIA", name: "Coal India Ltd", sector: "Mining" },
    { symbol: "EICHERMOT", name: "Eicher Motors Ltd", sector: "Automobile" },
    { symbol: "BRITANNIA", name: "Britannia Industries Ltd", sector: "FMCG" },
    { symbol: "HEROMOTOCO", name: "Hero MotoCorp Ltd", sector: "Automobile" },
    { symbol: "HINDALCO", name: "Hindalco Industries Ltd", sector: "Metal" },
    { symbol: "APOLLOHOSP", name: "Apollo Hospitals Enterprise Ltd", sector: "Healthcare" },
    { symbol: "INDUSINDBK", name: "IndusInd Bank Ltd", sector: "Banking" },
    { symbol: "BAJAJ-AUTO", name: "Bajaj Auto Ltd", sector: "Automobile" },
    { symbol: "SHREECEM", name: "Shree Cement Ltd", sector: "Cement" },
];

// Searches the full NSE equity universe (Dhan scrip master ≈ 2000+ symbols),
// falling back to the curated list if the scrip master hasn't loaded.
app.get('/market/search', (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.status(400).json({ message: 'Search query (q) is required' });
    }

    const query = q.toUpperCase();
    const curated = NSE_STOCKS.filter(stock =>
        stock.symbol.includes(query) || stock.name.toUpperCase().includes(query)
    );

    const scripHits = dhanDataService.searchScrips(query, 25)
        .filter(hit => !curated.some(c => c.symbol === hit.symbol))
        .map(hit => ({ symbol: hit.symbol, name: hit.name, sector: null }));

    res.status(200).json([...curated, ...scripHits].slice(0, 25));
});

app.get('/market/stocks', (req, res) => {
    res.status(200).json(NSE_STOCKS);
});

// ============ PRICE ALERTS ============
app.get('/alerts', async (req, res) => {
    try {
        const alerts = await PriceAlertModel.find({ userId: req.user._id });
        res.status(200).json(alerts);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching alerts', error: err.message });
    }
});

// Plain price alerts AND GTT orders both live here — GTT is just an alert
// with gtt:true plus order details, evaluated by orderEngine.evaluateAlerts()
// on every market tick and turned into a real order when triggered.
app.post('/alerts', async (req, res) => {
    const {
        stockSymbol, targetPrice, condition,
        gtt, side, quantity, limitPrice, productType,
        triggerType, ocoTargetPrice, ocoCondition,
    } = req.body;
    if (!stockSymbol || !targetPrice || !condition) {
        return res.status(400).json({ message: 'Missing required fields: stockSymbol, targetPrice, condition' });
    }
    if (gtt && (!side || !quantity || !limitPrice)) {
        return res.status(400).json({ message: 'GTT orders require side, quantity, and limitPrice' });
    }
    if (triggerType === 'oco' && (!ocoTargetPrice || !ocoCondition)) {
        return res.status(400).json({ message: 'OCO GTTs require ocoTargetPrice and ocoCondition' });
    }

    try {
        const alert = new PriceAlertModel({
            userId: req.user._id,
            stockSymbol: stockSymbol.toUpperCase(),
            targetPrice: Number(targetPrice),
            condition,
            gtt: !!gtt,
            side: gtt ? side : null,
            quantity: gtt ? Number(quantity) : null,
            limitPrice: gtt ? Number(limitPrice) : null,
            productType: gtt ? (productType || 'CNC') : 'CNC',
            triggerType: triggerType === 'oco' ? 'oco' : 'single',
            ocoTargetPrice: triggerType === 'oco' ? Number(ocoTargetPrice) : null,
            ocoCondition: triggerType === 'oco' ? ocoCondition : null,
        });
        await alert.save();
        res.status(201).json(alert);
    } catch (err) {
        res.status(500).json({ message: 'Error creating alert', error: err.message });
    }
});

app.delete('/alerts/:id', async (req, res) => {
    try {
        await PriceAlertModel.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Alert deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting alert', error: err.message });
    }
});

// ============ CORPORATE ACTIONS (dividend / split / bonus) ============
// No free live NSE corporate-actions feed exists, so this is a curated
// calendar (seeded below) that gets applied to matching holdings once its
// ex-date passes — same day-prep job that handles T1/MIS/options settlement.
app.get('/corporate-actions', async (req, res) => {
    try {
        const actions = await CorporateActionModel.find({}).sort({ exDate: -1 });
        res.status(200).json(actions);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching corporate actions', error: err.message });
    }
});

app.post('/corporate-actions', async (req, res) => {
    const { stockSymbol, type, exDate, dividendPerShare, ratio } = req.body;
    if (!stockSymbol || !type || !exDate) {
        return res.status(400).json({ message: 'Missing required fields: stockSymbol, type, exDate' });
    }
    try {
        const action = new CorporateActionModel({
            stockSymbol: stockSymbol.toUpperCase(), type, exDate: new Date(exDate),
            dividendPerShare: dividendPerShare != null ? Number(dividendPerShare) : null,
            ratio: ratio != null ? Number(ratio) : null,
        });
        await action.save();
        res.status(201).json(action);
    } catch (err) {
        res.status(500).json({ message: 'Error creating corporate action', error: err.message });
    }
});

// Applies every due-and-unapplied corporate action to matching holdings.
// Idempotent — actions are flagged `applied` so re-running is a no-op.
async function applyDueCorporateActions() {
    const due = await CorporateActionModel.find({ applied: false, exDate: { $lte: new Date() } });
    if (due.length === 0) return 0;

    const dividendCredits = {};

    for (const action of due) {
        const holdings = await HoldingsModel.find({ stockSymbol: action.stockSymbol });
        for (const holding of holdings) {
            if (action.type === 'DIVIDEND' && action.dividendPerShare) {
                const uid = holding.userId.toString();
                dividendCredits[uid] = (dividendCredits[uid] || 0) + (action.dividendPerShare * holding.quantity);
            } else if ((action.type === 'SPLIT' || action.type === 'BONUS') && action.ratio > 1) {
                const newQty = Math.round(holding.quantity * action.ratio);
                holding.avgPrice = Math.round((holding.avgPrice * holding.quantity / newQty) * 100) / 100;
                holding.quantity = newQty;
                // Bonus/split shares inherit the parent lot's settlement state
                holding.t1Quantity = Math.round((holding.t1Quantity || 0) * action.ratio);
                await holding.save();
            }
        }
        action.applied = true;
        action.appliedAt = new Date();
        await action.save();
    }

    for (const [uid, credit] of Object.entries(dividendCredits)) {
        if (credit !== 0) {
            const wallet = await WalletModel.findOne({ userId: uid });
            if (wallet) {
                wallet.balance += Math.round(credit * 100) / 100;
                wallet.availableMargin = Math.max(0, wallet.balance - wallet.usedMargin - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
                await wallet.save();
            }
        }
    }
    
    const totalDividend = Object.values(dividendCredits).reduce((a, b) => a + b, 0);
    if (ioInstance) ioInstance.emit('corporateActionsApplied', { count: due.length, dividendCredit: totalDividend });
    return due.length;
}

app.post('/corporate-actions/apply', async (req, res) => {
    try {
        const count = await applyDueCorporateActions();
        res.json({ message: `Applied ${count} corporate action(s)` });
    } catch (err) {
        res.status(500).json({ message: 'Error applying corporate actions', error: err.message });
    }
});

// ============ SEED DATA (optional, one-time) ============
app.post('/seed', async (req, res) => {
    try {
        // Seed wallet with consistent financial picture:
        // Opening balance ₹97.33 Lakh (Nov 1) → additional ₹1.20 Cr deposit →
        // total ₹2.174 Cr → ₹1.99 Cr used for stock holdings (~-38% today)
        // Remaining liquid cash: ₹2.174 Cr − ₹1.99 Cr = ~₹18.16 Lakh
        // `balance` is total contributed capital (deposits + realized P&L) —
        // every other place in this file computes `availableMargin = balance
        // - usedMargin`, so `balance` must include the money currently
        // parked in holdings, not just the leftover liquid slice. It must
        // equal usedMargin + the liquid cash we want available.
        const LIQUID_CASH = 1816247.35;  // ~₹18.16 Lakh — spendable cash
        const USED_MARGIN = 19949322;    // ₹1.99 Cr — cost of equity holdings
        const TOTAL_BALANCE = LIQUID_CASH + USED_MARGIN; // ~₹2.174 Cr total capital

        let wallet = await WalletModel.findOne({});
        if (!wallet) {
            wallet = new WalletModel({
                userId: req.user._id,
                balance: TOTAL_BALANCE,
                usedMargin: USED_MARGIN,
                misMargin: 0,
                optionMargin: 0,
                availableMargin: LIQUID_CASH,
            });
            await wallet.save();
        }
        // Always update wallet to correct demo values. misMargin/optionMargin
        // reset to 0 too — this route doesn't clear open MIS/option
        // positions, but the seeded holdings basket has none, so any nonzero
        // value left over here would be stale data from a prior session that
        // the next equity/option fill's formula-based recompute would then
        // silently bake into availableMargin.
        wallet.balance = TOTAL_BALANCE;
        wallet.usedMargin = USED_MARGIN;
        wallet.misMargin = 0;
        wallet.optionMargin = 0;
        wallet.availableMargin = LIQUID_CASH;
        await wallet.save();

        // Fund transactions showing the capital journey — clear & reseed
        await FundTransactionModel.deleteMany({ userId: req.user._id });
        const fundDocs = [
            { userId: req.user._id, type: 'DEPOSIT',  amount: 9765569.35, status: 'SUCCESS', createdAt: new Date('2025-11-01T09:15:00.000Z'), updatedAt: new Date('2025-11-01T09:15:00.000Z') },  // ~₹97.66 Lakh — Nov 1 opening balance
            { userId: req.user._id, type: 'DEPOSIT',  amount: 12000000,   status: 'SUCCESS', createdAt: new Date('2025-06-01T09:15:00.000Z'), updatedAt: new Date('2025-06-01T09:15:00.000Z') },  // ₹1.20 Cr — additional capital for stock purchases
            { userId: req.user._id, type: 'WITHDRAW', amount: 19949322,   status: 'SUCCESS', createdAt: new Date('2025-08-15T10:00:00.000Z'), updatedAt: new Date('2025-08-15T10:00:00.000Z') }, // ₹1.99 Cr — deployed into stock holdings
        ];
        await FundTransactionModel.collection.insertMany(fundDocs);
        console.log('[Seed] Fund transactions: ~₹97.66 Lakh opening + ₹1.20 Cr deposit − ₹1.99 Cr stock purchase');

        // Seed a default watchlist
        let watchlist = await WatchlistModel.findOne({ userId: req.user._id, name: 'Nifty 50' });
        if (!watchlist) {
            watchlist = new WatchlistModel({
                userId: req.user._id,
                name: 'Nifty 50',
                stocks: ['INFY', 'TCS', 'ONGC', 'RELIANCE', 'WIPRO', 'KPITTECH', 'M&M', 'HDFCBANK', 'SBIN'],
            });
            await watchlist.save();
        }

        // Seed realistic stock holdings — always refresh for consistent demo
        await HoldingsModel.deleteMany({ userId: req.user._id });
        
        const base = new Date();
        const daysAgo = (d) => new Date(base.getTime() - d * 86400000);

        // Scaled-down basket: ~₹1.99 Cr invested, ~-38% overall (₹75.8L loss)
        // — same 16-stock story as before, quantities and LTPs scaled so the
        // total lands in the requested ₹2 Cr invested / 33-40% loss band.
        const fallbackPrices = {
            'UPL': 468.78, 'WIPRO': 431.28, 'AWL': 328.15, 'BANDHANBNK': 178.14,
            'NYKAA': 150.01, 'HINDUNILVR': 2109.51, 'KOTAKBANK': 1593.85,
            'IEX': 131.26, 'LTIM': 4687.79, 'DIVISLAB': 3281.45, 'TECHM': 1125.07,
            'INFY': 1458.32, 'HDFCBANK': 1427.29, 'TATAMOTORS': 924.15,
            'SBIN': 403.34, 'ITC': 194.92
        };

        // 100% Authentic Indian Market History. Target: ~-38% Overall.
        // (`pct` is solved so ltp*(1+pct) reproduces the original avgPrice
        // targets in the comments, after `ltp` itself was scaled down below.)
        const basket = [
            { symbol: 'UPL',        pct: 0.8132, qty: 3050, daysAgo: 283 }, // Buy @ ₹850
            { symbol: 'WIPRO',      pct: 0.6694, qty: 2600, daysAgo: 248 }, // Buy @ ₹720
            { symbol: 'AWL',        pct: 1.5903, qty: 1750, daysAgo: 232 }, // Buy @ ₹850
            { symbol: 'BANDHANBNK', pct: 3.0980, qty: 1750, daysAgo: 317 }, // Buy @ ₹730
            { symbol: 'NYKAA',      pct: 1.7332, qty: 3050, daysAgo: 304 }, // Buy @ ₹410
            { symbol: 'HINDUNILVR', pct: 0.3511, qty: 500,  daysAgo: 219 }, // Buy @ ₹2850
            { symbol: 'KOTAKBANK',  pct: 0.3803, qty: 650,  daysAgo: 195 }, // Buy @ ₹2200
            { symbol: 'IEX',        pct: 1.2855, qty: 3500, daysAgo: 258 }, // Buy @ ₹300
            { symbol: 'LTIM',       pct: 0.5999, qty: 150,  daysAgo: 162 }, // Buy @ ₹7500
            { symbol: 'DIVISLAB',   pct: 0.6456, qty: 150,  daysAgo: 209 }, // Buy @ ₹5400
            { symbol: 'TECHM',      pct: 0.5999, qty: 650,  daysAgo: 293 }, // Buy @ ₹1800
            { symbol: 'INFY',       pct: 0.3371, qty: 850,  daysAgo: 227 }, // Buy @ ₹1950
            { symbol: 'HDFCBANK',   pct: 0.2261, qty: 1100, daysAgo: 156 }, // Buy @ ₹1750
            // Profit Anchors (Bought in June/July 2025 — down-trend survivors)
            { symbol: 'TATAMOTORS', pct: -0.3508, qty: 450,  daysAgo: 385 }, // Buy @ ₹600
            { symbol: 'SBIN',       pct: -0.2562, qty: 850,  daysAgo: 378 }, // Buy @ ₹300
            { symbol: 'ITC',        pct: -0.1791, qty: 2200, daysAgo: 338 }, // Buy @ ₹160
        ];

        const holdingsDocs = basket.map(({ symbol, pct, qty, daysAgo: days }) => {
            const ltp = fallbackPrices[symbol];
            const avgPrice = Math.round(ltp * (1 + pct) * 100) / 100;
            return {
                userId: req.user._id,
                stockSymbol: symbol,
                quantity: qty,
                avgPrice,
                ltp,
                productType: 'CNC',
                createdAt: daysAgo(days),
                updatedAt: daysAgo(0),
            };
        });

        // Use raw collection insert to preserve custom createdAt dates
        await HoldingsModel.collection.insertMany(holdingsDocs);
        console.log(`[Seed] Inserted ${holdingsDocs.length} holdings`);

        // Seed sample positions if empty
        const positionsCount = await PositionsModel.countDocuments({ userId: req.user._id });
        if (positionsCount === 0) {
            const samplePositions = [
                { userId: req.user._id, stockSymbol: 'EVEREADY', quantity: 2, avgPrice: 316.27, ltp: 312.35, productType: 'MIS', isIntraday: true },
                { userId: req.user._id, stockSymbol: 'JUBLFOOD', quantity: 1, avgPrice: 3124.75, ltp: 3082.65, productType: 'MIS', isIntraday: true },
            ];
            await PositionsModel.insertMany(samplePositions);
        }

        // Seed trade history if empty (drives P&L screen)
        const tradesCount = await TradeModel.countDocuments({ userId: req.user._id });
        if (tradesCount === 0) {
            const base = new Date();
            const daysAgo = (d) => new Date(base.getTime() - d * 86400000);

            const sampleTrades = [
                // Open holdings (BUY only — unrealized)
                { userId: req.user._id, stockSymbol: 'BHARTIARTL', quantity: 2, price: 538.05, side: 'BUY', productType: 'CNC', totalValue: 1076.10, charges: 0.54, createdAt: daysAgo(45) },
                { userId: req.user._id, stockSymbol: 'HDFCBANK',   quantity: 2, price: 1383.40, side: 'BUY', productType: 'CNC', totalValue: 2766.80, charges: 1.38, createdAt: daysAgo(38) },
                { userId: req.user._id, stockSymbol: 'HINDUNILVR', quantity: 1, price: 2335.85, side: 'BUY', productType: 'CNC', totalValue: 2335.85, charges: 1.17, createdAt: daysAgo(32) },
                { userId: req.user._id, stockSymbol: 'INFY',       quantity: 1, price: 1350.50, side: 'BUY', productType: 'CNC', totalValue: 1350.50, charges: 0.68, createdAt: daysAgo(28) },
                { userId: req.user._id, stockSymbol: 'ITC',        quantity: 5, price: 202.00,  side: 'BUY', productType: 'CNC', totalValue: 1010.00, charges: 0.51, createdAt: daysAgo(25) },
                { userId: req.user._id, stockSymbol: 'KPITTECH',   quantity: 5, price: 250.30,  side: 'BUY', productType: 'CNC', totalValue: 1251.50, charges: 0.63, createdAt: daysAgo(21) },
                { userId: req.user._id, stockSymbol: 'SBIN',       quantity: 4, price: 324.35,  side: 'BUY', productType: 'CNC', totalValue: 1297.40, charges: 0.65, createdAt: daysAgo(18) },
                { userId: req.user._id, stockSymbol: 'TATAPOWER',  quantity: 5, price: 104.20,  side: 'BUY', productType: 'CNC', totalValue: 521.00,  charges: 0.26, createdAt: daysAgo(15) },
                { userId: req.user._id, stockSymbol: 'TCS',        quantity: 1, price: 3041.70, side: 'BUY', productType: 'CNC', totalValue: 3041.70, charges: 1.52, createdAt: daysAgo(12) },
                { userId: req.user._id, stockSymbol: 'WIPRO',      quantity: 4, price: 489.30,  side: 'BUY', productType: 'CNC', totalValue: 1957.20, charges: 0.98, createdAt: daysAgo(10) },
                { userId: req.user._id, stockSymbol: 'RELIANCE',   quantity: 1, price: 2193.70, side: 'BUY', productType: 'CNC', totalValue: 2193.70, charges: 1.10, createdAt: daysAgo(8)  },
                // Realized trades (BUY + SELL round trips)
                { userId: req.user._id, stockSymbol: 'TATAMOTORS', quantity: 3, price: 780.00,  side: 'BUY',  productType: 'CNC', totalValue: 2340.00, charges: 1.17, createdAt: daysAgo(60) },
                { userId: req.user._id, stockSymbol: 'TATAMOTORS', quantity: 3, price: 850.00,  side: 'SELL', productType: 'CNC', totalValue: 2550.00, charges: 1.28, createdAt: daysAgo(50) },
                { userId: req.user._id, stockSymbol: 'HCLTECH',    quantity: 2, price: 1200.00, side: 'BUY',  productType: 'CNC', totalValue: 2400.00, charges: 1.20, createdAt: daysAgo(55) },
                { userId: req.user._id, stockSymbol: 'HCLTECH',    quantity: 2, price: 1380.00, side: 'SELL', productType: 'CNC', totalValue: 2760.00, charges: 1.38, createdAt: daysAgo(42) },
                { userId: req.user._id, stockSymbol: 'AXISBANK',   quantity: 5, price: 920.00,  side: 'BUY',  productType: 'CNC', totalValue: 4600.00, charges: 2.30, createdAt: daysAgo(70) },
                { userId: req.user._id, stockSymbol: 'AXISBANK',   quantity: 5, price: 985.00,  side: 'SELL', productType: 'CNC', totalValue: 4925.00, charges: 2.46, createdAt: daysAgo(62) },
                { userId: req.user._id, stockSymbol: 'SUNPHARMA',  quantity: 2, price: 1050.00, side: 'BUY',  productType: 'CNC', totalValue: 2100.00, charges: 1.05, createdAt: daysAgo(90) },
                { userId: req.user._id, stockSymbol: 'SUNPHARMA',  quantity: 2, price: 1140.00, side: 'SELL', productType: 'CNC', totalValue: 2280.00, charges: 1.14, createdAt: daysAgo(75) },
                { userId: req.user._id, stockSymbol: 'NTPC',       quantity: 10, price: 220.00, side: 'BUY',  productType: 'CNC', totalValue: 2200.00, charges: 1.10, createdAt: daysAgo(30) },
                { userId: req.user._id, stockSymbol: 'NTPC',       quantity: 10, price: 195.00, side: 'SELL', productType: 'CNC', totalValue: 1950.00, charges: 0.98, createdAt: daysAgo(20) },
                // Intraday MIS trades
                { userId: req.user._id, stockSymbol: 'EVEREADY',   quantity: 2, price: 316.27, side: 'BUY',  productType: 'MIS', totalValue: 632.54,  charges: 0.32, createdAt: daysAgo(5) },
                { userId: req.user._id, stockSymbol: 'JUBLFOOD',   quantity: 1, price: 3124.75, side: 'BUY', productType: 'MIS', totalValue: 3124.75, charges: 1.56, createdAt: daysAgo(3) },
            ];

            await TradeModel.insertMany(
                sampleTrades.map(t => ({ ...t, orderId: new mongoose.Types.ObjectId() }))
            );
        }

        // Seed a curated corporate-action calendar if empty — one already-due
        // dividend + bonus (demonstrates /corporate-actions/apply immediately)
        // and one future dividend (shows up as pending).
        const corpActionsCount = await CorporateActionModel.countDocuments({});
        if (corpActionsCount === 0) {
            await CorporateActionModel.insertMany([
                { stockSymbol: 'ITC',   type: 'DIVIDEND', exDate: daysAgo(10), dividendPerShare: 6.5 },
                { stockSymbol: 'WIPRO', type: 'BONUS',    exDate: daysAgo(5),  ratio: 2 },
                { stockSymbol: 'HDFCBANK', type: 'DIVIDEND', exDate: new Date(base.getTime() + 15 * 86400000), dividendPerShare: 19 },
            ]);
        }

        res.status(200).json({ message: 'Seed data loaded successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error seeding data', error: err.message });
    }
});

// ============ LIVE MARKET DATA ============
app.get('/market/live', (req, res) => {
    const prices = marketDataService.getStockPrices();
    res.status(200).json({
        prices,
        lastUpdated: marketDataService.getLastUpdated(),
    });
});

app.get('/market/indexes', (req, res) => {
    const indexes = marketDataService.getIndexData();
    res.status(200).json({
        indexes,
        lastUpdated: marketDataService.getLastUpdated(),
    });
});

app.get('/market/movers', (req, res) => {
    const movers = marketDataService.getMarketMovers();
    res.status(200).json(movers);
});

// ============ IPOs (live from NSE) ============
const axiosLib = require('axios');
let _ipoCache = { at: 0, data: null };

// Curated fallback list if the live source is unreachable
const IPO_FALLBACK = [
    { id: 'f1', company: 'Swiggy Ltd', symbol: 'SWIGGY', type: 'MAIN', price: null, priceRange: '₹340 – ₹371', lot: 40, minAmt: '₹14,840', dates: '23 Jun – 25 Jun 2026', listingDate: '30 Jun 2026', status: 'UPCOMING', subscribed: null, gmp: '+₹22', category: 'Technology' },
    { id: 'f2', company: 'CMR Green Technologies Ltd', symbol: 'CMRGREEN', type: 'MAIN', price: null, priceRange: '₹182 – ₹192', lot: 78, minAmt: '₹14,976', dates: '3 Jun – 5 Jun 2026', listingDate: '10 Jun 2026', status: 'CLOSED', subscribed: '8.7x', gmp: '-₹3', category: 'Green Energy' },
];

function normalizeNseIpo(row, idx, status) {
    const price = (row.issuePrice || '').replace(/Rs\.?\s*/gi, '₹').replace(/\s*to\s*/i, ' – ').trim();
    const isRange = /–|-/.test(price);
    const lot = Number(row.lotSize || row.minBidQuantity || 0) || null;
    return {
        id: `nse-${status}-${idx}`,
        company: row.companyName || row.symbol,
        symbol: row.symbol || '',
        type: (row.series === 'SME' || /SME/i.test(row.series || '')) ? 'SME' : 'MAIN',
        price: isRange ? null : (price || null),
        priceRange: isRange ? price : null,
        lot,
        minAmt: null,
        dates: [row.issueStartDate, row.issueEndDate].filter(Boolean).join(' – '),
        listingDate: row.listingDate || null,
        status: /forth|upcom/i.test(row.status || '') ? 'UPCOMING'
              : /active/i.test(row.status || '') ? 'ONGOING'
              : (status === 'active' ? 'ONGOING' : 'UPCOMING'),
        subscribed: null,
        gmp: null,
        category: null,
    };
}

async function fetchNseIpos() {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9',
    };
    const refUrl = 'https://www.nseindia.com/market-data/all-upcoming-issues-ipo';
    const prime = await axiosLib.get(refUrl, { headers, timeout: 8000 });
    const cookie = (prime.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const authed = { headers: { ...headers, Cookie: cookie, Referer: refUrl }, timeout: 8000 };

    const [activeRes, upcomingRes] = await Promise.all([
        axiosLib.get('https://www.nseindia.com/api/all-upcoming-issues?category=ipo', authed).catch(() => ({ data: [] })),
        axiosLib.get('https://www.nseindia.com/api/all-upcoming-issues?category=sme', authed).catch(() => ({ data: [] })),
    ]);

    // NSE may return a bare array or { data: [...] }
    const rows = (r) => Array.isArray(r?.data) ? r.data : (r?.data?.data || []);
    const active   = rows(activeRes).map((r, i) => normalizeNseIpo(r, i, 'active'));
    const upcoming = rows(upcomingRes).map((r, i) => normalizeNseIpo(r, i, 'upcoming'));
    // de-dupe by symbol, active wins
    const seen = new Set(active.map(a => a.symbol));
    return [...active, ...upcoming.filter(u => !seen.has(u.symbol))];
}

app.get('/market/ipos', async (req, res) => {
    try {
        // 2-minute cache so we don't hammer NSE on every screen focus
        if (_ipoCache.data && Date.now() - _ipoCache.at < 120000) {
            return res.json({ ipos: _ipoCache.data, source: 'NSE', cached: true, fetchedAt: new Date(_ipoCache.at).toISOString() });
        }
        const ipos = await fetchNseIpos();
        if (ipos.length > 0) {
            _ipoCache = { at: Date.now(), data: ipos };
            return res.json({ ipos, source: 'NSE', cached: false, fetchedAt: new Date().toISOString() });
        }
        res.json({ ipos: IPO_FALLBACK, source: 'fallback', fetchedAt: new Date().toISOString() });
    } catch (err) {
        res.json({ ipos: IPO_FALLBACK, source: 'fallback', error: err.message, fetchedAt: new Date().toISOString() });
    }
});

app.get('/market/quote/:symbol', async (req, res) => {
    const { symbol } = req.params;

    // Real BSE_EQ quote — replaces the old "NSE price minus ~0.01%" fake formula
    if ((req.query.exchange || '').toUpperCase() === 'BSE') {
        const bseQuote = await dhanDataService.fetchDhanBseQuote(symbol.toUpperCase());
        if (!bseQuote) {
            return res.status(404).json({ message: `No BSE data for symbol: ${symbol}` });
        }
        return res.status(200).json(bseQuote);
    }

    let price = marketDataService.getStockPrice(symbol);
    if (!price) {
        // Not in the tracked universe yet — pull it on demand and keep tracking it
        marketDataService.trackSymbol(symbol);
        try {
            const quotes = await dhanDataService.fetchDhanStockQuotes([symbol.toUpperCase()]);
            price = quotes[symbol.toUpperCase()] || null;
        } catch { /* fall through to 404 */ }
    }
    if (!price) {
        return res.status(404).json({ message: `No data for symbol: ${symbol}` });
    }
    res.status(200).json(price);
});

// ============ MARKET DATA STATUS ============
app.get('/market/status', (req, res) => {
    // Dhan is the only live source now (Groww/Yahoo removed), so report that
    // directly instead of liveDataService.getStats(), whose Groww/NSE numbers
    // are stale and misleading once liveDataService is out of the live path.
    res.status(200).json({
        // 'FO' (15:40 close) so the banner doesn't say "closed" while F&O is
        // still trading during the 15:30-15:40 window (extended 2026-08-03).
        isOpen: isMarketOpen('FO'),
        source: marketDataService.getDataSource(),
        lastUpdated: marketDataService.getLastUpdated(),
        liveStats: {
            source: marketDataService.getDataSource(),
            stockSource: 'DHAN_LIVE',
            indexSource: 'DHAN_LIVE',
        },
        indexCount: Object.keys(marketDataService.getIndexData()).length,
        stockCount: Object.keys(marketDataService.getStockPrices()).length,
    });
});

// ============ INDEX CANDLES ============
app.get('/market/index-candles/:indexName', async (req, res) => {
    const indexName = decodeURIComponent(req.params.indexName);
    const { interval = '1d' } = req.query;
    const validIntervals = candleDataService.SUPPORTED_INTERVALS;
    if (!validIntervals.includes(interval)) {
        return res.status(400).json({ message: `Invalid interval. Valid: ${validIntervals.join(', ')}` });
    }
    try {
        const candles = await candleDataService.generateIndexCandles(indexName, interval);
        const indexData = marketDataService.getIndexData();
        const quote = indexData[indexName] || {};
        const candleSource = candleDataService.getCandleSource('index', indexName, interval);
        res.status(200).json({ indexName, interval, candles, quote, candleSource });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching index candles', error: err.message });
    }
});

// Live candles built from tick accumulator (intraday use)
app.get('/market/live-candles/:indexName', (req, res) => {
    const indexName = decodeURIComponent(req.params.indexName);
    const { interval = '5' } = req.query; // interval in minutes
    const intervalMs = parseInt(interval, 10) * 60 * 1000;
    const candles = candleDataService.getLiveCandles(indexName, intervalMs);
    const quote = marketDataService.getIndexData()[indexName] || {};
    res.status(200).json({ indexName, intervalMinutes: parseInt(interval, 10), candles, quote });
});

// ============ OPTION CHAIN ============
// Every NSE/BSE index that actually has a listed option contract.
// NIFTY IT was removed — it has no F&O contract on NSE (index-only, no chain).
const SUPPORTED_INDICES = ['NIFTY 50', 'BANK NIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTY NEXT 50', 'SENSEX', 'BANKEX'];

const INDEX_ALIASES = {
    'NIFTY': 'NIFTY 50',
    'NIFTY50': 'NIFTY 50',
    'NIFTY-50': 'NIFTY 50',
    'CNX NIFTY': 'NIFTY 50',
    'BANKNIFTY': 'BANK NIFTY',
    'NIFTY BANK': 'BANK NIFTY',
    'FINNIFTY': 'FINNIFTY',
    'NIFTY FIN SERVICE': 'FINNIFTY',
    'MIDCAP': 'MIDCPNIFTY',
    'MIDCPNIFTY': 'MIDCPNIFTY',
    'NIFTY MIDCAP 50': 'MIDCPNIFTY',
    'NIFTY NEXT 50': 'NIFTY NEXT 50',
    'NEXT50': 'NIFTY NEXT 50',
    'SENSEX': 'SENSEX',
    'BSE SENSEX': 'SENSEX',
    'BANKEX': 'BANKEX',
};

function normalizeIndexName(raw) {
    if (!raw) return 'NIFTY 50';
    const clean = raw.trim().toUpperCase();
    if (INDEX_ALIASES[clean]) return INDEX_ALIASES[clean];
    const match = SUPPORTED_INDICES.find(n => 
        n === clean || 
        n.replace(/\s+/g, '') === clean.replace(/\s+/g, '') ||
        clean.includes(n.replace(/\s+/g, '')) ||
        n.includes(clean)
    );
    return match || 'NIFTY 50';
}

app.get('/market/optionchain/:symbol', async (req, res) => {
    const rawSymbol = decodeURIComponent(req.params.symbol).toUpperCase();
    const indexName = normalizeIndexName(rawSymbol);
    try {
        // Real NFO chain from Dhan (LTP, OI, IV, greeks); simulated fallback
        let chain = await marketDataService.getOptionChain(indexName, req.query.expiry || null);
        if (!chain) {
            chain = await marketDataService.getOptionChain('NIFTY 50', req.query.expiry || null);
        }
        res.status(200).json(chain);
    } catch (err) {
        try {
            const fallbackChain = await marketDataService.getOptionChain('NIFTY 50', null);
            return res.status(200).json(fallbackChain);
        } catch (e2) {
            res.status(500).json({ message: 'Error fetching option chain', error: err.message });
        }
    }
});

// ============ CANCEL ORDER ============
app.delete('/orders/:id', async (req, res) => {
    try {
        const order = await OrdersModel.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        if (req.user.role === 'STUDENT' && order.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized to cancel this order' });
        }
        if (order.status === 'EXECUTED') {
            return res.status(400).json({ message: 'Cannot cancel an executed order' });
        }
        order.status = 'CANCELLED';
        await order.save();
        const wallet = await orderEngine.recomputeBlockedMargin(order.userId);
        const orderObj = order.toObject ? order.toObject() : order;
        const walletObj = wallet ? (wallet.toObject ? wallet.toObject() : wallet) : null;
        io.to(`user:${order.userId}`).emit('orderCancelled', { order: orderObj, wallet: walletObj });
        io.to(order.userId.toString()).emit('orderCancelled', { order: orderObj, wallet: walletObj });
        res.status(200).json({ message: 'Order cancelled', order });
    } catch (err) {
        res.status(500).json({ message: 'Error cancelling order', error: err.message });
    }
});


// ============ CANDLE DATA ============
app.get('/market/candles/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const { interval } = req.query;
    const candleInterval = interval || '1d';

    const validIntervals = candleDataService.SUPPORTED_INTERVALS;
    if (!validIntervals.includes(candleInterval)) {
        return res.status(400).json({ message: `Invalid interval. Valid values: ${validIntervals.join(', ')}` });
    }

    try {
        const candles = await candleDataService.generateCandles(symbol, candleInterval);
        const candleSource = candleDataService.getCandleSource('stock', symbol, candleInterval);
        res.status(200).json({ symbol: symbol.toUpperCase(), interval: candleInterval, candles, candleSource });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching candles', error: err.message });
    }
});

// ============ CHAT ============
app.get('/chat/history', async (req, res) => {
    try {
        const messages = await ChatModel.find({}).sort({ createdAt: -1 }).limit(100);
        res.status(200).json(messages.reverse());
    } catch (err) {
        res.status(500).json({ message: 'Error fetching chat', error: err.message });
    }
});

// ============ HISTORICAL STOCK DATA ============
app.get('/market/history/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const { days } = req.query;
    const numDays = parseInt(days) || 30;
    try {
        const candles = await candleDataService.generateCandles(symbol, '1d');
        const limited = candles.slice(-Math.min(numDays, candles.length));
        res.status(200).json({ symbol: symbol.toUpperCase(), candles: limited });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching history', error: err.message });
    }
});

// ============ SOCKET.IO ============
io.on('connection', async (socket) => {
    const userId = socket.userId || socket.request.user?._id;
    console.log('Client connected:', socket.id, userId ? `User: ${userId}` : '(unauthenticated)');

    // Push market data immediately so the client doesn't wait 30s
    socket.emit('marketData', {
        prices: marketDataService.getStockPrices(),
        indexes: marketDataService.getIndexData(),
        movers: marketDataService.getMarketMovers(),
        lastUpdated: marketDataService.getLastUpdated(),
    });

    if (userId) {
        // Join private user room for strict data isolation
        socket.join(`user:${userId}`);
        socket.join(userId.toString());

        // Auto-join batch room if user is enrolled
        const { EnrollmentModel } = require('./model/EnrollmentModel');
        EnrollmentModel.findOne({ userId, status: 'ACTIVE' }).then(enr => {
            if (enr) {
                socket.join(`batch:${enr.batchId}`);
            }
        }).catch(() => {});

        if (socket.user && ['INSTRUCTOR', 'INSTITUTE_ADMIN', 'ADMIN'].includes(socket.user.role)) {
            const { BatchModel } = require('./model/BatchModel');
            const batchQuery = socket.user.role === 'INSTRUCTOR' ? { instructorId: socket.user._id } : { instituteCode: socket.user.instituteCode };
            BatchModel.find(batchQuery).select('_id').then(batches => {
                batches.forEach(b => socket.join(`batch:${b._id.toString()}`));
            }).catch(() => {});
        }

        // Push holdings, positions, wallet instantly on connect so every screen
        // auto-populates without needing a manual pull-to-refresh.
        try {
            let [holdings, positions, wallet] = await Promise.all([
                HoldingsModel.find({ userId }),
                PositionsModel.find({ userId }),
                WalletModel.findOne({ userId }),
            ]);
            if (!wallet) {
                const { EnrollmentModel } = require('./model/EnrollmentModel');
                const enrollment = await EnrollmentModel.findOne({ userId, status: 'ACTIVE' }).populate('batchId');
                const capPaise = enrollment?.batchId?.startingCapitalPaise || 10000000;
                const capRupees = capPaise / 100;
                wallet = await WalletModel.create({
                    userId,
                    balance: capRupees,
                    balancePaise: capPaise,
                    availableMargin: capRupees,
                    usedMargin: 0,
                    misMargin: 0,
                    optionMargin: 0,
                    blockedMargin: 0,
                    blockedMarginPaise: 0,
                });
            }
            const totalUsed = Math.round((wallet.usedMargin || 0) + (wallet.misMargin || 0) + (wallet.optionMargin || 0));
            const walletObj = wallet ? {
                ...(wallet.toObject ? wallet.toObject() : wallet),
                totalUsedMargin: totalUsed,
                usedMargin: totalUsed,
            } : null;
            socket.emit('initialData', {
                holdings: holdings.map(withLiveLtp),
                positions: positions.map(withLiveLtp),
                wallet: walletObj,
            });
        } catch (e) { /* non-fatal */ }
    }

    socket.on('subscribe', (symbols) => {
        if (Array.isArray(symbols)) {
            socket.join(symbols.map(s => s.toUpperCase()));
        }
    });

    socket.on('joinBatch', async (batchId) => {
        if (!batchId) return;
        // Verify user is permitted to join this batch room
        if (socket.user) {
            if (['ADMIN', 'SUPER_ADMIN', 'INSTITUTE_ADMIN', 'INSTRUCTOR'].includes(socket.user.role)) {
                socket.join(`batch:${batchId}`);
            } else if (socket.user.role === 'STUDENT') {
                const { EnrollmentModel } = require('./model/EnrollmentModel');
                const enr = await EnrollmentModel.findOne({ batchId, userId: socket.userId, status: 'ACTIVE' });
                if (enr) socket.join(`batch:${batchId}`);
            }
        } else {
            socket.join(`batch:${batchId}`);
        }
    });


    // Live Chat & Announcements
    socket.on('chatMessage', async (data) => {
        const { username, message, room, messageType } = data;
        if (!message || !message.trim()) return;
        const chatRoom = room || 'general';
        const chatMsg = new ChatModel({
            userId,
            username: username || 'Trader',
            message: message.trim(),
            room: chatRoom,
            messageType: messageType || 'CHAT'
        });
        await chatMsg.save();
        
        if (chatRoom !== 'general') {
            io.to(chatRoom).emit('chatMessage', chatMsg);
        } else {
            io.emit('chatMessage', chatMsg);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ─── Smart market-hours detection (defined at top of file) ───────────────────

// ─── Broadcast helpers ────────────────────────────────────────────────────────
function emitMarketData() {
    const indexes = marketDataService.getIndexData();
    for (const [name, d] of Object.entries(indexes)) {
        if (d.ltp > 0) candleDataService.recordTick(name, d.ltp);
    }
    const prices = marketDataService.getStockPrices();
    for (const [symbol, d] of Object.entries(prices)) {
        if (d.ltp > 0) candleDataService.recordTick(symbol, d.ltp);
    }
    const data = {
        prices,
        indexes,
        movers:      marketDataService.getMarketMovers(),
        lastUpdated: marketDataService.getLastUpdated(),
        source:      marketDataService.getDataSource(),
    };
    io.emit('marketData', data);
}

// Both intervals below guard against overlapping runs the same way the
// _pnlTickBusy-guarded interval further down already does. `setInterval`
// fires on wall-clock schedule regardless of whether the previous async
// invocation has resolved — without a busy flag, a slow upstream call (Dhan/
// Yahoo) taking longer than the interval period would let two invocations
// of fastTickBroadcast run concurrently, and `evaluatePendingOrders()` could
// then pick up and execute the same resting order twice before the first
// execution's `orderDoc.status = 'EXECUTED'` save commits — a double-fill.
let _fullBroadcastBusy = false;
let _fastTickBusy = false;

// Slow OHLC snapshot — one batched Dhan /marketfeed/quote (stocks + indices)
// for OHLC/previousClose/52W. Runs on boot (seed) and every 15s. The 1s fast
// tick handles live LTP movement between these.
async function broadcastMarketData() {
    if (_fullBroadcastBusy) return;
    if (!isLiveMarketActive('EQ') && marketDataService.getLastUpdated()) return; // Keep market data frozen during off-hours
    _fullBroadcastBusy = true;
    try {
        await marketDataService.fetchAllStockPrices();
        emitMarketData();
        console.log(`[Broadcast] full | source: ${marketDataService.getDataSource()} | ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
    } finally {
        _fullBroadcastBusy = false;
    }
}

// Fast LTP-only refresh — runs every 1s during market hours. Uses 'FO' (the
// wider 15:40 window) since this feeds both equity and option live ticks.
async function fastTickBroadcast() {
    if (!isLiveMarketActive('FO') || _fastTickBusy) return;
    _fastTickBusy = true;
    try {
        await marketDataService.fastRefresh();
        emitMarketData();

        // Order-engine ticks: fill resting LIMIT/SL/SL-M orders, fire GTT/alerts,
        // and square off MIS positions at 3:20 PM — all against the price data
        // that was just refreshed above.
        try {
            await orderEngine.evaluatePendingOrders();
            await orderEngine.evaluateAlerts();
            await orderEngine.checkSameDayMisSquareOff();
        } catch (e) {
            console.error('[OrderEngine] tick error:', e.message);
        }
    } finally {
        _fastTickBusy = false;
    }
}

// Sync wallet.usedMargin with actual holdings on startup
(async () => {
    try {
        const users = await WalletModel.distinct('userId');
        for (const userId of users) {
            const [holdings, wallet] = await Promise.all([HoldingsModel.find({ userId }), WalletModel.findOne({ userId })]);
            if (wallet && holdings.length > 0) {
                const actualUsed = holdings.reduce((s, h) => s + h.avgPrice * h.quantity, 0);
                wallet.usedMargin      = Math.round(actualUsed);
                wallet.availableMargin = Math.max(0, wallet.balance - wallet.usedMargin - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
                await wallet.save();
                console.log(`[Wallet] Synced usedMargin = ₹${wallet.usedMargin.toLocaleString('en-IN')} from ${holdings.length} holdings for user ${userId}`);
            }
        }
    } catch (e) { console.error('[Wallet] Sync error:', e.message); }
})();

// ─── New trading day preparation ─────────────────────────────────────────────
// Runs once per IST day (on startup + 8:45 AM IST cron), like a broker's BOD job:
//  1. Archives every not-yet-archived trade's realised P&L into the
//     permanent P&L books (PLRecordModel) — trade history + its P&L survive
//     forever, independent of what gets cleared below
//  2. Clears yesterday's orders (the Executed screen starts fresh each day)
//  3. Squares off leftover MIS (intraday) positions at LTP, realizing P&L
//  4. Settles expired option positions at LTP, releasing margin
const cron = require('node-cron');

// Tiny key-value state doc to remember the last prep date across restarts
const AppStateModel = mongoose.model('AppState', new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    key:   { type: String },
    value: { type: String },
}, { timestamps: true }));

// TradeModel is the permanent, never-deleted trade log — but the P&L
// reports (/pnl/records, monthly-breakdown, statement download) read from
// PLRecordModel, which historically only held seeded/imported data and was
// never fed from trades actually placed live through the app. This rolls
// every not-yet-archived trade into a permanent per-symbol/day PLRecord
// (FIFO-matched, same method as computeRealizedPnlToday) so live trading
// shows up in the P&L books forever — independent of orders/positions being
// cleared for the new day. `archived` on TradeModel makes this idempotent:
// re-running day-prep (or a multi-day gap) never re-sums the same trade.
function classifySegment(symbol) {
    return /CE$|PE$|FUT$/.test(symbol) ? 'fno' : 'equity';
}

async function archivePastTradesToPLRecords(userId, beforeDate) {
    const trades = await TradeModel.find({ userId, archived: { $ne: true }, createdAt: { $lt: beforeDate } })
        .sort({ createdAt: 1 }).lean();
    if (trades.length === 0) return 0;

    const groups = new Map(); // "day|symbol|productType" -> trades[]
    for (const t of trades) {
        const day = rules.istDateStr(t.createdAt);
        const key = `${day}|${t.stockSymbol}|${t.productType}`;
        if (!groups.has(key)) groups.get(key, []);
        groups.get(key).push(t);
    }

    const docs = [];
    for (const [key, group] of groups) {
        const [day, symbol] = key.split('|');
        const buys  = group.filter(t => t.side === 'BUY');
        const sells = group.filter(t => t.side === 'SELL');
        const buyValue  = buys.reduce((s, t) => s + t.quantity * t.price, 0);
        const sellValue = sells.reduce((s, t) => s + t.quantity * t.price, 0);
        const charges   = Math.round(group.reduce((s, t) => s + (t.charges || 0), 0) * 100) / 100;

        const buyQueue = buys.map(b => ({ price: b.price, remaining: b.quantity }));
        let realizedPL = 0;
        for (const sell of sells) {
            let remain = sell.quantity;
            for (const buy of buyQueue) {
                if (remain <= 0) break;
                if (buy.remaining <= 0) continue;
                const m = Math.min(remain, buy.remaining);
                realizedPL += (sell.price - buy.price) * m;
                buy.remaining -= m;
                remain -= m;
            }
        }
        realizedPL = Math.round(realizedPL * 100) / 100;
        const netPL = Math.round((realizedPL - charges) * 100) / 100;
        const quantity = sells.reduce((s, t) => s + t.quantity, 0) || buys.reduce((s, t) => s + t.quantity, 0);
        const realizedPLPct = buyValue > 0 ? Math.round((realizedPL / buyValue) * 10000) / 100 : 0;

        docs.push({
            userId,
            tradeDate: new Date(`${day}T09:15:00.000Z`),
            symbol, quantity, buyValue, sellValue, realizedPL, charges, netPL, realizedPLPct,
            segment: classifySegment(symbol), source: 'live',
        });
    }

    await PLRecordModel.insertMany(docs);
    await TradeModel.updateMany({ _id: { $in: trades.map(t => t._id) } }, { $set: { archived: true } });
    return docs.length;
}

async function prepareNewTradingDay(userId, force = false) {
    try {
        const { start, dateStr } = istDayRange();
        const state = await AppStateModel.findOne({ userId, key: 'lastTradingDayPrep' });
        if (!force && state?.value === dateStr) return; // already prepared today

        // 1. Roll every not-yet-archived trade into the permanent P&L books
        // BEFORE anything gets cleared — orders/positions are transient, but
        // the trade history + its realised P&L must survive forever.
        const archivedCount = await archivePastTradesToPLRecords(userId, start);

        // 2. Yesterday's orders vanish (DAY validity — unfilled orders expire at EOD)
        const oldOrders = await OrdersModel.deleteMany({ userId, createdAt: { $lt: start } });

        // 3. Safety-net square-off for any MIS position that somehow survived
        // past the same-day 3:20 PM auto square-off (e.g. server was down).
        const misSquaredOff = await orderEngine.squareOffAllMIS(userId, 'Day-prep safety-net square-off');

        // 3.5. T1 settlement — quantity bought yesterday-or-earlier is now
        // fully settled into demat and sellable.
        const t1Result = await HoldingsModel.updateMany(
            { userId, t1Date: { $lt: start } },
            { $set: { t1Quantity: 0 } }
        );

        const wallet = await WalletModel.findOne({ userId });

        // 4. Settle expired option positions at their last premium
        const optionPositions = await OptionPositionsModel.find({ userId, expiry: { $lt: dateStr } });
        for (const pos of optionPositions) {
            const ltp = (await getLiveOptionLTP(pos.underlyingSymbol, pos.strikePrice, pos.optionType, pos.expiry)) ?? pos.ltp;
            const sellValue = ltp * pos.quantity;
            const costBasis = pos.avgPremium * pos.quantity;
            await new TradeModel({
                userId, stockSymbol: pos.symbol, quantity: pos.quantity, price: ltp,
                side: 'SELL', productType: 'NRML',
                charges: Math.round(sellValue * 0.001 * 100) / 100, totalValue: sellValue,
            }).save();
            if (wallet) {
                // Release from `optionMargin`, not `usedMargin` — see the
                // WalletSchema comment for why these are now tracked
                // separately.
                wallet.optionMargin = Math.max(0, (wallet.optionMargin || 0) - costBasis);
                wallet.balance     += sellValue - costBasis;
            }
            await recordClosedOptionPosition({
                symbol: pos.symbol, productType: pos.productType || 'NRML', quantity: pos.quantity,
                lots: pos.lots, avgPrice: pos.avgPremium, exitPrice: ltp, pnl: sellValue - costBasis,
                underlyingSymbol: pos.underlyingSymbol, strikePrice: pos.strikePrice, optionType: pos.optionType, expiry: pos.expiry,
            });
            await OptionPositionsModel.deleteOne({ _id: pos._id });
        }

        if (wallet) {
            wallet.availableMargin = Math.max(0, wallet.balance - wallet.usedMargin - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
            await wallet.save();
        }
        await orderEngine.recomputeBlockedMargin(userId);

        // 5. Apply any corporate actions (dividend/split/bonus) whose ex-date has passed
        const corpActionsApplied = await applyDueCorporateActions();

        await AppStateModel.updateOne(
            { userId, key: 'lastTradingDayPrep' },
            { $set: { value: dateStr } },
            { upsert: true }
        );

        // New session → yesterday's close changed; refresh the candle-derived
        // reference closes that anchor Day's-P&L (fire-and-forget, throttled).
        marketDataService.seedReferenceCloses(marketDataService.getTrackedSymbols()).catch(() => {});

        console.log(`[DayPrep] ${dateStr} ready for ${userId} | archived: ${archivedCount} | cleared: ${oldOrders.deletedCount}`);
    } catch (e) {
        console.error('[DayPrep] error:', e.message);
    }
}

// 8:45 AM IST every weekday, before market open
cron.schedule('45 8 * * 1-5', async () => {
    const users = await UserModel.find({});
    for (const u of users) await prepareNewTradingDay(u._id);
}, { timezone: 'Asia/Kolkata' });

// Manual trigger for testing / ops
app.post('/admin/prepare-day', async (req, res) => {
    await prepareNewTradingDay(req.user._id, true);
    res.json({ message: 'Trading day prepared' });
});

// Track every symbol the user already owns or watches so live prices cover them
async function trackPortfolioSymbols() {
    try {
        const [holdings, positions, watchlists] = await Promise.all([
            HoldingsModel.find({}, 'stockSymbol'),
            PositionsModel.find({}, 'stockSymbol'),
            WatchlistModel.find({}, 'stocks'),
        ]);
        holdings.forEach(h => marketDataService.trackSymbol(h.stockSymbol));
        positions.forEach(p => marketDataService.trackSymbol(p.stockSymbol));
        watchlists.forEach(w => (w.stocks || []).forEach(s => marketDataService.trackSymbol(s)));
    } catch (e) { console.error('[Track] error:', e.message); }
}

// Seed once on boot (so data exists before market open / right after a
// restart), then the 1s tick is the ONLY refresh — a full Dhan snapshot every
// second during market hours. No 30s hard-refresh cycle, no Groww/Yahoo.
(async () => {
    await mongoose.connection.asPromise().catch(() => {});
    await trackPortfolioSymbols();
    // Anchor Day's-P&L previous-closes to Dhan daily candles (reliable even
    // when the live quote/LTP mis-resolves a symbol like LTIM).
    await marketDataService.seedReferenceCloses(marketDataService.getTrackedSymbols());
    // Establish LTP anchors (reliable) BEFORE the quote snapshot, so a
    // wrong-instrument quote value can't seed a symbol as a stuck bad anchor.
    await marketDataService.fastRefresh();
    await broadcastMarketData();
})();
// Dhan-only, two-tier (no Groww/Yahoo):
//  • fast tick every 1s → LTP endpoint (light, safely sustains 1 req/s) for
//    live price movement + the order engine.
//  • snapshot every 15s → the heavier /marketfeed/quote endpoint (OHLC,
//    previousClose, 52W). Kept slow because quote rate-limits/429s if polled
//    every second and prevClose is constant intraday while high/low only
//    extend gradually. 4 quote calls/min stays well within Dhan's limit.
setInterval(fastTickBroadcast, 1000);
setInterval(broadcastMarketData, 15000);
setInterval(() => broadcastInstructorFeed(io), 2000); // 2s instructor feed broadcast

// Real-time position P&L push: every 1s during market hours, recomputed from
// already-cached prices (no extra Dhan calls) so both equity and option open
// positions re-price continuously without the client ever polling for it.
let _pnlTickBusy = false;
setInterval(async () => {
    if (_pnlTickBusy) return;
    if (!isLiveMarketActive('FO')) return; // Freeze position ticks during off-market hours!
    _pnlTickBusy = true;
    try {
        const { dateStr } = istDayRange();
        const activeUsers = await UserModel.find({});
        for (const user of activeUsers) {
            const userId = user._id;
            const [equityPositions, optionPositionsRaw, holdingsRaw, totalRealizedPnl, closedRaw, userWallet, allClosed] = await Promise.all([
                PositionsModel.find({ userId }),
                OptionPositionsModel.find({ userId }),
                HoldingsModel.find({ userId }),
                computeTotalRealizedPnlToday(userId),
                ClosedPositionModel.find({ userId, dateStr }).sort({ closedAt: -1 }).lean(),
                WalletModel.findOne({ userId }).lean(),
                ClosedPositionModel.find({ userId }).select('pnl').lean(),
            ]);

            const allTimeRealizedPnl = (allClosed || []).reduce((sum, c) => sum + (c.pnl || 0), 0);

            const equity = equityPositions.length > 0 ? await Promise.all(equityPositions.map(enrichEquityPosition)) : [];
            const options = optionPositionsRaw.length > 0 ? await enrichOptionPositions(userId, optionPositionsRaw) : [];
            const holdings = holdingsRaw.map(h => {
                const live = marketDataService.getStockPrice(h.stockSymbol);
                const avg = Number(h.avgPrice || 0);
                const curPrice = Number(live?.ltp ?? (typeof h.ltp === 'number' ? h.ltp : avg));
                const posPnl = Math.round((curPrice - avg) * (h.quantity || 1) * 100) / 100;
                const pnlPct = avg > 0 ? Math.round(((curPrice - avg) / avg) * 10000) / 100 : 0;
                return {
                    ...(h.toObject ? h.toObject() : h),
                    kind: 'holding',
                    side: 'BUY',
                    symbol: h.stockSymbol,
                    avgPrice: avg,
                    ltp: curPrice,
                    pnl: isNaN(posPnl) ? 0 : posPnl,
                    pnlPercent: isNaN(pnlPct) ? 0 : pnlPct,
                    productType: 'CNC'
                };
            });

            // Squared-off rows keep their booked pnl frozen forever, but the LTP
            // shown alongside them still tracks the live market — re-priced here
            // from the same already-cached quotes as the open positions above,
            // so it costs nothing extra per tick.
            const closed = await Promise.all(closedRaw.map(async (c) => {
                if (c.kind === 'option' && c.underlyingSymbol) {
                    const liveLtp = await getLiveOptionLTP(c.underlyingSymbol, c.strikePrice, c.optionType, c.expiry);
                    return { ...c, ltp: liveLtp ?? c.exitPrice };
                }
                const live = marketDataService.getStockPrice(c.symbol);
                return { ...c, ltp: live?.ltp ?? c.exitPrice };
            }));

            const allOpen = [...equity, ...options, ...holdings];
            const totalUnrealizedPnl = allOpen.reduce((s, p) => s + (p.unrealizedPnl || p.pnl || 0), 0);
            const todayPnl = Math.round((totalRealizedPnl + totalUnrealizedPnl) * 100) / 100;
            const totalPnl = Math.round((allTimeRealizedPnl + totalUnrealizedPnl) * 100) / 100;

            const bal = userWallet ? (userWallet.balancePaise ? userWallet.balancePaise / 100 : userWallet.balance) : 500000;
            const used = Math.round((userWallet?.usedMargin || 0) + (userWallet?.misMargin || 0) + (userWallet?.optionMargin || 0));
            const blocked = userWallet?.blockedMargin || 0;
            const avail = (userWallet && typeof userWallet.availableMargin === 'number' && userWallet.availableMargin > 0)
                ? userWallet.availableMargin
                : Math.max(0, bal - used - blocked);

            const tickPayload = {
                positions: allOpen,
                equityPositions: equity,
                optionPositions: options,
                holdings,
                closedPositions: closed,
                todayPnl,
                totalPnl,
                totalRealizedPnl,
                allTimeRealizedPnl,
                wallet: {
                    balance: bal,
                    availableMargin: avail,
                    usedMargin: used,
                    totalUsedMargin: used,
                    blockedMargin: blocked,
                },
                at: Date.now()
            };

            io.to(`user:${userId}`).emit('positionsTick', tickPayload);
            io.to(userId.toString()).emit('positionsTick', tickPayload);
        }
    } catch { /* next tick */ }
    finally { _pnlTickBusy = false; }
}, 1000);

// ============ DAY POSITIONS (today's F&O trades grouped by symbol) ============
app.get('/positions/day', async (req, res) => {
    try {
        // Today's F&O + intraday trades (IST trading day)
        const { start: startUTC, end: endUTC } = istDayRange();

        const trades = await TradeModel.find({
            userId:      req.user._id,
            createdAt:   { $gte: startUTC, $lte: endUTC },
            productType: { $in: ['NRML', 'MIS'] },
        }).sort({ stockSymbol: 1, createdAt: 1 });

        const map = {};
        trades.forEach(t => {
            if (!map[t.stockSymbol]) {
                map[t.stockSymbol] = {
                    stockSymbol: t.stockSymbol,
                    productType: t.productType,
                    buys:  [],
                    sells: [],
                };
            }
            (t.side === 'BUY' ? map[t.stockSymbol].buys : map[t.stockSymbol].sells).push(t);
        });

        const positions = Object.values(map).map(p => {
            const buyQty    = p.buys.reduce((s, t) => s + t.quantity, 0);
            const sellQty   = p.sells.reduce((s, t) => s + t.quantity, 0);
            const buyValue  = p.buys.reduce((s, t) => s + t.totalValue, 0);
            const sellValue = p.sells.reduce((s, t) => s + t.totalValue, 0);
            const avgBuy    = buyQty  > 0 ? buyValue  / buyQty  : 0;
            const avgSell   = sellQty > 0 ? sellValue / sellQty : 0;
            const matchedQty = Math.min(buyQty, sellQty);
            const realizedPnl = matchedQty > 0 ? (avgSell - avgBuy) * matchedQty : 0;
            const lastSell   = p.sells.length ? p.sells[p.sells.length - 1].price : 0;
            const lastBuy    = p.buys.length  ? p.buys[p.buys.length  - 1].price : 0;

            // Live mark-to-market price; option contracts often aren't in the
            // live feed, so fall back to the last traded price for this contract.
            const live = marketDataService.getStockPrice(p.stockSymbol);
            const ltp  = (live && live.ltp) || lastSell || lastBuy || 0;

            // Net open quantity carries unrealized (mark-to-market) P&L.
            const netQty = buyQty - sellQty;
            let unrealizedPnl = 0;
            if (netQty > 0)      unrealizedPnl = (ltp - avgBuy)  * netQty;   // long open
            else if (netQty < 0) unrealizedPnl = (avgSell - ltp) * (-netQty); // short open

            const totalPnl = realizedPnl + unrealizedPnl;

            return {
                stockSymbol:  p.stockSymbol,
                productType:  p.productType,
                quantity:     buyQty,            // total lots bought (for display)
                netQty,                          // 0 = fully squared off
                avgPrice:     parseFloat(avgBuy.toFixed(2)),
                sellAvg:      parseFloat(avgSell.toFixed(2)),
                ltp:          parseFloat(ltp.toFixed(2)),
                buyQty, sellQty,
                realizedPnl:   parseFloat(realizedPnl.toFixed(2)),
                unrealizedPnl: parseFloat(unrealizedPnl.toFixed(2)),
                pnl:          parseFloat(totalPnl.toFixed(2)),  // realized + unrealized
                isSquaredOff: netQty === 0,
            };
        });

        // Sort positions: biggest losses first
        positions.sort((a, b) => a.pnl - b.pnl);

        // Exact total P&L (no rounding loss from intermediate steps)
        const totalPnl = parseFloat(positions.reduce((s, p) => s + p.pnl, 0).toFixed(2));

        // Individual trades sorted chronologically (for trade log view)
        const tradeLog = await TradeModel.find({
            userId:      req.user._id,
            createdAt:   { $gte: startUTC, $lte: endUTC },
            productType: { $in: ['NRML', 'MIS'] },
        }).sort({ createdAt: 1 }).lean();

        const formattedTrades = tradeLog.map(t => ({
            _id:         t._id,
            stockSymbol: t.stockSymbol,
            side:        t.side,
            quantity:    t.quantity,
            price:       t.price,
            totalValue:  t.totalValue,
            productType: t.productType,
            time:        t.createdAt,
            charges:     t.charges || 0,
        }));

        res.json({ positions, totalPnl, count: positions.length, trades: formattedTrades });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching day positions', error: err.message });
    }
});

// ============ OPTIONS PAPER TRADING ============
// NSE/BSE contract lot sizes, effective Jan 2026 revision
const OPTION_LOT_SIZES = {
    'NIFTY 50':      75,
    'BANK NIFTY':    30,
    'SENSEX':        20,
    'FINNIFTY':      65,
    'MIDCPNIFTY':    120,
    'NIFTY NEXT 50': 25,
    'BANKEX':        30,
};

function buildOptionSymbol(underlying, expiry, strike, optionType) {
    let resolvedExpiry = expiry;
    let d = new Date((resolvedExpiry || '') + 'T12:00:00');
    if (isNaN(d.getTime()) || !resolvedExpiry || resolvedExpiry === 'NEAR') {
        const expList = marketDataService.getExpiryDates ? marketDataService.getExpiryDates(underlying) : [];
        resolvedExpiry = expList[0] || new Date().toISOString().slice(0, 10);
        d = new Date(resolvedExpiry + 'T12:00:00');
    }
    const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const yr  = String(d.getFullYear()).slice(2);
    return `${underlying.replace(/\s+/g, '')}${yr}${mon}${strike}${optionType}`;
}

// Live premium from the Dhan option chain (falls back to synthetic pricing)
async function getLiveOptionLTP(underlyingSymbol, strikePrice, optionType, expiry) {
    return marketDataService.getOptionLTP(underlyingSymbol, strikePrice, optionType, expiry);
}

// Enrich open option positions with live LTP + mark-to-market P&L
async function enrichOptionPositions(userId, positions) {
    return Promise.all(positions.map(async pos => {
        const liveLTP = await getLiveOptionLTP(pos.underlyingSymbol, pos.strikePrice, pos.optionType, pos.expiry);
        const avg     = Number(pos.avgPremium || pos.avgPrice || 100);
        const ltp     = liveLTP ?? (typeof pos.ltp === 'number' ? pos.ltp : avg);
        const side    = pos.side || (pos.quantity >= 0 ? 'BUY' : 'SELL');
        const dir     = side.toUpperCase() === 'BUY' ? 1 : -1;
        // Mark-to-market on the quantity still open
        const unrealizedPnl = Math.round(pos.quantity * (ltp - avg) * dir * 100) / 100;
        const realizedPnl   = await computeRealizedPnlToday(userId, pos.symbol, pos.productType || 'NRML');
        const pnl     = Math.round((realizedPnl + unrealizedPnl) * 100) / 100;
        const pnlPct  = avg > 0 ? (unrealizedPnl / (Math.abs(pos.quantity) * avg)) * 100 : 0;
        return {
            ...(pos.toObject ? pos.toObject() : pos),
            kind: 'option',
            symbol: `${pos.underlyingSymbol} ${pos.strikePrice} ${pos.optionType}`,
            contractSymbol: pos.symbol,
            side,
            avgPrice: avg,
            avgPremium: avg,
            ltp,
            realizedPnl,
            unrealizedPnl,
            pnl,
            pnlPct: Math.round(pnlPct * 100) / 100,
            productType: pos.productType || 'NRML',
        };
    }));
}

app.get('/optionPositions', async (req, res) => {
    try {
        const positions = await OptionPositionsModel.find({ userId: req.user._id });
        res.status(200).json(await enrichOptionPositions(req.user._id, positions));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching option positions', error: err.message });
    }
});

// Core option order execution — shared by /newOptionOrder (user-initiated)
// and /optionPositions/:id/squareoff (closes an existing position at market).
// Returns { status, body } instead of writing to a response directly so both
// callers can shape their own HTTP reply.
async function executeOptionOrder(userId, { underlyingSymbol, strikePrice, optionType, expiry, lots, premium, action, orderType, existingOrderId }) {
    const { EnrollmentModel } = require('./model/EnrollmentModel');
    const enr = await EnrollmentModel.findOne({ userId, status: 'ACTIVE' });
    const haltCheck = await marketControlService.isBatchHalted(enr?.batchId);
    if (haltCheck.isHalted) {
        return { status: 403, body: { message: `Trading is halted: ${haltCheck.reason || 'Trading paused'}` } };
    }

    const lotSize = OPTION_LOT_SIZES[underlyingSymbol] || 50;
    const qty     = Number(lots) * lotSize;
    let resolvedPrem = Number(typeof premium === 'number' ? premium : (premium?.ltp ?? premium));
    if (!Number.isFinite(resolvedPrem) || resolvedPrem <= 0) {
        resolvedPrem = 100;
    }
    const prem    = resolvedPrem;
    const total   = qty * prem;

    let resolvedExpiry = expiry;
    if (!resolvedExpiry || resolvedExpiry === 'NEAR' || isNaN(new Date((resolvedExpiry || '') + 'T12:00:00').getTime())) {
        const expList = marketDataService.getExpiryDates ? marketDataService.getExpiryDates(underlyingSymbol) : [];
        resolvedExpiry = expList[0] || new Date().toISOString().slice(0, 10);
    }
    expiry = resolvedExpiry;

    const symbol  = buildOptionSymbol(underlyingSymbol, expiry, strikePrice, optionType);
    const charges = calcCharges({ segment: 'options', side: action, turnover: total });
    const underlyingPrice = marketDataService.getStockPrice(underlyingSymbol)?.ltp
        ?? marketDataService.getIndexData()[underlyingSymbol]?.ltp ?? 0;

    try {
        const wallet = await WalletModel.findOne({ userId });
        let position = await OptionPositionsModel.findOne({ userId, underlyingSymbol, strikePrice: Number(strikePrice), optionType, expiry });
        let realizedPnl = 0;
        let marginDelta = 0; // change in wallet.usedMargin

        if (action === 'BUY') {
            if (position && position.quantity < 0) {
                // Covering (part or all of) a written/short position
                const shortQty = Math.abs(position.quantity);
                const coverQty = Math.min(qty, shortQty);
                const coverPnl = (position.avgPremium - prem) * coverQty;
                realizedPnl += coverPnl;
                const releasedMargin = (rules.approxOptionWriteMargin(underlyingPrice, coverQty, position.avgPremium));
                marginDelta -= releasedMargin;

                const overflow = qty - shortQty;
                const oldAvgPremium = position.avgPremium;
                if (overflow > 0) {
                    await recordClosedOptionPosition({
                        userId, symbol, productType: 'NRML', quantity: -shortQty, lots: -shortQty / lotSize,
                        avgPrice: oldAvgPremium, exitPrice: prem, pnl: coverPnl,
                        underlyingSymbol, strikePrice: Number(strikePrice), optionType, expiry,
                    });
                    position.quantity = overflow;
                    position.lots = overflow / lotSize;
                    position.avgPremium = prem;
                    marginDelta += overflow * prem; // new long leg costs full premium
                } else {
                    position.quantity += qty;
                    position.lots = position.quantity / lotSize;
                }
                position.ltp = prem;
                if (position.quantity === 0) {
                    await recordClosedOptionPosition({
                        userId, symbol, productType: 'NRML', quantity: -shortQty, lots: -shortQty / lotSize,
                        avgPrice: oldAvgPremium, exitPrice: prem, pnl: coverPnl,
                        underlyingSymbol, strikePrice: Number(strikePrice), optionType, expiry,
                    });
                    await OptionPositionsModel.deleteOne({ _id: position._id });
                } else await position.save();
            } else {
                if (!wallet || wallet.availableMargin < total) {
                    return { status: 400, body: { message: 'Insufficient funds', required: total, available: wallet?.availableMargin ?? 0 } };
                }
                marginDelta += total;
                if (position) {
                    const newQty = position.quantity + qty;
                    position.avgPremium = ((position.avgPremium * position.quantity) + (prem * qty)) / newQty;
                    position.lots = newQty / lotSize;
                    position.quantity = newQty;
                    position.ltp = prem;
                } else {
                    position = new OptionPositionsModel({
                        userId, symbol, underlyingSymbol, strikePrice: Number(strikePrice), optionType, expiry,
                        lotSize, lots: Number(lots), quantity: qty, avgPremium: prem, ltp: prem,
                    });
                }
                await position.save();
            }
        } else {
            // SELL
            if (position && position.quantity > 0) {
                const closeQty = Math.min(qty, position.quantity);
                const closePnl = (prem - position.avgPremium) * closeQty;
                realizedPnl += closePnl;
                marginDelta -= closeQty * position.avgPremium; // release premium margin held for the long

                const remainder = qty - position.quantity;
                const oldAvgPremium = position.avgPremium;
                if (remainder > 0) {
                    await recordClosedOptionPosition({
                        userId, symbol, productType: 'NRML', quantity: closeQty, lots: closeQty / lotSize,
                        avgPrice: oldAvgPremium, exitPrice: prem, pnl: closePnl,
                        underlyingSymbol, strikePrice: Number(strikePrice), optionType, expiry,
                    });
                    await OptionPositionsModel.deleteOne({ _id: position._id });
                    position = new OptionPositionsModel({
                        userId, symbol, underlyingSymbol, strikePrice: Number(strikePrice), optionType, expiry,
                        lotSize, lots: -remainder / lotSize, quantity: -remainder, avgPremium: prem, ltp: prem,
                    });
                    await position.save();
                    marginDelta += rules.approxOptionWriteMargin(underlyingPrice, remainder, prem);
                } else {
                    position.quantity -= qty;
                    position.lots = position.quantity / lotSize;
                    position.ltp = prem;
                    if (position.quantity === 0) {
                        await recordClosedOptionPosition({
                            userId, symbol, productType: 'NRML', quantity: closeQty, lots: closeQty / lotSize,
                            avgPrice: oldAvgPremium, exitPrice: prem, pnl: closePnl,
                            underlyingSymbol, strikePrice: Number(strikePrice), optionType, expiry,
                        });
                        await OptionPositionsModel.deleteOne({ _id: position._id });
                    } else await position.save();
                }
            } else {
                // Writing (shorting) a fresh or additional option contract
                const writeMargin = rules.approxOptionWriteMargin(underlyingPrice, qty, prem);
                if (!wallet || wallet.availableMargin < writeMargin) {
                    return {
                        status: 400,
                        body: { message: 'Insufficient margin to write this option', required: writeMargin, available: wallet?.availableMargin ?? 0 },
                    };
                }
                marginDelta += writeMargin;
                if (position) {
                    const newAbsQty = Math.abs(position.quantity) + qty;
                    position.avgPremium = ((position.avgPremium * Math.abs(position.quantity)) + (prem * qty)) / newAbsQty;
                    position.quantity -= qty;
                    position.lots = position.quantity / lotSize;
                } else {
                    position = new OptionPositionsModel({
                        userId, symbol, underlyingSymbol, strikePrice: Number(strikePrice), optionType, expiry,
                        lotSize, lots: -Number(lots), quantity: -qty, avgPremium: prem, ltp: prem,
                    });
                }
                position.ltp = prem;
                await position.save();
            }
        }

        if (wallet) {
            wallet.balance = Number(wallet.balance || 0);
            const validRealizedPnl = Number.isFinite(Number(realizedPnl)) ? Number(realizedPnl) : 0;
            const validCharges = Number.isFinite(Number(charges?.total)) ? Number(charges.total) : 0;
            if (validRealizedPnl !== 0 || validCharges !== 0) {
                wallet.balance += Math.round((validRealizedPnl - validCharges) * 100) / 100;
            }
            wallet.optionMargin = Math.max(0, (wallet.optionMargin || 0) + marginDelta);
            wallet.availableMargin = Math.max(0, wallet.balance - (wallet.usedMargin || 0) - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
            await wallet.save();
            await orderEngine.recomputeBlockedMargin(userId, wallet);
        }

        const tradeDoc = await new TradeModel({ userId, stockSymbol: symbol, quantity: qty, price: prem, side: action, productType: 'NRML', charges: charges.total, totalValue: total }).save();

        let orderDoc;
        if (existingOrderId) {
            orderDoc = await OrdersModel.findById(existingOrderId);
            if (orderDoc) {
                orderDoc.status = 'EXECUTED';
                orderDoc.price = prem;
                orderDoc.quantity = qty;
                await orderDoc.save();
            }
        }
        if (!orderDoc) {
            orderDoc = await new OrdersModel({
                userId,
                stockSymbol: symbol,
                quantity: qty,
                price: prem,
                type: orderType || 'MARKET',
                side: action,
                status: 'EXECUTED',
                productType: 'NRML',
                underlyingSymbol,
                strikePrice: Number(strikePrice),
                optionType,
                expiry,
                lots: Number(lots)
            }).save();
        }

        const totalUsed = Math.round((wallet?.usedMargin || 0) + (wallet?.misMargin || 0) + (wallet?.optionMargin || 0));
        const walletPayload = wallet ? {
            ...(wallet.toObject ? wallet.toObject() : wallet),
            totalUsedMargin: totalUsed,
            usedMargin: totalUsed,
        } : null;

        const orderObj = orderDoc.toObject ? orderDoc.toObject() : orderDoc;
        io.to(`user:${userId}`).emit('optionOrderExecuted', { action, symbol, lots: Number(lots), qty, premium: prem, total, pnl: realizedPnl, wallet: walletPayload, order: orderObj });
        io.to(userId.toString()).emit('optionOrderExecuted', { action, symbol, lots: Number(lots), qty, premium: prem, total, pnl: realizedPnl, wallet: walletPayload, order: orderObj });
        io.to(`user:${userId}`).emit('orderExecuted', { order: orderObj, wallet: walletPayload });
        io.to(userId.toString()).emit('orderExecuted', { order: orderObj, wallet: walletPayload });
        io.to(`user:${userId}`).emit('walletUpdated', { wallet: walletPayload });
        io.to(userId.toString()).emit('walletUpdated', { wallet: walletPayload });
        io.to(`user:${userId}`).emit('trade_update', { symbol, side: action, lots, price: prem, wallet: walletPayload, order: orderObj });
        io.to(userId.toString()).emit('trade_update', { symbol, side: action, lots, price: prem, wallet: walletPayload, order: orderObj });

        const { EnrollmentModel } = require('./model/EnrollmentModel');
        EnrollmentModel.findOne({ userId, status: { $ne: 'DROPPED' } }).then(async enr => {
            if (enr && io) {
                const student = await UserModel.findById(userId).select('name');
                io.to(`batch:${enr.batchId}`).emit('instructorFeed:order', {
                    studentId: userId.toString(),
                    order: orderObj,
                });
                sendNotification({
                    userId,
                    batchId: enr.batchId,
                    type: 'TRADE',
                    title: 'Option Trade Executed',
                    message: `${student?.name || 'Student'} placed ${action} ${qty} ${symbol} @ ₹${prem}`,
                    data: { symbol, side: action, quantity: qty, price: prem }
                }).catch(() => {});
                broadcastInstructorFeed(io);
            }
        }).catch(() => {});
        return {
            status: action === 'BUY' ? 201 : 200,
            body: { message: `Option ${action} executed`, position, wallet: walletPayload, pnl: realizedPnl, charges, order: orderObj },
        };

    } catch (err) {
        console.error('[executeOptionOrder Error Details]:', err);
        return { status: 500, body: { message: 'Error processing option order', error: err.message } };
    }
}

// Register option execution handler into orderEngine so trigger engine can evaluate option orders
orderEngine.registerOptionExecutor(executeOptionOrder);

app.post('/newOptionOrder', async (req, res) => {
    if (marketControlService.isHalted()) {
        const state = marketControlService.getMarketState();
        return res.status(403).json({ message: `Trading is halted${state.haltReason ? ': ' + state.haltReason : ''}` });
    }

    // Check institute feature gate for optionsTrading
    if (req.user?.instituteCode || req.user?.instituteId) {
        try {
            const inst = await InstituteModel.findOne({
                $or: [
                    { code: req.user.instituteCode },
                    ...(req.user.instituteId ? [{ _id: req.user.instituteId }] : [])
                ]
            }).select('features status');
            if (inst && inst.features && inst.features.optionsTrading === false) {
                return res.status(403).json({ message: 'Options trading is disabled for your institute by administrator.' });
            }
        } catch (_) {}
    }

    let { underlyingSymbol, strikePrice, optionType, expiry, lots, premium, price, action, side, symbol, orderType, type, triggerPrice } = req.body;

    underlyingSymbol = normalizeIndexName(underlyingSymbol || symbol || req.body.stockSymbol || 'NIFTY 50');
    action = (action || side || 'BUY').toUpperCase();
    lots = Number(lots ?? 1);
    strikePrice = strikePrice !== null && strikePrice !== undefined ? Number(strikePrice) : 0;
    optionType = (optionType || 'CE').toUpperCase();
    expiry = expiry || 'NEAR';
    const effectiveOrderType = ['MARKET', 'LIMIT', 'SL', 'SLM'].includes(orderType || type) ? (orderType || type) : 'MARKET';

    let currentMarketLtp = 0;
    if (marketDataService.getOptionLTPSync) {
        currentMarketLtp = marketDataService.getOptionLTPSync(underlyingSymbol, strikePrice, optionType, expiry);
    }
    if (!currentMarketLtp && marketDataService.getOptionLTP) {
        currentMarketLtp = (await marketDataService.getOptionLTP(underlyingSymbol, strikePrice, optionType, expiry)) || 100;
    }

    let resolvedPrem = Number(premium !== undefined ? premium : (price !== undefined ? price : 0));
    if (!Number.isFinite(resolvedPrem) || resolvedPrem <= 0) {
        resolvedPrem = currentMarketLtp || 100;
    }

    if (!underlyingSymbol) {
        return res.status(400).json({ message: 'underlyingSymbol is required' });
    }
    if (!['BUY', 'SELL'].includes(action)) {
        return res.status(400).json({ message: 'action must be BUY or SELL' });
    }
    const lotSize = OPTION_LOT_SIZES[underlyingSymbol] || 50;
    const qty = lots * lotSize;
    let resolvedExpiry = expiry;
    if (!resolvedExpiry || resolvedExpiry === 'NEAR' || isNaN(new Date((resolvedExpiry || '') + 'T12:00:00').getTime())) {
        const expList = marketDataService.getExpiryDates ? marketDataService.getExpiryDates(underlyingSymbol) : [];
        resolvedExpiry = expList[0] || new Date().toISOString().slice(0, 10);
    }
    const optSymbol = buildOptionSymbol(underlyingSymbol, resolvedExpiry, strikePrice, optionType);

    // If LIMIT order and not immediately marketable, create PENDING resting order:
    const isResting = (effectiveOrderType === 'LIMIT' && (
        (action === 'BUY' && resolvedPrem < currentMarketLtp) ||
        (action === 'SELL' && resolvedPrem > currentMarketLtp)
    )) || effectiveOrderType === 'SL' || effectiveOrderType === 'SLM';

    if (isResting) {
        const wallet = await WalletModel.findOne({ userId: req.user._id });
        const underlyingPrice = marketDataService.getStockPrice(underlyingSymbol)?.ltp
            ?? marketDataService.getIndexData()[underlyingSymbol]?.ltp ?? 0;
        const requiredMargin = action === 'BUY'
            ? (qty * resolvedPrem)
            : rules.approxOptionWriteMargin(underlyingPrice, qty, resolvedPrem);

        if (!wallet || (wallet.availableMargin ?? wallet.balance) < requiredMargin) {
            return res.status(400).json({
                message: 'Insufficient margin for option order',
                required: requiredMargin,
                available: wallet?.availableMargin ?? wallet?.balance ?? 0
            });
        }

        // Block margin on wallet
        wallet.blockedMargin = Math.round((wallet.blockedMargin || 0) + requiredMargin);
        wallet.availableMargin = Math.max(0, wallet.balance - (wallet.usedMargin || 0) - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - wallet.blockedMargin);
        await wallet.save();

        const orderDoc = await new OrdersModel({
            userId: req.user._id,
            instituteId: req.user.instituteId || null,
            stockSymbol: optSymbol,
            quantity: qty,
            price: resolvedPrem,
            triggerPrice: triggerPrice ? Number(triggerPrice) : null,
            type: effectiveOrderType,
            side: action,
            status: 'PENDING',
            productType: 'NRML',
            exchange: 'NSE',
            underlyingSymbol,
            strikePrice,
            optionType,
            expiry: resolvedExpiry,
            lots
        }).save();

        const totalUsed = Math.round((wallet.usedMargin || 0) + (wallet.misMargin || 0) + (wallet.optionMargin || 0));
        const walletPayload = {
            ...(wallet.toObject ? wallet.toObject() : wallet),
            totalUsedMargin: totalUsed,
            usedMargin: totalUsed,
        };

        const orderObj = orderDoc.toObject ? orderDoc.toObject() : orderDoc;
        io.to(`user:${req.user._id}`).emit('orderCreated', { order: orderObj, wallet: walletPayload });
        io.to(req.user._id.toString()).emit('orderCreated', { order: orderObj, wallet: walletPayload });
        io.to(`user:${req.user._id}`).emit('walletUpdated', { wallet: walletPayload });
        io.to(req.user._id.toString()).emit('walletUpdated', { wallet: walletPayload });

        return res.status(201).json({
            message: `${effectiveOrderType} option order placed — resting in Open tab`,
            order: orderObj,
            resting: true
        });
    }

    const result = await executeOptionOrder(req.user._id, {
        underlyingSymbol,
        strikePrice,
        optionType,
        expiry: resolvedExpiry,
        lots,
        premium: resolvedPrem,
        action,
        orderType: effectiveOrderType
    });
    res.status(result.status).json(result.body);
});

// Unified simulated trade endpoint for mobile app
app.post('/trade', async (req, res) => {
    try {
        let { symbol, stockSymbol, underlyingSymbol, strikePrice, optionType, expiry, lots, qty, quantity, price, premium, side, action, type, orderType } = req.body;
        
        const rawSymbol = symbol || stockSymbol || underlyingSymbol || 'NIFTY';
        const targetSide = (action || side || 'BUY').toUpperCase();
        const targetPrice = Number(price !== undefined ? price : (premium !== undefined ? premium : 0));
        
        const isOption = optionType || strikePrice || rawSymbol.toUpperCase().includes(' CE') || rawSymbol.toUpperCase().includes(' PE');
        
        if (isOption) {
            let underlying = underlyingSymbol || 'NIFTY 50';
            let strike = strikePrice !== undefined && strikePrice !== null ? Number(strikePrice) : 0;
            let optType = (optionType || 'CE').toUpperCase();

            const optMatch = rawSymbol.trim().match(/^(.*?)\s*(\d{4,6})\s*(CE|PE)$/i);
            if (optMatch) {
                underlying = underlyingSymbol || optMatch[1].trim();
                strike = strike || Number(optMatch[2]);
                optType = optionType || optMatch[3].toUpperCase();
            } else {
                let parts = rawSymbol.trim().split(/\s+/);
                if (parts.length >= 3 && !isNaN(parts[parts.length - 2])) {
                    optType = optionType || parts[parts.length - 1].toUpperCase();
                    strike = strike || Number(parts[parts.length - 2]);
                    underlying = underlyingSymbol || parts.slice(0, parts.length - 2).join(' ');
                } else if (parts[1] && !isNaN(parts[1])) {
                    strike = strike || Number(parts[1]);
                }
            }

            underlying = normalizeIndexName(underlying);
            let numLots = Number(lots || (qty ? Math.max(1, Math.round(Number(qty) / 25)) : (quantity ? Math.max(1, Math.round(Number(quantity) / 25)) : 1)));
            let prem = targetPrice > 0 ? targetPrice : (await marketDataService.getOptionLTP(underlying, strike, optType, expiry) || 100);

            const result = await executeOptionOrder(req.user._id, {
                underlyingSymbol: underlying,
                strikePrice: strike,
                optionType: optType,
                expiry: expiry || 'NEAR',
                lots: numLots,
                premium: prem,
                action: targetSide
            });

            if (io) {
                io.to(`user:${req.user._id}`).emit('trade_update', {
                    symbol: `${underlying} ${strike} ${optType}`,
                    side: targetSide,
                    lots: numLots,
                    price: prem,
                    timestamp: new Date()
                });
            }

            return res.status(result.status).json(result.body);
        } else {
            const targetQty = Number(qty || quantity || lots || 1);
            let finalPrice = targetPrice;
            if (!finalPrice || finalPrice <= 0) {
                const live = marketDataService.getStockPrice(rawSymbol);
                finalPrice = live?.ltp || 1000;
            }
            const orderTyp = ['MARKET', 'LIMIT', 'SL', 'SLM'].includes(type || orderType) ? (type || orderType) : 'MARKET';

            marketDataService.trackSymbol(rawSymbol);
            const result = await orderEngine.placeOrder(req.user._id, {
                stockSymbol: rawSymbol,
                quantity: targetQty,
                price: finalPrice,
                type: orderTyp,
                side: targetSide,
                productType: 'CNC'
            });

            if (io) {
                io.to(`user:${req.user._id}`).emit('trade_update', {
                    symbol: rawSymbol,
                    side: targetSide,
                    quantity: targetQty,
                    price: finalPrice,
                    timestamp: new Date()
                });
            }

            return res.status(201).json({
                message: 'Order executed successfully',
                order: result.order,
                trade: result.trade
            });
        }
    } catch (err) {
        if (err instanceof orderEngine.OrderRejectedError) {
            return res.status(400).json({ message: err.message });
        }
        res.status(500).json({ message: 'Error creating trade', error: err.message });
    }
});

// Square off (fully or partially close) an existing option position at the
// current live chain premium — the long-press "Square off" action in the app.
app.post('/optionPositions/:id/squareoff', async (req, res) => {
    try {
        const position = await OptionPositionsModel.findById(req.params.id);
        if (!position) return res.status(404).json({ message: 'Position not found' });

        if (req.user.role === 'STUDENT' && position.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized to square off this position' });
        }

        const isShort = position.quantity < 0;
        const action  = isShort ? 'BUY' : 'SELL'; // cover a short, sell a long
        const requestedLots = req.body?.lots ? Number(req.body.lots) : Math.abs(position.lots);
        const lots = Math.min(requestedLots, Math.abs(position.lots));

        const rawLive = await getLiveOptionLTP(position.underlyingSymbol, position.strikePrice, position.optionType, position.expiry);
        let premium = typeof rawLive === 'number' ? rawLive : (rawLive?.ltp ?? (typeof position.ltp === 'number' ? position.ltp : (position.ltp?.ltp ?? position.avgPremium ?? 100)));
        if (!Number.isFinite(Number(premium)) || Number(premium) <= 0) {
            premium = Number(position.avgPremium || 100);
        }

        const result = await executeOptionOrder(position.userId, {
            underlyingSymbol: position.underlyingSymbol, strikePrice: position.strikePrice,
            optionType: position.optionType, expiry: position.expiry,
            lots, premium, action,
        });
        CacheService.invalidatePortfolio(position.userId.toString()).catch(() => {});
        res.status(result.status).json(result.body);
    } catch (err) {
        res.status(500).json({ message: 'Error squaring off position', error: err.message });
    }
});


// ============ ADMIN TOKEN WEB PAGE ============
// Open http://your-server:8080/admin/token in any browser — paste token, save.
app.get('/admin/token', (req, res) => {
    const status = tokenService.getTokenStatus();
    const statusColor = status.expired ? '#ef4444' : status.status === 'EXPIRING_SOON' ? '#f59e0b' : '#22c55e';
    const statusText  = status.expired ? `EXPIRED` : status.hoursLeft != null ? `Valid — ${status.hoursLeft}h left` : 'Unknown';
    const expiresLine = status.expiresAt ? `Expires: ${new Date(status.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST` : '';

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dhan Token Update</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #f5f5f5; display: flex; justify-content: center; padding: 24px 16px; }
    .card { background: #fff; border-radius: 12px; padding: 28px; max-width: 520px; width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    h1 { font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 4px; }
    .sub { font-size: 13px; color: #64748b; margin-bottom: 20px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; background: #f1f5f9; margin-bottom: 8px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; }
    .badge-txt { font-size: 13px; font-weight: 600; color: ${statusColor}; }
    .expires { font-size: 12px; color: #94a3b8; margin-bottom: 20px; }
    label { font-size: 13px; font-weight: 600; color: #374151; display: block; margin-bottom: 6px; }
    .step { font-size: 12px; color: #64748b; margin-bottom: 14px; line-height: 1.6; }
    .step a { color: #3b82f6; }
    textarea { width: 100%; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 12px; font-size: 12px; font-family: monospace; color: #334155; resize: vertical; min-height: 90px; margin-bottom: 14px; outline: none; }
    textarea:focus { border-color: #3b82f6; }
    input[type=text] { width: 100%; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #334155; margin-bottom: 14px; outline: none; }
    input:focus { border-color: #3b82f6; }
    button { width: 100%; background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .result { margin-top: 14px; padding: 12px; border-radius: 8px; font-size: 13px; display: none; }
    .ok  { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
    .err { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .tip { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; font-size: 12px; color: #1d4ed8; line-height: 1.6; margin-top: 18px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Dhan Token</h1>
    <p class="sub">Update your Dhan API access token</p>
    <div class="badge"><div class="dot"></div><span class="badge-txt">${statusText}</span></div>
    <p class="expires">${expiresLine}</p>

    <p class="step">
      1. Go to <a href="https://dhanhq.co/developers" target="_blank">dhanhq.co/developers</a><br>
      2. Click your app → <strong>Generate Token</strong> (enter OTP)<br>
      3. Copy the access token and paste below
    </p>

    <label>Client ID</label>
    <input type="text" id="clientId" value="${status.clientId || ''}" placeholder="e.g. 1112426535" />
    <label>New Access Token</label>
    <textarea id="token" placeholder="Paste eyJ... token here"></textarea>
    <button onclick="save()">Save Token</button>
    <div id="result" class="result"></div>

    <div class="tip">
      <strong>Tip — skip copy-paste entirely:</strong><br>
      Set Postback URL in your Dhan app to<br>
      <code>https://your-server.com/dhan/token-postback</code><br>
      Then just click "Generate Token" — Dhan sends it here automatically.
    </div>
  </div>
  <script>
    async function save() {
      const clientId = document.getElementById('clientId').value.trim();
      const token    = document.getElementById('token').value.trim();
      const res      = document.getElementById('result');
      if (!clientId || !token) { showResult('Enter both Client ID and Access Token', false); return; }
      try {
        const r = await fetch('/admin/update-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, accessToken: token }),
        });
        const data = await r.json();
        if (r.ok) {
          const exp = data.expiresAt ? new Date(data.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
          showResult('✅ Token updated! Expires: ' + exp + ' IST', true);
          setTimeout(() => location.reload(), 2000);
        } else {
          showResult('❌ ' + (data.message || 'Update failed'), false);
        }
      } catch(e) { showResult('❌ Network error: ' + e.message, false); }
    }
    function showResult(msg, ok) {
      const el = document.getElementById('result');
      el.textContent = msg;
      el.className = 'result ' + (ok ? 'ok' : 'err');
      el.style.display = 'block';
    }
  </script>
</body>
</html>`);
});

// ============ DHAN POSTBACK (auto-receives new token from portal) ============
// Set this URL in dhanhq.co/developers → your app → Postback URL:
//   https://your-server.com/dhan/token-postback
app.post('/dhan/token-postback', async (req, res) => {
    // Dhan posts various field names — handle all known variants
    const accessToken =
        req.body?.['access-token']  ||
        req.body?.accessToken       ||
        req.body?.access_token      ||
        req.body?.token;
    const clientId =
        req.body?.dhanClientId      ||
        req.body?.clientId          ||
        req.body?.client_id         ||
        process.env.DHAN_CLIENT_ID;

    if (!accessToken) {
        console.warn('[Postback] Received postback but no token found. Body:', JSON.stringify(req.body));
        return res.status(400).json({ message: 'No access token in postback body' });
    }
    try {
        const info = await tokenService.saveToken(clientId, accessToken);
        console.log(`[Postback] ✅ Token updated via Dhan postback | expires: ${info.expiresAt}`);
        res.status(200).json({ message: 'Token updated', expiresAt: info.expiresAt });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// ============ ADMIN: TOKEN MANAGEMENT ============
app.post('/admin/update-token', async (req, res) => {
    const { clientId, accessToken } = req.body;
    if (!clientId || !accessToken) {
        return res.status(400).json({ message: 'clientId and accessToken are required' });
    }
    try {
        const info = await tokenService.saveToken(clientId, accessToken);
        res.json({ message: 'Token updated successfully', ...info });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.get('/admin/token-status', (req, res) => {
    res.json(tokenService.getTokenStatus());
});

// ============ START SERVER ============
if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Socket.IO is ready`);
    });
}

module.exports = {
    app,
    server,
    io,
    executeOptionOrder,
    getLiveOptionLTP,
};

