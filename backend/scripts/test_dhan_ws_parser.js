'use strict';

const DhanWebSocketFeed = require('../services/DhanWebSocketFeed');
const assert = require('assert');

console.log('--- Testing DhanWebSocketFeed Binary Parsing ---');

const feed = new DhanWebSocketFeed({ clientId: 'TEST_ID', accessToken: 'TEST_TOKEN' });

let tickReceived = null;
let quoteReceived = null;
let oiReceived = null;

feed.on('tick', (data) => {
    tickReceived = data;
});

feed.on('quote', (data) => {
    quoteReceived = data;
});

feed.on('oi', (data) => {
    oiReceived = data;
});

// 1. Build a synthetic Ticker Packet (Code 2, 16 bytes)
// Bytes 0: code 2, Bytes 1-2: msgLen 16, Byte 3: segment 1 (NSE_EQ), Bytes 4-7: secId 11536 (TCS)
// Bytes 8-11: float32 ltp 4520.50, Bytes 12-15: int32 ltt 1727500000
const tickerBuf = Buffer.alloc(16);
tickerBuf.writeUInt8(2, 0);
tickerBuf.writeInt16LE(16, 1);
tickerBuf.writeUInt8(1, 3); // NSE_EQ
tickerBuf.writeInt32LE(11536, 4);
tickerBuf.writeFloatLE(4520.50, 8);
tickerBuf.writeInt32LE(1727500000, 12);

// 2. Build a synthetic OI Packet (Code 5, 12 bytes)
const oiBuf = Buffer.alloc(12);
oiBuf.writeUInt8(5, 0);
oiBuf.writeInt16LE(12, 1);
oiBuf.writeUInt8(2, 3); // NSE_FNO
oiBuf.writeInt32LE(49081, 4);
oiBuf.writeInt32LE(350000, 8); // OI = 350,000

// Test single packet
feed._parseBinaryMessages(tickerBuf);
assert.strictEqual(tickReceived?.securityId, 11536);
assert.strictEqual(tickReceived?.segment, 'NSE_EQ');
assert.strictEqual(Math.round(tickReceived?.ltp * 100), 452050);
console.log('✔ Ticker Packet decoded successfully:', tickReceived);

// Test concatenated packets (ticker + oi in a single stream)
const multiBuf = Buffer.concat([tickerBuf, oiBuf]);
feed._parseBinaryMessages(multiBuf);
assert.strictEqual(oiReceived?.securityId, 49081);
assert.strictEqual(oiReceived?.segment, 'NSE_FNO');
assert.strictEqual(oiReceived?.oi, 350000);
console.log('✔ Concatenated Binary Stream decoded successfully:', oiReceived);

console.log('All Dhan WebSocket Parser Tests PASSED! 🎉');
