// Candle data service
// Uses yahoo-finance2 v3 chart() API for real OHLCV data
// Falls back to simulated data when market is closed / API fails

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
};

const INDEX_BASE_PRICES = {
    'NIFTY 50':   24085, 'BANK NIFTY': 57585,
    'SENSEX':     77155, 'NIFTY IT':   28810,
    'FINNIFTY':   26405, 'INDIA VIX':  13.2,
};

const SIMULATED_BASE_PRICES = {
    'RELIANCE': 1332, 'TCS': 2223, 'HDFCBANK': 787,
    'INFY': 1157, 'ICICIBANK': 1280, 'HINDUNILVR': 2417,
    'KOTAKBANK': 1780, 'SBIN': 430, 'BHARTIARTL': 541,
    'ITC': 207, 'LT': 3654, 'WIPRO': 577,
    'AXISBANK': 1150, 'SUNPHARMA': 1870, 'M&M': 779,
    'TITAN': 3450, 'ADANIENT': 2840, 'ADANIPORTS': 1350,
    'NTPC': 245, 'MARUTI': 9750, 'POWERGRID': 315,
    'TATAMOTORS': 985, 'HCLTECH': 1450, 'TATASTEEL': 142,
    'ULTRACEMCO': 11250, 'ASIANPAINT': 3240, 'BAJFINANCE': 7120,
    'NESTLEIND': 2840, 'ONGC': 116, 'JSWSTEEL': 985,
    'TECHM': 1350, 'DIVISLAB': 5780, 'CIPLA': 1580,
    'DRREDDY': 6350, 'GRASIM': 2480, 'HDFCLIFE': 640,
    'SBILIFE': 1540, 'BPCL': 345, 'BAJAJFINSV': 1680,
    'TATAPOWER': 124, 'KPITTECH': 266, 'COALINDIA': 245,
    'EICHERMOT': 3850, 'BRITANNIA': 5420, 'HEROMOTOCO': 4150,
    'HINDALCO': 635, 'APOLLOHOSP': 6750, 'INDUSINDBK': 1120,
    'BAJAJ-AUTO': 5240, 'SHREECEM': 2580,
};

// How many days of data to request per interval (3m/30m are aggregated from base intervals)
const PERIOD_DAYS = { '1m': 1, '3m': 1, '5m': 2, '15m': 7, '30m': 7, '1h': 30, '1d': 365 };
const AGGREGATE_MAP = { '3m': { base: '1m', factor: 3 }, '30m': { base: '15m', factor: 2 } };

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

// OHLCV cache: key → { candles, fetchedAt }
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

// ─── Simulated candle generators ─────────────────────────────────
function seededRandom(seed) {
    let s = seed;
    return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function simulateCandles(basePrice, interval, count, seed = 42) {
    const rng = seededRandom(seed);
    const msMap = { '1m': 60e3, '5m': 5 * 60e3, '15m': 15 * 60e3, '1h': 3600e3, '1d': 86400e3 };
    const intervalMs = msMap[interval] || 3600e3;
    const volatility = basePrice * 0.0035;
    const candles = [];
    let price = basePrice * (0.85 + rng() * 0.3);
    const now = Date.now();

    for (let i = count - 1; i >= 0; i--) {
        const time = Math.floor((now - i * intervalMs) / 1000);
        const trend = (rng() - 0.48) * volatility;
        const noise = (rng() - 0.5) * volatility * 2;
        const open  = price;
        const close = Math.max(0.01, open + trend);
        const high  = Math.max(open, close) + Math.abs(noise) * rng();
        const low   = Math.min(open, close) - Math.abs(noise) * rng();
        candles.push({
            time,
            open:   Math.round(open  * 100) / 100,
            high:   Math.round(high  * 100) / 100,
            low:    Math.round(low   * 100) / 100,
            close:  Math.round(close * 100) / 100,
            volume: Math.floor(500000 + rng() * 2000000),
        });
        price = close;
    }
    return candles;
}

// ─── Yahoo Finance fetcher (v3 chart API) ─────────────────────────
async function fetchYahooCandles(yahooSymbol, interval) {
    const days = PERIOD_DAYS[interval] || 365;
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
    const cacheKey = `STOCK_${symbol.toUpperCase()}_${interval}`;
    const now = Date.now();
    const ttl = CACHE_TTL[interval] || CACHE_TTL['1d'];

    if (cache[cacheKey] && (now - cache[cacheKey].fetchedAt) < ttl) {
        return cache[cacheKey].candles;
    }

    const yahooSym = `${symbol.toUpperCase()}.NS`;
    const candles = await fetchYahooCandles(yahooSym, interval);

    if (candles && candles.length > 5) {
        console.log(`[Candles] ${symbol} (${interval}): ${candles.length} candles from Yahoo`);
        cache[cacheKey] = { candles, fetchedAt: now };
        return candles;
    }

    // Simulated fallback
    const basePrice = SIMULATED_BASE_PRICES[symbol.toUpperCase()] || 1000;
    const counts = { '1m': 300, '5m': 200, '15m': 150, '1h': 200, '1d': 365 };
    const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const simulated = simulateCandles(basePrice, interval, counts[interval] || 200, seed);
    cache[cacheKey] = { candles: simulated, fetchedAt: now };
    return simulated;
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
        if (['1m', '5m', '15m'].includes(interval)) {
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
        const candles = await fetchYahooCandles(yahooSym, interval);
        if (candles && candles.length > 5) {
            console.log(`[Candles] ${normalised} (${interval}): ${candles.length} candles from Yahoo`);
            cache[cacheKey] = { candles, fetchedAt: now };
            return candles;
        }
    }

    // Simulated fallback
    const basePrice = INDEX_BASE_PRICES[normalised] || 22450;
    const counts = { '1m': 390, '5m': 200, '15m': 150, '1h': 200, '1d': 365 };
    const seed = normalised.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const simulated = simulateCandles(basePrice, interval, counts[interval] || 200, seed);
    cache[cacheKey] = { candles: simulated, fetchedAt: now };
    return simulated;
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
    INDEX_BASE_PRICES,
};
