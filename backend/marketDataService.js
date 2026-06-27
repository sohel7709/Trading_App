const yahooFinance = require('yahoo-finance2').default;
const liveDataService = require('./liveDataService');

// Plain NSE symbols (no .NS suffix) — used by Groww API
const NSE_STOCK_SYMBOLS = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
    'HINDUNILVR', 'KOTAKBANK', 'SBIN', 'BHARTIARTL', 'ITC',
    'LT', 'WIPRO', 'AXISBANK', 'SUNPHARMA', 'TATAMOTORS',
    'TITAN', 'ADANIENT', 'ADANIPORTS', 'NTPC', 'MARUTI',
    'POWERGRID', 'HCLTECH', 'TATASTEEL', 'ULTRACEMCO', 'ASIANPAINT',
    'BAJFINANCE', 'NESTLEIND', 'ONGC', 'JSWSTEEL', 'TECHM',
    'DIVISLAB', 'CIPLA', 'DRREDDY', 'GRASIM', 'HDFCLIFE',
    'SBILIFE', 'BPCL', 'BAJAJFINSV', 'TATAPOWER', 'KPITTECH',
    'COALINDIA', 'EICHERMOT', 'BRITANNIA', 'HEROMOTOCO', 'HINDALCO',
    'APOLLOHOSP', 'INDUSINDBK', 'SHREECEM', 'M&M', 'BAJAJ-AUTO',
    'UPL', 'AWL', 'BANDHANBNK', 'NYKAA', 'IEX', 'LTIM',
];

// Yahoo Finance format (fallback only)
const NSE_SYMBOLS = NSE_STOCK_SYMBOLS.map(s => s + '.NS');

// Index symbols (Yahoo Finance fallback)
const INDEX_SYMBOLS = [
    { symbol: '^NSEI',              name: 'NIFTY 50' },
    { symbol: '^NSEBANK',           name: 'BANK NIFTY' },
    { symbol: '^BSESN',             name: 'SENSEX' },
    { symbol: '^CNXIT',             name: 'NIFTY IT' },
    { symbol: 'NIFTY_FIN_SERVICE.NS', name: 'FINNIFTY' },
];

// In-memory cache for stock prices
let stockPrices = {};
let indexData = {};
let lastUpdated = null;
let isFetching = false;
let dataSource = 'SIMULATED'; // tracks current source

// Map Yahoo Finance symbol back to NSE symbol
function yahooToNseSymbol(yahooSymbol) {
    return yahooSymbol.replace('.NS', '').replace('.BO', '');
}

async function fetchQuote(symbol) {
    try {
        const quote = await yahooFinance.quote(symbol);
        if (!quote) return null;
        return {
            symbol: yahooToNseSymbol(symbol),
            ltp: quote.regularMarketPrice || 0,
            open: quote.regularMarketOpen || 0,
            high: quote.regularMarketDayHigh || 0,
            low: quote.regularMarketDayLow || 0,
            previousClose: quote.regularMarketPreviousClose || 0,
            volume: quote.regularMarketVolume || 0,
            change: quote.regularMarketChange || 0,
            changePercent: quote.regularMarketChangePercent || 0,
            currency: quote.currency || 'INR',
        };
    } catch (err) {
        return null;
    }
}

// Simulated base prices for NSE stocks (approximate real values)
const SIMULATED_PRICES = {
    'RELIANCE': { ltp: 1317.00, prevClose: 1312.00 },   // live Jun-2026
    'TCS': { ltp: 3194.00, prevClose: 3185.00 },
    'HDFCBANK': { ltp: 1522.35, prevClose: 1530.00 },
    'INFY': { ltp: 1555.45, prevClose: 1570.00 },
    'ICICIBANK': { ltp: 1280.60, prevClose: 1275.00 },
    'HINDUNILVR': { ltp: 2177.00, prevClose: 2170.00 },  // live Jun-2026
    'KOTAKBANK': { ltp: 1700.00, prevClose: 1695.00 },
    'SBIN': { ltp: 430.20, prevClose: 425.00, high52w: 912.00, low52w: 400.00, volume: 5200000 },
    'BHARTIARTL': { ltp: 541.15, prevClose: 538.00 },
    'ITC': { ltp: 207.90, prevClose: 205.00 },
    'LT': { ltp: 3654.30, prevClose: 3640.00 },
    'WIPRO': { ltp: 175.00, prevClose: 174.00, high52w: 273.10, low52w: 171.49, volume: 21544904 },
    'AXISBANK': { ltp: 1150.80, prevClose: 1145.00 },
    'SUNPHARMA': { ltp: 1870.55, prevClose: 1865.00 },
    'M&M': { ltp: 779.80, prevClose: 785.00 },
    'TITAN': { ltp: 3450.20, prevClose: 3445.00 },
    'ADANIENT': { ltp: 3040.00, prevClose: 3025.00 },    // live Jun-2026
    'ADANIPORTS': { ltp: 1795.00, prevClose: 1788.00 },  // live Jun-2026
    'NTPC': { ltp: 381.00, prevClose: 379.00 },           // live Jun-2026
    'MARUTI': { ltp: 12000.00, prevClose: 11950.00 },     // live Jun-2026
    'POWERGRID': { ltp: 310.00, prevClose: 308.00 },
    'TATAMOTORS': { ltp: 358.00, prevClose: 360.00, high52w: 447.79, low52w: 294.30, volume: 3100000 },
    'HCLTECH': { ltp: 1101.00, prevClose: 1095.00, high52w: 1780.10, low52w: 1089.50, volume: 820000 },
    'TATASTEEL': { ltp: 189.00, prevClose: 187.00 },      // live Jun-2026
    'ULTRACEMCO': { ltp: 11250.80, prevClose: 11230.00 },
    'ASIANPAINT': { ltp: 3240.15, prevClose: 3235.00 },
    'BAJFINANCE': { ltp: 7120.50, prevClose: 7100.00 },
    'NESTLEIND': { ltp: 1402.60, prevClose: 1400.00, high52w: 1498.10, low52w: 1084.70, volume: 155000 },
    'ONGC': { ltp: 233.15, prevClose: 234.00, high52w: 307.50, low52w: 228.61, volume: 5100000 },
    'JSWSTEEL': { ltp: 985.40, prevClose: 982.00 },
    'TECHM': { ltp: 1440.00, prevClose: 1430.00 },       // live Jun-2026
    'DIVISLAB': { ltp: 3500.00, prevClose: 3495.00 },
    'CIPLA': { ltp: 1580.35, prevClose: 1575.00 },
    'DRREDDY': { ltp: 6350.80, prevClose: 6340.00 },
    'GRASIM': { ltp: 2480.45, prevClose: 2475.00 },
    'HDFCLIFE': { ltp: 640.30, prevClose: 638.00 },
    'SBILIFE': { ltp: 1540.20, prevClose: 1535.00 },
    'BPCL': { ltp: 345.60, prevClose: 343.00 },
    'BAJAJFINSV': { ltp: 1680.50, prevClose: 1675.00 },
    'TATAPOWER': { ltp: 124.15, prevClose: 122.00 },
    'KPITTECH': { ltp: 738.00, prevClose: 732.00, high52w: 2058.00, low52w: 300.10, volume: 510000 },
    'COALINDIA': { ltp: 436.00, prevClose: 433.00, high52w: 491.25, low52w: 368.65, volume: 3000000 },
    'EICHERMOT': { ltp: 3850.35, prevClose: 3840.00 },
    'BRITANNIA': { ltp: 5420.60, prevClose: 5410.00 },
    'HEROMOTOCO': { ltp: 4150.25, prevClose: 4140.00 },
    'HINDALCO': { ltp: 635.40, prevClose: 632.00 },
    'APOLLOHOSP': { ltp: 6750.80, prevClose: 6740.00 },
    'INDUSINDBK': { ltp: 917.00, prevClose: 912.00, high52w: 968.85, low52w: 710.60, volume: 1250000 },
    'BAJAJ-AUTO': { ltp: 5240.50, prevClose: 5230.00 },
    'SHREECEM': { ltp: 2580.40, prevClose: 2575.00 },
    'UPL': { ltp: 590.50, prevClose: 588.00 },
    'AWL': { ltp: 350.00, prevClose: 348.00 },
    'BANDHANBNK': { ltp: 201.76, prevClose: 200.00 },
    'NYKAA': { ltp: 301.35, prevClose: 299.00 },
    'IEX': { ltp: 140.00, prevClose: 139.00 },
    'LTIM': { ltp: 5000.00, prevClose: 4990.00 },

    // ── Holdings stocks added for full 52W data on StockDetailScreen ──────────
    'TATAELXSI':  { ltp: 4028.30, prevClose: 4020.00, high52w: 6439.50, low52w: 3926.10, volume: 105000 },
    'IRFC':       { ltp:   91.77, prevClose:   92.00, high52w:  143.15, low52w:   87.00, volume: 2100000 },
    'RVNL':       { ltp:  240.85, prevClose:  241.00, high52w:  405.50, low52w:  221.55, volume: 1600000 },
    'ADANIPOWER': { ltp:  229.27, prevClose:  230.00, high52w:  254.20, low52w:  109.75, volume: 2000000 },
    'COCHINSHIP': { ltp: 1458.40, prevClose: 1460.00, high52w: 2186.00, low52w: 1187.00, volume: 310000 },
    'MAZDOCK':    { ltp: 2472.50, prevClose: 2475.00, high52w: 3369.00, low52w: 2057.40, volume: 205000 },
    'ADANIGREEN': { ltp: 1526.10, prevClose: 1525.00, high52w: 1557.00, low52w:  765.00, volume: 510000 },
    'GODREJPROP': { ltp: 1850.10, prevClose: 1852.00, high52w: 2420.00, low52w: 1434.00, volume: 410000 },
    'IREDA':      { ltp:  127.01, prevClose:  128.00, high52w:  310.00, low52w:  109.00, volume: 3100000 },
    'SUZLON':     { ltp:   57.01, prevClose:   57.50, high52w:   86.00, low52w:   38.19, volume: 10200000 },
    'DIXON':      { ltp: 12030.00, prevClose: 12050.00, high52w: 18471.00, low52w: 9600.00, volume: 52000 },
    'DELHIVERY':  { ltp:  464.90, prevClose:  466.00, high52w:  491.70, low52w:  374.45, volume: 810000 },
    'MPHASIS':    { ltp: 2264.90, prevClose: 2265.00, high52w: 3037.20, low52w: 2013.00, volume: 205000 },
    'HINDUNILVR': { ltp: 2177.00, prevClose: 2178.00, high52w: 2705.09, low52w: 2022.50, volume: 615000 },
};

function generateSimulatedPrice(basePrice) {
    const variation = (Math.random() - 0.5) * (basePrice * 0.02); // ±1% random variation
    return Math.round((basePrice + variation) * 100) / 100;
}

function simulateStockPrices() {
    for (const [symbol, data] of Object.entries(SIMULATED_PRICES)) {
        const ltp = generateSimulatedPrice(data.ltp);
        const open = generateSimulatedPrice(data.prevClose);
        const change = ltp - data.prevClose;
        const changePercent = data.prevClose > 0 ? (change / data.prevClose) * 100 : 0;

        stockPrices[symbol] = {
            symbol,
            ltp,
            open,
            high: Math.max(ltp, open) + Math.random() * (ltp * 0.005),
            low: Math.min(ltp, open) - Math.random() * (ltp * 0.005),
            previousClose: data.prevClose,
            volume: data.volume || (Math.floor(Math.random() * 1000000) + 100000),
            change: Math.round(change * 100) / 100,
            changePercent: Math.round(changePercent * 100) / 100,
            high52w: data.high52w || Math.round(data.ltp * 1.35 * 100) / 100,
            low52w:  data.low52w  || Math.round(data.ltp * 0.72 * 100) / 100,
            currency: 'INR',
            isSimulated: true,
        };
    }

    // Simulated index data
    const niftyBase = 22450;
    const niftyLtp = generateSimulatedPrice(niftyBase);
    indexData['NIFTY 50'] = { name: 'NIFTY 50', ltp: niftyLtp, change: niftyLtp - niftyBase, changePercent: ((niftyLtp - niftyBase) / niftyBase) * 100, symbol: 'NIFTY', isSimulated: true };
    indexData['BANK NIFTY'] = { name: 'BANK NIFTY', ltp: generateSimulatedPrice(48250), change: 150, changePercent: 0.31, symbol: 'BANKNIFTY', isSimulated: true };
    indexData['SENSEX'] = { name: 'SENSEX', ltp: generateSimulatedPrice(74200), change: 200, changePercent: 0.27, symbol: 'SENSEX', isSimulated: true };
    indexData['NIFTY IT'] = { name: 'NIFTY IT', ltp: generateSimulatedPrice(38100), change: -50, changePercent: -0.13, symbol: 'NIFTYIT', isSimulated: true };
    indexData['FINNIFTY'] = { name: 'FINNIFTY', ltp: generateSimulatedPrice(21500), change: 80, changePercent: 0.37, symbol: 'FINNIFTY', isSimulated: true };

    lastUpdated = new Date().toISOString();
}

async function fetchAllStockPrices() {
    if (isFetching) return;
    isFetching = true;

    try {
        // ── Step 1: Try NSE (indices) + Groww (stocks) ──
        const live = await liveDataService.fetchLiveMarketData(NSE_STOCK_SYMBOLS);

        let gotLiveStocks = false;
        let gotLiveIndexes = false;

        if (live.stockData && Object.keys(live.stockData).length > 0) {
            // Merge Groww stock data into stockPrices
            for (const [sym, d] of Object.entries(live.stockData)) {
                stockPrices[sym] = d;
            }
            gotLiveStocks = true;
            console.log(`[Market] Groww: ${Object.keys(live.stockData).length} stocks updated`);
        }

        if (live.indexData && Object.keys(live.indexData).length > 0) {
            // Merge NSE index data
            for (const [name, d] of Object.entries(live.indexData)) {
                indexData[name] = d;
            }
            gotLiveIndexes = true;
            console.log(`[Market] NSE: ${Object.keys(live.indexData).length} indices updated`);
        }

        // ── Step 2: Yahoo Finance fallback for any missing stocks ──
        if (!gotLiveStocks) {
            console.log('[Market] Groww failed, trying Yahoo Finance for stocks…');
            let yahooSuccess = false;
            const batchSize = 10;
            for (let i = 0; i < NSE_SYMBOLS.length; i += batchSize) {
                const batch = NSE_SYMBOLS.slice(i, i + batchSize);
                const results = await Promise.allSettled(batch.map(sym => fetchQuote(sym)));
                results.forEach(r => {
                    if (r.status === 'fulfilled' && r.value && r.value.ltp > 0) {
                        stockPrices[r.value.symbol] = r.value;
                        yahooSuccess = true;
                    }
                });
                if (i + batchSize < NSE_SYMBOLS.length) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }
            if (yahooSuccess) {
                console.log('[Market] Yahoo Finance stocks: OK');
            } else {
                console.log('[Market] Yahoo Finance also failed, using simulated stocks');
                simulateStockPrices();
            }
        }

        // ── Step 3: Yahoo Finance fallback for missing indexes (e.g. SENSEX) ──
        const missingIndexes = INDEX_SYMBOLS.filter(idx => !indexData[idx.name]);
        if (missingIndexes.length > 0) {
            const idxResults = await Promise.allSettled(
                missingIndexes.map(idx => fetchQuote(idx.symbol))
            );
            idxResults.forEach((r, i) => {
                if (r.status === 'fulfilled' && r.value && r.value.ltp > 0) {
                    indexData[missingIndexes[i].name] = {
                        ...r.value,
                        name: missingIndexes[i].name,
                    };
                    gotLiveIndexes = true;
                }
            });
        }

        // ── Step 4: Simulate any still-missing indexes ──
        if (!gotLiveIndexes && Object.keys(indexData).length === 0) {
            console.log('[Market] No live index data, using simulated indexes');
            simulateStockPrices();
        }

        dataSource = gotLiveStocks && gotLiveIndexes ? 'NSE+GROWW'
            : gotLiveStocks ? 'GROWW_LIVE'
            : gotLiveIndexes ? 'NSE_LIVE'
            : Object.keys(stockPrices).length > 0 ? 'YAHOO'
            : 'SIMULATED';

        lastUpdated = new Date().toISOString();
        console.log(`[Market] Update complete | source: ${dataSource} | stocks: ${Object.keys(stockPrices).length} | indexes: ${Object.keys(indexData).length}`);
    } catch (err) {
        console.error('[Market] fetchAllStockPrices error:', err.message);
        simulateStockPrices();
        dataSource = 'SIMULATED';
    } finally {
        isFetching = false;
    }
}

function getDataSource() { return dataSource; }

function getStockPrices() {
    return stockPrices;
}

function getIndexData() {
    return indexData;
}

function getLastUpdated() {
    return lastUpdated;
}

function getMarketMovers() {
    const stocks = Object.values(stockPrices)
        .filter(s => s.changePercent !== 0)
        .sort((a, b) => b.changePercent - a.changePercent);

    const gainers = stocks.filter(s => s.changePercent > 0).slice(0, 5);
    const losers = stocks.filter(s => s.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);

    return {
        gainers,
        losers,
        mostActive: stocks
            .sort((a, b) => (b.volume || 0) - (a.volume || 0))
            .slice(0, 5),
    };
}

function getStockPrice(symbol) {
    return stockPrices[symbol.toUpperCase()] || null;
}

// ============ OPTION CHAIN ============

// expiryDay: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat (actual NSE/BSE schedule)
const OPTION_CONFIG = {
    'NIFTY 50':    { strikeGap: 50,  atmPremium: 120, weeklyExpiry: true,  expiryDay: 4 }, // Thursday
    'BANK NIFTY':  { strikeGap: 100, atmPremium: 280, weeklyExpiry: true,  expiryDay: 3 }, // Wednesday
    'SENSEX':      { strikeGap: 100, atmPremium: 350, weeklyExpiry: true,  expiryDay: 5 }, // Friday (BSE weekly)
    'FINNIFTY':    { strikeGap: 50,  atmPremium: 80,  weeklyExpiry: true,  expiryDay: 2 }, // Tuesday
    'NIFTY IT':    { strikeGap: 50,  atmPremium: 90,  weeklyExpiry: false, expiryDay: 4 }, // Monthly Thursday
    'MIDCPNIFTY':  { strikeGap: 25,  atmPremium: 60,  weeklyExpiry: true,  expiryDay: 1 }, // Monday
};

// Format a Date as YYYY-MM-DD in LOCAL time (avoids UTC shift in toISOString())
function localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getExpiryDates(indexName) {
    const cfg = OPTION_CONFIG[indexName] || OPTION_CONFIG['NIFTY 50'];
    const expiries = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (cfg.weeklyExpiry) {
        // Next 5 weekly expiry days starting from tomorrow
        const cur = new Date(today);
        cur.setDate(cur.getDate() + 1);
        while (expiries.length < 5) {
            if (cur.getDay() === cfg.expiryDay) {
                expiries.push(localDateStr(cur));
            }
            cur.setDate(cur.getDate() + 1);
        }
    } else {
        // Last expiryDay of next 4 months
        for (let m = 0; m < 4; m++) {
            const month = new Date(today.getFullYear(), today.getMonth() + m + 1, 0);
            while (month.getDay() !== cfg.expiryDay) month.setDate(month.getDate() - 1);
            if (month >= today) expiries.push(localDateStr(month));
        }
    }
    return expiries;
}

function calcOptionPrice(type, indexPrice, strike, atmPremium, strikeGap) {
    const intrinsic = type === 'CE'
        ? Math.max(0, indexPrice - strike)
        : Math.max(0, strike - indexPrice);
    const stepsFromATM = Math.abs(strike - indexPrice) / strikeGap;
    const decay = Math.exp(-stepsFromATM * 0.25);
    const timeValue = Math.max(0.5, atmPremium * decay);
    const noise = (Math.random() - 0.5) * (timeValue * 0.1);
    return Math.max(0.05, Math.round((intrinsic + timeValue + noise) * 100) / 100);
}

function generateOptionChainForIndex(indexName, expiry) {
    const idxData = indexData[indexName];
    const indexPrice = idxData ? idxData.ltp : 22450;
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
                iv,
                ltp: ceLtp,
                change: Math.round((Math.random() - 0.5) * ceLtp * 0.3 * 100) / 100,
                delta: Math.max(0, Math.min(1, Math.round((0.5 - i * 0.07) * 100) / 100)),
            },
            pe: {
                oi: Math.max(100000, oiBase + Math.floor(Math.random() * 500000)),
                oiChange: Math.floor((Math.random() - 0.3) * 300000),
                volume: Math.floor(Math.random() * 150000) + 10000,
                iv,
                ltp: peLtp,
                change: Math.round((Math.random() - 0.5) * peLtp * 0.3 * 100) / 100,
                delta: Math.max(-1, Math.min(0, Math.round((-0.5 + i * 0.07) * 100) / 100)),
            },
        });
    }

    return {
        indexName,
        indexPrice,
        expiry,
        expiries: getExpiryDates(indexName),
        atmStrike,
        rows,
        lastUpdated: new Date().toISOString(),
    };
}

// Seed simulated prices immediately at module load so all SIMULATED_PRICES
// stocks are always available even before the first Groww fetch completes.
// Live data from Groww/Yahoo will overwrite these for the stocks it covers.
simulateStockPrices();

module.exports = {
    fetchAllStockPrices,
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