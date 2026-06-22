const { Schema } = require('mongoose');

const WalletSchema = new Schema({
    balance: { type: Number, default: 0 },
    usedMargin: { type: Number, default: 0 },
    availableMargin: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = { WalletSchema };