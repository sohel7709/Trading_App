'use strict';

const _yf2 = require('yahoo-finance2');
const _YF2 = _yf2.default || _yf2;
const yahooFinance = (typeof _YF2 === 'function') ? new _YF2({ suppressNotices: ['yahooSurvey'] }) : _YF2;
const liveDataService = require('./liveDataService');
const dhanDataService = require('./dhanDataService');

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
const INDEX_SYMBOLS = [
    { symbol: '^NSEI',               name: 'NIFTY 50' },
    { symbol: '^NSEBANK',            name: 'BANK NIFTY' },
    { symbol: '^BSESN',              name: 'SENSEX' },
    { symbol: '^CNXIT',              name: 'NIFTY IT' },
    { symbol: 'NIFTY_FIN_SERVICE.NS',name: 'FINNIFTY' },
];

// In-memory cache
let stockPrices = {};
let indexData   = {};
let lastUpdated = null;
let isFetching  = false;
let dataSource  = 'LOADING';

function yahooToNseSymbol(sym) {
    return sym.replace('.NS', '').replace('.BO', '');
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
            change:        quote.regularMarketChange || 0,
            changePercent: quote.regularMarketChangePercent || 0,
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
                const dhanData = await dhanDataService.fetchDhanStockQuotes(NSE_STOCK_SYMBOLS);
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

            // Indices via IDX_I segment
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
            needGroww ? NSE_STOCK_SYMBOLS : []
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
            for (let i = 0; i < NSE_SYMBOLS.length; i += batchSize) {
                const batch = NSE_SYMBOLS.slice(i, i + batchSize);
                const res = await Promise.allSettled(batch.map(s => fetchQuote(s)));
                res.forEach(r => {
                    if (r.status === 'fulfilled' && r.value && r.value.ltp > 0) {
                        stockPrices[r.value.symbol] = r.value;
                        ok = true;
                    }
                });
                if (i + batchSize < NSE_SYMBOLS.length) {
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
        const ltps = await dhanDataService.fetchDhanLTPAll(NSE_STOCK_SYMBOLS);
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

const OPTION_CONFIG = {
    'NIFTY 50':   { strikeGap: 50,  atmPremium: 120, weeklyExpiry: true,  expiryDay: 4 },
    'BANK NIFTY': { strikeGap: 100, atmPremium: 280, weeklyExpiry: true,  expiryDay: 3 },
    'SENSEX':     { strikeGap: 100, atmPremium: 350, weeklyExpiry: true,  expiryDay: 5 },
    'FINNIFTY':   { strikeGap: 50,  atmPremium: 80,  weeklyExpiry: true,  expiryDay: 2 },
    'NIFTY IT':   { strikeGap: 50,  atmPremium: 90,  weeklyExpiry: false, expiryDay: 4 },
    'MIDCPNIFTY': { strikeGap: 25,  atmPremium: 60,  weeklyExpiry: true,  expiryDay: 1 },
};

function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getExpiryDates(indexName) {
    const cfg = OPTION_CONFIG[indexName] || OPTION_CONFIG['NIFTY 50'];
    const expiries = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (cfg.weeklyExpiry) {
        const cur = new Date(today);
        cur.setDate(cur.getDate() + 1);
        while (expiries.length < 5) {
            if (cur.getDay() === cfg.expiryDay) expiries.push(localDateStr(cur));
            cur.setDate(cur.getDate() + 1);
        }
    } else {
        for (let m = 0; m < 4; m++) {
            const month = new Date(today.getFullYear(), today.getMonth() + m + 1, 0);
            while (month.getDay() !== cfg.expiryDay) month.setDate(month.getDate() - 1);
            if (month >= today) expiries.push(localDateStr(month));
        }
    }
    return expiries;
}

function calcOptionPrice(type, indexPrice, strike, atmPremium, strikeGap) {
    const intrinsic = type === 'CE' ? Math.max(0, indexPrice - strike) : Math.max(0, strike - indexPrice);
    const stepsFromATM = Math.abs(strike - indexPrice) / strikeGap;
    const decay = Math.exp(-stepsFromATM * 0.25);
    const timeValue = Math.max(0.5, atmPremium * decay);
    const noise = (Math.random() - 0.5) * (timeValue * 0.1);
    return Math.max(0.05, Math.round((intrinsic + timeValue + noise) * 100) / 100);
}

function generateOptionChainForIndex(indexName, expiry) {
    const idxEntry = indexData[indexName];
    const indexPrice = idxEntry ? idxEntry.ltp : 24000;
    const cfg = OPTION_CONFIG[indexName] || OPTION_CONFIG['NIFTY 50'];
    const { strikeGap, atmPremium } = cfg;
    const atmStrike = Math.round(indexPrice / strikeGap) * strikeGap;
    const rows = [];

    for (let i = -12; i <= 12; i++) {
        const strike = atmStrike + i * strikeGap;
        const stepsFromATM = Math.abs(i);
        const iv = Math.round((14 + stepsFromATM * 0.4 + Math.random() * 1.5) * 100) / 100;
        const ceLtp = calcOptionPrice('CE', indexPrice, strike, atmPremium, strikeGap);
        const peLtp = calcOptionPrice('PE', indexPrice, strike, atmPremium, strikeGap);
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
        indexName, indexPrice, expiry,
        expiries:  getExpiryDates(indexName),
        atmStrike, rows,
        lastUpdated: new Date().toISOString(),
    };
}

module.exports = {
    fetchAllStockPrices,
    fastRefresh,
    getStockPrices,
    getIndexData,
    getLastUpdated,
    getMarketMovers,
    getStockPrice,
    getDataSource,
    generateOptionChainForIndex,
    getExpiryDates,
    NSE_SYMBOLS,
    NSE_STOCK_SYMBOLS,
    INDEX_SYMBOLS,
};
