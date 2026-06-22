const { model } = require('mongoose');
const { PriceAlertSchema } = require('../schema/PriceAlertSchema');

const PriceAlertModel = new model('PriceAlert', PriceAlertSchema);

module.exports = { PriceAlertModel };