'use strict';

const express = require('express');
const router = express.Router();
const { authenticate: auth } = require('../middleware/authenticate');
const replayEngine = require('../services/replayEngineService');
const ReplayClockService = require('../services/marketData/ReplayClockService');

router.use(auth);

// ── Student / User Interactive Replay Session Routes ──

// Start new or resume existing replay session
router.post('/session/start', async (req, res) => {
    try {
        const { symbol, date, speed } = req.body;
        const session = await replayEngine.startSession(req.user._id, {
            symbol: symbol || 'NIFTY 50',
            date: date || '2024-07-01',
            speed: Number(speed) || 1,
            instituteId: req.user.instituteId || null,
        });
        res.json({ success: true, session });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to start replay session', error: err.message });
    }
});

// Pause active replay session
router.post('/session/pause', async (req, res) => {
    try {
        const session = await replayEngine.pauseSession(req.user._id);
        res.json({ success: true, session });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to pause replay session', error: err.message });
    }
});

// Resume paused replay session
router.post('/session/resume', async (req, res) => {
    try {
        const session = await replayEngine.resumeSession(req.user._id);
        res.json({ success: true, session });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to resume replay session', error: err.message });
    }
});

// Change playback speed: 1x (1000ms), 2x (500ms), 5x (200ms)
router.post('/session/speed', async (req, res) => {
    try {
        const { speed } = req.body;
        const session = await replayEngine.setSpeed(req.user._id, speed);
        res.json({ success: true, speed: session?.speed || speed });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to change replay speed', error: err.message });
    }
});

// Jump to a specific candle index
router.post('/session/jump', async (req, res) => {
    try {
        const { index } = req.body;
        const session = await replayEngine.jumpTo(req.user._id, index);
        res.json({ success: true, currentIndex: session?.currentIndex });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to jump replay index', error: err.message });
    }
});

// Place paper trade within isolated replay session
router.post('/trade', async (req, res) => {
    try {
        const { side, quantity, productType } = req.body;
        if (!side || !quantity) {
            return res.status(400).json({ success: false, message: 'Side (BUY/SELL) and quantity are required' });
        }
        const result = await replayEngine.placeReplayTrade(req.user._id, {
            side: side.toUpperCase(),
            quantity: Number(quantity),
            productType: productType || 'MIS',
        });
        res.json(result);
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// Get current replay state
router.get('/session/state', async (req, res) => {
    try {
        const state = await replayEngine.getSessionState(req.user._id);
        res.json({ success: true, state });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch replay state', error: err.message });
    }
});

// ── Legacy Instructor Institutional Clock Controls ──
router.post('/start', async (req, res) => {
    try {
        if (!['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Requires INSTRUCTOR or ADMIN role' });
        }
        const { startTs, speed = 1 } = req.body;
        const tenantId = req.user.tenantId || req.user.instituteCode || 'ADMIN';
        let ts = startTs || await ReplayClockService.getCurrentTs(tenantId);
        if (!ts) return res.status(400).json({ message: 'startTs is required for initial start' });
        await ReplayClockService.startSession(tenantId, ts, speed);
        res.json({ message: 'Replay session started', ts, speed });
    } catch (error) {
        res.status(500).json({ message: 'Error starting replay', error: error.message });
    }
});

router.post('/pause', async (req, res) => {
    try {
        if (!['INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Requires INSTRUCTOR or ADMIN role' });
        }
        const tenantId = req.user.tenantId || req.user.instituteCode || 'ADMIN';
        await ReplayClockService.pauseSession(tenantId);
        res.json({ message: 'Replay session paused' });
    } catch (error) {
        res.status(500).json({ message: 'Error pausing replay', error: error.message });
    }
});

router.get('/clock', async (req, res) => {
    try {
        const tenantId = req.user.tenantId || req.user.instituteCode || 'ADMIN';
        const ts = await ReplayClockService.getCurrentTs(tenantId);
        res.json({ currentTs: ts });
    } catch (error) {
        res.status(500).json({ message: 'Error getting clock', error: error.message });
    }
});

module.exports = router;
