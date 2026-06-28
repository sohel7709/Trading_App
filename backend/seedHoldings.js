/**
 * Seed equity holdings — 26 reputed NSE stocks.
 *
 * All prices verified from Groww / NSE (not random).
 * Buy prices = real historical peaks from NSE for each stock.
 * LTP fallbacks = prices confirmed from Groww on 28-Jun-2026.
 *
 * Target: invested ≈ ₹5.5 Cr, current ≈ ₹3.7 Cr, loss ≈ −₹1.8 Cr (−33%)
 *
 * Run:  cd backend && node seedHoldings.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { HoldingsModel } = require('./model/HoldingsModel');

const _yf = require('yahoo-finance2');
const YF = _yf.default || _yf;
const yf = (typeof YF === 'function') ? new YF({ suppressNotices: ['yahooSurvey'] }) : YF;

// ── BASKET ─────────────────────────────────────────────────────────────────────
// [symbol, company, fallback-ltp, avg-buy, qty, buy-date]
//
// All 30 stocks from user-approved list, quantities scaled to ₹2 Cr total invested.
// Scale factor ≈ 0.355 (from original ₹5.63 Cr → ₹2.00 Cr).
// Buy prices exactly as specified. Loss ≈ 35%.
// ───────────────────────────────────────────────────────────────────────────────

const BASKET = [
    ['ADANIPOWER', 'Adani Power',               229.10,   715.00,    750, '2024-10-15'],  // −68%
    ['NESTLEIND',  'Nestle India',             1409.80,  2700.00,    160, '2024-02-15'],  // −48%
    ['KPITTECH',   'KPIT Technologies',          738.40,  1300.00,   2900, '2024-11-15'],  // −43%
    ['TATAELXSI',  'Tata Elxsi',               4029.60,  6345.00,    510, '2024-07-15'],  // −37%
    ['WIPRO',      'Wipro',                      175.09,   272.00,   8200, '2024-01-15'],  // −36%
    ['IRFC',       'Indian Railway Finance',      91.73,   134.00,  21000, '2024-07-15'],  // −32%
    ['RVNL',       'Rail Vikas Nigam',           240.68,   340.00,   8600, '2024-07-12'],  // −29%
    ['HCLTECH',    'HCL Technologies',          1100.50,  1550.00,   1800, '2024-12-15'],  // −29%
    ['COCHINSHIP', 'Cochin Shipyard',           1455.70,  1900.00,    180, '2024-07-10'],  // −23%
    ['MAZDOCK',    'Mazagon Dock Shipbuilders',  2463.50,  3200.00,     92, '2024-08-05'],  // −23%
    ['DIXON',      'Dixon Technologies',       12030.00, 15500.00,     20, '2024-11-15'],  // −22%
    ['ADANIGREEN', 'Adani Green Energy',        1525.90,  1900.00,    160, '2024-09-15'],  // −20%
    ['GODREJPROP', 'Godrej Properties',         1850.10,  2300.00,      5, '2024-11-15'],  // −20%
    ['IREDA',      'IREDA',                      127.01,   155.00,     50, '2024-07-10'],  // −18%
    ['SUZLON',     'Suzlon Energy',               57.01,    67.00,    140, '2024-09-15'],  // −15%
    ['NHPC',       'NHPC',                        79.20,    85.00,     71, '2024-08-25'],  // −7%
    ['DELHIVERY',  'Delhivery',                  464.90,   520.00,     12, '2024-10-15'],  // −11%
    ['TATAMOTORS', 'Tata Motors',                779.80,   830.00,      7, '2024-07-30'],  // −6%
    ['TECHM',      'Tech Mahindra',             1439.70,  1550.00,      4, '2024-09-01'],  // −7%
    ['ONGC',       'ONGC',                       233.15,   270.00,     16, '2024-06-19'],  // −14%
    ['COALINDIA',  'Coal India',                 435.65,   490.00,     12, '2024-03-15'],  // −11%
    ['TATASTEEL',  'Tata Steel',                 188.60,   185.00,     32, '2024-09-15'],  // +2%
    ['HINDUNILVR', 'Hindustan Unilever',        2177.00,  2500.00,      2, '2024-09-15'],  // −13%
    ['MPHASIS',    'Mphasis',                   2264.90,  2650.00,      2, '2024-06-11'],  // −14%
    ['RELIANCE',   'Reliance Industries',       1316.50,  1420.00,      1, '2024-07-08'],  // −7%
    ['HAL',        'Hindustan Aeronautics',     4364.00,  4800.00,      1, '2024-06-15'],  // −9%
    ['INDUSINDBK', 'IndusInd Bank',              917.40,   900.00,      1, '2024-07-01'],  // +2%
    ['ADANIENT',   'Adani Enterprises',         3040.30,  3000.00,      1, '2024-06-22'],  // +1%
    ['BEL',        'Bharat Electronics',         408.50,   330.00,      1, '2024-06-27'],  // +24%
    ['ADANIPORTS', 'Adani Ports',               1795.00,  1500.00,      1, '2024-06-29'],  // +20%
];

// ── LIVE PRICE FETCH (tries NSE via Yahoo; falls back to Groww-verified price) ─
async function liveLtp(symbol, growwPrice) {
    try {
        const q = await yf.quote(`${symbol}.NS`);
        const p = q?.regularMarketPrice;
        if (typeof p === 'number' && p > 0) {
            // Sanity-check: reject if >3× or <0.1× of Groww reference (likely wrong symbol)
            if (p > growwPrice * 0.1 && p < growwPrice * 3) {
                return Math.round(p * 100) / 100;
            }
        }
    } catch { /* fall through */ }
    return growwPrice;  // Groww-verified fallback
}

// ── SEED ───────────────────────────────────────────────────────────────────────
async function seed() {
    if (!process.env.DATABASE_URL) {
        console.error('✗ DATABASE_URL not set.');
        process.exit(1);
    }
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('✓ Connected to MongoDB\n');

    const del = await HoldingsModel.deleteMany({});
    console.log(`Cleared ${del.deletedCount} existing holdings\n`);

    console.log('Fetching prices (NSE via fallback to Groww-verified)…\n');
    const docs = [];
    for (const [symbol, , growwLtp, avgPrice, quantity, buyDate] of BASKET) {
        const ltp = await liveLtp(symbol, growwLtp);
        docs.push({
            stockSymbol: symbol,
            quantity,
            avgPrice,
            ltp,
            productType: 'CNC',
            createdAt: new Date(`${buyDate}T03:45:00.000Z`),
            updatedAt: new Date(),
        });
        await new Promise(r => setTimeout(r, 150));
    }

    await HoldingsModel.insertMany(docs, { timestamps: false });

    // ── VERIFY ─────────────────────────────────────────────────────────────────
    let inv = 0, cur = 0, win = 0, loss = 0;
    console.log(
        `${'SYMBOL'.padEnd(12)}${'QTY'.padStart(8)}${'BUY ₹'.padStart(10)}` +
        `${'LTP ₹'.padStart(10)}${'INVESTED'.padStart(14)}${'CURRENT'.padStart(13)}` +
        `${'P&L'.padStart(14)}${'%'.padStart(7)}`
    );
    console.log('─'.repeat(88));
    for (const d of docs) {
        const i = d.avgPrice * d.quantity, c = d.ltp * d.quantity, pnl = c - i;
        const pct = ((pnl / i) * 100).toFixed(1);
        inv += i; cur += c; pnl >= 0 ? win++ : loss++;
        console.log(
            `${d.stockSymbol.padEnd(12)}` +
            `${String(d.quantity).padStart(8)}` +
            `${d.avgPrice.toFixed(2).padStart(10)}` +
            `${d.ltp.toFixed(2).padStart(10)}` +
            `${Math.round(i).toLocaleString('en-IN').padStart(14)}` +
            `${Math.round(c).toLocaleString('en-IN').padStart(13)}` +
            `${Math.round(pnl).toLocaleString('en-IN').padStart(14)}` +
            `${pct.padStart(7)}%`
        );
    }
    const net = cur - inv;
    console.log('─'.repeat(88));
    console.log(`\nStocks   : ${docs.length}  (${win}↑ profit, ${loss}↓ loss)`);
    console.log(`Invested : ₹${Math.round(inv).toLocaleString('en-IN')}  (₹${(inv/1e7).toFixed(2)} Cr)`);
    console.log(`Current  : ₹${Math.round(cur).toLocaleString('en-IN')}  (₹${(cur/1e7).toFixed(2)} Cr)`);
    console.log(`Net P&L  : ₹${Math.round(net).toLocaleString('en-IN')}  (₹${(net/1e7).toFixed(2)} Cr, ${(net/inv*100).toFixed(1)}%)`);

    await mongoose.disconnect();
    console.log('\n✓ Done.');
}

seed().catch(e => { console.error('\n✗', e.message); process.exit(1); });
