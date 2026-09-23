const mongoose = require('mongoose');
const CandleSchema = require('../schema/CandleSchema');

const CandleModel = mongoose.model('Candle', CandleSchema);

module.exports = CandleModel;
