const { Schema } = require('mongoose');

const WatchlistSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', index: true },

    name: { type: String, required: true },
    stocks: [{ type: String, uppercase: true }],
}, { timestamps: true });

WatchlistSchema.index({ instituteId: 1, userId: 1 });

module.exports = { WatchlistSchema };