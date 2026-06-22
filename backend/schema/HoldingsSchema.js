const { Schema } = require('mongoose');

const HoldingsSchema = new Schema({
    stockSymbol: { type: String, required: true, uppercase: true },
    quantity: { type: Number, required: true },
    avgPrice: { type: Number, required: true },
    ltp: { type: Number, default: 0 },
    productType: { type: String, enum: ['CNC', 'MIS', 'NRML'], default: 'CNC' },
}, { timestamps: true });

module.exports = { HoldingsSchema };