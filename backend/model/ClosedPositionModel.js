const { model } = require('mongoose');

const { ClosedPositionSchema } = require('../schema/ClosedPositionSchema');

const ClosedPositionModel = new model('ClosedPosition', ClosedPositionSchema);

module.exports = { ClosedPositionModel };
