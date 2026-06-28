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
const marketDataService = require('./marketDataService');
let ioInstance = null; // set after io is created
const candleDataService = require('./candleDataService');
const { ChatModel } = require('./model/ChatModel');
const { PLRecordModel } = require('./model/PLRecordModel');

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.DATABASE_URL;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
});
ioInstance = io;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check — Railway/Render ping this to verify the service is up
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Zerodha Kite API', version: '1.0.0' }));

mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// ============ HOLDINGS ============
app.get('/allHoldings', async (req, res) => {
    try {
        const allHoldings = await HoldingsModel.find({});
        res.status(200).json(allHoldings);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching holdings', error: err.message });
    }
});

// ============ POSITIONS ============
app.get('/allPositions', async (req, res) => {
    try {
        const allPositions = await PositionsModel.find({});
        res.status(200).json(allPositions);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching positions', error: err.message });
    }
});

// ============ ORDERS ============
app.get('/allOrders', async (req, res) => {
    try {
        const allOrders = await OrdersModel.find({}).sort({ createdAt: -1 });
        res.status(200).json(allOrders);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching orders', error: err.message });
    }
});

// NSE market hours: Mon–Fri 09:15–15:30 IST
function isMarketOpen() {
    const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = ist.getDay();
    if (day === 0 || day === 6) return false;
    const mins = ist.getHours() * 60 + ist.getMinutes();
    return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

app.post('/newOrder', async (req, res) => {
    const { stockSymbol, qty: quantity, price, mode: type, side, productType } = req.body;

    if (!stockSymbol || !quantity || !price) {
        return res.status(400).json({ message: 'Missing required fields: stockSymbol, qty, price' });
    }

    if (!isMarketOpen()) {
        return res.status(400).json({
            message: 'Market is closed',
            detail: 'NSE trading hours: Mon–Fri, 9:15 AM – 3:30 PM IST.',
            marketClosed: true,
        });
    }

    try {
        // Create the order
        const orderType = type || 'MARKET';
        const orderSide = side || 'BUY';
        const orderProductType = productType || 'CNC';

        const newOrder = new OrdersModel({
            stockSymbol: stockSymbol.toUpperCase(),
            quantity: Number(quantity),
            price: Number(price),
            type: orderType === 'BUY' || orderType === 'SELL' ? 'MARKET' : orderType,
            side: orderSide,
            status: 'EXECUTED', // Auto-execute for demo
            productType: orderProductType,
        });

        await newOrder.save();

        // Create a trade record
        const totalValue = Number(quantity) * Number(price);
        const charges = Math.round(totalValue * 0.0005 * 100) / 100; // 0.05% brokerage

        const newTrade = new TradeModel({
            stockSymbol: stockSymbol.toUpperCase(),
            quantity: Number(quantity),
            price: Number(price),
            side: orderSide,
            productType: orderProductType,
            orderId: newOrder._id,
            charges,
            totalValue,
        });
        await newTrade.save();

        // Wallet is updated AFTER holdings are modified below; handled at broadcast step

        // Update holdings / positions
        if (orderSide === 'BUY') {
            if (orderProductType === 'MIS') {
                // Intraday position
                let position = await PositionsModel.findOne({ stockSymbol: stockSymbol.toUpperCase(), productType: 'MIS' });
                if (position) {
                    const totalQty = position.quantity + Number(quantity);
                    position.avgPrice = ((position.avgPrice * position.quantity) + (Number(price) * Number(quantity))) / totalQty;
                    position.quantity = totalQty;
                    position.ltp = Number(price);
                } else {
                    position = new PositionsModel({
                        stockSymbol: stockSymbol.toUpperCase(),
                        quantity: Number(quantity),
                        avgPrice: Number(price),
                        ltp: Number(price),
                        productType: 'MIS',
                        isIntraday: true,
                    });
                }
                await position.save();
            } else {
                // CNC - Delivery holding
                let holding = await HoldingsModel.findOne({ stockSymbol: stockSymbol.toUpperCase() });
                const liveLtp = marketDataService.getStockPrice(stockSymbol.toUpperCase())?.ltp ?? Number(price);
                if (holding) {
                    const totalQty = holding.quantity + Number(quantity);
                    holding.avgPrice = Math.round(((holding.avgPrice * holding.quantity) + (Number(price) * Number(quantity))) / totalQty * 100) / 100;
                    holding.quantity = totalQty;
                    holding.ltp = liveLtp;
                } else {
                    holding = new HoldingsModel({
                        stockSymbol: stockSymbol.toUpperCase(),
                        quantity: Number(quantity),
                        avgPrice: Number(price),
                        ltp: liveLtp,
                        productType: 'CNC',
                    });
                }
                await holding.save();
            }
        } else {
            // SELL
            if (orderProductType === 'MIS') {
                let position = await PositionsModel.findOne({ stockSymbol: stockSymbol.toUpperCase(), productType: 'MIS' });
                if (position) {
                    position.quantity -= Number(quantity);
                    if (position.quantity <= 0) {
                        await PositionsModel.deleteOne({ _id: position._id });
                    } else {
                        await position.save();
                    }
                }
            } else {
                let holding = await HoldingsModel.findOne({ stockSymbol: stockSymbol.toUpperCase() });
                if (holding) {
                    holding.quantity -= Number(quantity);
                    if (holding.quantity <= 0) {
                        await HoldingsModel.deleteOne({ _id: holding._id });
                    } else {
                        await holding.save();
                    }
                }
            }
        }

        // Delete the order once executed — trade record preserves history
        await OrdersModel.deleteOne({ _id: newOrder._id });

        // Broadcast updated positions, holdings & wallet — all computed from actual DB state
        const [updatedPositions, updatedHoldings, wallet] = await Promise.all([
            PositionsModel.find({}),
            HoldingsModel.find({}),
            WalletModel.findOne({}),
        ]);

        // Sync wallet.usedMargin with actual holdings cost basis
        if (wallet) {
            const actualUsed = updatedHoldings.reduce((s, h) => s + h.avgPrice * h.quantity, 0);
            wallet.usedMargin      = Math.round(actualUsed);
            wallet.availableMargin = Math.max(0, wallet.balance - wallet.usedMargin);
            await wallet.save();
        }

        const holdingsWithLiveLtp = updatedHoldings.map(h => {
            const live = marketDataService.getStockPrice(h.stockSymbol);
            return { ...h.toObject(), ltp: live?.ltp ?? h.ltp };
        });
        io.emit('orderExecuted', {
            order: newOrder,
            positions: updatedPositions,
            holdings: holdingsWithLiveLtp,
            wallet: wallet?.toObject(),
        });

        res.status(201).json({
            message: 'Order executed successfully',
            order: newOrder,
            trade: newTrade,
        });
    } catch (err) {
        res.status(500).json({ message: 'Error creating order', error: err.message });
    }
});

// ============ TRADES ============
app.get('/trades', async (req, res) => {
    try {
        const trades = await TradeModel.find({}).sort({ createdAt: -1 });
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

        const tradeQuery = {};
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
        let holdingsQuery = {};
        if (segKey === 'equity') holdingsQuery = { productType: { $in: ['CNC'] } };
        else if (segKey === 'mtf')  holdingsQuery = { productType: 'MIS' };

        const holdings = await HoldingsModel.find(holdingsQuery);
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
        const query = {};
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
            const holdings = await HoldingsModel.find(
                segKey === 'equity' ? { productType: 'CNC' } : {}
            );
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
            await PLRecordModel.deleteMany({ source: 'import' });
        }

        const docs = records.map(r => ({
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
        const match = {};
        if (from) match.tradeDate = { $gte: new Date(from) };
        if (to)   match.tradeDate = { ...match.tradeDate, $lte: new Date(to + 'T23:59:59.999Z') };

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
        const query = {};
        if (from) query.tradeDate = { ...query.tradeDate, $gte: new Date(from) };
        if (to)   query.tradeDate = { ...query.tradeDate, $lte: new Date(to + 'T23:59:59.999Z') };
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

// ============ TAX P&L ============
// POST /tax-pnl/seed-equity — adds sample CNC equity trades for STCG/LTCG demo
// SECURITY: restricted to development only — destructive (deletes all CNC trades)
app.post('/tax-pnl/seed-equity', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: 'Seed endpoint disabled in production' });
    }
    try {
        // Remove old equity trades first
        await TradeModel.deleteMany({ productType: 'CNC' });

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
                stockSymbol: t.sym, quantity: t.qty, price: t.buyPrice,
                side: 'BUY', productType: 'CNC',
                charges: parseFloat((t.charges * 0.3).toFixed(2)),
                totalValue: parseFloat((t.qty * t.buyPrice).toFixed(2)),
                createdAt: buyTime, updatedAt: buyTime,
            });
            docs.push({
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
            side: 'SELL',
            createdAt: { $gte: fyFrom, $lte: fyTo },
        }).lean().sort({ createdAt: 1 });

        // All BUY trades (need full history for FIFO lot matching)
        const allBuys = await TradeModel.find({ side: 'BUY' }).lean().sort({ createdAt: 1 });

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
        let wallet = await WalletModel.findOne({});
        if (!wallet) {
            wallet = new WalletModel({ balance: 100000, usedMargin: 0, availableMargin: 100000 });
            await wallet.save();
        }
        res.status(200).json(wallet);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching wallet', error: err.message });
    }
});

// ============ FUND TRANSACTIONS ============
app.get('/funds', async (req, res) => {
    try {
        const fundTxs = await FundTransactionModel.find({}).sort({ createdAt: -1 });
        res.status(200).json(fundTxs);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching fund transactions', error: err.message });
    }
});

app.post('/funds/deposit', async (req, res) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
    }

    try {
        let wallet = await WalletModel.findOne({});
        if (!wallet) {
            wallet = new WalletModel({ balance: 100000, usedMargin: 0, availableMargin: 100000 });
        }

        wallet.balance += Number(amount);
        wallet.availableMargin = wallet.balance - wallet.usedMargin;
        await wallet.save();

        const txn = new FundTransactionModel({ type: 'DEPOSIT', amount: Number(amount), status: 'SUCCESS' });
        await txn.save();

        res.status(200).json({ message: 'Deposit successful', wallet, transaction: txn });
    } catch (err) {
        res.status(500).json({ message: 'Error processing deposit', error: err.message });
    }
});

// Withdrawals are temporarily suspended due to a technical issue.
const WITHDRAW_SUSPENDED = true;

app.post('/funds/withdraw', async (req, res) => {
    if (WITHDRAW_SUSPENDED) {
        return res.status(503).json({
            message: 'Withdrawals are temporarily suspended due to a technical issue. Our team is working on it — please try again later.',
            suspended: true,
        });
    }

    const { amount } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid amount' });
    }

    try {
        let wallet = await WalletModel.findOne({});
        if (!wallet) {
            return res.status(400).json({ message: 'No wallet found. Add funds first.' });
        }

        if (wallet.availableMargin < Number(amount)) {
            return res.status(400).json({ message: 'Insufficient available balance' });
        }

        wallet.balance -= Number(amount);
        wallet.availableMargin = wallet.balance - wallet.usedMargin;
        await wallet.save();

        const txn = new FundTransactionModel({ type: 'WITHDRAW', amount: Number(amount), status: 'SUCCESS' });
        await txn.save();

        res.status(200).json({ message: 'Withdrawal successful', wallet, transaction: txn });
    } catch (err) {
        res.status(500).json({ message: 'Error processing withdrawal', error: err.message });
    }
});

// ============ WATCHLIST ============
app.get('/watchlists', async (req, res) => {
    try {
        const watchlists = await WatchlistModel.find({});
        res.status(200).json(watchlists);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching watchlists', error: err.message });
    }
});

app.post('/watchlists', async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ message: 'Watchlist name is required' });
    }

    try {
        const watchlist = new WatchlistModel({ name, stocks: [] });
        await watchlist.save();
        res.status(201).json(watchlist);
    } catch (err) {
        res.status(500).json({ message: 'Error creating watchlist', error: err.message });
    }
});

app.post('/watchlists/:id/stock', async (req, res) => {
    const { id } = req.params;
    const { stockSymbol } = req.body;

    if (!stockSymbol) {
        return res.status(400).json({ message: 'stockSymbol is required' });
    }

    try {
        const watchlist = await WatchlistModel.findById(id);
        if (!watchlist) {
            return res.status(404).json({ message: 'Watchlist not found' });
        }

        const symbol = stockSymbol.toUpperCase();
        if (!watchlist.stocks.includes(symbol)) {
            watchlist.stocks.push(symbol);
            await watchlist.save();
        }

        res.status(200).json(watchlist);
    } catch (err) {
        res.status(500).json({ message: 'Error adding stock to watchlist', error: err.message });
    }
});

app.delete('/watchlists/:id/stock/:symbol', async (req, res) => {
    const { id, symbol } = req.params;

    try {
        const watchlist = await WatchlistModel.findById(id);
        if (!watchlist) {
            return res.status(404).json({ message: 'Watchlist not found' });
        }

        watchlist.stocks = watchlist.stocks.filter(s => s !== symbol.toUpperCase());
        await watchlist.save();

        res.status(200).json(watchlist);
    } catch (err) {
        res.status(500).json({ message: 'Error removing stock from watchlist', error: err.message });
    }
});

app.delete('/watchlists/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await WatchlistModel.findByIdAndDelete(id);
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

app.get('/market/search', (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.status(400).json({ message: 'Search query (q) is required' });
    }

    const query = q.toUpperCase();
    const results = NSE_STOCKS.filter(stock =>
        stock.symbol.includes(query) || stock.name.toUpperCase().includes(query)
    );

    res.status(200).json(results);
});

app.get('/market/stocks', (req, res) => {
    res.status(200).json(NSE_STOCKS);
});

// ============ PRICE ALERTS ============
app.get('/alerts', async (req, res) => {
    try {
        const alerts = await PriceAlertModel.find({});
        res.status(200).json(alerts);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching alerts', error: err.message });
    }
});

app.post('/alerts', async (req, res) => {
    const { stockSymbol, targetPrice, condition } = req.body;
    if (!stockSymbol || !targetPrice || !condition) {
        return res.status(400).json({ message: 'Missing required fields: stockSymbol, targetPrice, condition' });
    }

    try {
        const alert = new PriceAlertModel({
            stockSymbol: stockSymbol.toUpperCase(),
            targetPrice: Number(targetPrice),
            condition,
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

// ============ SEED DATA (optional, one-time) ============
app.post('/seed', async (req, res) => {
    try {
        // Seed wallet with consistent financial picture:
        // Opening balance ₹3.40 Cr (Nov 1) → options trading profit ₹96.13L → account grows to ₹4.36 Cr
        // Additional ₹1.20 Cr deposit from user → total ₹5.56 Cr → ₹4.60 Cr used for stock holdings
        // Remaining liquid cash: ₹5.56 Cr − ₹4.60 Cr = ₹96.13 Lakh
        let wallet = await WalletModel.findOne({});
        if (!wallet) {
            wallet = new WalletModel({
                balance: 9613521,       // ₹96.13 Lakh — remaining liquid cash
                usedMargin: 45964581,   // ₹4.60 Cr — cost of equity holdings
                availableMargin: 9613521,
            });
            await wallet.save();
        }
        // Always update wallet to correct demo values
        wallet.balance = 9613521;
        wallet.usedMargin = 45964581;
        wallet.availableMargin = 9613521;
        await wallet.save();

        // Fund transactions showing the capital journey — clear & reseed
        await FundTransactionModel.deleteMany({});
        const fundDocs = [
            { type: 'DEPOSIT',  amount: 34000000, status: 'SUCCESS', createdAt: new Date('2025-11-01T09:15:00.000Z'), updatedAt: new Date('2025-11-01T09:15:00.000Z') },  // ₹3.40 Cr — Nov 1 opening balance
            { type: 'DEPOSIT',  amount: 12000000, status: 'SUCCESS', createdAt: new Date('2025-06-01T09:15:00.000Z'), updatedAt: new Date('2025-06-01T09:15:00.000Z') },  // ₹1.20 Cr — additional capital for stock purchases
            { type: 'WITHDRAW', amount: 45960000, status: 'SUCCESS', createdAt: new Date('2025-08-15T10:00:00.000Z'), updatedAt: new Date('2025-08-15T10:00:00.000Z') }, // ₹4.60 Cr — deployed into stock holdings
        ];
        await FundTransactionModel.collection.insertMany(fundDocs);
        console.log('[Seed] Fund transactions: ₹3.40 Cr opening + ₹1.20 Cr deposit − ₹4.60 Cr stock purchase');

        // Seed a default watchlist
        let watchlist = await WatchlistModel.findOne({ name: 'Nifty 50' });
        if (!watchlist) {
            watchlist = new WatchlistModel({
                name: 'Nifty 50',
                stocks: ['INFY', 'TCS', 'ONGC', 'RELIANCE', 'WIPRO', 'KPITTECH', 'M&M', 'HDFCBANK', 'SBIN'],
            });
            await watchlist.save();
        }

        // Seed realistic stock holdings — always refresh for consistent demo
        await HoldingsModel.deleteMany({});
        
        const base = new Date();
        const daysAgo = (d) => new Date(base.getTime() - d * 86400000);

        // Authentic LTPs for the new realistic basket
        const fallbackPrices = {
            'UPL': 500.00, 'WIPRO': 460.00, 'AWL': 350.00, 'BANDHANBNK': 190.00, 
            'NYKAA': 160.00, 'HINDUNILVR': 2250.00, 'KOTAKBANK': 1700.00,
            'IEX': 140.00, 'LTIM': 5000.00, 'DIVISLAB': 3500.00, 'TECHM': 1200.00,
            'INFY': 1555.45, 'HDFCBANK': 1522.35, 'TATAMOTORS': 985.70, 
            'SBIN': 430.20, 'ITC': 207.90
        };

        // 100% Authentic Indian Market History. Target: -33.8% Overall.
        const basket = [
            { symbol: 'UPL',        pct: 0.7000, qty: 7000, daysAgo: 283 }, // Buy @ ₹850
            { symbol: 'WIPRO',      pct: 0.5652, qty: 6000, daysAgo: 248 }, // Buy @ ₹720
            { symbol: 'AWL',        pct: 1.4286, qty: 4000, daysAgo: 232 }, // Buy @ ₹850
            { symbol: 'BANDHANBNK', pct: 2.8421, qty: 4000, daysAgo: 317 }, // Buy @ ₹730
            { symbol: 'NYKAA',      pct: 1.5625, qty: 7000, daysAgo: 304 }, // Buy @ ₹410
            { symbol: 'HINDUNILVR', pct: 0.2667, qty: 1200, daysAgo: 219 }, // Buy @ ₹2850
            { symbol: 'KOTAKBANK',  pct: 0.2941, qty: 1500, daysAgo: 195 }, // Buy @ ₹2200
            { symbol: 'IEX',        pct: 1.1428, qty: 8000, daysAgo: 258 }, // Buy @ ₹300
            { symbol: 'LTIM',       pct: 0.5000, qty: 300,  daysAgo: 162 }, // Buy @ ₹7500
            { symbol: 'DIVISLAB',   pct: 0.5428, qty: 400,  daysAgo: 209 }, // Buy @ ₹5400
            { symbol: 'TECHM',      pct: 0.5000, qty: 1500, daysAgo: 293 }, // Buy @ ₹1800
            { symbol: 'INFY',       pct: 0.2536, qty: 2000, daysAgo: 227 }, // Buy @ ₹1950
            { symbol: 'HDFCBANK',   pct: 0.1495, qty: 2500, daysAgo: 156 }, // Buy @ ₹1750
            // Profit Anchors (Bought in June/July 2025 — down-trend survivors)
            { symbol: 'TATAMOTORS', pct: -0.3913, qty: 1000, daysAgo: 385 }, // Buy @ ₹600
            { symbol: 'SBIN',       pct: -0.3026, qty: 2000, daysAgo: 378 }, // Buy @ ₹300
            { symbol: 'ITC',        pct: -0.2304, qty: 5000, daysAgo: 338 }, // Buy @ ₹160
        ];

        const holdingsDocs = basket.map(({ symbol, pct, qty, daysAgo: days }) => {
            const ltp = fallbackPrices[symbol];
            const avgPrice = Math.round(ltp * (1 + pct) * 100) / 100;
            return {
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
        const positionsCount = await PositionsModel.countDocuments({});
        if (positionsCount === 0) {
            const samplePositions = [
                { stockSymbol: 'EVEREADY', quantity: 2, avgPrice: 316.27, ltp: 312.35, productType: 'MIS', isIntraday: true },
                { stockSymbol: 'JUBLFOOD', quantity: 1, avgPrice: 3124.75, ltp: 3082.65, productType: 'MIS', isIntraday: true },
            ];
            await PositionsModel.insertMany(samplePositions);
        }

        // Seed trade history if empty (drives P&L screen)
        const tradesCount = await TradeModel.countDocuments({});
        if (tradesCount === 0) {
            const base = new Date();
            const daysAgo = (d) => new Date(base.getTime() - d * 86400000);

            const sampleTrades = [
                // Open holdings (BUY only — unrealized)
                { stockSymbol: 'BHARTIARTL', quantity: 2, price: 538.05, side: 'BUY', productType: 'CNC', totalValue: 1076.10, charges: 0.54, createdAt: daysAgo(45) },
                { stockSymbol: 'HDFCBANK',   quantity: 2, price: 1383.40, side: 'BUY', productType: 'CNC', totalValue: 2766.80, charges: 1.38, createdAt: daysAgo(38) },
                { stockSymbol: 'HINDUNILVR', quantity: 1, price: 2335.85, side: 'BUY', productType: 'CNC', totalValue: 2335.85, charges: 1.17, createdAt: daysAgo(32) },
                { stockSymbol: 'INFY',       quantity: 1, price: 1350.50, side: 'BUY', productType: 'CNC', totalValue: 1350.50, charges: 0.68, createdAt: daysAgo(28) },
                { stockSymbol: 'ITC',        quantity: 5, price: 202.00,  side: 'BUY', productType: 'CNC', totalValue: 1010.00, charges: 0.51, createdAt: daysAgo(25) },
                { stockSymbol: 'KPITTECH',   quantity: 5, price: 250.30,  side: 'BUY', productType: 'CNC', totalValue: 1251.50, charges: 0.63, createdAt: daysAgo(21) },
                { stockSymbol: 'SBIN',       quantity: 4, price: 324.35,  side: 'BUY', productType: 'CNC', totalValue: 1297.40, charges: 0.65, createdAt: daysAgo(18) },
                { stockSymbol: 'TATAPOWER',  quantity: 5, price: 104.20,  side: 'BUY', productType: 'CNC', totalValue: 521.00,  charges: 0.26, createdAt: daysAgo(15) },
                { stockSymbol: 'TCS',        quantity: 1, price: 3041.70, side: 'BUY', productType: 'CNC', totalValue: 3041.70, charges: 1.52, createdAt: daysAgo(12) },
                { stockSymbol: 'WIPRO',      quantity: 4, price: 489.30,  side: 'BUY', productType: 'CNC', totalValue: 1957.20, charges: 0.98, createdAt: daysAgo(10) },
                { stockSymbol: 'RELIANCE',   quantity: 1, price: 2193.70, side: 'BUY', productType: 'CNC', totalValue: 2193.70, charges: 1.10, createdAt: daysAgo(8)  },
                // Realized trades (BUY + SELL round trips)
                { stockSymbol: 'TATAMOTORS', quantity: 3, price: 780.00,  side: 'BUY',  productType: 'CNC', totalValue: 2340.00, charges: 1.17, createdAt: daysAgo(60) },
                { stockSymbol: 'TATAMOTORS', quantity: 3, price: 850.00,  side: 'SELL', productType: 'CNC', totalValue: 2550.00, charges: 1.28, createdAt: daysAgo(50) },
                { stockSymbol: 'HCLTECH',    quantity: 2, price: 1200.00, side: 'BUY',  productType: 'CNC', totalValue: 2400.00, charges: 1.20, createdAt: daysAgo(55) },
                { stockSymbol: 'HCLTECH',    quantity: 2, price: 1380.00, side: 'SELL', productType: 'CNC', totalValue: 2760.00, charges: 1.38, createdAt: daysAgo(42) },
                { stockSymbol: 'AXISBANK',   quantity: 5, price: 920.00,  side: 'BUY',  productType: 'CNC', totalValue: 4600.00, charges: 2.30, createdAt: daysAgo(70) },
                { stockSymbol: 'AXISBANK',   quantity: 5, price: 985.00,  side: 'SELL', productType: 'CNC', totalValue: 4925.00, charges: 2.46, createdAt: daysAgo(62) },
                { stockSymbol: 'SUNPHARMA',  quantity: 2, price: 1050.00, side: 'BUY',  productType: 'CNC', totalValue: 2100.00, charges: 1.05, createdAt: daysAgo(90) },
                { stockSymbol: 'SUNPHARMA',  quantity: 2, price: 1140.00, side: 'SELL', productType: 'CNC', totalValue: 2280.00, charges: 1.14, createdAt: daysAgo(75) },
                { stockSymbol: 'NTPC',       quantity: 10, price: 220.00, side: 'BUY',  productType: 'CNC', totalValue: 2200.00, charges: 1.10, createdAt: daysAgo(30) },
                { stockSymbol: 'NTPC',       quantity: 10, price: 195.00, side: 'SELL', productType: 'CNC', totalValue: 1950.00, charges: 0.98, createdAt: daysAgo(20) },
                // Intraday MIS trades
                { stockSymbol: 'EVEREADY',   quantity: 2, price: 316.27, side: 'BUY',  productType: 'MIS', totalValue: 632.54,  charges: 0.32, createdAt: daysAgo(5) },
                { stockSymbol: 'JUBLFOOD',   quantity: 1, price: 3124.75, side: 'BUY', productType: 'MIS', totalValue: 3124.75, charges: 1.56, createdAt: daysAgo(3) },
            ];

            await TradeModel.insertMany(
                sampleTrades.map(t => ({ ...t, orderId: new mongoose.Types.ObjectId() }))
            );
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

app.get('/market/quote/:symbol', (req, res) => {
    const { symbol } = req.params;
    const price = marketDataService.getStockPrice(symbol);
    if (!price) {
        return res.status(404).json({ message: `No data for symbol: ${symbol}` });
    }
    res.status(200).json(price);
});

// ============ MARKET DATA STATUS ============
app.get('/market/status', (req, res) => {
    const liveDataService = require('./liveDataService');
    res.status(200).json({
        source: marketDataService.getDataSource(),
        lastUpdated: marketDataService.getLastUpdated(),
        liveStats: liveDataService.getStats(),
        indexCount: Object.keys(marketDataService.getIndexData()).length,
        stockCount: Object.keys(marketDataService.getStockPrices()).length,
    });
});

// ============ INDEX CANDLES ============
app.get('/market/index-candles/:indexName', async (req, res) => {
    const indexName = decodeURIComponent(req.params.indexName);
    const { interval = '1d' } = req.query;
    const validIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '1d'];
    if (!validIntervals.includes(interval)) {
        return res.status(400).json({ message: `Invalid interval. Valid: ${validIntervals.join(', ')}` });
    }
    try {
        const candles = await candleDataService.generateIndexCandles(indexName, interval);
        const indexData = marketDataService.getIndexData();
        const quote = indexData[indexName] || {};
        res.status(200).json({ indexName, interval, candles, quote });
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
const SUPPORTED_INDICES = ['NIFTY 50', 'BANK NIFTY', 'SENSEX', 'FINNIFTY', 'NIFTY IT'];

app.get('/market/optionchain/:symbol', (req, res) => {
    const rawSymbol = decodeURIComponent(req.params.symbol).toUpperCase();
    const indexName = SUPPORTED_INDICES.find(n => n === rawSymbol || n.replace(' ', '') === rawSymbol.replace(' ', ''));
    if (!indexName) {
        return res.status(400).json({ message: `Unsupported index. Supported: ${SUPPORTED_INDICES.join(', ')}` });
    }
    const { expiry } = req.query;
    const chain = marketDataService.generateOptionChainForIndex(indexName, expiry || null);
    res.status(200).json(chain);
});

// ============ CANCEL ORDER ============
app.delete('/orders/:id', async (req, res) => {
    try {
        const order = await OrdersModel.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        if (order.status === 'EXECUTED') {
            return res.status(400).json({ message: 'Cannot cancel an executed order' });
        }
        order.status = 'CANCELLED';
        await order.save();
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

    const validIntervals = ['1m', '3m', '5m', '15m', '30m', '1h', '1d'];
    if (!validIntervals.includes(candleInterval)) {
        return res.status(400).json({ message: `Invalid interval. Valid values: ${validIntervals.join(', ')}` });
    }

    try {
        const candles = await candleDataService.generateCandles(symbol, candleInterval);
        res.status(200).json({ symbol: symbol.toUpperCase(), interval: candleInterval, candles });
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
    console.log('Client connected:', socket.id);

    // Push market data immediately so the client doesn't wait 30s
    socket.emit('marketData', {
        prices: marketDataService.getStockPrices(),
        indexes: marketDataService.getIndexData(),
        movers: marketDataService.getMarketMovers(),
        lastUpdated: marketDataService.getLastUpdated(),
    });

    // Push holdings, positions, wallet instantly on connect so every screen
    // auto-populates without needing a manual pull-to-refresh.
    try {
        const [holdings, positions, wallet] = await Promise.all([
            HoldingsModel.find({}),
            PositionsModel.find({}),
            WalletModel.findOne({}),
        ]);
        const holdingsLive = holdings.map(h => {
            const live = marketDataService.getStockPrice(h.stockSymbol);
            return { ...h.toObject(), ltp: live?.ltp ?? h.ltp };
        });
        socket.emit('initialData', {
            holdings: holdingsLive,
            positions,
            wallet: wallet?.toObject(),
        });
    } catch (e) { /* non-fatal */ }

    socket.on('subscribe', (symbols) => {
        if (Array.isArray(symbols)) {
            socket.join(symbols.map(s => s.toUpperCase()));
        }
    });

    // Live Chat
    socket.on('chatMessage', async (data) => {
        const { username, message, room } = data;
        if (!message || !message.trim()) return;
        const chatMsg = new ChatModel({
            username: username || 'Trader',
            message: message.trim(),
            room: room || 'general',
        });
        await chatMsg.save();
        io.emit('chatMessage', chatMsg);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Fetch market data every 30 seconds and broadcast
async function broadcastMarketData() {
    await marketDataService.fetchAllStockPrices();

    const indexes = marketDataService.getIndexData();

    // Feed live ticks into the candle accumulator for intraday live charts
    for (const [name, d] of Object.entries(indexes)) {
        if (d.ltp > 0) candleDataService.recordTick(name, d.ltp);
    }

    const data = {
        prices: marketDataService.getStockPrices(),
        indexes,
        movers: marketDataService.getMarketMovers(),
        lastUpdated: marketDataService.getLastUpdated(),
        source: marketDataService.getDataSource(),
    };

    io.emit('marketData', data);
    console.log(`[Broadcast] source: ${data.source} | ${new Date().toLocaleTimeString()}`);
}

// Sync wallet.usedMargin with actual holdings on startup
(async () => {
    try {
        const [holdings, wallet] = await Promise.all([HoldingsModel.find({}), WalletModel.findOne({})]);
        if (wallet && holdings.length > 0) {
            const actualUsed = holdings.reduce((s, h) => s + h.avgPrice * h.quantity, 0);
            wallet.usedMargin      = Math.round(actualUsed);
            wallet.availableMargin = Math.max(0, wallet.balance - wallet.usedMargin);
            await wallet.save();
            console.log(`[Wallet] Synced usedMargin = ₹${wallet.usedMargin.toLocaleString('en-IN')} from ${holdings.length} holdings`);
        }
    } catch (e) { console.error('[Wallet] Sync error:', e.message); }
})();

// Initial fetch, then every 30 seconds
broadcastMarketData();
setInterval(broadcastMarketData, 30000);

// ============ DAY POSITIONS (today's F&O trades grouped by symbol) ============
app.get('/positions/day', async (req, res) => {
    try {
        // Always show June 19 2026 data (the seeded option trading day)
        const startUTC = new Date('2026-06-19T00:00:00.000Z');
        const endUTC   = new Date('2026-06-19T23:59:59.999Z');

        const trades = await TradeModel.find({
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

// ============ START SERVER ============
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Socket.IO is ready`);
});
