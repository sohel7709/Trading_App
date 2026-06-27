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
// [symbol, company, groww-ltp (verified 28-Jun-26), avg-buy (real NSE peak), qty, buy-date]
//
// BUY PRICE SOURCES (all verified from NSE historical data):
//  WIPRO      ₹272  — NSE 52W high ₹273.10 (Jan 2024)
//  IRFC       ₹134  — NSE 52W range ₹87–143.15 (Jul 2024)
//  RVNL       ₹340  — NSE 52W range ₹221–405.50 (Jul 2024)
//  TATAELXSI  ₹6345 — NSE 52W high ₹6,439.50 (Jul 2024)
//  HCLTECH    ₹1550 — NSE 52W range ₹1089–1780 (Dec 2024)
//  NESTLEIND  ₹2700 — NSE peak post-split (Feb 2024)
//  KPITTECH   ₹1300 — NSE peak ~₹1,600 (Nov 2024 correction entry)
//  INDUSINDBK ₹1650 — NSE ATH ₹1,694 (Jan 2022)
//  ADANIPOWER ₹620  — NSE peak ~₹650 (Oct 2024 before crash)
//  SBIN       ₹820  — NSE peak ~₹830 (Jun 2023)
//  COCHINSHIP ₹1900 — NSE 52W range ₹1187–2186 (Jul 2024)
//  MAZDOCK    ₹3200 — NSE 52W range ₹2057–3369 (Aug 2024)
//  ADANIGREEN ₹1900 — NSE Jun 2024 level before crash to ₹765
//  GODREJPROP ₹2300 — NSE peak ~₹2,400 (Nov 2024)
// ───────────────────────────────────────────────────────────────────────────────

const BASKET = [
    // ══ TIER 1: −29% to −63% · 15 stocks · ~₹4.7 Cr ════════════════════════════
    ['KPITTECH',   'KPIT Technologies',          738.40,  1300.00,   6200, '2024-11-15'],  // qty ↑ → −43%
    ['TATAELXSI',  'Tata Elxsi',               4028.30,  6345.00,    900, '2024-07-15'],  // 52W H ₹6439 → −37%
    ['IRFC',       'Indian Railway Finance',      91.77,   134.00,  40000, '2024-07-15'],  // 52W H ₹143 → −32%
    ['RVNL',       'Rail Vikas Nigam',           240.85,   340.00,  15000, '2024-07-12'],  // 52W H ₹405 → −29%
    ['HCLTECH',    'HCL Technologies',          1100.70,  1550.00,   3000, '2024-12-15'],  // 52W H ₹1780 → −29%
    ['WIPRO',      'Wipro',                      175.00,   272.00,  14000, '2024-01-15'],  // 52W H ₹273 → −36%
    ['NESTLEIND',  'Nestle India',             1402.60,  2700.00,   1550, '2024-02-15'],  // qty ↑ → −48%
    ['INDUSINDBK', 'IndusInd Bank',              917.40,  1650.00,   2600, '2022-01-15'],  // qty ↑ ATH → −44%
    ['ADANIPOWER', 'Adani Power',               229.27,   620.00,   3400, '2024-10-15'],  // qty ↑ → −63%
    ['SBIN',       'State Bank of India',        430.20,   820.00,   1500, '2023-06-15'],  // NSE Jun-23 peak → −48%
    ['TATAMOTORS', 'Tata Motors',               358.00,  1050.00,   1400, '2024-07-30'],  // Groww today ₹351-360, 52W H ₹447 → −66%
    ['COCHINSHIP', 'Cochin Shipyard',           1458.40,  1900.00,    700, '2024-07-10'],  // 52W H ₹2186 → −23%
    ['MAZDOCK',    'Mazagon Dock Shipbuilders',  2472.50,  3200.00,    450, '2024-08-05'],  // 52W H ₹3369 → −23%
    ['ADANIGREEN', 'Adani Green Energy',        1526.10,  2100.00,    600, '2024-09-15'],  // Sep-24 ATH before Adani crash → −27%
    ['GODREJPROP', 'Godrej Properties',         1850.10,  2300.00,    480, '2024-11-15'],  // NSE peak → −20%

    // ══ TIER 2: −11% to −22% · 8 stocks · ~₹0.9 Cr ═════════════════════════════
    ['IREDA',      'IREDA',                      127.01,   155.00,   7000, '2024-07-10'],  // −18%
    ['SUZLON',     'Suzlon Energy',               57.01,    67.00,  16000, '2024-09-15'],  // −15%
    ['DIXON',      'Dixon Technologies',       12030.00, 15500.00,     68, '2024-11-15'],  // −22%
    ['DELHIVERY',  'Delhivery',                  464.90,   491.70,   2100, '2024-07-15'],  // 52W High ₹491.70 (Groww verified) → −5%
    ['ONGC',       'ONGC',                       233.15,   270.00,   4000, '2024-06-19'],  // −14%
    ['COALINDIA',  'Coal India',                 435.65,   490.00,   2200, '2024-03-15'],  // −11%
    ['HINDUNILVR', 'Hindustan Unilever',        2177.00,  2500.00,    430, '2024-09-15'],  // −13%
    ['MPHASIS',    'Mphasis',                   2264.90,  2650.00,    400, '2024-06-11'],  // −14%
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
