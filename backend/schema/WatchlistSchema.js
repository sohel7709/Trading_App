const { Schema } = require('mongoose');

const WatchlistSchema = new Schema({
    name: { type: String, required: true },
    stocks: [{ type: String, uppercase: true }],
}, { timestamps: true });

module.exports = { WatchlistSchema };