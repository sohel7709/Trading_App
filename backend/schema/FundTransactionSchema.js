const { Schema } = require('mongoose');

const FundTransactionSchema = new Schema({
    type: { type: String, enum: ['DEPOSIT', 'WITHDRAW'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['SUCCESS', 'FAILED', 'PENDING'], default: 'SUCCESS' },
}, { timestamps: true });

module.exports = { FundTransactionSchema };