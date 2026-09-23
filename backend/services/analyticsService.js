'use strict';

const { ClosedPositionModel } = require('../model/ClosedPositionModel');
const { TradeModel } = require('../model/TradeModel');
const { UserModel } = require('../model/UserModel');
const { WalletModel } = require('../model/WalletModel');
const { PLRecordModel } = require('../model/PLRecordModel');
const CacheService = require('./cacheService');

class AnalyticsService {
    /**
     * Compute comprehensive performance metrics and chart datasets for a trader
     */
    async getPerformanceAnalytics(userId) {
        const cacheKey = `analytics:perf:${userId}`;
        const cached = await CacheService.get(cacheKey);
        if (cached) return cached;

        const [user, wallet, closedPositions, trades, plRecords] = await Promise.all([
            UserModel.findById(userId).select('startingCapital startingCapitalPaise createdAt').lean(),
            WalletModel.findOne({ userId }).lean(),
            ClosedPositionModel.find({ userId }).sort({ closedAt: 1 }).lean(),
            TradeModel.find({ userId }).sort({ createdAt: 1 }).lean(),
            PLRecordModel.find({ userId }).sort({ tradeDate: 1 }).lean(),
        ]);

        const startingCapital = user?.startingCapital || (user?.startingCapitalPaise ? user.startingCapitalPaise / 100 : 500000);
        const currentBalance = wallet ? (wallet.balancePaise ? wallet.balancePaise / 100 : wallet.balance) : startingCapital;

        // ── 1. Core Metrics ──
        const totalClosed = closedPositions.length;
        const winningTrades = closedPositions.filter(c => (c.pnl || 0) > 0);
        const losingTrades = closedPositions.filter(c => (c.pnl || 0) < 0);

        const grossProfit = winningTrades.reduce((sum, c) => sum + (c.pnl || 0), 0);
        const grossLoss = Math.abs(losingTrades.reduce((sum, c) => sum + (c.pnl || 0), 0));
        const totalPnl = Math.round((grossProfit - grossLoss) * 100) / 100;

        const winRate = totalClosed > 0 ? Math.round((winningTrades.length / totalClosed) * 100) : 0;
        const avgProfit = winningTrades.length > 0 ? Math.round((grossProfit / winningTrades.length) * 100) / 100 : 0;
        const avgLoss = losingTrades.length > 0 ? Math.round((grossLoss / losingTrades.length) * 100) / 100 : 0;
        const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : (grossProfit > 0 ? 99.9 : 0);
        const riskRewardRatio = avgLoss > 0 ? Math.round((avgProfit / avgLoss) * 100) / 100 : (avgProfit > 0 ? 99.9 : 0);

        // ── 2. Equity Curve & Maximum Drawdown ──
        let runningPnl = 0;
        let peakBalance = startingCapital;
        let maxDrawdownAmt = 0;
        let maxDrawdownPct = 0;

        const equityCurve = [
            { date: 'Start', balance: startingCapital, cumulativePnl: 0, drawdownPct: 0 }
        ];

        // Group closed positions by date
        const dayPnlMap = {};
        for (const cp of closedPositions) {
            const dateKey = cp.dateStr || (cp.closedAt ? cp.closedAt.toISOString().slice(0, 10) : '2024-07-01');
            dayPnlMap[dateKey] = (dayPnlMap[dateKey] || 0) + (cp.pnl || 0);
        }

        const sortedDates = Object.keys(dayPnlMap).sort();
        const dailyReturns = [];

        for (const dateKey of sortedDates) {
            const dayPnl = dayPnlMap[dateKey];
            runningPnl += dayPnl;
            const balanceAtDay = startingCapital + runningPnl;

            if (balanceAtDay > peakBalance) {
                peakBalance = balanceAtDay;
            }

            const ddAmt = peakBalance - balanceAtDay;
            const ddPct = peakBalance > 0 ? (ddAmt / peakBalance) * 100 : 0;
            if (ddAmt > maxDrawdownAmt) maxDrawdownAmt = ddAmt;
            if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

            dailyReturns.push(startingCapital > 0 ? (dayPnl / startingCapital) : 0);

            equityCurve.push({
                date: dateKey,
                balance: Math.round(balanceAtDay * 100) / 100,
                cumulativePnl: Math.round(runningPnl * 100) / 100,
                drawdownPct: Math.round(ddPct * 10) / 10,
            });
        }

        // ── 3. Sharpe Ratio Calculation ──
        // Sharpe = (mean daily return - daily risk free rate) / std dev of daily returns * sqrt(252)
        let sharpeRatio = 0;
        if (dailyReturns.length >= 3) {
            const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
            const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / dailyReturns.length;
            const stdDev = Math.sqrt(variance);
            const dailyRiskFree = 0.06 / 252; // ~6% annual risk free rate
            if (stdDev > 0) {
                sharpeRatio = Math.round(((mean - dailyRiskFree) / stdDev) * Math.sqrt(252) * 100) / 100;
            }
        }

        // ── 4. Hourly Performance Breakdown ──
        const hourlyMap = {};
        for (let h = 9; h <= 15; h++) {
            const label = `${String(h).padStart(2, '0')}:00`;
            hourlyMap[label] = { hour: label, pnl: 0, trades: 0, wins: 0 };
        }

        for (const cp of closedPositions) {
            const d = cp.closedAt ? new Date(cp.closedAt) : new Date();
            const h = d.getHours();
            const label = `${String(h).padStart(2, '0')}:00`;
            if (hourlyMap[label]) {
                hourlyMap[label].trades++;
                hourlyMap[label].pnl += (cp.pnl || 0);
                if ((cp.pnl || 0) > 0) hourlyMap[label].wins++;
            }
        }

        const hourlyPerformance = Object.values(hourlyMap).map(h => ({
            ...h,
            pnl: Math.round(h.pnl * 100) / 100,
            winRate: h.trades > 0 ? Math.round((h.wins / h.trades) * 100) : 0,
        }));

        const bestHour = hourlyPerformance.reduce((best, cur) => cur.pnl > best.pnl ? cur : best, { hour: 'N/A', pnl: 0 });

        // ── 5. Symbol Performance Breakdown ──
        const symbolMap = {};
        for (const cp of closedPositions) {
            const s = cp.symbol || 'OTHER';
            if (!symbolMap[s]) {
                symbolMap[s] = { symbol: s, pnl: 0, trades: 0, wins: 0 };
            }
            symbolMap[s].trades++;
            symbolMap[s].pnl += (cp.pnl || 0);
            if ((cp.pnl || 0) > 0) symbolMap[s].wins++;
        }

        const symbolBreakdown = Object.values(symbolMap).map(s => ({
            ...s,
            pnl: Math.round(s.pnl * 100) / 100,
            winRate: s.trades > 0 ? Math.round((s.wins / s.trades) * 100) : 0,
        })).sort((a, b) => b.pnl - a.pnl);

        const mostProfitableSymbol = symbolBreakdown[0]?.pnl > 0 ? symbolBreakdown[0].symbol : 'None';
        const mostLossMakingSymbol = symbolBreakdown[symbolBreakdown.length - 1]?.pnl < 0 ? symbolBreakdown[symbolBreakdown.length - 1].symbol : 'None';

        // ── 6. Day of Week Heatmap ──
        const daysOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        const dayMap = {
            1: { day: 'Mon', pnl: 0, trades: 0, wins: 0 },
            2: { day: 'Tue', pnl: 0, trades: 0, wins: 0 },
            3: { day: 'Wed', pnl: 0, trades: 0, wins: 0 },
            4: { day: 'Thu', pnl: 0, trades: 0, wins: 0 },
            5: { day: 'Fri', pnl: 0, trades: 0, wins: 0 },
        };

        for (const cp of closedPositions) {
            const d = cp.closedAt ? new Date(cp.closedAt) : new Date();
            const dayOfWeek = d.getDay(); // 1 = Monday
            if (dayMap[dayOfWeek]) {
                dayMap[dayOfWeek].trades++;
                dayMap[dayOfWeek].pnl += (cp.pnl || 0);
                if ((cp.pnl || 0) > 0) dayMap[dayOfWeek].wins++;
            }
        }

        const dayOfWeekHeatmap = daysOrder.map(label => {
            const found = Object.values(dayMap).find(d => d.day === label);
            return {
                day: label,
                pnl: Math.round((found?.pnl || 0) * 100) / 100,
                trades: found?.trades || 0,
                winRate: found?.trades > 0 ? Math.round((found.wins / found.trades) * 100) : 0,
            };
        });

        // ── 7. Daily PnL Bar Chart Series ──
        const dailyPnlBars = sortedDates.map(dateKey => ({
            date: dateKey,
            pnl: Math.round(dayPnlMap[dateKey] * 100) / 100,
        }));

        const result = {
            overview: {
                startingCapital,
                currentBalance,
                totalPnl,
                winRate,
                totalClosedTrades: totalClosed,
                winningTradesCount: winningTrades.length,
                losingTradesCount: losingTrades.length,
                profitFactor,
                avgProfit,
                avgLoss,
                riskRewardRatio,
            },
            advanced: {
                maxDrawdownPct: Math.round(maxDrawdownPct * 10) / 10,
                maxDrawdownAmt: Math.round(maxDrawdownAmt * 100) / 100,
                sharpeRatio,
                bestTradingHour: bestHour.hour,
                bestTradingHourPnl: bestHour.pnl,
                mostProfitableSymbol,
                mostLossMakingSymbol,
            },
            charts: {
                equityCurve,
                dailyPnlBars,
                hourlyPerformance,
                dayOfWeekHeatmap,
                symbolBreakdown: symbolBreakdown.slice(0, 10),
            }
        };

        // Cache for 15 seconds
        await CacheService.set(cacheKey, result, 15).catch(() => {});

        return result;
    }
}

module.exports = new AnalyticsService();
