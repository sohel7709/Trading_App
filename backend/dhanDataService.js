'use strict';

// Dhan API — live market data integration
// Docs: https://dhanhq.co/docs/v2/market-feed/

const DHAN_BASE = 'https://api.dhan.co';
const SCRIP_MASTER_URL = 'https://images.dhan.co/api-data/api-scrip-master.csv';

// Verified from Dhan scrip master CSV (NSE EQ series, July 2026)
// TATAMOTORS maps to TMCV (759782) — Tata Motors after commercial vehicle demerger
const FALLBACK_SECURITY_IDS = {
    'RELIANCE':    2885,   'TCS':         11536,  'HDFCBANK':    1333,
    'INFY':        1594,   'ICICIBANK':   4963,   'HINDUNILVR':  1394,
    'KOTAKBANK':   1922,   'SBIN':        3045,   'BHARTIARTL':  10604,
    'ITC':         1660,   'LT':          11483,  'WIPRO':       3787,
    'AXISBANK':    5900,   'SUNPHARMA':   3351,   'TATAMOTORS':  759782,
    'TITAN':       3506,   'ADANIENT':    25,     'ADANIPORTS':  15083,
    'NTPC':        11630,  'MARUTI':      10999,  'POWERGRID':   14977,
    'HCLTECH':     7229,   'TATASTEEL':   3499,   'ULTRACEMCO':  11532,
    'ASIANPAINT':  236,    'BAJFINANCE':  317,    'NESTLEIND':   17963,
    'ONGC':        2475,   'JSWSTEEL':    11723,  'TECHM':       13538,
    'DIVISLAB':    10940,  'CIPLA':       694,    'DRREDDY':     881,
    'GRASIM':      1232,   'HDFCLIFE':   467,    'SBILIFE':     21808,
    'BPCL':        526,    'BAJAJFINSV':  16675,  'TATAPOWER':   3426,
    'KPITTECH':    9683,   'COALINDIA':   20374,  'EICHERMOT':   910,
    'BRITANNIA':   547,    'HEROMOTOCO':  1348,   'HINDALCO':    1363,
    'APOLLOHOSP':  157,    'INDUSINDBK':  5258,   'SHREECEM':    3103,
    'M&M':         2031,   'BAJAJ-AUTO':  16669,  'UPL':         11287,
    'AWL':         8110,   'BANDHANBNK':  2263,   'NYKAA':       6545,
    'IEX':         220,    'LTIM':        17818,
    // Holdings extras
    'NHPC':        17400,  'HAL':         2303,   'BEL':         383,
    'TATAELXSI':   3411,   'IRFC':        2029,   'RVNL':        9552,
    'ADANIPOWER':  17388,  'COCHINSHIP':  21508,  'MAZDOCK':     509,
    'ADANIGREEN':  3563,   'GODREJPROP':  17875,  'IREDA':       20261,
    'SUZLON':      12018,  'DIXON':       21690,  'DELHIVERY':   9599,
    'MPHASIS':     4503,   'TATACONSUM':  3432,
};

// symbol → integer securityId (starts with fallbacks, scrip master overwrites on load)
let securityIdMap = { ...FALLBACK_SECURITY_IDS };
// BSE_EQ symbol → securityId — populated from the scrip master only (no
// curated fallback since BSE quotes are a secondary/best-effort feature)
let bseSecurityIdMap = {};
// Short-lived cache so rapid repeat calls (e.g. exchange toggle in the UI)
// don't hammer Dhan; BSE quotes are fetched on demand, not on the tick loop.
const bseQuoteCache = {}; // symbol -> { at, data }
const BSE_QUOTE_TTL = 3000;
// string(securityId) → symbol (reverse lookup)
let securityIdToSymbol = Object.fromEntries(
    Object.entries(FALLBACK_SECURITY_IDS).map(([s, id]) => [String(id), s])
);
let scripMasterLoaded = false;
let scripMasterLoading = false;
let scripMasterLoadPromise = null; // shared by every caller that arrives while a load is in-flight
// symbol → company name (from scrip master, for full-universe search)
let symbolNames = {};

// ─── Scrip Master ────────────────────────────────────────────────────────────

// Public entry point — callers that arrive while a load is already in-flight
// share the SAME promise instead of getting an immediately-resolved no-op,
// which previously meant "loaded" data callers saw could be empty depending
// on exactly when they called in relative to the auto-triggered background load.
function loadScripMaster() {
    if (scripMasterLoaded) return Promise.resolve();
    if (scripMasterLoading) return scripMasterLoadPromise;
    scripMasterLoading = true;
    scripMasterLoadPromise = _doLoadScripMaster().finally(() => {
        scripMasterLoading = false;
        scripMasterLoadPromise = null;
    });
    return scripMasterLoadPromise;
}

async function _doLoadScripMaster() {
    try {
        const res = await fetch(SCRIP_MASTER_URL, {
            signal: AbortSignal.timeout(60000),
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const csv = await res.text();
        const lines = csv.split('\n');
        const header = lines[0].split(',');

        const iExch   = header.indexOf('SEM_EXM_EXCH_ID');
        const iSeg    = header.indexOf('SEM_SEGMENT');
        const iSecId  = header.indexOf('SEM_SMST_SECURITY_ID');
        const iSymbol = header.indexOf('SEM_TRADING_SYMBOL');
        const iSeries = header.indexOf('SEM_SERIES');
        const iName   = header.indexOf('SM_SYMBOL_NAME');
        const iCustom = header.indexOf('SEM_CUSTOM_SYMBOL');

        if (iExch < 0 || iSecId < 0 || iSymbol < 0) {
            throw new Error('Unexpected CSV header: ' + lines[0].slice(0, 120));
        }

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (!cols[iExch]) continue;
            const exch = cols[iExch].trim();
            if (exch !== 'NSE' && exch !== 'BSE') continue;
            if (iSeg >= 0 && cols[iSeg].trim() !== 'E') continue;
            // NSE main-board equity uses series "EQ"; BSE uses group "A"/"B"
            // (BSE has no "EQ" series at all — its group classification is
            // by liquidity/settlement type instead).
            const series = iSeries >= 0 ? cols[iSeries].trim() : '';
            if (exch === 'NSE' && series !== 'EQ') continue;
            if (exch === 'BSE' && series !== 'A' && series !== 'B') continue;

            const symbol = cols[iSymbol]?.trim();
            const secId  = parseInt(cols[iSecId], 10);
            if (!symbol || isNaN(secId) || secId <= 0) continue;

            if (exch === 'NSE') {
                securityIdMap[symbol]         = secId;
                securityIdToSymbol[String(secId)] = symbol;
                const name = (iName >= 0 && cols[iName]?.trim()) || (iCustom >= 0 && cols[iCustom]?.trim()) || '';
                if (name) symbolNames[symbol] = name;
            } else {
                bseSecurityIdMap[symbol] = secId;
            }
        }

        scripMasterLoaded = Object.keys(securityIdMap).length > 0;
        if (scripMasterLoaded) {
            console.log(`[Dhan] Scrip master loaded — ${Object.keys(securityIdMap).length} NSE EQ + ${Object.keys(bseSecurityIdMap).length} BSE EQ symbols`);
        } else {
            console.warn('[Dhan] Scrip master parsed but no symbols found — check CSV format');
        }
    } catch (e) {
        console.warn('[Dhan] Scrip master load failed:', e.message);
    }
}

// ─── Config ───────────────────────────────────────────────────────────────────

function isConfigured() {
    const cid = process.env.DHAN_CLIENT_ID;
    const tok = process.env.DHAN_ACCESS_TOKEN;
    return !!(cid && tok && cid !== 'YOUR_DHAN_CLIENT_ID' && tok !== 'YOUR_DHAN_ACCESS_TOKEN');
}

function getHeaders() {
    return {
        'client-id':     process.env.DHAN_CLIENT_ID || '',
        'access-token':  process.env.DHAN_ACCESS_TOKEN || '',
        'Content-Type':  'application/json',
        'Accept':        'application/json',
    };
}

// ─── Quote Fetch ──────────────────────────────────────────────────────────────

/**
 * Fetch full OHLCV quotes for a list of NSE symbols via Dhan API.
 * Returns: { [symbol]: { ltp, open, high, low, previousClose, volume, change, changePercent, source } }
 */
async function fetchDhanStockQuotes(symbols) {
    if (!isConfigured()) {
        console.log('[Dhan] Credentials not set — skipping');
        return {};
    }

    if (!scripMasterLoaded) await loadScripMaster();

    // Build security ID list and reverse map for this request
    const reqSecIds = [];
    const idToSym   = {};
    for (const sym of symbols) {
        const id = securityIdMap[sym];
        if (id) {
            reqSecIds.push(id);
            idToSym[String(id)] = sym;
        } else {
            console.log(`[Dhan] No security ID for symbol: ${sym}`);
        }
    }

    if (reqSecIds.length === 0) {
        console.warn('[Dhan] No security IDs resolved — is scrip master loaded?');
        return {};
    }

    const results = {};
    const BATCH = 100; // Dhan supports up to 100 instruments per call

    for (let i = 0; i < reqSecIds.length; i += BATCH) {
        const batch = reqSecIds.slice(i, i + BATCH);
        try {
            const res = await fetch(`${DHAN_BASE}/v2/marketfeed/quote`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ NSE_EQ: batch }),
                signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) {
                const body = await res.text().catch(() => '');
                console.warn(`[Dhan] Quote API error ${res.status}: ${body.slice(0, 120)}`);
                continue;
            }

            const json = await res.json();

            // Dhan v2 response: { status, data: { NSE_EQ: { "<secId>": { last_price, open, high, low, close, volume, ... } } } }
            const nseEq = json?.data?.NSE_EQ || {};

            for (const [secIdStr, q] of Object.entries(nseEq)) {
                const sym = idToSym[secIdStr];
                if (!sym) continue;

                // Confirmed Dhan v2 /marketfeed/quote response shape:
                // last_price, ohlc.{open,high,low,close}, volume,
                // net_change, 52_week_high, 52_week_low
                const ltp       = q.last_price ?? 0;
                const open      = q.ohlc?.open  ?? 0;
                const high      = q.ohlc?.high  ?? 0;
                const low       = q.ohlc?.low   ?? 0;
                const prevClose = q.ohlc?.close ?? 0;
                const volume    = q.volume ?? 0;
                const change    = q.net_change ?? (ltp - prevClose);
                const chgPct    = prevClose > 0 ? (change / prevClose) * 100 : 0;

                results[sym] = {
                    symbol: sym,
                    ltp:           Math.round(ltp * 100) / 100,
                    open,
                    high,
                    low,
                    previousClose: prevClose,
                    volume,
                    change:        Math.round(change * 100) / 100,
                    changePercent: Math.round(chgPct  * 100) / 100,
                    high52w:       q['52_week_high'] ?? 0,
                    low52w:        q['52_week_low']  ?? 0,
                    currency:      'INR',
                    source:        'DHAN_LIVE',
                };
            }

            // Small delay between batches
            if (i + BATCH < reqSecIds.length) {
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (e) {
            console.warn(`[Dhan] Quote fetch batch error: ${e.message}`);
        }
    }

    const count = Object.keys(results).length;
    if (count > 0) {
        console.log(`[Dhan] Quotes fetched: ${count}/${symbols.length} symbols via DHAN_LIVE`);
    }
    return results;
}

/**
 * Fetch LTP only (lighter call) — use for rapid refresh cycles.
 * Returns same shape as fetchDhanStockQuotes but OHLC fields = 0.
 */
async function fetchDhanLTP(symbols) {
    if (!isConfigured()) return {};
    if (!scripMasterLoaded) await loadScripMaster();

    const reqSecIds = [];
    const idToSym = {};
    for (const sym of symbols) {
        const id = securityIdMap[sym];
        if (id) { reqSecIds.push(id); idToSym[String(id)] = sym; }
    }
    if (reqSecIds.length === 0) return {};

    const results = {};
    const BATCH = 100;

    for (let i = 0; i < reqSecIds.length; i += BATCH) {
        const batch = reqSecIds.slice(i, i + BATCH);
        try {
            const res = await fetch(`${DHAN_BASE}/v2/marketfeed/ltp`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ NSE_EQ: batch }),
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) continue;
            const json = await res.json();
            const nseEq = json?.data?.NSE_EQ || {};

            for (const [secIdStr, q] of Object.entries(nseEq)) {
                const sym = idToSym[secIdStr];
                if (!sym) continue;
                results[sym] = {
                    symbol: sym,
                    ltp: Math.round((q.last_price ?? 0) * 100) / 100,
                    source: 'DHAN_LIVE',
                };
            }
        } catch (e) {
            console.warn('[Dhan] LTP batch error:', e.message);
        }
    }
    return results;
}

// ─── Historical daily candles (used to backfill real holding avg prices) ───

/**
 * Real daily OHLC history for one NSE equity symbol between two dates via
 * Dhan's v2 historical charts endpoint. Returns an array of
 * { date: 'YYYY-MM-DD', open, high, low, close, volume }, oldest first, or
 * [] if Dhan isn't configured / the symbol has no security ID / the call
 * fails — callers should treat that as "no real data available", not throw.
 */
async function fetchDhanHistoricalDaily(symbol, fromDate, toDate) {
    if (!isConfigured()) return [];
    if (!scripMasterLoaded) await loadScripMaster();

    const securityId = securityIdMap[symbol];
    if (!securityId) {
        console.log(`[Dhan] No security ID for historical fetch: ${symbol}`);
        return [];
    }

    try {
        const res = await fetch(`${DHAN_BASE}/v2/charts/historical`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({
                securityId: String(securityId),
                exchangeSegment: 'NSE_EQ',
                instrument: 'EQUITY',
                expiryCode: 0,
                fromDate,
                toDate,
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[Dhan] Historical API error ${res.status} for ${symbol}: ${body.slice(0, 150)}`);
            return [];
        }

        const json = await res.json();
        const { open = [], high = [], low = [], close = [], volume = [], timestamp = [] } = json || {};
        return timestamp.map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().slice(0, 10),
            open: open[i], high: high[i], low: low[i], close: close[i], volume: volume[i],
        }));
    } catch (e) {
        console.warn(`[Dhan] Historical fetch error for ${symbol}: ${e.message}`);
        return [];
    }
}

// ─── BSE quote (on-demand, e.g. NSE/BSE toggle on the order entry screen) ────

/**
 * Real BSE_EQ quote for a single symbol — not the fake "NSE price minus a
 * few paise" formula the mobile app used to compute. Falls back to null if
 * the symbol has no BSE listing in the scrip master or Dhan has no data.
 */
async function fetchDhanBseQuote(symbol) {
    if (!isConfigured()) return null;
    if (!scripMasterLoaded) await loadScripMaster();

    const hit = bseQuoteCache[symbol];
    if (hit && Date.now() - hit.at < BSE_QUOTE_TTL) return hit.data;

    const secId = bseSecurityIdMap[symbol];
    if (!secId) {
        console.warn(`[Dhan] No BSE security ID for symbol: ${symbol} (bseSecurityIdMap has ${Object.keys(bseSecurityIdMap).length} entries)`);
        return null;
    }

    try {
        const res = await fetch(`${DHAN_BASE}/v2/marketfeed/quote`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ BSE_EQ: [secId] }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[Dhan] BSE quote error ${res.status}: ${body.slice(0, 150)}`);
            return null;
        }
        const json = await res.json();
        const q = json?.data?.BSE_EQ?.[String(secId)];
        if (!q) {
            console.warn(`[Dhan] BSE quote: no data for secId ${secId} in response: ${JSON.stringify(json).slice(0, 200)}`);
            return null;
        }

        const ltp = q.last_price ?? 0;
        const prevClose = q.ohlc?.close ?? 0;
        const change = q.net_change ?? (ltp - prevClose);
        const data = {
            symbol, exchange: 'BSE',
            ltp: Math.round(ltp * 100) / 100,
            open: q.ohlc?.open ?? 0, high: q.ohlc?.high ?? 0, low: q.ohlc?.low ?? 0,
            previousClose: prevClose,
            change: Math.round(change * 100) / 100,
            changePercent: prevClose > 0 ? Math.round((change / prevClose) * 10000) / 100 : 0,
            source: 'DHAN_LIVE',
        };
        bseQuoteCache[symbol] = { at: Date.now(), data };
        return data;
    } catch (e) {
        console.warn(`[Dhan] fetchDhanBseQuote(${symbol}) error:`, e.message);
        return null;
    }
}

// ─── Index Quotes (IDX_I segment) ────────────────────────────────────────────
// Verified live from Dhan API (July 2026):
//   13=NIFTY 50, 25=BANK NIFTY, 51=SENSEX, 21=INDIA VIX,
//   10=NIFTY IT, 11=NIFTY MID SELECT, 28=NIFTY NEXT 50
// Verified directly against Dhan's api-scrip-master.csv (segment "I" rows) —
// NIFTY IT was previously wrong (10, which is actually "NIFTY LARGEMID250");
// the real id is 29. MIDCPNIFTY/NIFTYNXT50/BANKEX added for full option-chain coverage.
const INDEX_SECURITY_IDS = {
    'NIFTY 50':      13,
    'BANK NIFTY':    25,
    'SENSEX':        51,
    'INDIA VIX':     21,
    'NIFTY IT':      29,
    'FINNIFTY':      27,
    'MIDCPNIFTY':    442,
    'NIFTY NEXT 50': 38,
    'BANKEX':        69,   // BSE index — Dhan's IDX_I segment is exchange-agnostic
};

/**
 * Fetch live index prices from Dhan IDX_I segment.
 * Returns: { [indexName]: { name, ltp, change, changePercent, source } }
 */
async function fetchDhanIndices() {
    if (!isConfigured()) return {};

    const idToName = Object.fromEntries(
        Object.entries(INDEX_SECURITY_IDS).map(([name, id]) => [String(id), name])
    );
    const secIds = Object.values(INDEX_SECURITY_IDS);

    try {
        const res = await fetch(`${DHAN_BASE}/v2/marketfeed/quote`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ IDX_I: secIds }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[Dhan] Index quote error ${res.status}: ${body.slice(0, 80)}`);
            return {};
        }

        const json = await res.json();
        const idxData = json?.data?.IDX_I || {};
        const results = {};

        for (const [secIdStr, q] of Object.entries(idxData)) {
            const name = idToName[secIdStr];
            if (!name) continue;

            const ltp       = q.last_price ?? 0;
            const prevClose = q.ohlc?.close ?? 0;
            const change    = q.net_change ?? (ltp - prevClose);
            const chgPct    = prevClose > 0 ? (change / prevClose) * 100 : 0;

            results[name] = {
                name,
                ltp:           Math.round(ltp * 100) / 100,
                open:          q.ohlc?.open  ?? 0,
                high:          q.ohlc?.high  ?? 0,
                low:           q.ohlc?.low   ?? 0,
                previousClose: prevClose,
                change:        Math.round(change * 100) / 100,
                changePercent: Math.round(chgPct  * 100) / 100,
                symbol:        name.replace(/ /g, '_'),
                source:        'DHAN_LIVE',
            };
        }

        if (Object.keys(results).length > 0) {
            console.log(`[Dhan] Indices: ${Object.keys(results).join(', ')}`);
        }
        return results;
    } catch (e) {
        console.warn('[Dhan] fetchDhanIndices error:', e.message);
        return {};
    }
}

/**
 * Fast LTP-only refresh for stocks during market hours (single batch call).
 * Merges into existing stockPrices cache — only updates ltp, change, changePercent.
 */
async function fetchDhanLTPAll(symbols) {
    if (!isConfigured()) return {};

    const reqSecIds = [];
    const idToSym   = {};
    for (const sym of symbols) {
        const id = securityIdMap[sym];
        if (id) { reqSecIds.push(id); idToSym[String(id)] = sym; }
    }
    if (reqSecIds.length === 0) return {};

    const results = {};
    try {
        const res = await fetch(`${DHAN_BASE}/v2/marketfeed/ltp`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ NSE_EQ: reqSecIds, IDX_I: Object.values(INDEX_SECURITY_IDS) }),
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return {};
        const json = await res.json();

        // Stock LTPs
        for (const [secIdStr, q] of Object.entries(json?.data?.NSE_EQ || {})) {
            const sym = idToSym[secIdStr];
            if (sym) results[sym] = { ltp: Math.round((q.last_price ?? 0) * 100) / 100, source: 'DHAN_LIVE' };
        }
        // Index LTPs
        const idxIdToName = Object.fromEntries(
            Object.entries(INDEX_SECURITY_IDS).map(([n, id]) => [String(id), n])
        );
        for (const [secIdStr, q] of Object.entries(json?.data?.IDX_I || {})) {
            const name = idxIdToName[secIdStr];
            if (name) results[`__IDX__${name}`] = { ltp: Math.round((q.last_price ?? 0) * 100) / 100 };
        }
    } catch (e) {
        console.warn('[Dhan] fetchDhanLTPAll error:', e.message);
    }
    return results;
}

// ─── Option Chain (real NFO data) ─────────────────────────────────────────────
// Docs: https://dhanhq.co/docs/v2/option-chain/
// Rate limit: 1 option-chain request per ~3s per underlying — callers must cache.

/**
 * Expiry list for an index underlying.
 * Returns ['YYYY-MM-DD', ...] or null on failure.
 */
async function fetchDhanExpiryList(underlyingScrip) {
    if (!isConfigured()) return null;
    try {
        const res = await fetch(`${DHAN_BASE}/v2/optionchain/expirylist`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ UnderlyingScrip: underlyingScrip, UnderlyingSeg: 'IDX_I' }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[Dhan] Expiry list error ${res.status}: ${body.slice(0, 100)}`);
            return null;
        }
        const json = await res.json();
        const list = json?.data;
        return Array.isArray(list) && list.length > 0 ? list : null;
    } catch (e) {
        console.warn('[Dhan] fetchDhanExpiryList error:', e.message);
        return null;
    }
}

/**
 * Full option chain for an index underlying + expiry.
 * Returns { underlyingPrice, rows: [{ strike, ce: {...}, pe: {...} }] } or null.
 */
async function fetchDhanOptionChain(underlyingScrip, expiry) {
    if (!isConfigured() || !expiry) return null;
    try {
        const res = await fetch(`${DHAN_BASE}/v2/optionchain`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ UnderlyingScrip: underlyingScrip, UnderlyingSeg: 'IDX_I', Expiry: expiry }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[Dhan] Option chain error ${res.status}: ${body.slice(0, 100)}`);
            return null;
        }
        const json = await res.json();
        const oc = json?.data?.oc;
        if (!oc || Object.keys(oc).length === 0) return null;

        const normalizeSide = (s) => {
            if (!s) return null;
            const ltp       = s.last_price ?? 0;
            const prevClose = s.previous_close_price ?? 0;
            const oi        = s.oi ?? 0;
            return {
                oi,
                oiChange: oi - (s.previous_oi ?? oi),
                volume:   s.volume ?? 0,
                iv:       Math.round((s.implied_volatility ?? 0) * 100) / 100,
                ltp:      Math.round(ltp * 100) / 100,
                change:   Math.round((ltp - prevClose) * 100) / 100,
                delta:    Math.round((s.greeks?.delta ?? 0) * 100) / 100,
                bid:      s.top_bid_price ?? 0,
                ask:      s.top_ask_price ?? 0,
            };
        };

        const rows = Object.entries(oc)
            .map(([strikeStr, sides]) => ({
                strike: Math.round(parseFloat(strikeStr)),
                ce: normalizeSide(sides.ce),
                pe: normalizeSide(sides.pe),
            }))
            .filter(r => r.ce && r.pe)
            .sort((a, b) => a.strike - b.strike);

        return { underlyingPrice: json?.data?.last_price ?? 0, rows };
    } catch (e) {
        console.warn('[Dhan] fetchDhanOptionChain error:', e.message);
        return null;
    }
}

// ─── Full-universe search over the scrip master ──────────────────────────────
function searchScrips(query, limit = 25) {
    const q = String(query || '').toUpperCase().trim();
    if (!q) return [];
    const starts = [];
    const contains = [];
    for (const [symbol, secId] of Object.entries(securityIdMap)) {
        const name = (symbolNames[symbol] || '').toUpperCase();
        if (symbol.startsWith(q)) starts.push({ symbol, name: symbolNames[symbol] || symbol, securityId: secId });
        else if (symbol.includes(q) || name.includes(q)) contains.push({ symbol, name: symbolNames[symbol] || symbol, securityId: secId });
        if (starts.length >= limit) break;
    }
    return [...starts, ...contains].slice(0, limit);
}

function getAllEquitySymbols() {
    return Object.keys(securityIdMap);
}

// Kick off scrip master download at module load (non-blocking)
loadScripMaster().catch(() => {});

module.exports = {
    fetchDhanStockQuotes,
    fetchDhanLTP,
    fetchDhanIndices,
    fetchDhanLTPAll,
    isConfigured,
    loadScripMaster,
    getSecurityId: (sym) => securityIdMap[sym] ?? null,
    getSymbolFromId: (id) => securityIdToSymbol[String(id)] ?? null,
    getSymbolName: (sym) => symbolNames[sym] ?? null,
    searchScrips,
    getAllEquitySymbols,
    fetchDhanExpiryList,
    fetchDhanOptionChain,
    fetchDhanBseQuote,
    fetchDhanHistoricalDaily,
    INDEX_SECURITY_IDS,
};
