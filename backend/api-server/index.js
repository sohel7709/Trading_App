'use strict';

const http = require('http');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const bodyParser = require('body-parser');
const passport = require('passport');

const config = require('../shared/config');
const db = require('../shared/db');
const { authRouter } = require('../auth');
const { createSocketServer } = require('../socket-server/index');

// Modular Routers
const portfolioRoutes = require('./routes/portfolioRoutes');
const orderRoutes = require('./routes/orderRoutes');
const watchlistRoutes = require('./routes/watchlistRoutes');
const marketRoutes = require('./routes/marketRoutes');

function createApp() {
    const app = express();

    // Middleware
    app.use(compression());
    app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(passport.initialize());

    // Health check
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok', service: 'api-server', timestamp: new Date() });
    });

    // Mount Domain Routers
    app.use('/auth', authRouter);
    app.use(portfolioRoutes);
    app.use(orderRoutes);
    app.use(watchlistRoutes);
    app.use(marketRoutes);

    // Wallet & Funds routes (mounted directly or via router)
    const { authenticate } = require('../middleware/authenticate');
    const { WalletModel, FundTransactionModel } = require('../shared/db');

    app.get('/wallet', authenticate, async (req, res) => {
        try {
            const wallet = await WalletModel.findOne({ userId: req.user._id });
            res.status(200).json(wallet || { balance: 500000, availableMargin: 500000 });
        } catch (err) {
            res.status(500).json({ message: 'Error fetching wallet', error: err.message });
        }
    });

    app.get('/funds', authenticate, async (req, res) => {
        try {
            const wallet = await WalletModel.findOne({ userId: req.user._id });
            const transactions = await FundTransactionModel.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
            res.status(200).json({ wallet, transactions });
        } catch (err) {
            res.status(500).json({ message: 'Error fetching funds', error: err.message });
        }
    });

    return app;
}

async function startServer(port = config.API_PORT) {
    await db.connectDB();
    const app = createApp();
    const server = http.createServer(app);

    // Attach Socket.IO to the same HTTP server for seamless dual REST + WebSocket on port 8080
    const { io } = createSocketServer(server);

    server.listen(port, () => {
        console.log(`[APIServer] 🚀 API Server & WebSocket Gateway running on port ${port}`);
    });

    return { app, server, io };
}

if (require.main === module) {
    startServer().catch((err) => {
        console.error('[APIServer Fatal]:', err);
        process.exit(1);
    });
}

module.exports = { createApp, startServer };
