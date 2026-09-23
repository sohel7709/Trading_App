const mongoose = require('mongoose');
const OptionChainSnapSchema = require('../schema/OptionChainSnapSchema');

const OptionChainSnapModel = mongoose.model('OptionChainSnap', OptionChainSnapSchema);

module.exports = OptionChainSnapModel;
