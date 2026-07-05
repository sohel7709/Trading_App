// Candle data service
// Uses yahoo-finance2 v3 chart() API for real OHLCV data
// Live-data only: when the market is closed or Yahoo has nothing for the
// requested window, we widen the lookback and/or serve the last real
// historical candles we cached — never synthetic/simulated data.

const yf2 = require('yahoo-finance2');
const YahooFinance = yf2.default;
const yf = new YahooFinance({ suppressNotices: ['ripHistorical'], validation: { logErrors: false } });

// ─── Symbol maps ─────────────────────────────────────────────────
const INDEX_YAHOO_MAP = {
    'NIFTY 50':    '^NSEI',
    'BANK NIFTY':  '^NSEBANK',
    'SENSEX':      '^BSESN',
    'NIFTY IT':    '^CNXIT',
    'FINNIFTY':    'NIFTY_FIN_SERVICE.NS',
    'INDIA VIX':   '^INDIAVIX',
    'NIFTY 100':   '^CNX100',
    'NIFTY MIDCAP':'NIFTY_MIDCAP_50.NS',
    // Verified live via yahoo-finance2 .quote() before wiring in
    'MIDCPNIFTY':    'NIFTY_MID_SELECT.NS',
    'NIFTY NEXT 50': '^NSMIDCP',
    'BANKEX':        'BSE-BANK.BO',
};

const INDEX_BASE_PRICES = {
    'NIFTY 50':   24085, 'BANK NIFTY': 57585,
    'SENSEX':     77155, 'NIFTY IT':   28810,
    'FINNIFTY':   26405, 'INDIA VIX':  13.2,
    'MIDCPNIFTY': 14564, 'NIFTY NEXT 50': 72363, 'BANKEX': 65494,
};

// How many days of data to request per interval (non-Yahoo intervals are aggregated from base intervals)
const PERIOD_DAYS = { '1m': 1, '3m': 1, '5m': 2, '15m': 7, '30m': 7, '1h': 30, '1d': 365 };
// Yahoo only serves 1m/5m/15m/1h/1d natively — everything else is aggregated,
// which gives the full TradingView-style timeframe menu (2m…4h, 1W).
const AGGREGATE_MAP = {
    '2m':  { base: '1m',  factor: 2 },
    '3m':  { base: '1m',  factor: 3 },
    '4m':  { base: '1m',  factor: 4 },
    '10m': { base: '5m',  factor: 2 },
    '30m': { base: '15m', factor: 2 },
    '2h':  { base: '1h',  factor: 2 },
    '3h':  { base: '1h',  factor: 3 },
    '4h':  { base: '1h',  factor: 4 },
    '1w':  { base: '1d',  factor: 5 },
};

const SUPPORTED_INTERVALS = ['1m', '2m', '3m', '4m', '5m', '10m', '15m', '30m', '1h', '2h', '3h', '4h', '1d', '1w'];

// Aggregate OHLCV candles: merge every `factor` candles into one
function aggregateCandles(candles, factor) {
    if (!factor || factor <= 1) return candles;
    const out = [];
    for (let i = 0; i < candles.length; i += factor) {
        const chunk = candles.slice(i, i + factor);
        if (!chunk.length) continue;
        out.push({
            time:   chunk[0].time,
            open:   chunk[0].open,
            high:   Math.max(...chunk.map(c => c.high)),
            low:    Math.min(...chunk.map(c => c.low)),
            close:  chunk[chunk.length - 1].close,
            volume: chunk.reduce((s, c) => s + (c.volume || 0), 0),
        });
    }
    return out;
}

// OHLCV cache: key → { candles, fetchedAt, source }
// Also doubles as the "last known real data" store: when Yahoo is down or
// the market is closed with nothing in the requested window, callers serve
// straight from here instead of the TTL-gated path, so charts always show
// real historical candles rather than going blank or synthetic.
const cache = {};
const CACHE_TTL = {
    '1m': 60e3, '3m': 60e3,
    '5m': 2 * 60e3, '15m': 5 * 60e3, '30m': 5 * 60e3,
    '1h': 5 * 60e3,
    '1d': 30 * 60e3,
};

// ─── Live tick accumulator ────────────────────────────────────────
// Stores raw price ticks from socket broadcasts for building live candles
const liveTicks = {}; // { [indexName]: [{ time: ms, price }] }
const TICK_TTL = 24 * 60 * 60 * 1000; // keep 24h of ticks

function recordTick(indexName, price) {
    if (!price || price <= 0) return;
    if (!liveTicks[indexName]) liveTicks[indexName] = [];
    liveTicks[indexName].push({ time: Date.now(), price });
    // Trim ticks older than 24h
    const cutoff = Date.now() - TICK_TTL;
    liveTicks[indexName] = liveTicks[indexName].filter(t => t.time >= cutoff);
}

function buildCandlesFromTicks(indexName, intervalMs) {
    const ticks = liveTicks[indexName] || [];
    if (!ticks.length) return [];

    const buckets = {};
    for (const tick of ticks) {
        const bucket = Math.floor(tick.time / intervalMs) * intervalMs;
        if (!buckets[bucket]) {
            buckets[bucket] = { time: Math.floor(bucket / 1000), open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: 0, isLive: true };
        } else {
            buckets[bucket].high  = Math.max(buckets[bucket].high, tick.price);
            buckets[bucket].low   = Math.min(buckets[bucket].low,  tick.price);
            buckets[bucket].close = tick.price;
        }
    }
    return Object.values(buckets).sort((a, b) => a.time - b.time);
}

function getLastTickPrice(indexName) {
    const ticks = liveTicks[indexName];
    if (!ticks || !ticks.length) return null;
    return ticks[ticks.length - 1].price;
}

// ─── Yahoo Finance fetcher (v3 chart API) ─────────────────────────
async function fetchYahooCandles(yahooSymbol, interval, daysOverride) {
    const days = daysOverride || PERIOD_DAYS[interval] || 365;
    const period2 = new Date();
    const period1 = new Date(); period1.setDate(period1.getDate() - days);

    try {
        const result = await yf.chart(yahooSymbol, { period1, period2, interval });
        const quotes = result?.quotes || [];
        if (quotes.length < 3) return null;

        return quotes
            .filter(q => q.open && q.high && q.low && q.close)
            .map(q => ({
                time:   Math.floor(new Date(q.date).getTime() / 1000),
                open:   Math.round(q.open  * 100) / 100,
                high:   Math.round(q.high  * 100) / 100,
                low:    Math.round(q.low   * 100) / 100,
                close:  Math.round(q.close * 100) / 100,
                volume: q.volume || 0,
            }))
            .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time); // dedup
    } catch (e) {
        console.log(`[Candles] Yahoo ${yahooSymbol} (${interval}) failed: ${e.message.substring(0, 80)}`);
        return null;
    }
}

// ─── Public: stock candles ────────────────────────────────────────
async function generateCandles(symbol, interval) {
    // Aggregated intervals: fetch the base interval, then merge candles
    if (AGGREGATE_MAP[interval]) {
        const { base, factor } = AGGREGATE_MAP[interval];
        const baseCandles = await generateCandles(symbol, base);
        return aggregateCandles(baseCandles, factor);
    }

    const normSymbol = symbol.toUpperCase();
    const cacheKey = `STOCK_${normSymbol}_${interval}`;
    const now = Date.now();
    const ttl = CACHE_TTL[interval] || CACHE_TTL['1d'];

    if (cache[cacheKey] && (now - cache[cacheKey].fetchedAt) < ttl) {
        // For intraday intervals, patch the last candle with the latest live
        // tick so the candle keeps moving between Yahoo TTL refreshes.
        const candles = [...cache[cacheKey].candles];
        if (['1m', '5m', '15m', '1h', '1d'].includes(interval)) {
            const livePrice = getLastTickPrice(normSymbol);
            if (livePrice && candles.length > 0) {
                const last = { ...candles[candles.length - 1] };
                last.close = livePrice;
                last.high  = Math.max(last.high, livePrice);
                last.low   = Math.min(last.low,  livePrice);
                candles[candles.length - 1] = last;
            }
        }
        return candles;
    }

    const yahooSym = `${normSymbol}.NS`;
    let candles = await fetchYahooCandles(yahooSym, interval);

    // Market closed / no candles in the default window (e.g. weekend, holiday) —
    // widen the lookback so we still surface the last real trading session.
    if ((!candles || candles.length <= 5) && (PERIOD_DAYS[interval] || 365) < 7) {
        candles = await fetchYahooCandles(yahooSym, interval, 7);
    }

    if (candles && candles.length > 5) {
        console.log(`[Candles] ${symbol} (${interval}): ${candles.length} candles from Yahoo`);
        cache[cacheKey] = { candles, fetchedAt: now, source: 'yahoo' };
        return candles;
    }

    // Yahoo unavailable — serve the last real historical candles we have
    // rather than fabricating data.
    if (cache[cacheKey]) {
        console.log(`[Candles] ${symbol} (${interval}): Yahoo unavailable, serving last cached historical data`);
        return cache[cacheKey].candles;
    }

    console.log(`[Candles] ${symbol} (${interval}): no real data available`);
    return [];
}

// ─── Public: index candles ────────────────────────────────────────
async function generateIndexCandles(indexName, interval) {
    const normalised = Object.keys(INDEX_BASE_PRICES).find(
        k => k.toUpperCase() === indexName.toUpperCase() ||
             k.replace(/ /g, '') === indexName.replace(/ /g, '').toUpperCase()
    ) || 'NIFTY 50';

    // 3m/30m: fetch from base interval then aggregate
    if (AGGREGATE_MAP[interval]) {
        const { base, factor } = AGGREGATE_MAP[interval];
        const baseCandles = await generateIndexCandles(indexName, base);
        return aggregateCandles(baseCandles, factor);
    }

    const cacheKey = `INDEX_${normalised}_${interval}`;
    const now = Date.now();
    const ttl = CACHE_TTL[interval] || CACHE_TTL['1d'];

    if (cache[cacheKey] && (now - cache[cacheKey].fetchedAt) < ttl) {
        // For intraday intervals, patch the last candle with live tick
        const candles = [...cache[cacheKey].candles];
        if (['1m', '5m', '15m', '1h', '1d'].includes(interval)) {
            const livePrice = getLastTickPrice(normalised);
            if (livePrice && candles.length > 0) {
                const last = { ...candles[candles.length - 1] };
                last.close = livePrice;
                last.high  = Math.max(last.high, livePrice);
                last.low   = Math.min(last.low,  livePrice);
                candles[candles.length - 1] = last;
            }
        }
        return candles;
    }

    const yahooSym = INDEX_YAHOO_MAP[normalised];
    if (yahooSym) {
        let candles = await fetchYahooCandles(yahooSym, interval);

        // Market closed / no candles in the default window — widen the
        // lookback so we still surface the last real trading session.
        if ((!candles || candles.length <= 5) && (PERIOD_DAYS[interval] || 365) < 7) {
            candles = await fetchYahooCandles(yahooSym, interval, 7);
        }

        if (candles && candles.length > 5) {
            console.log(`[Candles] ${normalised} (${interval}): ${candles.length} candles from Yahoo`);
            cache[cacheKey] = { candles, fetchedAt: now, source: 'yahoo' };
            return candles;
        }
    }

    // Yahoo unavailable — serve the last real historical candles we have
    // rather than fabricating data.
    if (cache[cacheKey]) {
        console.log(`[Candles] ${normalised} (${interval}): Yahoo unavailable, serving last cached historical data`);
        return cache[cacheKey].candles;
    }

    console.log(`[Candles] ${normalised} (${interval}): no real data available`);
    return [];
}

// Resolves the *actual* underlying cache entry's source for a given
// (type, symbol, interval), following the aggregate-interval -> base-interval
// mapping so 2h/3h/4h/30m/10m/3m/1w report the real source of the data they
// were built from instead of always looking unset.
function getCandleSource(type, symbolOrIndex, interval) {
    const resolved = AGGREGATE_MAP[interval] ? AGGREGATE_MAP[interval].base : interval;
    const key = type === 'index'
        ? `INDEX_${Object.keys(INDEX_BASE_PRICES).find(
              k => k.toUpperCase() === symbolOrIndex.toUpperCase() ||
                   k.replace(/ /g, '') === symbolOrIndex.replace(/ /g, '').toUpperCase()
          ) || 'NIFTY 50'}_${resolved}`
        : `STOCK_${symbolOrIndex.toUpperCase()}_${resolved}`;
    return cache[key]?.source ?? null;
}

// ─── Public: get live accumulated candles from ticks ─────────────
function getLiveCandles(indexName, intervalMs) {
    return buildCandlesFromTicks(indexName, intervalMs);
}

module.exports = {
    generateCandles,
    generateIndexCandles,
    getLiveCandles,
    recordTick,
    getCandleSource,
    INDEX_BASE_PRICES,
    SUPPORTED_INTERVALS,
};
