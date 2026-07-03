const { model } = require('mongoose');
const { BasketSchema } = require('../schema/BasketSchema');
const BasketModel = new model('Basket', BasketSchema);
module.exports = { BasketModel };
