'use strict';

const mongoose = require('mongoose');

const ReplayPositionSchema = new mongoose.Schema({
    symbol: { type: String, required: true },
    quantity: { type: Number, required: true },
    avgPrice: { type: Number, required: true },
    ltp: { type: Number, default: 0 },
    side: { type: String, enum: ['BUY', 'SELL'], default: 'BUY' },
    productType: { type: String, default: 'MIS' },
});

const ReplayTradeSchema = new mongoose.Schema({
    symbol: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    side: { type: String, enum: ['BUY', 'SELL'], required: true },
    pnl: { type: Number, default: 0 },
    timestamp: { type: Number, required: true },
});

const ReplaySessionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    instituteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', index: true },
    symbol: { type: String, required: true, default: 'NIFTY 50' },
    date: { type: String, required: true }, // e.g. "2024-07-01"
    resolution: { type: String, default: '1m' },
    currentIndex: { type: Number, default: 0 },
    totalCandles: { type: Number, default: 0 },
    speed: { type: Number, enum: [1, 2, 5], default: 1 }, // 1x, 2x, 5x
    status: { type: String, enum: ['PLAYING', 'PAUSED', 'COMPLETED'], default: 'PAUSED' },
    
    // Isolated paper trading sandbox
    virtualBalance: { type: Number, default: 500000 },
    realizedPnl: { type: Number, default: 0 },
    positions: [ReplayPositionSchema],
    trades: [ReplayTradeSchema],
}, { timestamps: true });

ReplaySessionSchema.index({ userId: 1, status: 1 });

module.exports = ReplaySessionSchema;
