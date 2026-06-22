const { model } = require('mongoose');
const { FundTransactionSchema } = require('../schema/FundTransactionSchema');

const FundTransactionModel = new model('FundTransaction', FundTransactionSchema);

module.exports = { FundTransactionModel };