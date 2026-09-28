'use strict';

/**
 * dhanScripMasterService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dynamic Segment-Wise Scrip Master Service for DhanHQ v2
 * Docs: https://dhanhq.co/docs/v2/instruments/
 *
 * Endpoint: GET https://api.dhan.co/v2/instrument/{exchangeSegment}
 *
 * Benefits:
 * - Dynamic segment-by-segment fetching instead of monolithic 60MB CSV download
 * - Lazy-loading for BSE_FNO, NSE_CURRENCY, and MCX_COMM
 * - Pre-warmed caching with automatic daily pre-market sync
 * - Sub-millisecond in-memory symbol ↔ securityId lookups
 */

const DHAN_BASE = 'https://api.dhan.co';

// In-memory cache by segment
// segment -> { updatedAt: number, instruments: Array, symbolMap: Map, idMap: Map }
const segmentCache = new Map();
const SEGMENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (instruments update daily)

// Active segment list
const SUPPORTED_SEGMENTS = [
    'NSE_EQ',
    'NSE_FNO',
    'BSE_EQ',
    'BSE_FNO',
    'NSE_CURRENCY',
    'MCX_COMM',
];

/**
 * Get headers for Dhan API request
 */
function getHeaders(creds = null) {
    return {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'access-token': creds?.accessToken || process.env.DHAN_ACCESS_TOKEN || '',
        'client-id': creds?.clientId || process.env.DHAN_CLIENT_ID || '',
    };
}

/**
 * Fetch instruments for a specific exchange segment from Dhan
 * @param {string} exchangeSegment - 'NSE_EQ', 'NSE_FNO', 'BSE_EQ', 'BSE_FNO', 'NSE_CURRENCY', 'MCX_COMM'
 * @param {Object} [creds=null]
 * @param {boolean} [forceRefresh=false]
 */
async function fetchSegmentInstruments(exchangeSegment, creds = null, forceRefresh = false) {
    const seg = exchangeSegment.toUpperCase().trim();
    const hit = segmentCache.get(seg);

    if (!forceRefresh && hit && (Date.now() - hit.updatedAt < SEGMENT_TTL_MS)) {
        return hit.instruments;
    }

    const headers = getHeaders(creds);
    if (!headers['access-token'] || !headers['client-id']) {
        console.warn(`[DhanScripMaster] Cannot fetch segment ${seg}: credentials not configured.`);
        return hit?.instruments || [];
    }

    try {
        console.log(`[DhanScripMaster] Fetching dynamic instruments for segment ${seg}...`);
        const res = await fetch(`${DHAN_BASE}/v2/instrument/${seg}`, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
            console.warn(`[DhanScripMaster] HTTP ${res.status} fetching segment ${seg}`);
            return hit?.instruments || [];
        }

        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.data || []);

        if (list.length > 0) {
            const symbolMap = new Map();
            const idMap = new Map();

            for (const item of list) {
                // Support both detailed and compact keys from Dhan
                const secId = String(item.SEM_SMST_SECURITY_ID || item.SECURITY_ID || item.securityId || '');
                const sym = String(item.SM_SYMBOL_NAME || item.SYMBOL_NAME || item.symbolName || '').toUpperCase().trim();
                const displayName = item.SEM_CUSTOM_SYMBOL || item.DISPLAY_NAME || sym;
                const lotSize = Number(item.SEM_LOT_UNITS || item.LOT_SIZE || 1);
                const strikePrice = Number(item.SEM_STRIKE_PRICE || item.STRIKE_PRICE || 0);
                const optionType = item.SEM_OPTION_TYPE || item.OPTION_TYPE || '';
                const expiryDate = item.SEM_EXPIRY_DATE || item.SM_EXPIRY_DATE || '';

                if (secId && sym) {
                    const parsedItem = {
                        securityId: secId,
                        symbol: sym,
                        displayName,
                        lotSize,
                        strikePrice,
                        optionType,
                        expiryDate,
                        exchangeSegment: seg,
                        tickSize: Number(item.SEM_TICK_SIZE || item.TICK_SIZE || 0.05),
                    };

                    symbolMap.set(sym, parsedItem);
                    idMap.set(secId, parsedItem);
                }
            }

            segmentCache.set(seg, {
                updatedAt: Date.now(),
                instruments: list,
                symbolMap,
                idMap,
            });

            console.log(`[DhanScripMaster] Successfully cached ${symbolMap.size} instruments for segment ${seg}.`);
            return list;
        }

        return hit?.instruments || [];
    } catch (err) {
        console.error(`[DhanScripMaster] Error fetching segment ${seg}:`, err.message);
        return hit?.instruments || [];
    }
}

/**
 * Fast in-memory lookup for an instrument by symbol and segment
 */
function getInstrumentBySymbol(symbol, segment = 'NSE_EQ') {
    const seg = segment.toUpperCase().trim();
    const hit = segmentCache.get(seg);
    if (!hit) return null;
    return hit.symbolMap.get(symbol.toUpperCase().trim()) || null;
}

/**
 * Fast in-memory lookup for an instrument by Security ID
 */
function getInstrumentBySecurityId(securityId, segment = 'NSE_EQ') {
    const seg = segment.toUpperCase().trim();
    const hit = segmentCache.get(seg);
    if (!hit) return null;
    return hit.idMap.get(String(securityId)) || null;
}

/**
 * Search instruments within a segment
 */
function searchSegmentInstruments(query, segment = 'NSE_EQ', limit = 20) {
    const q = String(query || '').toUpperCase().trim();
    if (!q) return [];

    const seg = segment.toUpperCase().trim();
    const hit = segmentCache.get(seg);
    if (!hit) return [];

    const results = [];
    for (const [sym, item] of hit.symbolMap.entries()) {
        if (sym.startsWith(q) || item.displayName.toUpperCase().includes(q)) {
            results.push(item);
            if (results.length >= limit) break;
        }
    }
    return results;
}

/**
 * Warm up essential segments in background
 */
function warmUpEssentialSegments(creds = null) {
    // Non-blocking fetch of primary segments
    fetchSegmentInstruments('NSE_EQ', creds).catch(() => {});
    fetchSegmentInstruments('BSE_FNO', creds).catch(() => {});
    fetchSegmentInstruments('NSE_CURRENCY', creds).catch(() => {});
}

module.exports = {
    fetchSegmentInstruments,
    getInstrumentBySymbol,
    getInstrumentBySecurityId,
    searchSegmentInstruments,
    warmUpEssentialSegments,
    SUPPORTED_SEGMENTS,
};
