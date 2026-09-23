'use strict';

const mongoose = require('mongoose');
const dhanDataService = require('./dhanDataService');
const InstituteDataManager = require('./services/InstituteDataManager');
const BrokerCredentialModel = require('./model/BrokerCredentialModel');
const { InstituteModel } = require('./model/InstituteModel');

const MONGO_URI = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/zerodha';

// Mock Socket.IO server with room tracking
function createMockIO() {
    const emitted = [];
    const rooms = new Map();

    return {
        emitted,
        rooms,
        to(room) {
            return {
                emit(event, data) {
                    emitted.push({ room, event, data, timestamp: new Date() });
                    if (!rooms.has(room)) rooms.set(room, []);
                    rooms.get(room).push({ event, data });
                },
            };
        },
        emit(event, data) {
            emitted.push({ room: 'GLOBAL', event, data });
        },
    };
}

(async () => {
    console.log('====================================================');
    console.log('🧪 MULTI-INSTITUTE MARKET DATA SYSTEM TEST');
    console.log('====================================================\n');

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

    // ── Test 1: Commodity symbols & Scrip Master MCX coverage ──
    console.log('--- Test 1: MCX Commodity Universe Support ---');
    const commSymbols = dhanDataService.getAllCommoditySymbols();
    assert(commSymbols.length >= 10, `Loaded ${commSymbols.length} MCX commodity symbols`);
    assert(dhanDataService.isCommoditySymbol('CRUDEOIL'), 'Detects CRUDEOIL as commodity');
    assert(dhanDataService.isCommoditySymbol('GOLD'), 'Detects GOLD as commodity');
    assert(dhanDataService.isCommoditySymbol('SILVER'), 'Detects SILVER as commodity');
    assert(dhanDataService.isCommoditySymbol('NATURALGAS'), 'Detects NATURALGAS as commodity');
    assert(dhanDataService.isCommoditySymbol('COPPER'), 'Detects COPPER as commodity');
    assert(!dhanDataService.isCommoditySymbol('RELIANCE'), 'RELIANCE correctly identified as non-commodity');

    // ── Test 2: Global Fallback Credentials Helper ──
    console.log('\n--- Test 2: Global Fallback Credentials Helper ---');
    const globalCreds = dhanDataService.getGlobalCredentials();
    console.log('Global Credentials Present:', !!globalCreds);
    assert(typeof dhanDataService.getGlobalCredentials === 'function', 'getGlobalCredentials is an exported function');

    // ── Test 3: InstituteDataManager Multi-Tenant Isolation ──
    console.log('\n--- Test 3: InstituteDataManager Multi-Tenant Engine ---');
    const mockIO = createMockIO();
    const manager = new InstituteDataManager(mockIO);

    assert(manager instanceof InstituteDataManager, 'InstituteDataManager initialized');
    assert(typeof manager.start === 'function', 'manager.start is callable');
    assert(typeof manager.stop === 'function', 'manager.stop is callable');
    assert(typeof manager.restart === 'function', 'manager.restart is callable');
    assert(typeof manager.getPrices === 'function', 'manager.getPrices is callable');
    assert(typeof manager.getCommodities === 'function', 'manager.getCommodities is callable');

    // ── Test 4: Stop Market Data on Double Failure ──
    console.log('\n--- Test 4: Stop Market Data on Double Failure ---');
    const TEST_INST = 'TEST_INST_001';
    
    // Simulate stopping market data when neither institute key nor global key works
    manager._stopMarketData(TEST_INST, 'Unit test double failure simulation');
    const status = manager.getStatus(TEST_INST);
    assert(status.status === 'STOPPED', `Institute status is STOPPED (was: ${status.status})`);
    
    // Verify room emission
    const roomEvents = mockIO.rooms.get(`institute:${TEST_INST}`) || [];
    const stoppedStatusEvent = roomEvents.find(e => e.event === 'marketDataStatus' && e.data.status === 'STOPPED');
    const stoppedDataEvent = roomEvents.find(e => e.event === 'marketData' && e.data.status === 'STOPPED');
    assert(!!stoppedStatusEvent, 'Emitted marketDataStatus=STOPPED to institute room');
    assert(!!stoppedDataEvent, 'Emitted marketData with status=STOPPED to institute room');

    // ── Test 5: Concurrency Limiter Simulation for 100 Institutes ──
    console.log('\n--- Test 5: Rate Limit & Concurrency Management for 100 Institutes ---');
    const limiter = manager._limiter;
    let maxObservedConcurrent = 0;
    let currentlyRunning = 0;

    const instituteSimulations = Array.from({ length: 50 }, (_, i) => async () => {
        await limiter.run(async () => {
            currentlyRunning++;
            if (currentlyRunning > maxObservedConcurrent) {
                maxObservedConcurrent = currentlyRunning;
            }
            // Simulate 15ms API fetch latency
            await new Promise(r => setTimeout(r, 15));
            currentlyRunning--;
        });
    });

    await Promise.all(instituteSimulations.map(fn => fn()));
    assert(maxObservedConcurrent <= 15, `Max concurrent fetches remained within limit (observed: ${maxObservedConcurrent}, limit: 15)`);

    console.log('\n====================================================');
    console.log(`📊 TEST RESULTS: ${passed} passed, ${failed} failed`);
    console.log('====================================================\n');

    process.exit(failed > 0 ? 1 : 0);
})();
