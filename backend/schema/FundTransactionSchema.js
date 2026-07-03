const { Schema } = require('mongoose');

const FundTransactionSchema = new Schema({
    type: { type: String, enum: ['DEPOSIT', 'WITHDRAW'], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['SUCCESS', 'FAILED', 'PENDING'], default: 'SUCCESS' },
    method: { type: String, enum: ['UPI', 'NETBANKING', 'BANK'], default: 'NETBANKING' },
    upiApp: { type: String, default: null },    // e.g. PhonePe, Google Pay, Paytm
    reference: { type: String, default: null }, // UTR-style reference id
}, { timestamps: true });

module.exports = { FundTransactionSchema };