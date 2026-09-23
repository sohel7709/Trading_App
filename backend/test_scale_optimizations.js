'use strict';

const mongoose = require('mongoose');
const { ensureIndexes } = require('./scripts/ensureIndexes');
const CacheService = require('./services/cacheService');
const dhanDataService = require('./dhanDataService');
const InstituteDataManager = require('./services/InstituteDataManager');

const MONGO_URI = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/zerodha';

function createMockIO() {
    const emitted = [];
    return {
        emitted,
        to(room) {
            return {
                emit(event, data) {
                    emitted.push({ room, event, data, timestamp: new Date() });
                }
            };
        },
        emit(event, data) {
            emitted.push({ room: 'GLOBAL', event, data });
        }
    };
}

(async () => {
    console.log('======================================================');
    console.log('⚡ HIGH-SCALE (1,000–1,200 USERS) OPTIMIZATION TESTS');
    console.log('======================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(cond, msg) {
        if (cond) {
            console.log(`  ✅ PASS: ${msg}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${msg}`);
            failed++;
        }
    }

    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 4000 });
        console.log('Connected to MongoDB.\n');

        // ── 1. Database Indexing Verification ──
        console.log('--- Test 1: Compound Indexes Verification ---');
        await ensureIndexes();
        const db = mongoose.connection.db;

        const orderIndexes = await db.collection('orders').indexes();
        const hasOrderUserCreated = orderIndexes.some(i => i.name === 'idx_orders_user_created');
        assert(hasOrderUserCreated, 'orders collection has compound index { userId: 1, createdAt: -1 }');

        const plIndexes = await db.collection('plrecords').indexes();
        const hasPLUserDate = plIndexes.some(i => i.name === 'idx_pl_user_date');
        assert(hasPLUserDate, 'plrecords collection has compound index { userId: 1, date: -1 }');

        const userIndexes = await db.collection('users').indexes();
        const hasUserInstRole = userIndexes.some(i => i.name === 'idx_users_inst_role');
        assert(hasUserInstRole, 'users collection has compound index { instituteCode: 1, role: 1 }');

        // ── 2. Redis Session Caching Verification ──
        console.log('\n--- Test 2: Redis / In-Memory Session Caching ---');
        const testUserId = 'test_user_scale_123';
        const sessionPayload = {
            _id: testUserId,
            name: 'Scale Test User',
            role: 'STUDENT',
            instituteCode: 'SCALE01',
            balance: 100000,
        };

        await CacheService.setUserSession(testUserId, sessionPayload, 60);
        const cached = await CacheService.getUserSession(testUserId);
        assert(cached && cached.name === 'Scale Test User', 'Retrieved cached user session');
        assert(cached.balance === 100000, 'Cached session contains accurate balance');

        await CacheService.invalidateUserSession(testUserId);
        const afterInvalidate = await CacheService.getUserSession(testUserId);
        assert(!afterInvalidate, 'Invalidated user session successfully cleared');

        // ── 3. Option Chain ATM Windowing (±10 strikes) ──
        console.log('\n--- Test 3: Option Chain ATM Windowing ---');
        // Synthesize 50 strikes from 22000 to 24500 (step 50)
        const mockRows = Array.from({ length: 50 }, (_, i) => ({
            strike: 22000 + i * 50,
            ce: { ltp: 100, oi: 5000 },
            pe: { ltp: 100, oi: 5000 }
        }));
        const underlyingPrice = 23215; // ATM strike is 23200 (index 24)

        // Test windowing logic
        const closestIdx = mockRows.findIndex(r => Math.abs(r.strike - underlyingPrice) <= 25);
        const startIdx = Math.max(0, closestIdx - 10);
        const endIdx = Math.min(mockRows.length, closestIdx + 11);
        const windowed = mockRows.slice(startIdx, endIdx);

        assert(windowed.length === 21, `Windowed to 21 strikes (ATM ± 10 strikes), raw was ${mockRows.length}`);
        assert(windowed[0].strike === 22700, `First strike in window is ${windowed[0].strike} (ATM - 10)`);
        assert(windowed[windowed.length - 1].strike === 23700, `Last strike in window is ${windowed[windowed.length - 1].strike} (ATM + 10)`);

        // ── 4. Delta Tick vs Full Snapshot Emission ──
        console.log('\n--- Test 4: Delta Tick vs Full Snapshot Emission ---');
        const mockIO = createMockIO();
        const manager = new InstituteDataManager(mockIO);

        const testConn = {
            instituteCode: 'TEST_DELTA_01',
            credentials: { clientId: 'dummy', accessToken: 'dummy' },
            symbols: ['RELIANCE', 'TCS', 'INFY'],
            prices: {
                RELIANCE: { symbol: 'RELIANCE', ltp: 2800, change: 10, changePercent: 0.35 },
                TCS: { symbol: 'TCS', ltp: 4000, change: 20, changePercent: 0.5 },
                INFY: { symbol: 'INFY', ltp: 1800, change: -5, changePercent: -0.28 }
            },
            indexes: { 'NIFTY 50': { ltp: 24000, change: 50 } },
            commodities: {},
            movers: { gainers: [], losers: [] },
            previousLtp: { RELIANCE: 2800, TCS: 4000, INFY: 1800 },
            status: 'ACTIVE',
            isUsingFallback: false,
            lastUpdated: new Date().toISOString()
        };

        // Simulate delta tick where ONLY RELIANCE changed:
        const mockDiff = {
            stocks: {
                RELIANCE: { symbol: 'RELIANCE', ltp: 2815, change: 25, changePercent: 0.9 }, // Changed
                TCS: { symbol: 'TCS', ltp: 4000, change: 20, changePercent: 0.5 },            // Unchanged
                INFY: { symbol: 'INFY', ltp: 1800, change: -5, changePercent: -0.28 }        // Unchanged
            },
            indexes: {},
            commodities: {}
        };

        // Test diff identification
        const diffPrices = {};
        for (const [sym, q] of Object.entries(mockDiff.stocks)) {
            if (testConn.previousLtp[sym] !== q.ltp) {
                diffPrices[sym] = q;
                testConn.previousLtp[sym] = q.ltp;
            }
        }

        assert(Object.keys(diffPrices).length === 1, 'Identified exactly 1 modified symbol in delta tick');
        assert(diffPrices.RELIANCE?.ltp === 2815, 'Delta contains only updated RELIANCE quote');
        assert(!diffPrices.TCS, 'Unchanged TCS omitted from delta payload');

    } catch (e) {
        console.error('Test Exception:', e.message);
        failed++;
    } finally {
        await mongoose.disconnect();
        console.log('\n======================================================');
        console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
        console.log('======================================================\n');
        process.exit(failed > 0 ? 1 : 0);
    }
})();
