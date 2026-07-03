const { Schema } = require('mongoose');

const TradeSchema = new Schema({
    stockSymbol: { type: String, required: true, uppercase: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    side: { type: String, enum: ['BUY', 'SELL'], required: true },
    productType: { type: String, enum: ['CNC', 'MIS', 'NRML'], default: 'CNC' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    charges: { type: Number, default: 0 },
    totalValue: { type: Number, required: true },
    // Set once this trade's realised P&L has been rolled up into a
    // permanent PLRecord at day-prep — keeps the day-prep archive step
    // idempotent (never re-summed / never double-counted) across restarts.
    archived: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = { TradeSchema };