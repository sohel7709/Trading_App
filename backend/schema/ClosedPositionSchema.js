const { Schema } = require('mongoose');

const ClosedPositionSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', index: true },

    kind: { type: String, enum: ['equity', 'option'], required: true },
    symbol: { type: String, required: true },       // stockSymbol for equity, option symbol for option
    productType: { type: String, default: 'MIS' },
    quantity: { type: Number, required: true },      // signed size of the closed leg (+long / -short)
    lots: { type: Number },                          // options only
    underlyingSymbol: { type: String },
    strikePrice: { type: Number },
    optionType: { type: String },
    expiry: { type: String },
    avgPrice: { type: Number, required: true },       // entry avg price/premium
    exitPrice: { type: Number, required: true },      // exit price/premium
    pnl: { type: Number, required: true },            // booked, frozen P&L for this close
    dateStr: { type: String, required: true },        // IST trading day, e.g. '2026-07-03'
    closedAt: { type: Date, default: Date.now },
}, { timestamps: true });

ClosedPositionSchema.index({ instituteId: 1, userId: 1, closedAt: -1 });

module.exports = { ClosedPositionSchema };
