'use strict';

const express = require('express');
const router = express.Router();
const { authenticate: auth } = require('../middleware/authenticate');
const analyticsService = require('../services/analyticsService');

router.use(auth);

// GET /analytics/performance
// Optional ?studentId=... (requires INSTRUCTOR, ADMIN, or SUPER_ADMIN)
router.get('/performance', async (req, res) => {
    try {
        let targetUserId = req.user._id;

        if (req.query.studentId) {
            const isPrivileged = ['INSTRUCTOR', 'ADMIN', 'INSTITUTE_ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
            if (!isPrivileged && req.query.studentId !== req.user._id.toString()) {
                return res.status(403).json({ message: 'Forbidden: Cannot view other students analytics' });
            }
            targetUserId = req.query.studentId;
        }

        const data = await analyticsService.getPerformanceAnalytics(targetUserId);
        res.json({ success: true, ...data });
    } catch (err) {
        console.error('[AnalyticsRoutes] Error:', err);
        res.status(500).json({ success: false, message: 'Failed to compute analytics', error: err.message });
    }
});

// GET /analytics/overview
router.get('/overview', async (req, res) => {
    try {
        const data = await analyticsService.getPerformanceAnalytics(req.user._id);
        res.json({ success: true, overview: data.overview, advanced: data.advanced });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch overview', error: err.message });
    }
});

// GET /analytics/equity-curve
router.get('/equity-curve', async (req, res) => {
    try {
        const data = await analyticsService.getPerformanceAnalytics(req.user._id);
        res.json({ success: true, equityCurve: data.charts.equityCurve });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch equity curve', error: err.message });
    }
});

module.exports = router;
