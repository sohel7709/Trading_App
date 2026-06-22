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
}, { timestamps: true });

module.exports = { TradeSchema };