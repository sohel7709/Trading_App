/**
 * One-time script: 
 *  1. Add extra June-19/20 losing option trades so combined P&L (Nov–now) = NET LOSS
 *  2. Update wallet: available ≈ ₹18.67L (non-round), usedMargin = ₹1,79,40,000
 *
 * Run: cd backend && node updateFundsAndPL.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { PLRecordModel } = require('./model/PLRecordModel');
const { WalletModel } = require('./model/WalletModel');

// Extra losing trades to add — total gross loss ≈ ₹44.20L
// These are June 19–20 option positions that got wiped / margin-called on crash day.
const EXTRA_LOSSES = [
    {
        tradeDate: new Date('2026-06-19T10:30:00.000Z'),
        symbol: 'NIFTY19JUN24000CE',
        quantity: 25000,
        buyValue:  1826250,   // avg buy ₹73.05
        sellValue:   137500,  // exit ₹5.50 (crushed)
        realizedPL: -1688750,
        charges:     1834.22,
        brokerage: 40, stt: 137.5, exchangeCharges: 1241.62, gst: 250.10, sebiCharges: 65, stampDuty: 100,
        netPL: -1690584.22,
        realizedPLPct: -92.46,
        segment: 'fno', source: 'import',
    },
    {
        tradeDate: new Date('2026-06-19T11:15:00.000Z'),
        symbol: 'BANKNIFTY19JUN54000CE',
        quantity: 8400,
        buyValue:  1562400,   // avg buy ₹186.00
        sellValue:   126000,  // exit ₹15.00 (near worthless)
        realizedPL: -1436400,
        charges:     1612.18,
        brokerage: 40, stt: 126, exchangeCharges: 1050.24, gst: 213.94, sebiCharges: 82, stampDuty: 100,
        netPL: -1438012.18,
        realizedPLPct: -91.94,
        segment: 'fno', source: 'import',
    },
    {
        tradeDate: new Date('2026-06-20T09:45:00.000Z'),
        symbol: 'SENSEX20JUN79500CE',
        quantity: 2100,
        buyValue:   567000,   // avg buy ₹270.00
        sellValue:    52500,  // exit ₹25.00 (nearly expired)
        realizedPL: -514500,
        charges:      614.40,
        brokerage: 40, stt: 52.5, exchangeCharges: 382.88, gst: 79.02, sebiCharges: 60, stampDuty: 0,
        netPL: -515114.40,
        realizedPLPct: -90.74,
        segment: 'fno', source: 'import',
    },
];

// Total extra loss = 1688750 + 1436400 + 514500 = 3639650 = ₹36.40L (gross)
// Previous realized: ₹100.76L → new: ₹64.36L gross → net ≈ ₹59.5L
// Combined with holdings unrealized (−₹79.84L): total ≈ −₹20.3L  ← NET LOSS ✓

async function run() {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✓ Connected\n');

    // 1. Insert extra losing trades
    const inserted = await PLRecordModel.insertMany(EXTRA_LOSSES);
    const extraLoss = EXTRA_LOSSES.reduce((s, t) => s + t.realizedPL, 0);
    console.log(`✓ Added ${inserted.length} extra losing trades  (₹${Math.round(Math.abs(extraLoss)/1e5*100)/100}L gross loss)`);

    // 2. Verify new combined P&L
    const [agg] = await PLRecordModel.aggregate([
        { $match: { tradeDate: { $gte: new Date('2025-11-01'), $lte: new Date('2026-06-26') } } },
        { $group: { _id: null, total: { $sum: '$netPL' }, charges: { $sum: '$charges' } } },
    ]);
    const netRealized = agg?.total ?? 0;
    const unrealized  = -7983569.5;   // from current holdings seed
    const combined    = netRealized + unrealized;
    console.log(`\n  netRealizedPL : ₹${(netRealized/1e5).toFixed(2)}L`);
    console.log(`  unrealizedPL  : ₹${(unrealized/1e5).toFixed(2)}L (holdings)`);
    console.log(`  COMBINED TOTAL: ₹${(combined/1e5).toFixed(2)}L  ${combined < 0 ? '← NET LOSS ✓' : '← still positive'}`);

    // 3. Update wallet
    let wallet = await WalletModel.findOne({});
    const AVAILABLE   = 1867432;     // ₹18,67,432 — non-round available funds
    const USED_MARGIN = 17940000;    // ₹1,79,40,000 — exact stock investment
    if (!wallet) {
        wallet = new WalletModel({ balance: AVAILABLE, usedMargin: USED_MARGIN, availableMargin: AVAILABLE });
    } else {
        wallet.balance          = AVAILABLE;
        wallet.usedMargin       = USED_MARGIN;
        wallet.availableMargin  = AVAILABLE;
    }
    await wallet.save();
    console.log(`\n✓ Wallet updated`);
    console.log(`  Available funds : ₹${AVAILABLE.toLocaleString('en-IN')}  (₹18.67L)`);
    console.log(`  Used margin     : ₹${USED_MARGIN.toLocaleString('en-IN')}  (₹1.79 Cr)`);

    await mongoose.disconnect();
    console.log('\n✓ Done');
}

run().catch(e => { console.error(e.message); process.exit(1); });
