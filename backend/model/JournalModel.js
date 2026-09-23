const mongoose = require('mongoose');
const { JournalSchema } = require('../schema/JournalSchema');

const JournalModel = mongoose.model('Journal', JournalSchema);

module.exports = { JournalModel };
