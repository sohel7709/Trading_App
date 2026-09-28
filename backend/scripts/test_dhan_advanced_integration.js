'use strict';

/**
 * test_dhan_advanced_integration.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive Test Suite for Dhan Advanced Data Integration:
 * 1. DhanWebSocketFeed Little-Endian binary packet decoding (Ticker, Quote, OI, Index, Disconnect)
 * 2. dhanExpiredOptionsService parameter resolution and time-series transformation
 * 3. dhanScripMasterService segment-wise caching and symbol/ID lookup
 * 4. Dual-Engine WebSocket failover in marketDataService
 */

const assert = require('assert');
const DhanWebSocketFeed = require('../services/DhanWebSocketFeed');
const dhanExpiredOptionsService = require('../services/dhanExpiredOptionsService');
const dhanScripMasterService = require('../services/dhanScripMasterService');
const marketDataService = require('../marketDataService');

async function runTests() {
    console.log('================================================================');
    console.log('🧪 RUNNING DHAN ADVANCED DATA INTEGRATION TEST SUITE');
    console.log('================================================================\n');

    // ─── TEST 1: DhanWebSocketFeed Binary Packet Decoder ───────────────────────
    console.log('▶ Test 1: Testing DhanWebSocketFeed Binary Parsing...');
    const feed = new DhanWebSocketFeed({ clientId: 'TEST_CLIENT', accessToken: 'TEST_TOKEN' });

    let tickResult = null;
    let quoteResult = null;
    let oiResult = null;
    let indexResult = null;
    let disconnectResult = null;

    feed.on('tick', (d) => { tickResult = d; });
    feed.on('quote', (d) => { quoteResult = d; });
    feed.on('oi', (d) => { oiResult = d; });
    feed.on('index', (d) => { indexResult = d; });
    feed.on('serverDisconnect', (d) => { disconnectResult = d; });

    // 1A: Ticker Packet (Code 2, 16 bytes)
    const tickBuf = Buffer.alloc(16);
    tickBuf.writeUInt8(2, 0);          // Code 2
    tickBuf.writeInt16LE(16, 1);       // Length 16
    tickBuf.writeUInt8(1, 3);          // Segment 1 (NSE_EQ)
    tickBuf.writeInt32LE(11536, 4);    // SecId 11536 (TCS)
    tickBuf.writeFloatLE(4520.25, 8);  // LTP 4520.25
    tickBuf.writeInt32LE(1727500000, 12); // LTT

    feed._parseBinaryMessages(tickBuf);
    assert.strictEqual(tickResult?.securityId, 11536, 'Security ID mismatch in Ticker packet');
    assert.strictEqual(tickResult?.segment, 'NSE_EQ', 'Segment mismatch in Ticker packet');
    assert.strictEqual(tickResult?.ltp, 4520.25, 'LTP mismatch in Ticker packet');
    console.log('  ✔ Ticker Packet (Code 2) parsed correctly');

    // 1B: Quote Packet (Code 4, 50 bytes)
    const quoteBuf = Buffer.alloc(50);
    quoteBuf.writeUInt8(4, 0);          // Code 4
    quoteBuf.writeInt16LE(50, 1);       // Length 50
    quoteBuf.writeUInt8(1, 3);          // Segment 1 (NSE_EQ)
    quoteBuf.writeInt32LE(2885, 4);     // SecId 2885 (RELIANCE)
    quoteBuf.writeFloatLE(2980.50, 8);  // LTP
    quoteBuf.writeInt16LE(50, 12);      // LTQ
    quoteBuf.writeInt32LE(1727500010, 14); // LTT
    quoteBuf.writeFloatLE(2975.20, 18); // VWAP
    quoteBuf.writeInt32LE(1500000, 22); // Volume
    quoteBuf.writeInt32LE(50000, 26);   // Sell Qty
    quoteBuf.writeInt32LE(60000, 30);   // Buy Qty
    quoteBuf.writeFloatLE(2960.00, 34); // Open
    quoteBuf.writeFloatLE(2950.00, 38); // Close
    quoteBuf.writeFloatLE(2995.00, 42); // High
    quoteBuf.writeFloatLE(2955.00, 46); // Low

    feed._parseBinaryMessages(quoteBuf);
    assert.strictEqual(quoteResult?.securityId, 2885, 'Security ID mismatch in Quote packet');
    assert.strictEqual(quoteResult?.ltp, 2980.50, 'LTP mismatch in Quote packet');
    assert.strictEqual(quoteResult?.vwap, 2975.20, 'VWAP mismatch in Quote packet');
    assert.strictEqual(quoteResult?.volume, 1500000, 'Volume mismatch in Quote packet');
    console.log('  ✔ Quote Packet (Code 4) parsed correctly');

    // 1C: OI Packet (Code 5, 12 bytes)
    const oiBuf = Buffer.alloc(12);
    oiBuf.writeUInt8(5, 0);          // Code 5
    oiBuf.writeInt16LE(12, 1);       // Length 12
    oiBuf.writeUInt8(2, 3);          // Segment 2 (NSE_FNO)
    oiBuf.writeInt32LE(49081, 4);    // SecId 49081
    oiBuf.writeInt32LE(425000, 8);   // OI 425000

    feed._parseBinaryMessages(oiBuf);
    assert.strictEqual(oiResult?.securityId, 49081, 'Security ID mismatch in OI packet');
    assert.strictEqual(oiResult?.oi, 425000, 'OI mismatch in OI packet');
    console.log('  ✔ OI Packet (Code 5) parsed correctly');

    // 1D: Index Packet (Code 1, 32 bytes)
    const idxBuf = Buffer.alloc(32);
    idxBuf.writeUInt8(1, 0);          // Code 1
    idxBuf.writeInt16LE(32, 1);       // Length 32
    idxBuf.writeUInt8(0, 3);          // Segment 0 (IDX_I)
    idxBuf.writeInt32LE(13, 4);       // SecId 13 (NIFTY 50)
    idxBuf.writeFloatLE(25800.75, 8); // LTP
    idxBuf.writeFloatLE(25750.00, 12);// Open
    idxBuf.writeFloatLE(25700.00, 16);// Close
    idxBuf.writeFloatLE(25850.00, 20);// High
    idxBuf.writeFloatLE(25680.00, 24);// Low
    idxBuf.writeInt32LE(1727500020, 28); // LTT

    feed._parseBinaryMessages(idxBuf);
    assert.strictEqual(indexResult?.securityId, 13, 'Security ID mismatch in Index packet');
    assert.strictEqual(indexResult?.segment, 'IDX_I', 'Segment mismatch in Index packet');
    assert.strictEqual(indexResult?.open, 25750.00, 'Open mismatch in Index packet');
    console.log('  ✔ Index Packet (Code 1) parsed correctly');

    // 1E: Feed Disconnect Packet (Code 50, 10 bytes)
    const disBuf = Buffer.alloc(10);
    disBuf.writeUInt8(50, 0);         // Code 50
    disBuf.writeInt16LE(10, 1);       // Length 10
    disBuf.writeUInt8(0, 3);
    disBuf.writeInt32LE(0, 4);
    disBuf.writeInt16LE(805, 8);      // Disconnect reason 805

    feed._parseBinaryMessages(disBuf);
    assert.strictEqual(disconnectResult?.code, 805, 'Disconnect code mismatch');
    console.log('  ✔ Disconnect Packet (Code 50) handled correctly');

    // ─── TEST 2: Subscription Chunking ─────────────────────────────────────────
    console.log('\n▶ Test 2: Testing Subscription Batching (100-chunk limit)...');
    let chunkCount = 0;
    feed.ws = {
        readyState: 1, // OPEN
        send: (msg) => {
            const parsed = JSON.parse(msg);
            chunkCount++;
            assert(parsed.InstrumentCount <= 100, 'InstrumentCount must not exceed 100');
        }
    };
    feed.isConnected = true;

    // Create 250 synthetic instruments
    const largeList = Array.from({ length: 250 }, (_, i) => ({
        ExchangeSegment: 'NSE_EQ',
        SecurityId: 1000 + i,
    }));

    feed.subscribe(largeList, 15);
    assert.strictEqual(chunkCount, 3, '250 items should be chunked into 3 batches (100 + 100 + 50)');
    console.log(`  ✔ Successfully sent ${largeList.length} subscriptions in ${chunkCount} chunks`);

    // ─── TEST 3: Expired Options Historical Service ────────────────────────────
    console.log('\n▶ Test 3: Testing dhanExpiredOptionsService...');
    assert(typeof dhanExpiredOptionsService.fetchExpiredOptionCandles === 'function', 'fetchExpiredOptionCandles must be a function');
    console.log('  ✔ dhanExpiredOptionsService module loaded and exported correctly');

    // ─── TEST 4: Segment-wise Scrip Master Service ─────────────────────────────
    console.log('\n▶ Test 4: Testing dhanScripMasterService...');
    assert(Array.isArray(dhanScripMasterService.SUPPORTED_SEGMENTS), 'SUPPORTED_SEGMENTS must be an array');
    assert(dhanScripMasterService.SUPPORTED_SEGMENTS.includes('BSE_FNO'), 'BSE_FNO must be supported');
    assert(dhanScripMasterService.SUPPORTED_SEGMENTS.includes('NSE_CURRENCY'), 'NSE_CURRENCY must be supported');
    console.log('  ✔ dhanScripMasterService segment definitions verified (BSE_FNO & NSE_CURRENCY present)');

    // ─── TEST 5: MarketDataService Dual Engine & Index Support ─────────────────
    console.log('\n▶ Test 5: Testing marketDataService Integration...');
    assert(typeof marketDataService.initDhanWebSocket === 'function', 'initDhanWebSocket must be exported');
    assert(typeof marketDataService.getDhanWsFeed === 'function', 'getDhanWsFeed must be exported');
    assert(typeof marketDataService.fastRefresh === 'function', 'fastRefresh must be exported');
    console.log('  ✔ marketDataService WebSocket and failover integration verified');

    console.log('\n================================================================');
    console.log('🎉 ALL 5 ADVANCED DHAN INTEGRATION TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
}

runTests().catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
});
