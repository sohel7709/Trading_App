'use strict';

const express = require('express');
const router = express.Router();
const { authenticate: auth } = require('../middleware/authenticate');
const gamificationService = require('../services/gamificationService');

router.use(auth);

// GET /leaderboard?timeframe=daily|weekly|monthly
router.get('/', async (req, res) => {
    try {
        const timeframe = ['daily', 'weekly', 'monthly'].includes(req.query.timeframe) 
            ? req.query.timeframe 
            : 'daily';

        const instituteId = req.user.role === 'SUPER_ADMIN' 
            ? (req.query.instituteId || req.user.instituteId)
            : req.user.instituteId;

        const batchId = req.query.batchId || null;

        const leaderboard = await gamificationService.calculateLeaderboard({
            instituteId,
            batchId,
            timeframe,
        });

        const currentUserIdStr = req.user._id.toString();
        const callerEntry = leaderboard.find(e => e.userId.toString() === currentUserIdStr) || null;

        const top10 = leaderboard.slice(0, 10);

        res.json({
            success: true,
            timeframe,
            callerRank: callerEntry?.rank || null,
            callerBadges: callerEntry?.badges || [],
            callerPnl: callerEntry?.totalPnl || 0,
            top10,
            totalTraders: leaderboard.length,
        });
    } catch (err) {
        console.error('[LeaderboardRoutes] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch leaderboard', error: err.message });
    }
});

module.exports = router;
