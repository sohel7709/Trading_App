'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticate } = require('../../middleware/authenticate');
const { WatchlistModel } = require('../../shared/db');
const CacheService = require('../../services/cacheService');
const marketDataService = require('../../marketDataService');

// GET /watchlists
router.get('/watchlists', authenticate, async (req, res) => {
    try {
        const uid = req.user?._id;
        if (!uid) return res.status(401).json({ message: 'Unauthorized' });

        const uidStr = uid.toString();
        if (!req.query.fresh && !req.query.nocache) {
            const cached = await CacheService.getWatchlists(uidStr);
            if (cached) {
                return res.status(200).json(cached);
            }
        }

        let watchlists = await WatchlistModel.find({ userId: uid }).sort({ createdAt: 1 });
        if (!watchlists || watchlists.length === 0) {
            const defaultList = await WatchlistModel.create({
                userId: uid,
                name: 'My Watchlist',
                stocks: ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN'],
            });
            watchlists = [defaultList];
        }

        CacheService.setWatchlists(uidStr, watchlists, 120).catch(() => {});
        res.status(200).json(watchlists);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching watchlists', error: err.message });
    }
});

// POST /watchlists
router.post('/watchlists', authenticate, async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Watchlist name is required' });

    try {
        const uid = req.user._id;
        const watchlist = await WatchlistModel.create({
            userId: uid,
            name: name.trim(),
            stocks: [],
        });
        CacheService.invalidateWatchlists(uid.toString()).catch(() => {});
        res.status(201).json(watchlist);
    } catch (err) {
        res.status(500).json({ message: 'Error creating watchlist', error: err.message });
    }
});

// POST /watchlists/:id/stock
router.post('/watchlists/:id/stock', authenticate, async (req, res) => {
    const { id } = req.params;
    const stockSymbol = req.body.stockSymbol || req.body.symbol;
    if (!stockSymbol) return res.status(400).json({ message: 'stockSymbol is required' });

    try {
        let watchlist = null;
        if (mongoose.Types.ObjectId.isValid(id)) {
            watchlist = await WatchlistModel.findOne({ _id: id, userId: req.user._id });
        }
        if (!watchlist) {
            watchlist = await WatchlistModel.findOne({ userId: req.user._id });
        }
        if (!watchlist) {
            watchlist = await WatchlistModel.create({
                userId: req.user._id,
                name: 'My Watchlist',
                stocks: [],
            });
        }

        const symbol = stockSymbol.toUpperCase();
        if (!watchlist.stocks) watchlist.stocks = [];
        if (!watchlist.stocks.includes(symbol)) {
            watchlist.stocks.push(symbol);
            await watchlist.save();
        }

        if (marketDataService.trackSymbol) {
            marketDataService.trackSymbol(symbol);
        }

        CacheService.invalidateWatchlists(req.user._id.toString()).catch(() => {});
        res.status(200).json(watchlist);
    } catch (err) {
        res.status(500).json({ message: 'Error adding stock to watchlist', error: err.message });
    }
});

// DELETE /watchlists/:id/stock/:symbol
router.delete('/watchlists/:id/stock/:symbol', authenticate, async (req, res) => {
    const { id, symbol } = req.params;
    try {
        let watchlist = null;
        if (mongoose.Types.ObjectId.isValid(id)) {
            watchlist = await WatchlistModel.findOne({ _id: id, userId: req.user._id });
        }
        if (!watchlist) return res.status(404).json({ message: 'Watchlist not found' });

        const symUpper = symbol.toUpperCase();
        watchlist.stocks = (watchlist.stocks || []).filter(s => s !== symUpper);
        await watchlist.save();

        CacheService.invalidateWatchlists(req.user._id.toString()).catch(() => {});
        res.status(200).json(watchlist);
    } catch (err) {
        res.status(500).json({ message: 'Error removing stock', error: err.message });
    }
});

// DELETE /watchlists/:id
router.delete('/watchlists/:id', authenticate, async (req, res) => {
    try {
        await WatchlistModel.findByIdAndDelete(req.params.id);
        CacheService.invalidateWatchlists(req.user._id.toString()).catch(() => {});
        res.status(200).json({ message: 'Watchlist deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting watchlist', error: err.message });
    }
});

module.exports = router;
