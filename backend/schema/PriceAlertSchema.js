const { Schema } = require('mongoose');

const PriceAlertSchema = new Schema({
    stockSymbol: { type: String, required: true, uppercase: true },
    targetPrice: { type: Number, required: true },
    condition: { type: String, enum: ['ABOVE', 'BELOW'], required: true },
    active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = { PriceAlertSchema };