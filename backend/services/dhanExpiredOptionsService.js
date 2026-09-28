'use strict';

/**
 * dhanExpiredOptionsService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Historical & Expired Options Candle Data Service
 * Docs: https://dhanhq.co/docs/v2/expired-options-data/
 *
 * Endpoint: POST https://api.dhan.co/v2/charts/historical
 *
 * Capabilities:
 * - Fetches historical 1m, 5m, 15m, 25m, 60m candles for expired options contracts
 * - Retrieves Open, High, Low, Close, Volume, Implied Volatility (IV), OI, and Spot price
 * - Supports Index Options (NIFTY, BANKNIFTY, SENSEX, FINNIFTY) and Stock Options
 * - Transforms parallel array responses into structured OHLCV time-series objects
 * - Powers Options Backtesting, Replay Simulation, and Strategy Analytics
 */

const dhanDataService = require('../dhanDataService');

const DHAN_BASE = 'https://api.dhan.co';

// In-memory cache for historical expired candles (1 hour TTL)
const expiredCandlesCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Fetch expired options candles from Dhan
 *
 * @param {Object} params
 * @param {string} params.underlyingSymbol - 'NIFTY 50', 'BANK NIFTY', 'SENSEX', 'FINNIFTY', etc.
 * @param {string} [params.exchangeSegment='NSE_FNO'] - 'NSE_FNO' or 'BSE_FNO'
 * @param {string} [params.instrument='OPTIDX'] - 'OPTIDX' or 'OPTSTK'
 * @param {string|number} [params.interval='5'] - '1', '5', '15', '25', '60'
 * @param {string} [params.expiryFlag='WEEK'] - 'WEEK' or 'MONTH'
 * @param {number} [params.expiryCode=0] - 0 = Current/Near, 1 = Next, 2 = Far
 * @param {string} [params.strike='ATM'] - 'ATM', 'ATM+1', 'ATM-1', 'ATM+2', etc.
 * @param {string} [params.drvOptionType='CALL'] - 'CALL' or 'PUT'
 * @param {string} params.fromDate - 'YYYY-MM-DD'
 * @param {string} params.toDate - 'YYYY-MM-DD'
 * @param {Object} [params.creds=null] - Optional Dhan credentials
 */
async function fetchExpiredOptionCandles({
    underlyingSymbol = 'NIFTY 50',
    exchangeSegment = null,
    instrument = 'OPTIDX',
    interval = '5',
    expiryFlag = 'WEEK',
    expiryCode = 0,
    strike = 'ATM',
    drvOptionType = 'CALL',
    fromDate,
    toDate,
    creds = null,
}) {
    if (!fromDate || !toDate) {
        throw new Error('fromDate and toDate are required in YYYY-MM-DD format');
    }

    // Resolve underlying Security ID
    const norm = underlyingSymbol.toUpperCase().trim();
    let secId = dhanDataService.INDEX_SECURITY_IDS[norm];
    if (!secId) {
        if (norm === 'NIFTY' || norm === 'NIFTY50') secId = 13;
        else if (norm === 'BANKNIFTY') secId = 25;
        else if (norm === 'SENSEX') secId = 51;
        else if (norm === 'FINNIFTY') secId = 27;
        else if (norm === 'MIDCPNIFTY') secId = 442;
        else secId = 13; // default NIFTY
    }

    // Segment resolution: SENSEX / BANKEX derivatives trade on BSE_FNO
    let seg = exchangeSegment;
    if (!seg) {
        seg = (norm === 'SENSEX' || norm === 'BANKEX') ? 'BSE_FNO' : 'NSE_FNO';
    }

    const optType = drvOptionType.toUpperCase() === 'PUT' ? 'PUT' : 'CALL';
    const cleanStrike = strike.toUpperCase().replace(/\s+/g, '');
    const cleanInterval = String(interval);

    // Cache key check
    const cacheKey = `${secId}_${seg}_${cleanInterval}_${expiryFlag}_${expiryCode}_${cleanStrike}_${optType}_${fromDate}_${toDate}`;
    const cached = expiredCandlesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    const payload = {
        securityId: String(secId),
        exchangeSegment: seg,
        instrument,
        interval: cleanInterval,
        expiryFlag,
        expiryCode: Number(expiryCode),
        strike: cleanStrike,
        drvOptionType: optType,
        requiredData: ['open', 'high', 'low', 'close', 'volume', 'iv', 'oi', 'spot'],
        fromDate,
        toDate,
    };

    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'access-token': creds?.accessToken || process.env.DHAN_ACCESS_TOKEN || '',
        'client-id': creds?.clientId || process.env.DHAN_CLIENT_ID || '',
    };

    if (!headers['access-token'] || !headers['client-id']) {
        console.warn('[DhanExpired] Credentials not configured for expired options');
        return { candles: [], source: 'UNCONFIGURED' };
    }

    try {
        const res = await fetch(`${DHAN_BASE}/v2/charts/historical`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[DhanExpired] API error ${res.status}: ${body.slice(0, 150)}`);
            return { candles: [], source: 'DHAN_ERROR', status: res.status, error: body };
        }

        const json = await res.json();
        const sideData = optType === 'CALL' ? json?.data?.ce : json?.data?.pe;

        if (!sideData || !Array.isArray(sideData.timestamp) || sideData.timestamp.length === 0) {
            return { candles: [], source: 'DHAN_NO_DATA' };
        }

        const len = sideData.timestamp.length;
        const candles = [];

        for (let i = 0; i < len; i++) {
            const epochSec = sideData.timestamp[i];
            const d = new Date(epochSec * 1000);

            candles.push({
                timestamp: epochSec,
                time: d.toISOString(),
                istTime: d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                open: sideData.open?.[i] ?? 0,
                high: sideData.high?.[i] ?? 0,
                low: sideData.low?.[i] ?? 0,
                close: sideData.close?.[i] ?? 0,
                volume: sideData.volume?.[i] ?? 0,
                iv: sideData.iv?.[i] ?? 0,
                oi: sideData.oi?.[i] ?? 0,
                spot: sideData.spot?.[i] ?? 0,
                strike: sideData.strike?.[i] ?? cleanStrike,
            });
        }

        const result = {
            underlyingSymbol,
            securityId: secId,
            segment: seg,
            optionType: optType,
            strike: cleanStrike,
            interval: cleanInterval,
            count: candles.length,
            candles,
            source: 'DHAN_EXPIRED_HISTORICAL',
        };

        // Cache result
        expiredCandlesCache.set(cacheKey, { timestamp: Date.now(), data: result });

        return result;
    } catch (err) {
        console.error('[DhanExpired] Fetch failed:', err.message);
        return { candles: [], error: err.message, source: 'ERROR' };
    }
}

module.exports = {
    fetchExpiredOptionCandles,
};
