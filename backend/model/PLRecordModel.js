const mongoose = require('mongoose');
const { PLRecordSchema } = require('../schema/PLRecordSchema');

const PLRecordModel = mongoose.model('PLRecord', PLRecordSchema);

module.exports = { PLRecordModel };
