const { Schema } = require('mongoose');

const OrdersSchema = new Schema({
    stockSymbol: { type: String, required: true, uppercase: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    type: { type: String, enum: ['MARKET', 'LIMIT', 'SL', 'SLM'], default: 'MARKET' },
    side: { type: String, enum: ['BUY', 'SELL'], required: true },
    status: { type: String, enum: ['PENDING', 'EXECUTED', 'CANCELLED'], default: 'PENDING' },
    productType: { type: String, enum: ['CNC', 'MIS', 'NRML'], default: 'CNC' },
}, { timestamps: true });

module.exports = { OrdersSchema };