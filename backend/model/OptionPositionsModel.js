const mongoose = require('mongoose');
const { OptionPositionsSchema } = require('../schema/OptionPositionsSchema');

const OptionPositionsModel = mongoose.model('OptionPositions', OptionPositionsSchema, 'optionpositions');
module.exports = { OptionPositionsModel };
