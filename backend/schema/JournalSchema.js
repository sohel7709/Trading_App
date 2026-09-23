const { Schema } = require('mongoose');

const JournalSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    stockSymbol: { type: String, required: true },
    notes: { type: String, required: true },
    emotion: { type: String, enum: ['CALM', 'CONFIDENT', 'FEAR', 'GREED', 'FOMO', 'ANXIOUS'], default: 'CALM' },
    mistakes: [{ type: String }], // Array of strings e.g. ['OVERTRADING', 'REVENGE_TRADING']
}, { timestamps: true });

module.exports = { JournalSchema };
