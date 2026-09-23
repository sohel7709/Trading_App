'use strict';

const { UserModel } = require('../model/UserModel');
const { ClosedPositionModel } = require('../model/ClosedPositionModel');
const { PositionsModel } = require('../model/PositionsModel');
const { TradeModel } = require('../model/TradeModel');
const { RiskLogModel } = require('../model/RiskLogModel');
const CacheService = require('./cacheService');
const marketDataService = require('../marketDataService');

class GamificationService {
    /**
     * Compute timestamp filter for given timeframe
     */
    getTimeframeDate(timeframe = 'daily') {
        const now = new Date();
        if (timeframe === 'daily') {
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);
            return start;
        } else if (timeframe === 'weekly') {
            const start = new Date(now);
            start.setDate(now.getDate() - 7);
            start.setHours(0, 0, 0, 0);
            return start;
        } else if (timeframe === 'monthly') {
            const start = new Date(now);
            start.setDate(now.getDate() - 30);
            start.setHours(0, 0, 0, 0);
            return start;
        }
        return new Date(0); // all time
    }

    /**
     * Determine badges earned by student
     */
    assignBadges({ rank, winRate, tradesCount, maxDrawdown, riskBreachesCount, profitableDaysCount }) {
        const badges = [];

        if (rank === 1 && tradesCount >= 3) {
            badges.push({ id: 'TOP_TRADER', name: 'Top Trader', icon: '🥇', description: 'Rank #1 on the Leaderboard' });
        } else if (rank === 2 && tradesCount >= 3) {
            badges.push({ id: 'RUNNER_UP', name: 'Silver Champ', icon: '🥈', description: 'Rank #2 on the Leaderboard' });
        } else if (rank === 3 && tradesCount >= 3) {
            badges.push({ id: 'BRONZE_CHAMP', name: 'Bronze Champ', icon: '🥉', description: 'Rank #3 on the Leaderboard' });
        }

        if (winRate >= 75 && tradesCount >= 5) {
            badges.push({ id: 'HIGH_ACCURACY', name: 'High Accuracy', icon: '🎯', description: '75%+ Win Rate with 5+ trades' });
        }

        if (riskBreachesCount === 0 && tradesCount >= 5 && maxDrawdown <= 5) {
            badges.push({ id: 'RISK_MASTER', name: 'Risk Master', icon: '🛡️', description: 'Strict discipline with <5% drawdown' });
        }

        if (profitableDaysCount >= 3) {
            badges.push({ id: 'CONSISTENT_STREAK', name: 'Profit Streak', icon: '🔥', description: '3+ consecutive profitable trading days' });
        }

        return badges;
    }

    /**
     * Compute leaderboard for institute or batch
     */
    async calculateLeaderboard({ instituteId, batchId, timeframe = 'daily' } = {}) {
        const cacheKey = `leaderboard:${timeframe}:${instituteId || batchId || 'GLOBAL'}`;
        const cached = await CacheService.get(cacheKey);
        if (cached) {
            return cached;
        }

        const userFilter = { isActive: true, role: 'STUDENT' };
        if (instituteId) userFilter.instituteId = instituteId;

        const users = await UserModel.find(userFilter).select('_id name userId email instituteId instituteCode').lean();
        if (!users || users.length === 0) return [];

        const startDate = this.getTimeframeDate(timeframe);

        const results = await Promise.all(users.map(async (student) => {
            const uid = student._id;

            // 1. Closed positions / realized P&L within timeframe
            const closed = await ClosedPositionModel.find({
                userId: uid,
                closedAt: { $gte: startDate }
            }).lean();

            // 2. Open positions / live unrealized P&L
            const openPos = await PositionsModel.find({ userId: uid }).lean();
            let unrealizedPnl = 0;
            for (const p of openPos) {
                const live = marketDataService.getStockPrice(p.stockSymbol);
                const ltp = live?.ltp ?? p.ltp ?? p.avgPrice;
                const side = p.side || (p.quantity >= 0 ? 'BUY' : 'SELL');
                const dir = side === 'BUY' ? 1 : -1;
                unrealizedPnl += (ltp - p.avgPrice) * Math.abs(p.quantity) * dir;
            }

            // 3. Trade count
            const tradesCount = closed.length;
            const winningTrades = closed.filter(c => (c.pnl || 0) > 0).length;
            const realizedPnl = closed.reduce((sum, c) => sum + (c.pnl || 0), 0);
            const totalPnl = Math.round((realizedPnl + unrealizedPnl) * 100) / 100;
            const winRate = tradesCount > 0 ? Math.round((winningTrades / tradesCount) * 100) : 0;

            // 4. Calculate Drawdown estimate
            let peak = 0;
            let maxDrawdown = 0;
            let runningPnl = 0;
            for (const c of closed) {
                runningPnl += (c.pnl || 0);
                if (runningPnl > peak) peak = runningPnl;
                const dd = peak > 0 ? ((peak - runningPnl) / peak) * 100 : 0;
                if (dd > maxDrawdown) maxDrawdown = dd;
            }

            // 5. Risk log breaches
            const riskBreachesCount = await RiskLogModel.countDocuments({
                userId: uid,
                createdAt: { $gte: startDate }
            });

            // 6. Profitable days count
            const daysMap = {};
            closed.forEach(c => {
                const day = c.dateStr || (c.closedAt ? c.closedAt.toISOString().slice(0, 10) : 'today');
                daysMap[day] = (daysMap[day] || 0) + (c.pnl || 0);
            });
            const profitableDaysCount = Object.values(daysMap).filter(val => val > 0).length;

            return {
                userId: student._id,
                studentId: student.userId,
                name: student.name || student.userId || 'Student',
                instituteId: student.instituteId,
                instituteCode: student.instituteCode,
                totalPnl,
                realizedPnl: Math.round(realizedPnl * 100) / 100,
                unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
                tradesCount,
                winningTrades,
                winRate,
                maxDrawdown: Math.round(maxDrawdown * 10) / 10,
                riskBreachesCount,
                profitableDaysCount,
            };
        }));

        // Rank Sorting Logic:
        // 1. Total PnL descending
        // 2. Win rate descending
        // 3. Max drawdown ascending (lower is better)
        results.sort((a, b) => {
            if (b.totalPnl !== a.totalPnl) return b.totalPnl - a.totalPnl;
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return a.maxDrawdown - b.maxDrawdown;
        });

        // Assign ranks and badges
        const leaderboard = results.map((entry, index) => {
            const rank = index + 1;
            const badges = this.assignBadges({
                rank,
                winRate: entry.winRate,
                tradesCount: entry.tradesCount,
                maxDrawdown: entry.maxDrawdown,
                riskBreachesCount: entry.riskBreachesCount,
                profitableDaysCount: entry.profitableDaysCount,
            });

            return {
                ...entry,
                rank,
                badges,
            };
        });

        // Cache in Redis for 10 seconds
        await CacheService.set(cacheKey, leaderboard, 10).catch(() => {});

        return leaderboard;
    }
}

module.exports = new GamificationService();
