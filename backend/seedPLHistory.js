/**
 * Seed P&L history from Synthetic_Options_Trades.csv (the ONLY trade source).
 *
 * - Wipes ALL existing P&L records and ALL NRML trades from TradeModel,
 *   so the synthetic options list is the single source of truth.
 * - Loads every row of Synthetic_Options_Trades.csv into PLRecordModel,
 *   tagged segment: 'fno' so the P&L screen's "Futures & Options" filter
 *   shows them, keyed by trade date for the calendar / date-range filter.
 *
 * Run:  cd backend && node seedPLHistory.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { PLRecordModel } = require('./model/PLRecordModel');
const { TradeModel } = require('./model/TradeModel');

const CSV_PATH = path.join(__dirname, '../Synthetic_Options_Trades.csv');

const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

// Parse "03-Nov-2025" -> Date at 10:00 UTC (inside the day window for filters)
function parseTradeDate(s) {
    const [dd, mon, yyyy] = String(s).split('-');
    return new Date(Date.UTC(Number(yyyy), MONTHS[mon], Number(dd), 10, 0, 0));
}

function parseCSV(filePath) {
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const vals = line.split(',');
        const row = {};
        headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
        return row;
    });
}

async function seed() {
    if (!process.env.DATABASE_URL) {
        console.error('✗ DATABASE_URL is not set. Copy backend/.env.example to backend/.env and fill it in.');
        process.exit(1);
    }
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✓ Connected to MongoDB\n');

    // 1) Remove everything else — synthetic file is the only source
    const delRecords = await PLRecordModel.deleteMany({});
    console.log(`Cleared ${delRecords.deletedCount} old P&L records`);
    const delTrades = await TradeModel.deleteMany({ productType: 'NRML' });
    console.log(`Cleared ${delTrades.deletedCount} old NRML trades from TradeModel\n`);

    // 2) Parse synthetic options file
    const rows = parseCSV(CSV_PATH);
    console.log(`Parsed ${rows.length} rows from ${path.basename(CSV_PATH)}`);

    const docs = rows.map(r => ({
        tradeDate:     parseTradeDate(r['Trade Date']),
        symbol:        String(r['Symbol']).toUpperCase(),
        quantity:      Number(r['Quantity'])       || 0,
        buyValue:      Number(r['Buy Value'])       || 0,
        sellValue:     Number(r['Sell Value'])      || 0,
        realizedPL:    Number(r['Gross P&L'])       || 0,
        charges:       Number(r['Total Charges'])   || 0,
        // Real per-component charges straight from the sheet
        brokerage:       Number(r['Brokerage'])        || 0,
        stt:             Number(r['STT'])              || 0,
        exchangeCharges: Number(r['Exchange Charges']) || 0,
        gst:             Number(r['GST'])              || 0,
        sebiCharges:     Number(r['SEBI Charges'])     || 0,
        stampDuty:       Number(r['Stamp Duty'])       || 0,
        netPL:         Number(r['Net P&L'])         || 0,
        realizedPLPct: Number(r['Realized P&L %'])  || 0,
        segment:       'fno',   // all rows are NIFTY/BANKNIFTY/SENSEX options
        source:        'import',
    }));

    // 3) Insert
    const result = await PLRecordModel.insertMany(docs, { ordered: false });
    console.log(`✓ Seeded ${result.length} F&O P&L history records\n`);

    // 4) Summary
    const dates = [...new Set(docs.map(d => d.tradeDate.toISOString().slice(0, 10)))].sort();
    const totalNet = docs.reduce((s, d) => s + d.netPL, 0);
    const wins = docs.filter(d => d.realizedPL > 0).length;
    const losses = docs.filter(d => d.realizedPL < 0).length;
    console.log(`Segment    : fno (Futures & Options)`);
    console.log(`Date range : ${dates[0]} → ${dates[dates.length - 1]}  (${dates.length} trading days)`);
    console.log(`Trades     : ${docs.length}  (${wins} win / ${losses} loss)`);
    console.log(`Net P&L    : ₹${Math.round(totalNet).toLocaleString('en-IN')}`);

    await mongoose.disconnect();
    console.log('\n✓ Done');
}

seed().catch(e => { console.error('\n✗', e.message); process.exit(1); });
