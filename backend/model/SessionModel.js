const mongoose = require('mongoose');
const { SessionSchema } = require('../schema/SessionSchema');

const SessionModel = mongoose.model('Session', SessionSchema);
module.exports = { SessionModel };
