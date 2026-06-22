// Live market data service
// Priority: NSE India (indices) → Groww (stocks) → Yahoo Finance → Simulated

const NSE_BASE = 'https://www.nseindia.com';
const GROWW_BASE = 'https://groww.in/v1/api/stocks_data/v1/tr_live_prices/exchange/NSE/segment/CASH';

const NSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
};

const GROWW_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://groww.in/',
    'Origin': 'https://groww.in',
};

// Maps NSE allIndices names → our app's display names
const NSE_INDEX_NAME_MAP = {
    'NIFTY 50':                   'NIFTY 50',
    'NIFTY BANK':                 'BANK NIFTY',
    'NIFTY IT':                   'NIFTY IT',
    'NIFTY FINANCIAL SERVICES':   'FINNIFTY',
    'NIFTY MIDCAP 50':            'NIFTY MIDCAP',
    'INDIA VIX':                  'INDIA VIX',
    'NIFTY 100':                  'NIFTY 100',
    'NIFTY 200':                  'NIFTY 200',
    'NIFTY 500':                  'NIFTY 500',
    'NIFTY NEXT 50':              'NIFTY NEXT 50',
    'NIFTY AUTO':                 'NIFTY AUTO',
    'NIFTY FMCG':                 'NIFTY FMCG',
    'NIFTY PHARMA':               'NIFTY PHARMA',
    'NIFTY REALTY':               'NIFTY REALTY',
    'NIFTY METAL':                'NIFTY METAL',
    'NIFTY ENERGY':               'NIFTY ENERGY',
    'NIFTY INFRA':                'NIFTY INFRA',
    'NIFTY PSU BANK':             'NIFTY PSU BANK',
    'NIFTY PRIVATE BANK':         'NIFTY PRIVATE BANK',
    'NIFTY HEALTHCARE INDEX':     'NIFTY HEALTHCARE',
    'NIFTY MEDIA':                'NIFTY MEDIA',
    'NIFTY CONSUMPTION':          'NIFTY CONSUMPTION',
    'NIFTY COMMODITIES':          'NIFTY COMMODITIES',
    'NIFTY SMALLCAP 50':          'NIFTY SMALLCAP 50',
    'NIFTY SMALLCAP 100':         'NIFTY SMALLCAP 100',
    'NIFTY MIDCAP 100':           'NIFTY MIDCAP 100',
};

// NSE session state
let session = {
    cookies: '',
    lastRefresh: 0,
    valid: false,
    failCount: 0,
};

// Stats for monitoring
let stats = {
    source: 'SIMULATED',   // 'NSE+GROWW' | 'YAHOO' | 'SIMULATED'
    lastSuccess: null,
    lastAttempt: null,
    indexSource: 'SIMULATED',
    stockSource: 'SIMULATED',
    errors: [],
};

// ─────────────────────────── NSE Session ───────────────────────────

async function refreshNSESession() {
    try {
        const res = await fetch(`${NSE_BASE}/`, {
            headers: {
                ...NSE_HEADERS,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) { session.valid = false; return false; }

        const cookieArr = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
        session.cookies = cookieArr.map(c => c.split(';')[0]).join('; ');
        session.lastRefresh = Date.now();
        session.valid = cookieArr.length > 0;
        session.failCount = 0;
        if (session.valid) console.log('[LiveData] NSE session refreshed');
        return session.valid;
    } catch (e) {
        session.valid = false;
        session.failCount++;
        console.log('[LiveData] NSE session refresh failed:', e.message);
        return false;
    }
}

async function ensureNSESession() {
    const expired = Date.now() - session.lastRefresh > 20 * 60 * 1000;
    if (!session.valid || expired) {
        await refreshNSESession();
    }
}

// ─────────────────────────── NSE Indices ───────────────────────────

async function fetchNSEIndices() {
    await ensureNSESession();
    if (!session.valid) return null;

    try {
        const res = await fetch(`${NSE_BASE}/api/allIndices`, {
            headers: {
                ...NSE_HEADERS,
                Cookie: session.cookies,
                Referer: `${NSE_BASE}/`,
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            session.valid = false;
            return null;
        }

        const data = await res.json();
        if (!data.data || !Array.isArray(data.data)) return null;

        const result = {};
        for (const item of data.data) {
            const ourName = NSE_INDEX_NAME_MAP[item.index];
            if (!ourName) continue;

            result[ourName] = {
                name: ourName,
                ltp: item.last,
                change: item.variation,
                changePercent: item.percentChange,
                open: item.open,
                high: item.high,
                low: item.low,
                previousClose: item.previousClose ?? (item.last - item.variation),
                pe: item.pe,
                pb: item.pb,
                yearHigh: item.yearHigh,
                yearLow: item.yearLow,
                advances: item.advances,
                declines: item.declines,
                symbol: item.indexSymbol || item.index,
                source: 'NSE_LIVE',
            };
        }

        console.log(`[LiveData] NSE indices fetched: ${Object.keys(result).length} indices`);
        stats.indexSource = 'NSE_LIVE';
        return result;
    } catch (e) {
        session.valid = false;
        console.log('[LiveData] NSE allIndices failed:', e.message);
        return null;
    }
}

// ─────────────────────────── Groww Stocks ───────────────────────────

async function fetchGrowwStock(symbol) {
    try {
        const encoded = encodeURIComponent(symbol);
        const res = await fetch(`${GROWW_BASE}/${encoded}/latest`, {
            headers: GROWW_HEADERS,
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;

        const d = await res.json();
        if (!d.ltp) return null;

        return {
            symbol,
            ltp: d.ltp,
            open: d.open,
            high: d.high,
            low: d.low,
            previousClose: d.close,
            volume: d.volume,
            change: d.dayChange,
            changePercent: d.dayChangePerc,
            high52w: d.yearHighPrice,
            low52w: d.yearLowPrice,
            totalBuyQty: d.totalBuyQty,
            totalSellQty: d.totalSellQty,
            currency: 'INR',
            source: 'GROWW_LIVE',
        };
    } catch (e) {
        return null;
    }
}

async function fetchAllGrowwStocks(symbols) {
    const results = {};
    let successCount = 0;
    const BATCH = 10;
    const DELAY_MS = 150;

    for (let i = 0; i < symbols.length; i += BATCH) {
        const batch = symbols.slice(i, i + BATCH);
        const settled = await Promise.allSettled(batch.map(s => fetchGrowwStock(s)));

        settled.forEach((r, j) => {
            if (r.status === 'fulfilled' && r.value) {
                results[batch[j]] = r.value;
                successCount++;
            }
        });

        if (i + BATCH < symbols.length) {
            await new Promise(res => setTimeout(res, DELAY_MS));
        }
    }

    console.log(`[LiveData] Groww stocks: ${successCount}/${symbols.length} fetched`);
    if (successCount > 0) stats.stockSource = 'GROWW_LIVE';
    return results;
}

// ─────────────────────────── Fetch All (main entry) ───────────────────────────

async function fetchLiveMarketData(nseSymbols) {
    stats.lastAttempt = new Date().toISOString();
    let indexData = null;
    let stockData = {};

    // 1. NSE indices
    try {
        indexData = await fetchNSEIndices();
    } catch (e) {
        console.log('[LiveData] NSE indices error:', e.message);
    }

    // 2. Groww stocks (all NSE symbols)
    try {
        stockData = await fetchAllGrowwStocks(nseSymbols);
    } catch (e) {
        console.log('[LiveData] Groww stocks error:', e.message);
    }

    const indexOK = indexData && Object.keys(indexData).length > 0;
    const stocksOK = Object.keys(stockData).length > 0;

    if (indexOK || stocksOK) {
        stats.source = indexOK && stocksOK ? 'NSE+GROWW' : (indexOK ? 'NSE_ONLY' : 'GROWW_ONLY');
        stats.lastSuccess = new Date().toISOString();
    }

    return {
        indexData: indexOK ? indexData : null,
        stockData: stocksOK ? stockData : null,
        source: stats.source,
    };
}

function getStats() { return { ...stats }; }

// Kick off session on module load
refreshNSESession();

module.exports = {
    fetchLiveMarketData,
    fetchNSEIndices,
    fetchGrowwStock,
    fetchAllGrowwStocks,
    refreshNSESession,
    getStats,
};
