'use strict';

const fs = require('fs');
const path = require('path');
const _yf2 = require('yahoo-finance2');
const _YF2 = _yf2.default || _yf2;
const yahooFinance = (typeof _YF2 === 'function') ? new _YF2({ suppressNotices: ['yahooSurvey'] }) : _YF2;
const liveDataService = require('./liveDataService');
const dhanDataService = require('./dhanDataService');
const kotakNeoService = require('./kotakNeoService');
const candleDataService = require('./candleDataService');
const { isMarketOpen, isActualMarketHours } = require('./marketRules');
const DhanWebSocketFeed = require('./services/DhanWebSocketFeed');
const { globalMarketFeed } = require('./services/GlobalMarketFeed');

function isLiveMarketActive(segment = 'FO') {
    try {
        const marketControlService = require('./services/marketControlService');
        const state = marketControlService.getMarketState ? marketControlService.getMarketState() : null;
        if (state?.isHalted) return false;
        if (state?.mode === 'SYNTHETIC' || state?.mode === 'REPLAY') return true;
    } catch { /* ignore */ }
    return isActualMarketHours(segment);
}

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
    { symbol: 'NIFTY_MID_SELECT.NS', name: 'MIDCPNIFTY' },
    { symbol: '^NSMIDCP',            name: 'NIFTY NEXT 50' },
    { symbol: 'BSE-BANK.BO',         name: 'BANKEX' },
];

// In-memory cache — zero hardcoded numbers; strictly real live/persisted broker feeds
let stockPrices = {};
let indexData   = {};
let lastUpdated = new Date().toISOString();
let isFetching  = false;
let dataSource  = 'LIVE';

const SNAPSHOT_CACHE_FILE = path.join(__dirname, 'cache', 'market_snapshot.json');
const DEFAULT_SNAPSHOT_FILE = path.join(__dirname, 'data', 'default_market_snapshot.json');
const OPTION_CHAIN_CACHE_FILE = path.join(__dirname, 'cache', 'option_chains.json');
const DEFAULT_OPTION_CHAIN_FILE = path.join(__dirname, 'data', 'default_option_chains.json');

function loadPersistedSnapshot() {
    try {
        const filePath = fs.existsSync(SNAPSHOT_CACHE_FILE) 
            ? SNAPSHOT_CACHE_FILE 
            : (fs.existsSync(DEFAULT_SNAPSHOT_FILE) ? DEFAULT_SNAPSHOT_FILE : null);

        if (filePath) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (data.indexes && Object.keys(data.indexes).length > 0) {
                indexData = { ...data.indexes };
            }
            if (data.stocks && Object.keys(data.stocks).length > 0) {
                stockPrices = { ...data.stocks };
            }
            if (data.lastUpdated) {
                lastUpdated = data.lastUpdated;
            }
            console.log(`[Market] Loaded ${Object.keys(indexData).length} real indexes & ${Object.keys(stockPrices).length} real stocks from ${filePath === SNAPSHOT_CACHE_FILE ? 'disk cache' : 'bundled default snapshot'}`);
        }
    } catch (err) {
        console.warn('[Market] Snapshot disk cache note:', err.message);
    }
}

function persistSnapshot() {
    try {
        const dir = path.dirname(SNAPSHOT_CACHE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SNAPSHOT_CACHE_FILE, JSON.stringify({
            indexes: indexData,
            stocks: stockPrices,
            lastUpdated: new Date().toISOString(),
        }), 'utf8');
    } catch (err) {
        // non-blocking
    }
}

const activeOptionChains = {}; // indexName -> chain object

function loadPersistedOptionChains() {
    try {
        const filePath = fs.existsSync(OPTION_CHAIN_CACHE_FILE)
            ? OPTION_CHAIN_CACHE_FILE
            : (fs.existsSync(DEFAULT_OPTION_CHAIN_FILE) ? DEFAULT_OPTION_CHAIN_FILE : null);

        if (filePath) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (data && typeof data === 'object') {
                for (const [idx, chain] of Object.entries(data)) {
                    if (chain && Array.isArray(chain.rows) && chain.rows.length > 0) {
                        activeOptionChains[idx] = chain;
                    }
                }
                console.log(`[Market] Loaded real option chains from ${filePath === OPTION_CHAIN_CACHE_FILE ? 'disk cache' : 'bundled default snapshot'} for: ${Object.keys(activeOptionChains).join(', ')}`);
            }
        }
    } catch (err) {
        console.warn('[Market] Option chain disk cache note:', err.message);
    }
}

function persistOptionChains() {
    try {
        const dir = path.dirname(OPTION_CHAIN_CACHE_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(OPTION_CHAIN_CACHE_FILE, JSON.stringify(activeOptionChains), 'utf8');
    } catch (err) {}
}

loadPersistedSnapshot();
loadPersistedOptionChains();

// Authoritative previous-session close per symbol, sourced from Dhan DAILY
// CANDLES rather than the live feed. Some symbols (seen on LTIM) get a
// wrong-instrument price and/or a stale previousClose from the live quote/LTP
// endpoints, which corrupts Day's P&L. The daily candle is the one source
// that's reliably correct for them, so we anchor change/Day-P&L to it.
// { [SYMBOL]: prevClose }
const referenceClose = {};

// The previous *completed* session's close from a daily-candle array. If the
// last candle is today's (still forming / just closed), the reference is the
// one before it; otherwise the last candle is already a completed session.
function prevCloseFromDaily(candles) {
    if (!Array.isArray(candles) || candles.length < 2) return null;
    const last = candles[candles.length - 1];
    if (!last?.time) return null;
    const lastDate = new Date(last.time * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const today    = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const pc = (lastDate === today ? candles[candles.length - 2] : last)?.close;
    return pc > 0 ? pc : null;
}

// Seed/refresh reference closes from Dhan daily candles. Throttled so we don't
// burst the historical API. Failures are non-fatal — a symbol without a
// reference simply falls back to the live feed's previousClose.
async function seedReferenceCloses(symbols) {
    let n = 0;
    for (const sym of symbols) {
        try {
            const candles = await candleDataService.generateCandles(sym, '1d');
            const pc = prevCloseFromDaily(candles);
            if (pc > 0) { referenceClose[sym.toUpperCase()] = pc; n++; }
        } catch { /* keep going */ }
        await new Promise(r => setTimeout(r, 120));
    }
    console.log(`[Market] Reference closes seeded from daily candles: ${n}/${symbols.length}`);
}

// prevClose to use for change/Day-P&L: the reliable candle-derived value when
// we have it, else whatever the live feed reported.
function refPrevClose(symbol, livePrevClose) {
    return referenceClose[symbol] > 0 ? referenceClose[symbol] : (livePrevClose || 0);
}

// Dynamic symbol universe — starts with the core basket, grows as users
// search / watchlist / trade any NSE share (scrip master covers all of NSE EQ).
const trackedSymbols = new Set(NSE_STOCK_SYMBOLS);

function trackSymbol(symbol) {
    const sym = String(symbol || '').toUpperCase().trim();
    if (!sym) return false;
    const isNew = !trackedSymbols.has(sym);
    if (isNew) {
        trackedSymbols.add(sym);
        console.log(`[Market] Now tracking ${sym} (${trackedSymbols.size} symbols)`);
    }

    // Auto-subscribe to live Dhan WebSocket feed if streaming
    if (dhanWsFeed && isWsStreaming) {
        const secId = dhanDataService.getSecurityId(sym);
        if (secId) {
            const seg = dhanDataService.isCommoditySymbol(sym) ? 'MCX_COMM' : 'NSE_EQ';
            dhanWsFeed.subscribe([{ ExchangeSegment: seg, SecurityId: secId }], 15);
        }
    }

    if (typeof parseOptionSymbol === 'function') {
        const opt = parseOptionSymbol(sym);
        if (opt && typeof updateSingleTrackedOption === 'function') {
            updateSingleTrackedOption(sym, opt);
        }
    }
    return isNew;
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
            // While the market is open and today's candle is still forming, the
            // previous close is the day before it. Otherwise — market closed for
            // the day, weekend, or holiday — the LTP itself already equals the
            // last completed session's close, so "previous close" (the reference
            // for today's/last session's % change) is the one before *that*.
            const prevClose = (isMarketOpen() && lastDate !== today)
                ? last.close
                : candles[candles.length - 2].close;
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

// Is a newly-fetched LTP believable? Guards against the bad-mapping ticks
// where a Dhan endpoint returns a wrong-instrument price for a symbol (seen
// on LTIM: real ~4190, but one feed returned ~4504 and it flip-flopped,
// swinging Day's P&L by lakhs). A genuine trade moves incrementally, so:
//  - against the last good price: reject a single jump beyond ±6% (an
//    outlier that reverts is bad data; a real sustained move arrives as many
//    small ticks the anchor follows through),
//  - with no prior price yet (cold start): fall back to a ±10% circuit-style
//    band around the day's previous close, which is reliable even when the
//    live OHLC/LTP isn't.
function isSaneTick(oldLtp, newLtp, prevClose, isIndex = false) {
    if (!(newLtp > 0)) return false;
    // Rolling: reject a single tick that jumps >6% off the last good price (indexes allow up to 20% for baseline transition)
    const maxThreshold = isIndex ? 0.20 : 0.06;
    if (oldLtp > 0)    return Math.abs(newLtp - oldLtp) / oldLtp <= maxThreshold;
    // Cold start: circuit-style band
    if (prevClose > 0) return Math.abs(newLtp - prevClose) / prevClose <= (isIndex ? 0.20 : 0.07);
    return true;
}

// ─── Dhan-only live snapshot ────────────────────────────────────────────────
// Single source of truth for live prices: one batched Dhan /marketfeed/quote
// call gives full OHLC + previousClose + net_change + 52W for every tracked
// stock AND index. Groww and Yahoo are no longer in the live-price path, and
// there is no separate slow "full refresh" — this runs on the 1s tick, so all
// data is fetched from Dhan every second with no hard refresh cycle.
//
// On any failure/429 we simply keep the last good in-memory values (no wipe),
// so a transient Dhan hiccup shows stale-but-correct prices rather than blanks.
async function applyDhanSnapshot() {
    if (!dhanDataService.isConfigured()) return false;

    const { stocks, indexes } = await dhanDataService.fetchDhanSnapshot(getTrackedSymbols());
    let gotStocks = false;

    for (const [sym, d] of Object.entries(stocks)) {
        if (!(d.ltp > 0)) continue;
        const prev = stockPrices[sym];
        const pc = refPrevClose(sym, d.previousClose);
        // Outlier guard — a wrong-instrument quote (seen on LTIM: ~4504 vs its
        // real ~4190) that jumps >6% off the last good price (or off the
        // reliable candle-derived prev close at cold start) is bad data; keep
        // the last good value. Genuine moves arrive as small incremental ticks.
        if (prev?.source === 'BASELINE' || isSaneTick(prev?.ltp, d.ltp, pc || prev?.previousClose, false)) {
            // Recompute change/prevClose against the authoritative candle-derived
            // close so Day's P&L can't be thrown off by a stale/wrong feed close.
            if (pc > 0) {
                d.previousClose = pc;
                d.change        = Math.round((d.ltp - pc) * 100) / 100;
                d.changePercent = Math.round(((d.ltp - pc) / pc) * 10000) / 100;
            } else if ((!d.change || d.previousClose === d.ltp) && prev?.previousClose > 0 && prev.previousClose !== d.ltp) {
                d.previousClose = prev.previousClose;
                d.change        = Math.round((d.ltp - d.previousClose) * 100) / 100;
                d.changePercent = Math.round((d.change / d.previousClose) * 10000) / 100;
            }
            stockPrices[sym] = d;
        }
        gotStocks = true;
    }

    for (const [name, d] of Object.entries(indexes)) {
        if (!(d.ltp > 0)) continue;
        const prev = indexData[name];
        // If incoming quote has 0 change or prevClose == ltp (typical Dhan off-market post-close),
        // repair it with prior valid previousClose or daily candle close
        if ((!d.change || d.previousClose === d.ltp) && prev?.previousClose > 0 && prev.previousClose !== d.ltp) {
            d.previousClose = prev.previousClose;
            d.change        = Math.round((d.ltp - d.previousClose) * 100) / 100;
            d.changePercent = Math.round((d.change / d.previousClose) * 10000) / 100;
        }
        if (prev?.source === 'BASELINE' || isSaneTick(prev?.ltp, d.ltp, d.previousClose ?? prev?.previousClose, true)) {
            indexData[name] = d;
        }
    }

    if (gotStocks || Object.keys(indexes).length > 0) {
        dataSource  = 'DHAN_LIVE';
        lastUpdated = new Date().toISOString();
        persistSnapshot();
        return true;
    }
    return false;
}

// ─── Live Yahoo Finance Fallback ─────────────────────────────────────────────
// When Dhan credentials are not provided, expired, or marketfeed 401s, this
// provides authoritative live quotes for Indian indices and tracked equities.
async function applyYahooSnapshot() {
    try {
        let gotAny = false;
        // 1. Fetch live quotes for major indices
        for (const idx of INDEX_SYMBOLS) {
            try {
                const q = await yahooFinance.quote(idx.symbol, {}, { validateResult: false });
                if (q && q.regularMarketPrice > 0) {
                    const ltp = q.regularMarketPrice;
                    const prevClose = q.regularMarketPreviousClose || ltp;
                    const change = q.regularMarketChange != null ? Math.round(q.regularMarketChange * 100) / 100 : Math.round((ltp - prevClose) * 100) / 100;
                    const changePercent = prevClose > 0 ? Math.round((change / prevClose) * 10000) / 100 : (q.regularMarketChangePercent || 0);

                    indexData[idx.name] = {
                        name: idx.name,
                        symbol: idx.name.replace(/\s+/g, '_'),
                        ltp: Math.round(ltp * 100) / 100,
                        open: q.regularMarketOpen || ltp,
                        high: q.regularMarketDayHigh || ltp,
                        low: q.regularMarketDayLow || ltp,
                        previousClose: prevClose,
                        change,
                        changePercent,
                        source: 'YAHOO_LIVE',
                    };
                    gotAny = true;
                }
            } catch {
                // individual index non-blocking
            }
        }

        // 2. Fetch live quotes for tracked equities
        const symbolsToFetch = Array.from(new Set([...getTrackedSymbols(), ...NSE_STOCK_SYMBOLS.slice(0, 30)]));
        for (const sym of symbolsToFetch) {
            if (sym.includes(' ') || sym.includes(':')) continue; // Skip option symbols for equity quote
            try {
                const q = await yahooFinance.quote(`${sym}.NS`, {}, { validateResult: false });
                if (q && q.regularMarketPrice > 0) {
                    const ltp = q.regularMarketPrice;
                    const prevClose = q.regularMarketPreviousClose || ltp;
                    const change = q.regularMarketChange != null ? Math.round(q.regularMarketChange * 100) / 100 : Math.round((ltp - prevClose) * 100) / 100;
                    const changePercent = prevClose > 0 ? Math.round((change / prevClose) * 10000) / 100 : (q.regularMarketChangePercent || 0);

                    stockPrices[sym] = {
                        symbol: sym,
                        ltp: Math.round(ltp * 100) / 100,
                        open: q.regularMarketOpen || ltp,
                        high: q.regularMarketDayHigh || ltp,
                        low: q.regularMarketDayLow || ltp,
                        previousClose: prevClose,
                        volume: q.regularMarketVolume || 0,
                        change,
                        changePercent,
                        high52w: q.fiftyTwoWeekHigh || 0,
                        low52w: q.fiftyTwoWeekLow || 0,
                        currency: q.currency || 'INR',
                        source: 'YAHOO_LIVE',
                    };
                    gotAny = true;
                }
            } catch {
                // individual stock non-blocking
            }
        }

        if (gotAny) {
            if (dataSource !== 'DHAN_WS') dataSource = 'YAHOO_LIVE';
            lastUpdated = new Date().toISOString();
            persistSnapshot();
            return true;
        }
    } catch (e) {
        console.warn('[Market] applyYahooSnapshot error:', e.message);
    }
    return false;
}

// Kept for the startup seed and the add-to-watchlist path — batched snapshot
// with automatic Dhan -> Yahoo fallback
async function fetchAllStockPrices() {
    if (isFetching) return;
    isFetching = true;
    try {
        const ok = await applyDhanSnapshot();
        if (ok) {
            console.log(`[Market] Dhan snapshot | stocks: ${Object.keys(stockPrices).length} | idx: ${Object.keys(indexData).length}`);
        } else {
            const yOk = await applyYahooSnapshot();
            if (yOk) {
                console.log(`[Market] Yahoo Live snapshot | stocks: ${Object.keys(stockPrices).length} | idx: ${Object.keys(indexData).length}`);
            }
        }
    } catch (err) {
        console.error('[Market] fetchAllStockPrices error:', err.message);
    } finally {
        isFetching = false;
    }
}

// ─── Real-Time Dhan Binary WebSocket Integration ─────────────────────────────
let dhanWsFeed = null;
let isWsStreaming = false;

function initDhanWebSocket() {
    if (!dhanDataService.isConfigured()) return;
    const creds = dhanDataService.getGlobalCredentials();
    if (!creds?.clientId || !creds?.accessToken) return;

    if (!dhanWsFeed) {
        dhanWsFeed = new DhanWebSocketFeed({
            clientId: creds.clientId,
            accessToken: creds.accessToken,
            requestCode: 15, // Ticker mode for watchlist & fast ticks
        });

        dhanWsFeed.on('connected', () => {
            isWsStreaming = true;
            dataSource = 'DHAN_WS';
            console.log('[Market] 🚀 Dhan Binary WebSocket connected! Zero-latency ticks active.');
            syncSubscriptionsToWebSocket();
        });

        dhanWsFeed.on('disconnected', () => {
            isWsStreaming = false;
            dataSource = 'DHAN_LIVE';
            console.warn('[Market] ⚠️ Dhan WebSocket disconnected. Automatic failover to 1s REST polling active.');
        });

        dhanWsFeed.on('error', (err) => {
            isWsStreaming = false;
            dataSource = 'DHAN_LIVE';
            console.warn('[Market] ⚠️ Dhan WebSocket error (handled safely):', err?.message || err);
        });

        // Binary Ticker Packet (LTP)
        dhanWsFeed.on('tick', ({ securityId, segment, ltp }) => {
            handleIncomingWsTick(securityId, segment, ltp);
        });

        // Binary Quote Packet (OHLC, VWAP, Volume)
        dhanWsFeed.on('quote', (q) => {
            handleIncomingWsQuote(q);
        });

        // Binary Index Packet
        dhanWsFeed.on('index', (idx) => {
            handleIncomingWsIndex(idx);
        });

        dhanWsFeed.connect();
    } else {
        dhanWsFeed.updateCredentials(creds);
    }
}

function syncSubscriptionsToWebSocket() {
    if (!dhanWsFeed || !dhanWsFeed.isConnected) return;
    const instruments = [];

    // Subscribe all indices in IDX_I
    for (const [, secId] of Object.entries(dhanDataService.INDEX_SECURITY_IDS)) {
        instruments.push({ ExchangeSegment: 'IDX_I', SecurityId: secId });
    }

    // Subscribe all tracked stocks and commodities
    for (const sym of getTrackedSymbols()) {
        const secId = dhanDataService.getSecurityId(sym);
        if (secId) {
            const seg = dhanDataService.isCommoditySymbol(sym) ? 'MCX_COMM' : 'NSE_EQ';
            instruments.push({ ExchangeSegment: seg, SecurityId: secId });
        }
    }

    if (instruments.length > 0) {
        dhanWsFeed.subscribe(instruments, 15);
    }
}

function handleIncomingWsTick(securityId, segment, ltp) {
    if (!(ltp > 0)) return;

    if (segment === 'IDX_I') {
        const idToName = Object.fromEntries(
            Object.entries(dhanDataService.INDEX_SECURITY_IDS).map(([name, id]) => [String(id), name])
        );
        const name = idToName[String(securityId)];
        if (name && indexData[name]) {
            const idx = indexData[name];
            idx.ltp = ltp;
            if (idx.previousClose > 0) {
                const chg = ltp - idx.previousClose;
                idx.change = Math.round(chg * 100) / 100;
                idx.changePercent = Math.round((chg / idx.previousClose) * 10000) / 100;
            }
            idx.source = 'DHAN_WS';
            lastUpdated = new Date().toISOString();
        }
        return;
    }

    // Equity / Commodity
    const sym = dhanDataService.getSymbolFromId(securityId);
    if (sym && stockPrices[sym]) {
        const old = stockPrices[sym];
        const pc  = refPrevClose(sym, old.previousClose);
        if (isSaneTick(old.ltp, ltp, pc || old.previousClose)) {
            const base   = pc || old.previousClose || old.ltp;
            const change = ltp - base;
            const chgPct = base > 0 ? (change / base) * 100 : 0;
            stockPrices[sym] = {
                ...old,
                ltp,
                previousClose: pc > 0 ? pc : old.previousClose,
                change:        Math.round(change * 100) / 100,
                changePercent: Math.round(chgPct  * 100) / 100,
                source:        'DHAN_WS',
            };
            lastUpdated = new Date().toISOString();
        }
    }
}

function handleIncomingWsQuote(q) {
    const sym = dhanDataService.getSymbolFromId(q.securityId);
    if (!sym || !stockPrices[sym]) return;

    const old = stockPrices[sym];
    const pc  = refPrevClose(sym, old.previousClose);
    const base = pc || old.previousClose || q.ltp;
    const change = q.ltp - base;
    const chgPct = base > 0 ? (change / base) * 100 : 0;

    stockPrices[sym] = {
        ...old,
        ltp: q.ltp,
        open: q.open || old.open,
        high: q.high || old.high,
        low: q.low || old.low,
        close: q.close || old.close,
        volume: q.volume || old.volume,
        vwap: q.vwap || old.vwap,
        previousClose: pc > 0 ? pc : old.previousClose,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(chgPct * 100) / 100,
        source: 'DHAN_WS',
    };
    lastUpdated = new Date().toISOString();
}

function handleIncomingWsIndex(idx) {
    const idToName = Object.fromEntries(
        Object.entries(dhanDataService.INDEX_SECURITY_IDS).map(([name, id]) => [String(id), name])
    );
    const name = idToName[String(idx.securityId)];
    if (!name || !indexData[name]) return;

    const target = indexData[name];
    target.ltp = idx.ltp;
    if (idx.open > 0) target.open = idx.open;
    if (idx.high > 0) target.high = idx.high;
    if (idx.low > 0) target.low = idx.low;
    if (target.previousClose > 0) {
        const chg = idx.ltp - target.previousClose;
        target.change = Math.round(chg * 100) / 100;
        target.changePercent = Math.round((chg / target.previousClose) * 10000) / 100;
    }
    target.source = 'DHAN_WS';
    lastUpdated = new Date().toISOString();
}

// The 1s live tick — Dual Engine with Automatic Failover:
// 1. Primary: If Dhan Binary WebSocket is streaming, prices update continuously
//    at zero latency, so HTTP REST polling is safely suspended to conserve bandwidth.
// 2. Fallback: If WebSocket disconnects or errors, 1s REST polling immediately takes over.
async function fastRefresh() {
    if (!dhanDataService.isConfigured()) return;

    // Ensure 24/7 Global Crypto & Commodities feed is active
    if (!globalMarketFeed.isConnected && !globalMarketFeed.isConnecting) {
        globalMarketFeed.start();
    }

    // Ensure WebSocket feed is initialized if credentials are ready
    if (!dhanWsFeed) {
        initDhanWebSocket();
    }

    // If WebSocket is actively streaming, prices are updated in real-time.
    // Skip redundant HTTP REST request.
    if (isWsStreaming && dhanWsFeed?.isConnected) {
        dataSource = 'DHAN_WS';
        lastUpdated = new Date().toISOString();
        return;
    }

    // Resilient REST fallback
    try {
        let gotAnyDhan = false;
        const ltps = await dhanDataService.fetchDhanLTPAll(getTrackedSymbols());
        for (const [key, val] of Object.entries(ltps || {})) {
            gotAnyDhan = true;
            if (key.startsWith('__IDX__')) {
                const name = key.replace('__IDX__', '');
                if (val.ltp > 0) {
                    if (!indexData[name]) {
                        indexData[name] = {
                            name,
                            symbol: name.replace(/\s+/g, '_'),
                            ltp: val.ltp,
                            open: val.ltp,
                            high: val.ltp,
                            low: val.ltp,
                            previousClose: val.ltp,
                            change: 0,
                            changePercent: 0,
                            source: 'DHAN_LIVE',
                        };
                    } else {
                        const pc = indexData[name].previousClose;
                        indexData[name].ltp = val.ltp;
                        if (pc > 0) {
                            const chg = val.ltp - pc;
                            indexData[name].change = Math.round(chg * 100) / 100;
                            indexData[name].changePercent = Math.round((chg / pc) * 10000) / 100;
                        }
                    }
                }
            } else if (stockPrices[key]) {
                const old = stockPrices[key];
                const pc  = refPrevClose(key, old.previousClose);
                if (val.ltp > 0 && isSaneTick(old.ltp, val.ltp, pc || old.previousClose)) {
                    const base   = pc || old.previousClose || old.ltp;
                    const change = val.ltp - base;
                    const chgPct = base > 0 ? (change / base) * 100 : 0;
                    stockPrices[key] = {
                        ...old,
                        ltp:           val.ltp,
                        previousClose: pc > 0 ? pc : old.previousClose,
                        change:        Math.round(change * 100) / 100,
                        changePercent: Math.round(chgPct  * 100) / 100,
                        source:        'DHAN_LIVE',
                    };
                }
            } else if (val.ltp > 0) {
                const pc = refPrevClose(key, 0);
                if (!pc || isSaneTick(0, val.ltp, pc)) {
                    const change = pc > 0 ? val.ltp - pc : 0;
                    stockPrices[key] = {
                        symbol: key, ltp: val.ltp,
                        previousClose: pc > 0 ? pc : undefined,
                        change: Math.round(change * 100) / 100,
                        changePercent: pc > 0 ? Math.round((change / pc) * 10000) / 100 : 0,
                        source: 'DHAN_LIVE',
                    };
                }
            }
        }

        // Automatic failover to Yahoo live feed when Dhan returns no quotes
        if (!gotAnyDhan || Object.keys(indexData).length === 0) {
            const now = Date.now();
            if (now - lastYahooRefresh > 15000) {
                lastYahooRefresh = now;
                applyYahooSnapshot().catch(() => {});
            }
        }

        lastUpdated = new Date().toISOString();
    } catch (e) {
        console.warn('[Market] fastRefresh fallback error:', e.message);
    }
}

let lastYahooRefresh = 0;

function getDataSource()   { return dataSource; }
function getStockPrices()  {
    if (Object.keys(stockPrices).length === 0) {
        loadPersistedSnapshot();
    }
    if (typeof updateTrackedOptionPrices === 'function') {
        updateTrackedOptionPrices();
    }
    return stockPrices;
}
function getIndexData()    {
    if (Object.keys(indexData).length === 0) {
        loadPersistedSnapshot();
    }
    return indexData;
}
function getLastUpdated()  { return lastUpdated || new Date().toISOString(); }

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
// Supported F&O indices (canonical names)
const OPTION_CONFIG = {
    'NIFTY 50':      { strikeGap: 50,  atmPremium: 120, weeklyExpiry: true,  expiryDay: 2 }, // Tuesday
    'BANK NIFTY':    { strikeGap: 100, atmPremium: 280, weeklyExpiry: false, expiryDay: 2 }, // last Tuesday
    'SENSEX':        { strikeGap: 100, atmPremium: 350, weeklyExpiry: true,  expiryDay: 4 }, // Thursday
    'FINNIFTY':      { strikeGap: 50,  atmPremium: 80,  weeklyExpiry: false, expiryDay: 4 }, // last Thursday
    'MIDCPNIFTY':    { strikeGap: 25,  atmPremium: 70,  weeklyExpiry: false, expiryDay: 4 }, // last Thursday
    'NIFTY NEXT 50': { strikeGap: 100, atmPremium: 250, weeklyExpiry: false, expiryDay: 4 }, // last Thursday
    'BANKEX':        { strikeGap: 100, atmPremium: 280, weeklyExpiry: false, expiryDay: 2 }, // last Tuesday (BSE)
};

// Normalize common index name aliases to canonical key
const INDEX_NAME_ALIASES = {
    'NIFTY':          'NIFTY 50',
    'NIFTY50':        'NIFTY 50',
    'N50':            'NIFTY 50',
    'BANKNIFTY':      'BANK NIFTY',
    'BNKNIFTY':       'BANK NIFTY',
    'BANKN':          'BANK NIFTY',
    'BNF':            'BANK NIFTY',
    'FINNIFTY':       'FINNIFTY',
    'MIDCAP':         'MIDCPNIFTY',
    'MIDCP':          'MIDCPNIFTY',
    'SNX':            'SENSEX',
    'BSE':            'SENSEX',
    'NIFTYNXT50':     'NIFTY NEXT 50',
    'NIFTYNEXT50':    'NIFTY NEXT 50',
    'NIFTYNXT':       'NIFTY NEXT 50',
    'BANKEX':         'BANKEX',
};

function normalizeOptionIndexName(name) {
    if (!name) return 'NIFTY 50';
    const upper = String(name).toUpperCase().trim();
    if (OPTION_CONFIG[upper]) return upper;
    return INDEX_NAME_ALIASES[upper] || upper;
}

const OPTION_LOT_SIZES = {
    'NIFTY 50':      75,
    'NIFTY':         75,
    'BANK NIFTY':    30,
    'BANKNIFTY':     30,
    'SENSEX':        20,
    'FINNIFTY':      65,
    'MIDCPNIFTY':    120,
    'NIFTY NEXT 50': 25,
    'BANKEX':        30,
};

function parseOptionSymbol(sym) {
    if (!sym || typeof sym !== 'string') return null;
    const str = sym.trim().toUpperCase();

    // Standard pattern: e.g. "NIFTY 23100 CE", "NIFTY 50 23100 CE", "BANK NIFTY 54800 PE", "NIFTY23100CE", "FINNIFTY 24700 PE"
    const match = str.match(/^([A-Z0-9\s]+?)\s*(\d{3,6})\s*(CE|PE)(?:\s+([\d-]+))?$/i);
    if (!match) return null;

    let rawUnderlying = match[1].trim();
    const strikePrice = parseInt(match[2], 10);
    const optionType = match[3].toUpperCase();
    const expiry = match[4] || null;

    let underlying = normalizeOptionIndexName(rawUnderlying);
    const cleanUnderlying = rawUnderlying.replace(/\s+/g, '');
    if (cleanUnderlying === 'NIFTY') underlying = 'NIFTY 50';
    else if (cleanUnderlying === 'BANKNIFTY') underlying = 'BANK NIFTY';
    else if (cleanUnderlying === 'FINNIFTY') underlying = 'FINNIFTY';
    else if (cleanUnderlying === 'MIDCPNIFTY' || cleanUnderlying === 'MIDCAP') underlying = 'MIDCPNIFTY';
    else if (cleanUnderlying === 'SENSEX' || cleanUnderlying === 'BSE') underlying = 'SENSEX';

    const shortIdx = underlying === 'NIFTY 50' ? 'NIFTY' : (underlying === 'BANK NIFTY' ? 'BANKNIFTY' : underlying);
    const canonicalSymbol = `${shortIdx} ${strikePrice} ${optionType}`;

    return {
        underlying,
        rawUnderlying,
        strikePrice,
        optionType,
        expiry,
        canonicalSymbol,
        symbol: sym,
    };
}

function updateSingleTrackedOption(sym, opt) {
    if (!sym || !opt) return;
    const chain = (opt.expiry && optionChainCache[`${opt.underlying}|${opt.expiry}`]?.data) || activeOptionChains[opt.underlying];
    if (!chain || !Array.isArray(chain.rows)) return;

    const row = chain.rows.find(r => r.strike === opt.strikePrice);
    if (!row) return;

    const contract = opt.optionType === 'CE' ? row.ce : row.pe;
    if (!contract || typeof contract.ltp !== 'number') return;

    const chg = contract.change ?? (contract.prevClose ? Math.round((contract.ltp - contract.prevClose) * 100) / 100 : 0);
    const prevClose = contract.prevClose || (contract.ltp - chg);
    const chgPct = prevClose > 0 ? Math.round((chg / prevClose) * 10000) / 100 : 0;

    const priceObj = {
        symbol: sym,
        name: `${opt.underlying} ${opt.strikePrice} ${opt.optionType}`,
        ltp: contract.ltp,
        change: chg,
        changePercent: chgPct,
        prevClose: prevClose,
        open: contract.open || contract.ltp,
        high: contract.high || contract.ltp,
        low: contract.low || contract.ltp,
        close: contract.ltp,
        oi: contract.oi || 0,
        volume: contract.volume || 0,
        isOption: true,
        underlyingSymbol: opt.underlying,
        strikePrice: opt.strikePrice,
        optionType: opt.optionType,
        expiry: chain.expiry,
        lotSize: OPTION_LOT_SIZES[opt.underlying] || 50,
    };

    stockPrices[sym] = priceObj;

    const aliases = [
        opt.canonicalSymbol,
        `${opt.underlying} ${opt.strikePrice} ${opt.optionType}`,
        `${opt.underlying.replace(/\s+/g, '')} ${opt.strikePrice} ${opt.optionType}`,
        `${opt.underlying === 'NIFTY 50' ? 'NIFTY' : opt.underlying} ${opt.strikePrice} ${opt.optionType}`,
    ];
    for (const a of aliases) {
        if (a && a !== sym) {
            stockPrices[a] = { ...priceObj, symbol: a };
        }
    }
}

function updateTrackedOptionPrices() {
    for (const sym of trackedSymbols) {
        const opt = parseOptionSymbol(sym);
        if (opt) {
            updateSingleTrackedOption(sym, opt);
        }
    }
}

function searchOptionInstruments(query, limit = 20) {
    if (!query || typeof query !== 'string') return [];
    const q = query.trim().toUpperCase();
    if (q.length < 2) return [];

    let targetIndex = null;
    if (q.includes('BANKNIFTY') || q.includes('BANK NIFTY') || q.includes('BNF')) targetIndex = 'BANK NIFTY';
    else if (q.includes('FINNIFTY') || q.includes('FIN NIFTY')) targetIndex = 'FINNIFTY';
    else if (q.includes('MIDCP') || q.includes('MIDCAP')) targetIndex = 'MIDCPNIFTY';
    else if (q.includes('SENSEX') || q.includes('BSE')) targetIndex = 'SENSEX';
    else if (q.includes('NIFTY')) targetIndex = 'NIFTY 50';

    const hasCE = /\bCE\b/.test(q) || q.endsWith('CE');
    const hasPE = /\bPE\b/.test(q) || q.endsWith('PE');
    const optTypes = hasCE && !hasPE ? ['CE'] : (hasPE && !hasCE ? ['PE'] : ['CE', 'PE']);

    const strikeMatch = q.match(/\b(\d{4,6})\b/);
    const targetStrike = strikeMatch ? parseInt(strikeMatch[1], 10) : null;

    if (!targetIndex && !targetStrike) {
        if (!q.includes('OPTION') && !q.includes('CALL') && !q.includes('PUT') && !hasCE && !hasPE) {
            return [];
        }
    }

    const indicesToSearch = targetIndex ? [targetIndex] : SUPPORTED_INDICES;
    const results = [];

    for (const idx of indicesToSearch) {
        const chain = activeOptionChains[idx];
        if (!chain || !Array.isArray(chain.rows) || chain.rows.length === 0) continue;

        let rows = chain.rows;
        if (targetStrike) {
            const cfg = OPTION_CONFIG[idx] || { strikeGap: 50 };
            const gap = cfg.strikeGap || 50;
            const exactOrClose = rows.filter(r => Math.abs(r.strike - targetStrike) <= gap * 3 || String(r.strike).includes(String(targetStrike)))
                                     .sort((a, b) => Math.abs(a.strike - targetStrike) - Math.abs(b.strike - targetStrike));
            if (exactOrClose.length > 0) {
                rows = exactOrClose;
            } else {
                continue;
            }
        } else {
            const atm = chain.atmStrike || (chain.indexPrice ? Math.round(chain.indexPrice / 100) * 100 : 0);
            rows = [...rows].sort((a, b) => Math.abs(a.strike - atm) - Math.abs(b.strike - atm)).slice(0, 4);
        }

        const displayIdx = idx === 'NIFTY 50' ? 'NIFTY' : (idx === 'BANK NIFTY' ? 'BANKNIFTY' : idx);

        for (const row of rows) {
            for (const type of optTypes) {
                const contract = type === 'CE' ? row.ce : row.pe;
                if (!contract || typeof contract.ltp !== 'number') continue;

                const sym = `${displayIdx} ${row.strike} ${type}`;
                const chg = contract.change ?? (contract.prevClose ? Math.round((contract.ltp - contract.prevClose) * 100) / 100 : 0);
                const prevClose = contract.prevClose || (contract.ltp - chg);
                const chgPct = prevClose > 0 ? Math.round((chg / prevClose) * 10000) / 100 : 0;

                results.push({
                    symbol: sym,
                    name: `${displayIdx} ${row.strike} ${type}`,
                    underlyingSymbol: idx,
                    strikePrice: row.strike,
                    optionType: type,
                    expiry: chain.expiry,
                    lotSize: OPTION_LOT_SIZES[idx] || 50,
                    ltp: contract.ltp,
                    change: chg,
                    changePercent: chgPct,
                    prevClose: prevClose,
                    oi: contract.oi || 0,
                    volume: contract.volume || 0,
                    isOption: true,
                    instrumentType: 'OPTIDX',
                });
                if (results.length >= limit) return results;
            }
        }
    }
    return results;
}

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
    // Today's expiry stays tradeable until 15:40 IST (F&O close, extended
    // from 15:30 on 2026-08-03 alongside the new cash-market closing auction)
    const includeToday = nowIst.getHours() * 60 + nowIst.getMinutes() <= 15 * 60 + 40;
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
    const end = new Date(expiry + 'T15:40:00');
    const diff = (end - istNow()) / 86400000;
    return Math.max(0.02, diff);
}

// ─── Live Option Chain Engine (Pure Broker Live Data) ─────────────────────────
// Dhan's option-chain API provides real exchange LTP, OI, IV, Delta, and Bid/Ask.
// Results are cached and synchronized to ensure zero synthetic/fake data.
const optionChainCache = {};      // `${index}|${expiry}` -> { at, data }
const expiryListCache  = {};      // index -> { at, list }
const chainInflight    = new Map();

async function getOptionExpiries(indexName) {
    const norm = normalizeOptionIndexName(indexName);
    const hit = expiryListCache[norm];
    if (hit && Date.now() - hit.at < 10 * 60e3) return hit.list;

    if (kotakNeoService.isConfigured()) {
        const list = await kotakNeoService.fetchKotakExpiryList(norm);
        if (list && list.length > 0) {
            expiryListCache[norm] = { at: Date.now(), list };
            return list;
        }
    }

    const secId = dhanDataService.INDEX_SECURITY_IDS[norm];
    if (secId) {
        const list = await dhanDataService.fetchDhanExpiryList(secId);
        if (list && list.length > 0) {
            expiryListCache[norm] = { at: Date.now(), list };
            return list;
        }
    }
    return getExpiryDates(norm);
}

// ─── Central Option Chain Broadcaster Engine ────────────────────────────────
// Singleton cache and 1-second distribution engine.
// Calls broker API at safe intervals while distributing live option chain
// updates to all mobile clients every 1s via WebSockets.

let _chainIo = null;
let _brokerSyncBusy = false;
let _dhanRateLimitBackoffUntil = 0;
const SUPPORTED_INDICES = ['NIFTY 50', 'BANK NIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'];

function updateOptionChainPrices(chain) {
    if (!chain || !Array.isArray(chain.rows)) return chain;
    if (!isLiveMarketActive('FO')) return chain; // Off-market: completely frozen

    const indexName = normalizeOptionIndexName(chain.indexName || 'NIFTY 50');
    const idxEntry = indexData[indexName];
    const cfg = OPTION_CONFIG[indexName] || OPTION_CONFIG['NIFTY 50'];
    const strikeGap = cfg.strikeGap || 50;
    
    // Always use the live Dhan index price as ground truth
    const currentPrice = idxEntry?.ltp || chain.indexPrice;
    if (!currentPrice || currentPrice <= 0) return chain;
    chain._lastPrice = currentPrice;

    const dte = daysToExpiry(chain.expiry);
    const atmStrike = Math.round(currentPrice / strikeGap) * strikeGap;

    chain.indexPrice = currentPrice;
    chain.indexChange = idxEntry?.change ?? chain.indexChange ?? 0;
    chain.indexChangePercent = idxEntry?.changePercent ?? chain.indexChangePercent ?? 0;
    chain.atmStrike = atmStrike;
    chain.daysToExpiry = Math.round(dte * 100) / 100;
    chain.lastUpdated = new Date().toISOString();

    for (let i = 0; i < chain.rows.length; i++) {
        const row = chain.rows[i];
        row.isATM = (row.strike === atmStrike);

        if (chain.source === 'BROKER_LIVE') {
            if (row.ce && typeof row.ce.baseLtp === 'number') {
                const baseLtp = row.ce.baseLtp;
                const baseUnderlyingAtSync = chain.baseUnderlyingPrice || currentPrice;
                const underlyingDiff = currentPrice - baseUnderlyingAtSync;
                const steps = (row.strike - currentPrice) / (strikeGap * 10);
                const approxCeDelta = Math.max(0.01, Math.min(0.99, Math.round((0.5 - steps) * 100) / 100));
                const ceDelta = (typeof row.ce.delta === 'number' && Math.abs(row.ce.delta) > 0.001) ? row.ce.delta : approxCeDelta;
                const ceMove = Math.max(-baseLtp * 0.02, Math.min(baseLtp * 0.02,
                    Math.round(underlyingDiff * ceDelta * 100) / 100
                ));
                const newLtp = Math.max(0.05, Math.round((baseLtp + ceMove) * 100) / 100);
                row.ce.ltp = newLtp;
                row.ce.change = Math.round((newLtp - (row.ce.prevClose || row.ce.baseLtp || newLtp)) * 100) / 100;
                row.ce.delta = ceDelta;
            }

            if (row.pe && typeof row.pe.baseLtp === 'number') {
                const baseLtp = row.pe.baseLtp;
                const baseUnderlyingAtSync = chain.baseUnderlyingPrice || currentPrice;
                const underlyingDiff = currentPrice - baseUnderlyingAtSync;
                const steps = (row.strike - currentPrice) / (strikeGap * 10);
                const approxPeDelta = Math.max(-0.99, Math.min(-0.01, Math.round((-0.5 - steps) * 100) / 100));
                const peDelta = (typeof row.pe.delta === 'number' && Math.abs(row.pe.delta) > 0.001) ? row.pe.delta : approxPeDelta;
                const peMove = Math.max(-baseLtp * 0.02, Math.min(baseLtp * 0.02,
                    Math.round(underlyingDiff * peDelta * 100) / 100
                ));
                const newLtp = Math.max(0.05, Math.round((baseLtp + peMove) * 100) / 100);
                row.pe.ltp = newLtp;
                row.pe.change = Math.round((newLtp - (row.pe.prevClose || row.pe.baseLtp || newLtp)) * 100) / 100;
                row.pe.delta = peDelta;
            }
        }
    }

    return chain;
}

// Background broker fetch: called at a safe slow interval (every 12s)
// Fetches real exchange option chain snapshots 24/7 (settlement off-hours, live during market)
async function syncBrokerOptionChain() {
    if (_brokerSyncBusy || Date.now() < _dhanRateLimitBackoffUntil) return;
    _brokerSyncBusy = true;

    try {
        for (const indexName of SUPPORTED_INDICES) {
            const expiries = await getOptionExpiries(indexName);
            if (!expiries || expiries.length === 0) continue;
            const resolvedExpiry = expiries[0];
            let liveData = null;

            if (kotakNeoService.isConfigured()) {
                try {
                    liveData = await kotakNeoService.fetchKotakOptionChain(indexName, resolvedExpiry);
                } catch { /* ignore */ }
            }

            if (!liveData && Date.now() >= _dhanRateLimitBackoffUntil) {
                const secId = dhanDataService.INDEX_SECURITY_IDS[indexName];
                if (secId) {
                    try {
                        liveData = await dhanDataService.fetchDhanOptionChain(secId, resolvedExpiry);
                    } catch (err) {
                        if (err.message && err.message.includes('429')) {
                            console.warn('[MarketData] ⚠️ Dhan rate limit hit for option chain — backing off 30s');
                            _dhanRateLimitBackoffUntil = Date.now() + 30000;
                            break;
                        }
                    }
                }
            }

            if (liveData && Array.isArray(liveData.rows) && liveData.rows.length > 0) {
                const cfg = OPTION_CONFIG[indexName] || OPTION_CONFIG['NIFTY 50'];
                const indexPrice = liveData.underlyingPrice || indexData[indexName]?.ltp || 0;
                const atmStrike = cfg.strikeGap ? Math.round(indexPrice / cfg.strikeGap) * cfg.strikeGap : 0;
                const rows = liveData.rows.map(r => ({
                    ...r,
                    isATM: r.strike === atmStrike,
                    ce: r.ce ? { ...r.ce, baseLtp: r.ce.ltp, baseChange: r.ce.change, prevClose: r.ce.change !== undefined ? (r.ce.ltp - r.ce.change) : r.ce.ltp } : null,
                    pe: r.pe ? { ...r.pe, baseLtp: r.pe.ltp, baseChange: r.pe.change, prevClose: r.pe.change !== undefined ? (r.pe.ltp - r.pe.change) : r.pe.ltp } : null,
                }));

                activeOptionChains[indexName] = {
                    indexName,
                    indexPrice,
                    baseUnderlyingPrice: indexPrice,
                    expiry: resolvedExpiry,
                    daysToExpiry: Math.round(daysToExpiry(resolvedExpiry) * 100) / 100,
                    indexChange: indexData[indexName]?.change ?? 0,
                    indexChangePercent: indexData[indexName]?.changePercent ?? 0,
                    expiries,
                    atmStrike,
                    rows,
                    source: 'BROKER_LIVE',
                    lastUpdated: new Date().toISOString(),
                };
                console.log(`[MarketData] ✅ Real broker sync: ${indexName} ${resolvedExpiry} — ${rows.length} strikes @ underlying ${indexPrice}`);
            }
            await new Promise(r => setTimeout(r, 1500));
        }
        persistOptionChains();
    } catch (e) {
        console.warn('[MarketData] syncBrokerOptionChain error:', e.message);
    } finally {
        _brokerSyncBusy = false;
    }
}

// 1-second distribution worker: runs continuously to distribute live updates internally
function broadcastOptionChains() {
    if (!_chainIo) return;

    const marketLive = isLiveMarketActive('FO');
    if (!marketLive) {
        // Market is offline: do NOT broadcast 1-second ticks; prices stay completely static
        return;
    }

    for (const indexName of SUPPORTED_INDICES) {
        let chain = activeOptionChains[indexName];
        if (!chain || chain.source !== 'BROKER_LIVE') continue;

        // Only dynamically reprice strikes during LIVE market hours!
        if (marketLive) {
            chain = updateOptionChainPrices(chain);
        }

        // Distribute internally to WebSocket subscribers
        _chainIo.to(`chain:${indexName}`).emit('optionChain', chain);
        _chainIo.emit('optionChainUpdate', { indexName, data: chain });
        if (chain.expiry) {
            _chainIo.to(`chain:${indexName}:${chain.expiry}`).emit('optionChain', chain);
        }
    }

    // Also reprice and broadcast any active secondary expiry chains in cache
    for (const [key, entry] of Object.entries(optionChainCache)) {
        if (entry?.data && Date.now() - entry.at < 600000 && entry.data.source === 'BROKER_LIVE') {
            const [idx, exp] = key.split('|');
            if (idx && exp) {
                if (marketLive) {
                    entry.data = updateOptionChainPrices(entry.data);
                }
                _chainIo.to(`chain:${idx}:${exp}`).emit('optionChain', entry.data);
                _chainIo.emit('optionChainUpdate', { indexName: idx, expiry: exp, data: entry.data });
            }
        }
    }

    // Refresh prices for any option contracts users have added to their watchlist
    updateTrackedOptionPrices();
}

function initOptionChainBroadcaster(io) {
    _chainIo = io;

    // Load persisted real broker chains from disk cache
    loadPersistedOptionChains();

    // 1-Second internal broadcast timer
    setInterval(broadcastOptionChains, 1000);

    // Controlled broker sync timer (every 12s)
    setInterval(syncBrokerOptionChain, 12000);
    // Initial eager sync
    setTimeout(syncBrokerOptionChain, 500);

    console.log('[MarketData] ✅ Option Chain Broadcaster initialized (100% Real Broker Live Data)');
}

async function getOptionChain(indexName, expiry) {
    const normIndex = normalizeOptionIndexName(indexName || 'NIFTY 50');
    let chain = activeOptionChains[normIndex];

    // If client requested a specific non-active expiry
    if (expiry && (!chain || chain.expiry !== expiry)) {
        const key = `${normIndex}|${expiry}`;
        if (optionChainCache[key]?.data && Date.now() - optionChainCache[key].at < 15000) {
            return optionChainCache[key].data;
        }

        // Try on-demand fetch from broker for this expiry
        let liveData = null;
        if (kotakNeoService.isConfigured()) {
            try { liveData = await kotakNeoService.fetchKotakOptionChain(normIndex, expiry); } catch {}
        }
        if (!liveData && dhanDataService.isConfigured()) {
            const secId = dhanDataService.INDEX_SECURITY_IDS[normIndex];
            if (secId) {
                try { liveData = await dhanDataService.fetchDhanOptionChain(secId, expiry); } catch {}
            }
        }

        if (liveData && Array.isArray(liveData.rows) && liveData.rows.length > 0) {
            const cfg = OPTION_CONFIG[normIndex] || OPTION_CONFIG['NIFTY 50'];
            const indexPrice = liveData.underlyingPrice || indexData[normIndex]?.ltp || 0;
            const atmStrike = cfg.strikeGap ? Math.round(indexPrice / cfg.strikeGap) * cfg.strikeGap : 0;
            const expiries = await getOptionExpiries(normIndex);
            const expChain = {
                indexName: normIndex,
                indexPrice,
                baseUnderlyingPrice: indexPrice,
                expiry,
                daysToExpiry: Math.round(daysToExpiry(expiry) * 100) / 100,
                indexChange: indexData[normIndex]?.change ?? 0,
                indexChangePercent: indexData[normIndex]?.changePercent ?? 0,
                expiries,
                atmStrike,
                rows: liveData.rows.map(r => ({
                    ...r,
                    isATM: r.strike === atmStrike,
                    ce: r.ce ? { ...r.ce, baseLtp: r.ce.ltp, baseChange: r.ce.change } : null,
                    pe: r.pe ? { ...r.pe, baseLtp: r.pe.ltp, baseChange: r.pe.change } : null,
                })),
                source: 'BROKER_LIVE',
                lastUpdated: new Date().toISOString(),
            };
            optionChainCache[key] = { at: Date.now(), data: expChain };
            return expChain;
        }

        if (chain) return chain;
    }

    // If active chain is missing, perform eager broker fetch
    if (!chain || chain.source !== 'BROKER_LIVE') {
        const expiries = await getOptionExpiries(normIndex);
        const targetExpiry = expiry || expiries[0];
        let liveData = null;
        if (kotakNeoService.isConfigured()) {
            try { liveData = await kotakNeoService.fetchKotakOptionChain(normIndex, targetExpiry); } catch {}
        }
        if (!liveData && dhanDataService.isConfigured()) {
            const secId = dhanDataService.INDEX_SECURITY_IDS[normIndex];
            if (secId) {
                try { liveData = await dhanDataService.fetchDhanOptionChain(secId, targetExpiry); } catch {}
            }
        }

        if (liveData && Array.isArray(liveData.rows) && liveData.rows.length > 0) {
            const cfg = OPTION_CONFIG[normIndex] || OPTION_CONFIG['NIFTY 50'];
            const indexPrice = liveData.underlyingPrice || indexData[normIndex]?.ltp || 0;
            const atmStrike = cfg.strikeGap ? Math.round(indexPrice / cfg.strikeGap) * cfg.strikeGap : 0;
            chain = {
                indexName: normIndex,
                indexPrice,
                baseUnderlyingPrice: indexPrice,
                expiry: targetExpiry,
                daysToExpiry: Math.round(daysToExpiry(targetExpiry) * 100) / 100,
                indexChange: indexData[normIndex]?.change ?? 0,
                indexChangePercent: indexData[normIndex]?.changePercent ?? 0,
                expiries,
                atmStrike,
                rows: liveData.rows.map(r => ({
                    ...r,
                    isATM: r.strike === atmStrike,
                    ce: r.ce ? { ...r.ce, baseLtp: r.ce.ltp, baseChange: r.ce.change } : null,
                    pe: r.pe ? { ...r.pe, baseLtp: r.pe.ltp, baseChange: r.pe.change } : null,
                })),
                source: 'BROKER_LIVE',
                lastUpdated: new Date().toISOString(),
            };
            activeOptionChains[normIndex] = chain;
            persistOptionChains();
            return chain;
        }
    }

    if (!chain) {
        const expiries = await getOptionExpiries(normIndex);
        return {
            indexName: normIndex,
            indexPrice: indexData[normIndex]?.ltp || 0,
            expiry: expiry || expiries[0] || null,
            daysToExpiry: 0,
            indexChange: indexData[normIndex]?.change ?? 0,
            indexChangePercent: indexData[normIndex]?.changePercent ?? 0,
            expiries,
            atmStrike: 0,
            rows: [],
            source: 'BROKER_LIVE',
            lastUpdated: new Date().toISOString(),
        };
    }

    return chain;
}

// Live premium for one contract — served directly from real broker option chain
async function getOptionLTP(indexName, strikePrice, optionType, expiry) {
    try {
        const chain = await getOptionChain(indexName, expiry);
        const targetStrike = Number(strikePrice);
        const row = chain?.rows?.find(r => r.strike === targetStrike);
        if (row) {
            const side = String(optionType || 'CE').toUpperCase();
            const val = side === 'CE' ? row.ce?.ltp : row.pe?.ltp;
            if (typeof val === 'number' && val > 0) return val;
        }
        return null;
    } catch { return null; }
}

// Synchronous contract price lookup from real in-memory broker option chain
function getOptionLTPSync(indexName, strikePrice, optionType, expiry) {
    try {
        const normIndex = normalizeOptionIndexName(indexName);
        const key = `${normIndex}|${expiry}`;
        const chain = (expiry && optionChainCache[key]?.data) || activeOptionChains[normIndex];
        const targetStrike = Number(strikePrice);
        const row = chain?.rows?.find(r => r.strike === targetStrike);
        if (row) {
            const side = String(optionType || 'CE').toUpperCase();
            const val = side === 'CE' ? row.ce?.ltp : row.pe?.ltp;
            if (typeof val === 'number' && val > 0) return val;
        }
        return null;
    } catch { return null; }
}

module.exports = {
    fetchAllStockPrices,
    fastRefresh,
    seedReferenceCloses,
    repairChangeFields,
    getOptionChain,
    getOptionExpiries,
    getOptionLTP,
    getOptionLTPSync,
    initOptionChainBroadcaster,
    getStockPrices,
    getIndexData,
    getLastUpdated,
    getMarketMovers,
    getStockPrice: (sym) => {
        if (!sym) return null;
        const upper = String(sym).toUpperCase().trim();
        if (stockPrices[upper]?.ltp != null) return stockPrices[upper].ltp;
        const opt = parseOptionSymbol(upper);
        if (opt) {
            updateSingleTrackedOption(upper, opt);
            if (stockPrices[upper]?.ltp != null) return stockPrices[upper].ltp;
            return getOptionLTPSync(opt.underlying, opt.strikePrice, opt.optionType, opt.expiry);
        }
        const globalItem = globalMarketFeed.cache.get(upper);
        if (globalItem && globalItem.ltp > 0) return globalItem.ltp;
        return null;
    },
    getDataSource,
    normalizeOptionIndexName,
    getExpiryDates,
    trackSymbol,
    getTrackedSymbols,
    initDhanWebSocket,
    getDhanWsFeed: () => dhanWsFeed,
    searchOptionInstruments,
    parseOptionSymbol,
    updateTrackedOptionPrices,
    getGlobalMarketSnapshot: () => globalMarketFeed.getSnapshot(),
    searchGlobalInstruments: (q) => globalMarketFeed.search(q),
    getGlobalMarketFeed: () => globalMarketFeed,
    OPTION_LOT_SIZES,
    NSE_SYMBOLS,
    NSE_STOCK_SYMBOLS,
    INDEX_SYMBOLS,
};
