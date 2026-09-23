const { model } = require('mongoose');
const { BranchSchema } = require('../schema/BranchSchema');

const BranchModel = new model('Branch', BranchSchema);

module.exports = { BranchModel };
