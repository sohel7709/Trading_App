'use strict';

// Dhan API — live market data integration
// Docs: https://dhanhq.co/docs/v2/market-feed/

const DHAN_BASE = 'https://api.dhan.co';
const SCRIP_MASTER_URL = 'https://images.dhan.co/api-data/api-scrip-master.csv';

// symbol → integer securityId (loaded from Dhan scrip master CSV)
let securityIdMap = {};
// string(securityId) → symbol (reverse lookup)
let securityIdToSymbol = {};
let scripMasterLoaded = false;
let scripMasterLoading = false;

// ─── Scrip Master ────────────────────────────────────────────────────────────

async function loadScripMaster() {
    if (scripMasterLoaded || scripMasterLoading) return;
    scripMasterLoading = true;
    try {
        const res = await fetch(SCRIP_MASTER_URL, {
            signal: AbortSignal.timeout(20000),
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

        if (iExch < 0 || iSecId < 0 || iSymbol < 0) {
            throw new Error('Unexpected CSV header: ' + lines[0].slice(0, 120));
        }

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (!cols[iExch]) continue;
            if (cols[iExch].trim() !== 'NSE') continue;
            if (iSeg  >= 0 && cols[iSeg].trim()    !== 'E')  continue;
            if (iSeries >= 0 && cols[iSeries].trim() !== 'EQ') continue;

            const symbol = cols[iSymbol]?.trim();
            const secId  = parseInt(cols[iSecId], 10);
            if (symbol && !isNaN(secId) && secId > 0) {
                securityIdMap[symbol]         = secId;
                securityIdToSymbol[String(secId)] = symbol;
            }
        }

        scripMasterLoaded = Object.keys(securityIdMap).length > 0;
        if (scripMasterLoaded) {
            console.log(`[Dhan] Scrip master loaded — ${Object.keys(securityIdMap).length} NSE EQ symbols`);
        } else {
            console.warn('[Dhan] Scrip master parsed but no symbols found — check CSV format');
        }
    } catch (e) {
        console.warn('[Dhan] Scrip master load failed:', e.message);
    } finally {
        scripMasterLoading = false;
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

                // Field names vary slightly across Dhan API versions — handle both
                const ltp       = q.last_price ?? q.ltp ?? q.lastPrice ?? 0;
                const prevClose = q.close ?? q.prev_close ?? q.previousClose ?? 0;
                const open      = q.open  ?? 0;
                const high      = q.high  ?? 0;
                const low       = q.low   ?? 0;
                const volume    = q.volume ?? q.tot_trd_qty ?? 0;
                const change    = ltp - prevClose;
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
                const ltp = q.last_price ?? q.ltp ?? q.lastPrice ?? 0;
                results[sym] = {
                    symbol: sym,
                    ltp: Math.round(ltp * 100) / 100,
                    source: 'DHAN_LIVE',
                };
            }
        } catch (e) {
            console.warn('[Dhan] LTP batch error:', e.message);
        }
    }
    return results;
}

// Kick off scrip master download at module load (non-blocking)
loadScripMaster().catch(() => {});

module.exports = {
    fetchDhanStockQuotes,
    fetchDhanLTP,
    isConfigured,
    loadScripMaster,
    getSecurityId: (sym) => securityIdMap[sym] ?? null,
    getSymbolFromId: (id) => securityIdToSymbol[String(id)] ?? null,
};
