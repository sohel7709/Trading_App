const { Schema } = require('mongoose');

// A basket bundles multiple order legs so they can be reviewed together and
// executed atomically (each leg still goes through the normal order engine —
// MARKET legs fill immediately, LIMIT/SL/SL-M legs rest as PENDING).
const BasketLegSchema = new Schema({
    stockSymbol:  { type: String, required: true, uppercase: true },
    quantity:     { type: Number, required: true },
    price:        { type: Number, required: true },
    triggerPrice: { type: Number, default: null },
    type:         { type: String, enum: ['MARKET', 'LIMIT', 'SL', 'SLM'], default: 'MARKET' },
    side:         { type: String, enum: ['BUY', 'SELL'], required: true },
    productType:  { type: String, enum: ['CNC', 'MIS', 'NRML'], default: 'CNC' },
    exchange:     { type: String, enum: ['NSE', 'BSE'], default: 'NSE' },
}, { _id: false });

const BasketSchema = new Schema({
    name:     { type: String, required: true },
    legs:     { type: [BasketLegSchema], default: [] },
    executed: { type: Boolean, default: false },
    executedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = { BasketSchema };
