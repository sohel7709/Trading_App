const mongoose = require('mongoose');
const { RiskLogSchema } = require('../schema/RiskLogSchema');

const RiskLogModel = mongoose.model('RiskLog', RiskLogSchema);

module.exports = { RiskLogModel };
