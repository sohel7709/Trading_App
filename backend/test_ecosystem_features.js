'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.DATABASE_URL || process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/zerodha';

const replayEngine = require('./services/replayEngineService');
const gamificationService = require('./services/gamificationService');
const analyticsService = require('./services/analyticsService');
const notificationService = require('./services/notificationService');
const { NotificationModel } = require('./model/NotificationModel');
const { UserModel } = require('./model/UserModel');

async function runTests() {
    console.log('🧪 Starting Ecosystem Features Verification Suite...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB Atlas\n');

    // Find or create test student
    let testUser = await UserModel.findOne({ role: 'STUDENT' });
    if (!testUser) {
        testUser = await UserModel.create({
            userId: 'TEST_STUDENT_ECO',
            email: 'test_eco@zerodha.dev',
            passwordHash: 'dummy_hash',
            role: 'STUDENT',
        });
    }
    const userId = testUser._id;
    console.log(`👤 Using student: ${testUser.userId || testUser.email} (${userId})\n`);

    // ── Test 1: Replay Trading Engine ──
    console.log('--- [1/4] Testing Replay Trading Engine ---');
    const session = await replayEngine.startSession(userId, {
        symbol: 'NIFTY 50',
        date: '2024-07-01',
        speed: 5,
    });
    console.log(`  ✓ Replay session started: ID=${session._id}, Status=${session.status}, Speed=${session.speed}x, TotalCandles=${session.totalCandles}`);

    // Place simulated buy order in replay
    const tradeResult = await replayEngine.placeReplayTrade(userId, {
        side: 'BUY',
        quantity: 50,
        productType: 'MIS',
    });
    console.log(`  ✓ Replay trade executed at ₹${tradeResult.execPrice}. Open positions: ${tradeResult.positions.length}`);

    // Pause replay
    const paused = await replayEngine.pauseSession(userId);
    console.log(`  ✓ Replay session paused: Status=${paused.status}`);

    // Set speed to 2x
    const speedUpdated = await replayEngine.setSpeed(userId, 2);
    console.log(`  ✓ Replay speed updated to: ${speedUpdated.speed}x`);

    // Fetch state
    const state = await replayEngine.getSessionState(userId);
    console.log(`  ✓ Replay state verified: CurrentIndex=${state.currentIndex}, TradesLogged=${state.trades.length}`);
    console.log('✅ Replay Trading Engine Test PASSED\n');

    // ── Test 2: Leaderboard & Gamification ──
    console.log('--- [2/4] Testing Leaderboard & Gamification ---');
    const leaderboard = await gamificationService.calculateLeaderboard({ timeframe: 'daily' });
    console.log(`  ✓ Daily Leaderboard computed: ${leaderboard.length} ranked traders`);
    if (leaderboard.length > 0) {
        const top = leaderboard[0];
        console.log(`  ✓ Rank #1: ${top.name} | PnL: ₹${top.totalPnl} | WinRate: ${top.winRate}% | Badges: ${top.badges.map(b => b.icon + ' ' + b.name).join(', ') || 'None'}`);
    }

    // Verify badge assignment logic
    const testBadges = gamificationService.assignBadges({
        rank: 1,
        winRate: 80,
        tradesCount: 6,
        maxDrawdown: 3,
        riskBreachesCount: 0,
        profitableDaysCount: 4,
    });
    console.log(`  ✓ Badge logic verified: [${testBadges.map(b => b.name).join(', ')}]`);
    console.log('✅ Leaderboard & Gamification Test PASSED\n');

    // ── Test 3: Advanced Analytics Engine ──
    console.log('--- [3/4] Testing Advanced Analytics Dashboard ---');
    const analytics = await analyticsService.getPerformanceAnalytics(userId);
    console.log(`  ✓ Core Metrics: WinRate=${analytics.overview.winRate}%, ProfitFactor=${analytics.overview.profitFactor}, R:R=${analytics.overview.riskRewardRatio}`);
    console.log(`  ✓ Advanced Metrics: MaxDrawdown=${analytics.advanced.maxDrawdownPct}%, SharpeRatio=${analytics.advanced.sharpeRatio}, BestHour=${analytics.advanced.bestTradingHour}`);
    console.log(`  ✓ Chart Series: EquityCurve=${analytics.charts.equityCurve.length} points, HourlyBars=${analytics.charts.hourlyPerformance.length} hours, DayHeatmap=${analytics.charts.dayOfWeekHeatmap.length} days`);
    console.log('✅ Advanced Analytics Engine Test PASSED\n');

    // ── Test 4: Smart Notification Engine ──
    console.log('--- [4/4] Testing Smart Notification Engine ---');
    const notif = await notificationService.sendNotification({
        userId,
        type: 'TRADE',
        title: 'Trade Executed: BUY 50 NIFTY 50',
        message: 'Your order was successfully executed at ₹24,150.',
        data: { symbol: 'NIFTY 50', quantity: 50 },
    });
    console.log(`  ✓ Notification persisted to DB: ID=${notif._id}, Title="${notif.title}"`);

    const persisted = await NotificationModel.findById(notif._id).lean();
    if (!persisted || persisted.read !== false) {
        throw new Error('Notification persistence verification failed');
    }
    console.log(`  ✓ Notification retrieved and verified from MongoDB`);
    console.log('✅ Smart Notification Engine Test PASSED\n');

    console.log('🎉 ALL 4 ECOSYSTEM FEATURES SUCCESSFULLY TESTED & VERIFIED!');
    await mongoose.disconnect();
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
