const { BatchModel } = require('../model/BatchModel');
const { EnrollmentModel } = require('../model/EnrollmentModel');
const { WalletModel } = require('../model/WalletModel');
const { PLRecordModel } = require('../model/PLRecordModel');
const { ClosedPositionModel } = require('../model/ClosedPositionModel');
const { PositionsModel } = require('../model/PositionsModel');
const { OptionPositionsModel } = require('../model/OptionPositionsModel');
const { HoldingsModel } = require('../model/HoldingsModel');
const { RiskLogModel } = require('../model/RiskLogModel');

const { istDateStr, isActualMarketHours } = require('../marketRules');

function isLiveMarketActive() {
    try {
        const marketControlService = require('./marketControlService');
        const state = marketControlService.getMarketState ? marketControlService.getMarketState() : null;
        if (state?.isHalted) return false;
        if (state?.mode === 'SYNTHETIC' || state?.mode === 'REPLAY') return true;
    } catch { /* ignore */ }
    return isActualMarketHours('FO');
}

async function broadcastInstructorFeed(io) {
    try {
        if (!io) return;
        if (!isLiveMarketActive()) return; // Freeze PnL and grid during off-market hours
        const dateStr = istDateStr();

        // Find active batches
        const activeBatches = await BatchModel.find({ status: { $ne: 'INACTIVE' } });
        
        for (const batch of activeBatches) {
            if (!batch || !batch._id) continue;
            const enrollments = await EnrollmentModel.find({
                batchId: batch._id,
                status: { $ne: 'DROPPED' }
            }).populate('userId', 'name email userId');
            
            const batchUpdates = [];

            for (const enroll of enrollments) {
                if (!enroll || !enroll.userId || !enroll.userId._id) continue;
                const userId = enroll.userId._id;

                // 1. Get Wallet
                const wallet = await WalletModel.findOne({ userId }) || { balance: 0, balancePaise: 0, blockedMarginPaise: 0 };
                
                // 2. Get Realized PNL from ClosedPositionsModel and PLRecordModel
                const closedTrades = await ClosedPositionModel.find({ userId, dateStr });
                let realizedPnlRupees = closedTrades.reduce((sum, c) => sum + (c.pnl || 0), 0);
                if (closedTrades.length === 0) {
                    const plRecord = await PLRecordModel.findOne({ userId, dateStr });
                    if (plRecord) realizedPnlRupees = (plRecord.netPnl || 0) / 100;
                }

                // 3. Get Open Positions and compute Live Unrealized PNL
                const userHoldings = await HoldingsModel.find({ userId });
                let unrealizedPnlRupees = 0;
                userHoldings.forEach(h => {
                    const live = marketDataService.getStockPrice(h.stockSymbol);
                    const curPrice = live?.ltp ?? h.ltp ?? h.avgPrice;
                    unrealizedPnlRupees += (curPrice - h.avgPrice) * h.quantity;
                });

                const userEqPositions = await PositionsModel.find({ userId });
                userEqPositions.forEach(p => {
                    const live = marketDataService.getStockPrice(p.stockSymbol);
                    const curPrice = live?.ltp ?? p.ltp ?? p.avgPrice;
                    unrealizedPnlRupees += (curPrice - p.avgPrice) * p.quantity;
                });

                const userOptPositions = await OptionPositionsModel.find({ userId });
                userOptPositions.forEach(p => {
                    const liveLtp = marketDataService.getOptionLTPSync ? marketDataService.getOptionLTPSync(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry) : (p.ltp ?? p.avgPrice);
                    const curPrice = Number(typeof liveLtp === 'number' ? liveLtp : (p.ltp ?? p.avgPrice));
                    const dir = p.side === 'BUY' ? 1 : -1;
                    const diff = (curPrice - p.avgPrice) * p.quantity * dir;
                    unrealizedPnlRupees += isNaN(diff) ? 0 : diff;
                });

                const totalPnlRupees = Math.round((realizedPnlRupees + unrealizedPnlRupees) * 100) / 100;
                const totalNetPnlPaise = Math.round(totalPnlRupees * 100);
                const totalPositionsCount = userHoldings.length + userEqPositions.length + userOptPositions.length;

                const startingCapitalRupees = (enroll.startingCapitalPaise || batch.startingCapitalPaise || 10000000) / 100;
                const roi = startingCapitalRupees > 0 ? Math.round((totalPnlRupees / startingCapitalRupees) * 10000) / 100 : 0;
                const currentBalanceRupees = wallet.balance !== undefined ? wallet.balance : (startingCapitalRupees + totalPnlRupees);
                const currentBalancePaise = wallet.balancePaise !== undefined ? wallet.balancePaise : Math.round(currentBalanceRupees * 100);
                
                // 4. Calculate Margin Pct
                const totalCap = (wallet.balancePaise || 0) + (wallet.blockedMarginPaise || 0);
                const marginPct = totalCap > 0 ? ((wallet.blockedMarginPaise || 0) / totalCap) * 100 : 0;
                
                // 5. Get Risk Flags
                const riskLogs = await RiskLogModel.find({
                    userId,
                    batchId: batch._id,
                    createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
                });
                const riskFlags = riskLogs.map(r => r.ruleType);

                const totalUsedMarginRupees = Math.round((wallet.usedMargin || 0) + (wallet.misMargin || 0) + (wallet.optionMargin || 0));
                const availableMarginRupees = (typeof wallet.availableMargin === 'number' && wallet.availableMargin > 0)
                    ? wallet.availableMargin
                    : Math.max(0, currentBalanceRupees - totalUsedMarginRupees - (wallet.blockedMargin || 0));

                const updateObj = {
                    enrollmentId: enroll._id.toString(),
                    studentId: userId.toString(),
                    studentName: enroll.userId.name,
                    studentUserId: enroll.userId.userId || '',
                    email: enroll.userId.email,
                    netPnlPaise: totalNetPnlPaise,
                    pnl: totalPnlRupees,
                    todayPnl: totalPnlRupees,
                    totalPnl: totalPnlRupees,
                    realizedPnl: Math.round(realizedPnlRupees * 100) / 100,
                    unrealizedPnl: Math.round(unrealizedPnlRupees * 100) / 100,
                    balance: Math.round(currentBalanceRupees * 100) / 100,
                    balancePaise: currentBalancePaise,
                    availableMargin: availableMarginRupees,
                    usedMargin: totalUsedMarginRupees,
                    totalUsedMargin: totalUsedMarginRupees,
                    roi,
                    openPositions: totalPositionsCount,
                    openPositionsCount: totalPositionsCount,
                    marginPct,
                    riskFlags,
                    batchId: batch._id.toString(),
                };

                batchUpdates.push(updateObj);

                // Emit individual pnl_update event
                io.to(`batch:${batch._id}`).emit('pnl_update', updateObj);
            }

            if (batchUpdates.length > 0) {
                io.to(`batch:${batch._id}`).emit('instructorFeed', batchUpdates);
            }
        }
    } catch (err) {
        console.error('[InstructorFeed] Error broadcasting:', err.message);
    }
}

module.exports = { broadcastInstructorFeed };
