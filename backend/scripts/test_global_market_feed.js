'use strict';

/**
 * test_global_market_feed.js
 * Verification script for Binance live crypto stream and GlobalMarketFeed service
 */

const { GlobalMarketFeed } = require('../services/GlobalMarketFeed');

async function runTest() {
    console.log('================================================================');
    console.log('🧪 TESTING GLOBAL MARKET FEED (BINANCE CRYPTO & GLOBAL COMMODITIES)');
    console.log('================================================================\n');

    const feed = new GlobalMarketFeed();

    // 1. Check Initial Cache
    console.log('▶ Test 1: Checking Initial Registry Cache...');
    const initialSnapshot = feed.getSnapshot();
    console.log(`  Crypto Assets Initialized: ${initialSnapshot.crypto.length}`);
    console.log(`  Commodities Initialized: ${initialSnapshot.commodities.length}`);
    console.log(`  Forex Pairs Initialized: ${initialSnapshot.forex.length}`);
    console.log(`  Global Indices Initialized: ${initialSnapshot.globalIndices.length}`);
    if (initialSnapshot.crypto.length >= 8) {
        console.log('  ✔ Initial registry populated correctly\n');
    } else {
        throw new Error('Initial registry incomplete');
    }

    // 2. Test Search Functionality
    console.log('▶ Test 2: Testing Instrument Search...');
    const btcResults = feed.search('BTC');
    const goldResults = feed.search('Gold');
    const ethResults = feed.search('Ethereum');
    console.log(`  BTC search matches: ${btcResults.map(r => r.symbol).join(', ')}`);
    console.log(`  Gold search matches: ${goldResults.map(r => r.symbol).join(', ')}`);
    if (btcResults.length > 0 && goldResults.length > 0 && ethResults.length > 0) {
        console.log('  ✔ Search functionality working smoothly\n');
    } else {
        throw new Error('Search failed to find registered instruments');
    }

    // 3. Test Live Binance WebSocket Stream
    console.log('▶ Test 3: Connecting to Live Binance WebSocket Stream...');
    const receivedTicks = [];

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            if (receivedTicks.length > 0) {
                resolve();
            } else {
                reject(new Error('Timeout waiting for live Binance ticks'));
            }
        }, 10000);

        feed.on('connected', () => {
            console.log('  ✔ Connected to Binance stream successfully');
        });

        feed.on('tick', (tick) => {
            receivedTicks.push(tick);
            console.log(`  [TICK] ${tick.symbol} (${tick.name}): $${tick.ltp} | Change: ${tick.changePercent}% | Vol: ${tick.volume}`);
            if (receivedTicks.length >= 3) {
                clearTimeout(timeout);
                resolve();
            }
        });

        feed.connectBinance();
    });

    console.log(`\n  ✔ Received ${receivedTicks.length} live ticks from Binance in real-time!`);

    // 4. Verify Normalized Tick Fields
    const sampleTick = receivedTicks[0];
    console.log('\n▶ Test 4: Verifying Normalized Tick Schema...');
    console.log('  Sample Tick Object:', JSON.stringify(sampleTick, null, 2));

    if (
        sampleTick.symbol &&
        typeof sampleTick.ltp === 'number' &&
        sampleTick.ltp > 0 &&
        sampleTick.currency === 'USD' &&
        sampleTick.category &&
        sampleTick.updatedAt
    ) {
        console.log('  ✔ Normalized Tick adheres to schema specifications\n');
    } else {
        throw new Error('Sample tick validation failed');
    }

    // Cleanup
    feed.stop();
    console.log('================================================================');
    console.log('🎉 ALL GLOBAL MARKET FEED TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
    process.exit(0);
}

runTest().catch((err) => {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
});
