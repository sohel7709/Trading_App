/**
 * Add June-19/20 crash-day option losses to push combined P&L to ≈ −₹2.5 Cr
 * Run: cd backend && node addCrashLosses.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { PLRecordModel } = require('./model/PLRecordModel');

// Six large losing positions from the June 19–20 crash.
// Bought calls/puts expecting a move that never came; positions expired near-worthless.
const CRASH_LOSSES = [
    {   // NIFTY puts — bought for protection, market reversed, wiped out
        tradeDate: new Date('2026-06-19T09:30:00.000Z'), symbol: 'NIFTY19JUN23000PE',
        quantity: 50000, buyValue: 9250000, sellValue: 600000,
        realizedPL: -8650000, charges: 9850,
        brokerage: 40, stt: 600, exchangeCharges: 7239, gst: 1302, sebiCharges: 469, stampDuty: 200,
        netPL: -8659850, realizedPLPct: -93.51, segment: 'fno', source: 'import',
    },
    {   // BANKNIFTY puts — big lot, near-total loss
        tradeDate: new Date('2026-06-19T10:00:00.000Z'), symbol: 'BANKNIFTY19JUN50000PE',
        quantity: 15000, buyValue: 6750000, sellValue: 420000,
        realizedPL: -6330000, charges: 7170,
        brokerage: 40, stt: 420, exchangeCharges: 5286, gst: 951, sebiCharges: 273, stampDuty: 200,
        netPL: -6337170, realizedPLPct: -93.78, segment: 'fno', source: 'import',
    },
    {   // SENSEX calls — OTM call, expired worthless
        tradeDate: new Date('2026-06-19T10:45:00.000Z'), symbol: 'SENSEX19JUN75000CE',
        quantity: 3000, buyValue: 2670000, sellValue: 126000,
        realizedPL: -2544000, charges: 2796,
        brokerage: 40, stt: 126, exchangeCharges: 2093, gst: 377, sebiCharges: 160, stampDuty: 0,
        netPL: -2546796, realizedPLPct: -95.28, segment: 'fno', source: 'import',
    },
    {   // NIFTY calls — wrong direction on crash day
        tradeDate: new Date('2026-06-19T11:30:00.000Z'), symbol: 'NIFTY19JUN24500CE',
        quantity: 30000, buyValue: 2850000, sellValue: 150000,
        realizedPL: -2700000, charges: 3000,
        brokerage: 40, stt: 150, exchangeCharges: 2231, gst: 401, sebiCharges: 178, stampDuty: 0,
        netPL: -2703000, realizedPLPct: -94.74, segment: 'fno', source: 'import',
    },
    {   // BANKNIFTY calls — stopped out at big loss
        tradeDate: new Date('2026-06-20T09:45:00.000Z'), symbol: 'BANKNIFTY20JUN52000CE',
        quantity: 8000, buyValue: 2080000, sellValue: 144000,
        realizedPL: -1936000, charges: 2244,
        brokerage: 40, stt: 144, exchangeCharges: 1655, gst: 298, sebiCharges: 107, stampDuty: 0,
        netPL: -1938244, realizedPLPct: -93.08, segment: 'fno', source: 'import',
    },
    {   // NIFTY puts next day — tried to recover, lost again
        tradeDate: new Date('2026-06-20T10:15:00.000Z'), symbol: 'NIFTY20JUN24000PE',
        quantity: 10000, buyValue: 920000, sellValue: 70000,
        realizedPL: -850000, charges: 990,
        brokerage: 40, stt: 70, exchangeCharges: 735, gst: 132, sebiCharges: 13, stampDuty: 0,
        netPL: -850990, realizedPLPct: -92.39, segment: 'fno', source: 'import',
    },
];

async function run() {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✓ Connected\n');

    await PLRecordModel.insertMany(CRASH_LOSSES);
    const gross = CRASH_LOSSES.reduce((s, t) => s + t.realizedPL, 0);
    console.log(`✓ Added ${CRASH_LOSSES.length} crash-day trades  (additional gross loss: ₹${Math.abs(gross/1e5).toFixed(2)}L)`);

    // Verify final state
    const [agg] = await PLRecordModel.aggregate([
        { $match: { tradeDate: { $gte: new Date('2025-11-01'), $lte: new Date('2026-06-26') } } },
        { $group: { _id: null, totalRL: { $sum: '$realizedPL' }, totalC: { $sum: '$charges' } } },
    ]);
    const netRealized = (agg.totalRL - agg.totalC);
    const unrealized  = -7983569.5;
    const combined    = netRealized + unrealized;
    console.log(`\n  netRealizedPL : ₹${(netRealized/1e7).toFixed(2)} Cr`);
    console.log(`  unrealizedPL  : ₹${(unrealized/1e7).toFixed(2)} Cr  (holdings)`);
    console.log(`  COMBINED TOTAL: ₹${(combined/1e7).toFixed(2)} Cr  ${combined<0 ? '← NET LOSS ✓' : ''}`);

    await mongoose.disconnect();
    console.log('\n✓ Done');
}

run().catch(e => { console.error(e.message); process.exit(1); });
