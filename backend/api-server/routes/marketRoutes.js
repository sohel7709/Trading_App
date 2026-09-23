'use strict';

const express = require('express');
const router = express.Router();
const redis = require('../../shared/redis');
const marketDataService = require('../../marketDataService');
const candleDataService = require('../../candleDataService');

// NSE Stocks Master for search
const NSE_STOCKS = [
    { symbol: "RELIANCE", name: "Reliance Industries Ltd", sector: "Oil & Gas" },
    { symbol: "TCS", name: "Tata Consultancy Services Ltd", sector: "IT" },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd", sector: "Banking" },
    { symbol: "INFY", name: "Infosys Ltd", sector: "IT" },
    { symbol: "ICICIBANK", name: "ICICI Bank Ltd", sector: "Banking" },
    { symbol: "HINDUNILVR", name: "Hindustan Unilever Ltd", sector: "FMCG" },
    { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd", sector: "Banking" },
    { symbol: "SBIN", name: "State Bank of India", sector: "Banking" },
    { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", sector: "Telecom" },
    { symbol: "ITC", name: "ITC Ltd", sector: "FMCG" },
    { symbol: "LT", name: "Larsen & Toubro Ltd", sector: "Construction" },
    { symbol: "WIPRO", name: "Wipro Ltd", sector: "IT" },
    { symbol: "AXISBANK", name: "Axis Bank Ltd", sector: "Banking" },
    { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd", sector: "Pharma" },
    { symbol: "TATAMOTORS", name: "Tata Motors Ltd", sector: "Automobile" },
    { symbol: "TITAN", name: "Titan Company Ltd", sector: "Consumer" },
    { symbol: "ADANIENT", name: "Adani Enterprises Ltd", sector: "Diversified" },
    { symbol: "ADANIPORTS", name: "Adani Ports and Special Economic Zone Ltd", sector: "Infrastructure" },
    { symbol: "NTPC", name: "NTPC Ltd", sector: "Power" },
    { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", sector: "Automobile" },
];

// GET /market/search
router.get('/market/search', (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase();
    if (!q) return res.json([]);
    const matches = NSE_STOCKS.filter(s =>
        s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
    res.json(matches.slice(0, 10));
});

// GET /market/live - All prices from Redis cache (Zero broker call!)
router.get('/market/live', async (req, res) => {
    try {
        const prices = await redis.getAllPrices();
        res.status(200).json({
            success: true,
            prices,
            count: Object.keys(prices).length,
            lastUpdated: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching live prices', error: err.message });
    }
});

// GET /market/quote/:symbol - Single quote from Redis cache
router.get('/market/quote/:symbol', async (req, res) => {
    try {
        const sym = req.params.symbol.toUpperCase();
        const price = await redis.getPrice(sym);
        if (price) {
            return res.status(200).json(price);
        }
        // Fallback if not yet cached
        const live = marketDataService.getStockPrice(sym);
        res.status(200).json(live || { symbol: sym, ltp: 0 });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching quote', error: err.message });
    }
});

// GET /market/stocks - Tracked stocks list
router.get('/market/stocks', (req, res) => {
    res.status(200).json(marketDataService.getTrackedStocks ? marketDataService.getTrackedStocks() : NSE_STOCKS);
});

// GET /market/indexes - Live index data
router.get('/market/indexes', (req, res) => {
    res.status(200).json({ indexes: marketDataService.getIndexData ? marketDataService.getIndexData() : {} });
});

// GET /market/candles/:symbol
router.get('/market/candles/:symbol', async (req, res) => {
    try {
        const sym = req.params.symbol.toUpperCase();
        const interval = req.query.interval || '1d';
        const candles = await candleDataService.getCandles(sym, interval);
        res.status(200).json({ symbol: sym, interval, candles });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching candles', error: err.message });
    }
});

// GET /market/option-chain and /option-chain (ATM +- 10 strikes windowed by default, 3s Redis cache)
router.get(['/market/option-chain', '/option-chain'], async (req, res) => {
    try {
        const underlyingId = req.query.underlyingId || req.query.symbol || 'NIFTY';
        const expiry = req.query.expiry;
        const isAll = req.query.all === 'true';

        const cacheKey = `oc:GLOBAL:${underlyingId.toUpperCase()}:${expiry || 'nearest'}:${isAll ? 'all' : 'atm10'}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
            return res.status(200).json(JSON.parse(cached));
        }

        const chain = await marketDataService.getOptionChain(underlyingId, expiry);
        if (!chain) {
            return res.status(404).json({ message: 'Option chain not available for requested parameters' });
        }

        let responseChain = chain;
        const strikesArray = chain.rows || chain.strikes;
        if (!isAll && Array.isArray(strikesArray) && strikesArray.length > 21) {
            const spot = Number(chain.indexPrice || chain.spotPrice || chain.underlyingPrice || 0);
            let closestIdx = 0;
            let minDiff = Infinity;
            strikesArray.forEach((s, idx) => {
                const strikeVal = Number(s.strike || s.strikePrice || 0);
                const diff = Math.abs(strikeVal - spot);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = idx;
                }
            });

            const start = Math.max(0, closestIdx - 10);
            const end = Math.min(strikesArray.length, closestIdx + 11);
            const windowedSlice = strikesArray.slice(start, end);
            responseChain = {
                ...chain,
                totalStrikes: strikesArray.length,
                windowed: true,
                atmStrike: strikesArray[closestIdx]?.strike || strikesArray[closestIdx]?.strikePrice,
                ...(chain.rows ? { rows: windowedSlice } : {}),
                ...(chain.strikes ? { strikes: windowedSlice } : {}),
            };
        }

        await redis.set(cacheKey, JSON.stringify(responseChain), 'EX', 3);
        res.status(200).json(responseChain);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching option chain', error: err.message });
    }
});

module.exports = router;
