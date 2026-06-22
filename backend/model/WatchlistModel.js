const { model } = require('mongoose');
const { WatchlistSchema } = require('../schema/WatchlistSchema');

const WatchlistModel = new model('Watchlist', WatchlistSchema);

module.exports = { WatchlistModel };