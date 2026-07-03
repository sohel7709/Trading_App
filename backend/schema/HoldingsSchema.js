const { Schema } = require('mongoose');

const HoldingsSchema = new Schema({
    stockSymbol: { type: String, required: true, uppercase: true },
    quantity: { type: Number, required: true },
    avgPrice: { type: Number, required: true },
    ltp: { type: Number, default: 0 },
    productType: { type: String, enum: ['CNC', 'MIS', 'NRML'], default: 'CNC' },
    // T1 settlement — quantity bought today that hasn't settled into demat yet
    // and can't be sold until the next trading day's BOD prep runs.
    t1Quantity: { type: Number, default: 0 },
    t1Date: { type: Date, default: null },
}, { timestamps: true });

module.exports = { HoldingsSchema };