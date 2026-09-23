const { model } = require('mongoose');
const { BatchSchema } = require('../schema/BatchSchema');

const BatchModel = new model('Batch', BatchSchema);

module.exports = { BatchModel };
