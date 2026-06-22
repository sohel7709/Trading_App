const { model } = require('mongoose');
const { TradeSchema } = require('../schema/TradeSchema');

const TradeModel = new model('Trade', TradeSchema);

module.exports = { TradeModel };