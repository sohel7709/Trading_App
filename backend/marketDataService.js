'use strict';

const _yf2 = require('yahoo-finance2');
const _YF2 = _yf2.default || _yf2;
const yahooFinance = (typeof _YF2 === 'function') ? new _YF2({ suppressNotices: ['yahooSurvey'] }) : _YF2;
const liveDataService = require('./liveDataService');
const dhanDataService = require('./dhanDataService');
const candleDataService = require('./candleDataService');

// NSE symbols — used for Groww / Yahoo fallback
const NSE_STOCK_SYMBOLS = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
    'HINDUNILVR', 'KOTAKBANK', 'SBIN', 'BHARTIARTL', 'ITC',
    'LT', 'WIPRO', 'AXISBANK', 'SUNPHARMA', 'TATAMOTORS',
    'TITAN', 'ADANIENT', 'ADANIPORTS', 'NTPC', 'MARUTI',
    'POWERGRID', 'HCLTECH', 'TATASTEEL', 'ULTRACEMCO', 'ASIANPAINT',
    'BAJFINANCE', 'ONGC', 'JSWSTEEL', 'TECHM',
    'DIVISLAB', 'CIPLA', 'DRREDDY', 'GRASIM', 'HDFCLIFE',
    'SBILIFE', 'BPCL', 'BAJAJFINSV', 'TATAPOWER', 'KPITTECH',
    'COALINDIA', 'EICHERMOT', 'BRITANNIA', 'HEROMOTOCO', 'HINDALCO',
    'APOLLOHOSP', 'INDUSINDBK', 'SHREECEM', 'M&M', 'BAJAJ-AUTO',
    'UPL', 'AWL', 'BANDHANBNK', 'NYKAA', 'IEX', 'LTIM',
];

// Yahoo Finance format (fallback only)
const NSE_SYMBOLS = NSE_STOCK_SYMBOLS.map(s => s + '.NS');

// Index symbols for Yahoo Finance fallback
// Yahoo tickers verified live (yahoo-finance2 .quote()) against each index's
// real name before wiring in — NIFTY_MID_SELECT.NS, ^NSMIDCP and BSE-BANK.BO
// aren't guessable from convention alone.
const INDEX_SYMBOLS = [
    { symbol: '^NSEI',               name: 'NIFTY 50' },
    { symbol: '^NSEBANK',            name: 'BANK NIFTY' },
    { symbol: '^BSESN',              name: 'SENSEX' },
    { symbol: '^CNXIT',              name: 'NIFTY IT' },
    { symbol: 'NIFTY_FIN_SERVICE.NS',name: 'FINNIFTY' },
    { symbol: 'NIFTY_MID_SELECT.NS', name: 'MIDCPNIFTY' },
    { symbol: '^NSMIDCP',            name: 'NIFTY NEXT 50' },
    { symbol: 'BSE-BANK.BO',         name: 'BANKEX' },
];

// In-memory cache
let stockPrices = {};
let indexData   = {};
let lastUpdated = null;
let isFetching  = false;
let dataSource  = 'LOADING';

// Dynamic symbol universe — starts with the core basket, grows as users
// search / watchlist / trade any NSE share (scrip master covers all of NSE EQ).
const trackedSymbols = new Set(NSE_STOCK_SYMBOLS);

function trackSymbol(symbol) {
    const sym = String(symbol || '').toUpperCase().trim();
    if (!sym || trackedSymbols.has(sym)) return false;
    trackedSymbols.add(sym);
    console.log(`[Market] Now tracking ${sym} (${trackedSymbols.size} symbols)`);
    return true;
}

function getTrackedSymbols() {
    return [...trackedSymbols];
}

function yahooToNseSymbol(sym) {
    return sym.replace('.NS', '').replace('.BO', '');
}

// ─── Previous-close store ─────────────────────────────────────────────────────
// After market close Dhan's ohlc.close equals TODAY's close (same as ltp), so
// change/changePercent collapse to 0. We rebuild the real previous close from
// daily history candles, once per symbol per day.
const prevCloseStore = {};        // key -> { date, prevClose }
const prevCloseFetching = new Set();

function istDateStr() {
    const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`;
}

async function ensurePrevClose(key, isIndex = false) {
    const today = istDateStr();
    const hit = prevCloseStore[key];
    if (hit && hit.date === today) return hit.prevClose;
    if (prevCloseFetching.has(key)) return hit?.prevClose ?? null;

    prevCloseFetching.add(key);
    try {
        const candles = isIndex
            ? await candleDataService.generateIndexCandles(key, '1d')
            : await candleDataService.generateCandles(key, '1d');
        if (candles && candles.length >= 2) {
            const last = candles[candles.length - 1];
            const lastDate = new Date(last.time * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
            // If the last daily candle is today's, the previous close is the one before it
            const prevClose = lastDate === today ? candles[candles.length - 2].close : last.close;
            prevCloseStore[key] = { date: today, prevClose };
            return prevClose;
        }
    } catch { /* keep whatever we had */ }
    finally { prevCloseFetching.delete(key); }
    return hit?.prevClose ?? null;
}

// Repair change/changePercent on quotes where the source returned prevClose == ltp
async function repairChangeFields() {
    const stockFixes = Object.values(stockPrices)
        .filter(s => s.ltp > 0 && (!s.change || s.previousClose === s.ltp || !s.previousClose));
    const indexFixes = Object.entries(indexData)
        .filter(([, d]) => d.ltp > 0 && (!d.change || d.previousClose === d.ltp || !d.previousClose));

    // Limit concurrency — daily candles are cached 30 min, so this is cheap after warm-up
    const CONCURRENCY = 5;
    const tasks = [
        ...stockFixes.map(s => async () => {
            const pc = await ensurePrevClose(s.symbol, false);
            // Sanity: NSE circuit limit is 20% — a bigger "move" means the history
            // source tracks a different instrument (e.g. TATAMOTORS post-demerger)
            if (pc > 0 && pc !== s.ltp && Math.abs((s.ltp - pc) / pc) <= 0.2) {
                s.previousClose = pc;
                s.change        = Math.round((s.ltp - pc) * 100) / 100;
                s.changePercent = Math.round(((s.ltp - pc) / pc) * 10000) / 100;
            }
        }),
        ...indexFixes.map(([name, d]) => async () => {
            const pc = await ensurePrevClose(name, true);
            if (pc > 0 && pc !== d.ltp) {
                d.previousClose = pc;
                d.change        = Math.round((d.ltp - pc) * 100) / 100;
                d.changePercent = Math.round(((d.ltp - pc) / pc) * 10000) / 100;
            }
        }),
    ];
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
        await Promise.allSettled(tasks.slice(i, i + CONCURRENCY).map(t => t()));
    }
    if (tasks.length > 0) {
        console.log(`[Market] Repaired change%% via daily history: ${stockFixes.length} stocks, ${indexFixes.length} indices`);
    }
}

async function fetchQuote(symbol) {
    try {
        const quote = await yahooFinance.quote(symbol, {}, { validateResult: false });
        if (!quote || !quote.regularMarketPrice) return null;
        return {
            symbol:        yahooToNseSymbol(symbol),
            ltp:           quote.regularMarketPrice,
            open:          quote.regularMarketOpen || 0,
            high:          quote.regularMarketDayHigh || 0,
            low:           quote.regularMarketDayLow || 0,
            previousClose: quote.regularMarketPreviousClose || 0,
            volume:        quote.regularMarketVolume || 0,
            change:        Math.round((quote.regularMarketChange || 0) * 100) / 100,
            changePercent: Math.round((quote.regularMarketChangePercent || 0) * 100) / 100,
            high52w:       quote.fiftyTwoWeekHigh || 0,
            low52w:        quote.fiftyTwoWeekLow  || 0,
            currency:      quote.currency || 'INR',
            source:        'YAHOO_LIVE',
        };
    } catch (err) {
        console.log(`[Market] fetchQuote(${symbol}) err: ${err.message?.slice(0, 80)}`);
        return null;
    }
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

async function fetchAllStockPrices() {
    if (isFetching) return;
    isFetching = true;

    try {
        let gotLiveStocks  = false;
        let gotLiveIndexes = false;

        // ── Step 0: Dhan — stocks + indices (primary source) ──────────────────
        if (dhanDataService.isConfigured()) {
            // Stocks via full quote (OHLC + 52W)
            try {
                const dhanData = await dhanDataService.fetchDhanStockQuotes(getTrackedSymbols());
                if (Object.keys(dhanData).length > 0) {
                    for (const [sym, d] of Object.entries(dhanData)) {
                        stockPrices[sym] = d;
                    }
                    gotLiveStocks = true;
                    console.log(`[Market] Dhan stocks: ${Object.keys(dhanData).length}`);
                }
            } catch (e) {
                console.warn('[Market] Dhan stock fetch error:', e.message);
            }

            // Indices via IDX_I segment — spaced out to respect Dhan's 1 req/s
            // quote-API rate limit (back-to-back calls intermittently 429)
            await new Promise(r => setTimeout(r, 1100));
            try {
                const dhanIdx = await dhanDataService.fetchDhanIndices();
                if (Object.keys(dhanIdx).length > 0) {
                    for (const [name, d] of Object.entries(dhanIdx)) {
                        indexData[name] = d;
                    }
                    gotLiveIndexes = true;
                }
            } catch (e) {
                console.warn('[Market] Dhan index fetch error:', e.message);
            }
        }

        // ── Step 1: NSE (indices) + Groww stocks — if Dhan didn't cover them ──
        const needGroww = !gotLiveStocks;
        const live = await liveDataService.fetchLiveMarketData(
            needGroww ? getTrackedSymbols() : []
        );

        if (needGroww && live.stockData && Object.keys(live.stockData).length > 0) {
            for (const [sym, d] of Object.entries(live.stockData)) {
                stockPrices[sym] = d;
            }
            gotLiveStocks = true;
            console.log(`[Market] Groww stocks: ${Object.keys(live.stockData).length}`);
        }

        if (!gotLiveIndexes && live.indexData && Object.keys(live.indexData).length > 0) {
            for (const [name, d] of Object.entries(live.indexData)) {
                indexData[name] = d;
            }
            gotLiveIndexes = true;
            console.log(`[Market] NSE indices: ${Object.keys(live.indexData).length}`);
        }

        // ── Step 2: Yahoo Finance fallback for stocks ──────────────────────────
        if (!gotLiveStocks) {
            console.log('[Market] Dhan+Groww failed, trying Yahoo Finance…');
            let ok = false;
            const batchSize = 10;
            const yahooSyms = getTrackedSymbols().map(s => s + '.NS');
            for (let i = 0; i < yahooSyms.length; i += batchSize) {
                const batch = yahooSyms.slice(i, i + batchSize);
                const res = await Promise.allSettled(batch.map(s => fetchQuote(s)));
                res.forEach(r => {
                    if (r.status === 'fulfilled' && r.value && r.value.ltp > 0) {
                        stockPrices[r.value.symbol] = r.value;
                        ok = true;
                    }
                });
                if (i + batchSize < yahooSyms.length) {
                    await new Promise(r => setTimeout(r, 300));
                }
            }
            if (ok) {
                gotLiveStocks = true;
                console.log('[Market] Yahoo Finance stocks: OK');
            }
        }

        // ── Step 3: Yahoo Finance fallback for missing indices ─────────────────
        const LIVE_SOURCES = new Set(['NSE_LIVE', 'YAHOO_LIVE', 'DHAN_LIVE']);
        const missingIdx = INDEX_SYMBOLS.filter(
            i => !indexData[i.name] || !LIVE_SOURCES.has(indexData[i.name]?.source)
        );
        if (missingIdx.length > 0) {
            const idxRes = await Promise.allSettled(missingIdx.map(i => fetchQuote(i.symbol)));
            idxRes.forEach((r, i) => {
                if (r.status === 'fulfilled' && r.value && r.value.ltp > 0) {
                    indexData[missingIdx[i].name] = {
                        ...r.value,
                        name:   missingIdx[i].name,
                        source: 'YAHOO_LIVE',
                    };
                    gotLiveIndexes = true;
                    console.log(`[Market] Yahoo index: ${missingIdx[i].name} = ${r.value.ltp}`);
                }
            });
        }

        dataSource = dhanDataService.isConfigured() && gotLiveStocks && gotLiveIndexes
            ? 'DHAN_LIVE'
            : gotLiveStocks && gotLiveIndexes ? 'NSE+GROWW'
            : gotLiveStocks  ? 'STOCKS_ONLY'
            : gotLiveIndexes ? 'INDEX_ONLY'
            : Object.keys(stockPrices).length > 0 ? 'YAHOO'
            : 'NO_DATA';

        // Fix zeroed change% (Dhan reports prevClose == ltp after market close)
        await repairChangeFields();

        lastUpdated = new Date().toISOString();
        console.log(`[Market] source: ${dataSource} | stocks: ${Object.keys(stockPrices).length} | idx: ${Object.keys(indexData).length}`);
    } catch (err) {
        console.error('[Market] fetchAllStockPrices error:', err.message);
    } finally {
        isFetching = false;
    }
}

// ─── Fast LTP-only refresh (called every 2s during market hours) ──────────────
async function fastRefresh() {
    if (!dhanDataService.isConfigured()) return;
    try {
        const ltps = await dhanDataService.fetchDhanLTPAll(getTrackedSymbols());
        for (const [key, val] of Object.entries(ltps)) {
            if (key.startsWith('__IDX__')) {
                const name = key.replace('__IDX__', '');
                if (indexData[name]) {
                    indexData[name].ltp = val.ltp;
                }
            } else if (stockPrices[key]) {
                const old = stockPrices[key];
                const change    = val.ltp - (old.previousClose || old.ltp);
                const chgPct    = old.previousClose > 0 ? (change / old.previousClose) * 100 : 0;
                stockPrices[key] = {
                    ...old,
                    ltp:           val.ltp,
                    change:        Math.round(change * 100) / 100,
                    changePercent: Math.round(chgPct  * 100) / 100,
                };
            } else {
                stockPrices[key] = { symbol: key, ltp: val.ltp, source: 'DHAN_LIVE' };
            }
        }
        lastUpdated = new Date().toISOString();
    } catch (e) {
        console.warn('[Market] fastRefresh error:', e.message);
    }
}

function getDataSource()   { return dataSource; }
function getStockPrices()  { return stockPrices; }
function getIndexData()    { return indexData; }
function getLastUpdated()  { return lastUpdated; }

function getMarketMovers() {
    const stocks = Object.values(stockPrices)
        .filter(s => s.changePercent !== 0)
        .sort((a, b) => b.changePercent - a.changePercent);
    return {
        gainers:    stocks.filter(s => s.changePercent > 0).slice(0, 5),
        losers:     stocks.filter(s => s.changePercent < 0)
                          .sort((a, b) => a.changePercent - b.changePercent).slice(0, 5),
        mostActive: [...stocks].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 5),
    };
}

function getStockPrice(symbol) {
    return stockPrices[symbol.toUpperCase()] || null;
}

// ─── Option chain (calculated from live index price) ─────────────────────────

// Expiry schedule per SEBI/NSE/BSE rules effective since Sep 2025:
// only NIFTY (Tue) and SENSEX (Thu) keep weekly expiries; all other index
// derivatives moved to monthly expiry on their exchange's expiry weekday.
// atmPremium = typical ATM premium for the nearest weekly/monthly expiry.
// Real, currently-listed index derivatives only (NIFTY IT has no F&O contract
// on NSE — it's tracked for its index price/chart elsewhere, just not here).
// NSE: NIFTY 50, BANK NIFTY, FINNIFTY, MIDCPNIFTY, NIFTY NEXT 50.
// BSE: SENSEX, BANKEX.
const OPTION_CONFIG = {
    'NIFTY 50':      { strikeGap: 50,  atmPremium: 120, weeklyExpiry: true,  expiryDay: 2 }, // Tuesday
    'BANK NIFTY':    { strikeGap: 100, atmPremium: 280, weeklyExpiry: false, expiryDay: 2 }, // last Tuesday
    'SENSEX':        { strikeGap: 100, atmPremium: 350, weeklyExpiry: true,  expiryDay: 4 }, // Thursday
    'FINNIFTY':       { strikeGap: 50,  atmPremium: 80,  weeklyExpiry: false, expiryDay: 4 }, // last Thursday
    'MIDCPNIFTY':    { strikeGap: 25,  atmPremium: 70,  weeklyExpiry: false, expiryDay: 4 }, // last Thursday
    'NIFTY NEXT 50': { strikeGap: 100, atmPremium: 250, weeklyExpiry: false, expiryDay: 4 }, // last Thursday
    'BANKEX':        { strikeGap: 100, atmPremium: 280, weeklyExpiry: false, expiryDay: 2 }, // last Tuesday (BSE)
};

function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "Now" in IST regardless of server timezone
function istNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function getExpiryDates(indexName) {
    const cfg = OPTION_CONFIG[indexName] || OPTION_CONFIG['NIFTY 50'];
    const expiries = [];
    const nowIst = istNow();
    // Today's expiry stays tradeable until 15:30 IST
    const includeToday = nowIst.getHours() * 60 + nowIst.getMinutes() <= 15 * 60 + 30;
    const today = new Date(nowIst);
    today.setHours(0, 0, 0, 0);

    if (cfg.weeklyExpiry) {
        const cur = new Date(today);
        if (!includeToday) cur.setDate(cur.getDate() + 1);
        while (expiries.length < 5) {
            if (cur.getDay() === cfg.expiryDay) expiries.push(localDateStr(cur));
            cur.setDate(cur.getDate() + 1);
        }
    } else {
        for (let m = 0; m < 5 && expiries.length < 4; m++) {
            const month = new Date(today.getFullYear(), today.getMonth() + m + 1, 0);
            while (month.getDay() !== cfg.expiryDay) month.setDate(month.getDate() - 1);
            if (month > today || (month.getTime() === today.getTime() && includeToday)) {
                expiries.push(localDateStr(month));
            }
        }
    }
    return expiries;
}

// Days until expiry (fractional), floored at expiry-day close
function daysToExpiry(expiry) {
    if (!expiry) return 7;
    const end = new Date(expiry + 'T15:30:00');
    const diff = (end - istNow()) / 86400000;
    return Math.max(0.02, diff);
}

function calcOptionPrice(type, indexPrice, strike, atmPremium, strikeGap, dte) {
    const intrinsic = type === 'CE' ? Math.max(0, indexPrice - strike) : Math.max(0, strike - indexPrice);
    const stepsFromATM = Math.abs(strike - indexPrice) / strikeGap;
    const decay = Math.exp(-stepsFromATM * 0.25);
    // Time value scales with sqrt(time) like Black-Scholes ATM premium;
    // atmPremium is calibrated to a ~7-day expiry.
    const timeScale = Math.sqrt((dte ?? 7) / 7);
    const timeValue = Math.max(0.5, atmPremium * decay * timeScale);
    const noise = (Math.random() - 0.5) * (timeValue * 0.1);
    return Math.max(0.05, Math.round((intrinsic + timeValue + noise) * 100) / 100);
}

function generateOptionChainForIndex(indexName, expiry) {
    const idxEntry = indexData[indexName];
    const indexPrice = idxEntry ? idxEntry.ltp : 24000;
    const cfg = OPTION_CONFIG[indexName] || OPTION_CONFIG['NIFTY 50'];
    const { strikeGap, atmPremium } = cfg;
    const expiries = getExpiryDates(indexName);
    // Default to the nearest expiry; accept any explicit expiry (needed for
    // settlement pricing of past-dated contracts and Dhan expiry dates)
    const resolvedExpiry = expiry || expiries[0];
    const dte = daysToExpiry(resolvedExpiry);
    const atmStrike = Math.round(indexPrice / strikeGap) * strikeGap;
    const rows = [];

    for (let i = -12; i <= 12; i++) {
        const strike = atmStrike + i * strikeGap;
        const stepsFromATM = Math.abs(i);
        const iv = Math.round((14 + stepsFromATM * 0.4 + Math.random() * 1.5) * 100) / 100;
        const ceLtp = calcOptionPrice('CE', indexPrice, strike, atmPremium, strikeGap, dte);
        const peLtp = calcOptionPrice('PE', indexPrice, strike, atmPremium, strikeGap, dte);
        const oiBase = Math.round((5000000 - stepsFromATM * 200000) * (0.8 + Math.random() * 0.4));
        rows.push({
            strike,
            isATM: i === 0,
            ce: {
                oi: Math.max(100000, oiBase + Math.floor(Math.random() * 500000)),
                oiChange: Math.floor((Math.random() - 0.3) * 300000),
                volume: Math.floor(Math.random() * 150000) + 10000,
                iv, ltp: ceLtp,
                change: Math.round((Math.random() - 0.5) * ceLtp * 0.3 * 100) / 100,
                delta: Math.max(0, Math.min(1, Math.round((0.5 - i * 0.07) * 100) / 100)),
            },
            pe: {
                oi: Math.max(100000, oiBase + Math.floor(Math.random() * 500000)),
                oiChange: Math.floor((Math.random() - 0.3) * 300000),
                volume: Math.floor(Math.random() * 150000) + 10000,
                iv, ltp: peLtp,
                change: Math.round((Math.random() - 0.5) * peLtp * 0.3 * 100) / 100,
                delta: Math.max(-1, Math.min(0, Math.round((-0.5 + i * 0.07) * 100) / 100)),
            },
        });
    }

    return {
        indexName, indexPrice,
        expiry: resolvedExpiry,
        daysToExpiry: Math.round(dte * 100) / 100,
        indexChange:        idxEntry?.change ?? 0,
        indexChangePercent: idxEntry?.changePercent ?? 0,
        expiries,
        atmStrike, rows,
        lastUpdated: new Date().toISOString(),
    };
}

// ─── Live option chain (Dhan primary, synthetic fallback) ────────────────────
// Dhan's option-chain API is rate-limited (~1 req / 3s per underlying), so
// results are cached for 3s and concurrent callers share one in-flight request.
const optionChainCache = {};      // `${index}|${expiry}` -> { at, data }
const expiryListCache  = {};      // index -> { at, list }
const chainInflight    = new Map();

async function getOptionExpiries(indexName) {
    const hit = expiryListCache[indexName];
    if (hit && Date.now() - hit.at < 10 * 60e3) return hit.list;

    const secId = dhanDataService.INDEX_SECURITY_IDS[indexName];
    if (secId) {
        const list = await dhanDataService.fetchDhanExpiryList(secId);
        if (list && list.length > 0) {
            expiryListCache[indexName] = { at: Date.now(), list };
            return list;
        }
    }
    return getExpiryDates(indexName); // calculated fallback
}

async function getOptionChain(indexName, expiry) {
    const expiries = await getOptionExpiries(indexName);
    const resolvedExpiry = expiry && expiries.includes(expiry) ? expiry : expiries[0];
    const key = `${indexName}|${resolvedExpiry}`;

    const hit = optionChainCache[key];
    if (hit && Date.now() - hit.at < 3000) return hit.data;
    if (chainInflight.has(key)) return chainInflight.get(key);

    const p = (async () => {
        let data = null;
        const secId = dhanDataService.INDEX_SECURITY_IDS[indexName];
        if (secId) {
            const dhan = await dhanDataService.fetchDhanOptionChain(secId, resolvedExpiry);
            if (dhan && dhan.rows.length > 0) {
                const cfg = OPTION_CONFIG[indexName] || OPTION_CONFIG['NIFTY 50'];
                const indexPrice = dhan.underlyingPrice || indexData[indexName]?.ltp || 0;
                const atmStrike = Math.round(indexPrice / cfg.strikeGap) * cfg.strikeGap;
                const rows = dhan.rows.map(r => ({ ...r, isATM: r.strike === atmStrike }));
                // Window to ±15 strikes around ATM — full NFO chains are huge
                let atmIdx = rows.findIndex(r => r.strike >= atmStrike);
                if (atmIdx < 0) atmIdx = Math.floor(rows.length / 2);
                const windowed = rows.slice(Math.max(0, atmIdx - 15), Math.min(rows.length, atmIdx + 16));
                data = {
                    indexName, indexPrice,
                    expiry: resolvedExpiry,
                    daysToExpiry: Math.round(daysToExpiry(resolvedExpiry) * 100) / 100,
                    indexChange:        indexData[indexName]?.change ?? 0,
                    indexChangePercent: indexData[indexName]?.changePercent ?? 0,
                    expiries,
                    atmStrike,
                    rows: windowed,
                    source: 'DHAN_LIVE',
                    lastUpdated: new Date().toISOString(),
                };
            }
        }
        if (!data) {
            data = generateOptionChainForIndex(indexName, resolvedExpiry);
            data.expiries = expiries;
            data.source = 'SIMULATED';
        }
        optionChainCache[key] = { at: Date.now(), data };
        return data;
    })().finally(() => chainInflight.delete(key));

    chainInflight.set(key, p);
    return p;
}

// Live premium for one contract — served from the shared chain cache
async function getOptionLTP(indexName, strikePrice, optionType, expiry) {
    try {
        const chain = await getOptionChain(indexName, expiry);
        const row = chain?.rows?.find(r => r.strike === Number(strikePrice));
        return row ? (optionType === 'CE' ? row.ce.ltp : row.pe.ltp) : null;
    } catch { return null; }
}

module.exports = {
    fetchAllStockPrices,
    fastRefresh,
    getOptionChain,
    getOptionExpiries,
    getOptionLTP,
    getStockPrices,
    getIndexData,
    getLastUpdated,
    getMarketMovers,
    getStockPrice,
    getDataSource,
    generateOptionChainForIndex,
    getExpiryDates,
    trackSymbol,
    getTrackedSymbols,
    NSE_SYMBOLS,
    NSE_STOCK_SYMBOLS,
    INDEX_SYMBOLS,
};
