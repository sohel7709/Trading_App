'use strict';

const db = require('../shared/db');
const redis = require('../shared/redis');
const dhanService = require('./dhanService');

async function startWorker() {
    console.log('[MarketWorker] ⚡ Initializing Market Data Worker...');
    try {
        await db.connectDB();
        await dhanService.start();
        console.log('[MarketWorker] ✅ Market Data Worker is running');
    } catch (err) {
        console.error('[MarketWorker Fatal]:', err);
        process.exit(1);
    }
}

// Handle termination signals
process.on('SIGTERM', () => {
    console.log('[MarketWorker] SIGTERM received. Shutting down...');
    dhanService.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[MarketWorker] SIGINT received. Shutting down...');
    dhanService.stop();
    process.exit(0);
});

if (require.main === module) {
    startWorker();
}

module.exports = { startWorker };
