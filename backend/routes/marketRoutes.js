const express = require('express');
const router = express.Router();
const MarketDataFactory = require('../services/marketData/MarketDataFactory');
const marketDataService = require('../marketDataService');
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

router.get('/option-chain', async (req, res) => {
  try {
    const tenantId = req.user?.instituteCode || req.user?.tenantId || req.query.tenantId;
    const { underlyingId, expiry } = req.query;

    if (!underlyingId) {
      return res.status(400).json({ message: 'underlyingId is required' });
    }

    // Cache key includes windowing parameter
    const isAll = req.query.all === 'true';
    const cacheKey = `oc:${tenantId || 'GLOBAL'}:${underlyingId}:${expiry || 'nearest'}:${isAll ? 'all' : 'atm10'}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch (cacheErr) {
      // Redis optional
    }

    let chain = null;
    if (tenantId) {
      try {
        const source = await MarketDataFactory.getSourceForTenant(tenantId);
        chain = await source.getOptionChain(underlyingId, expiry);
      } catch (e) {
        // Fallback to marketDataService
      }
    }

    if (!chain) {
      chain = await marketDataService.getOptionChain(underlyingId, expiry);
    }

    if (!chain) {
      return res.status(404).json({ message: 'Option chain not available for the requested underlying/expiry' });
    }

    let responseChain = chain;

    // ATM +- 10 Strike windowing for 70% smaller payload & fast mobile rendering
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

    // Cache for 3 seconds to stay under broker rate-limits
    try {
      await redis.setex(cacheKey, 3, JSON.stringify(responseChain));
    } catch (e) {}

    res.json(responseChain);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching option chain', error: error.message });
  }
});

// Quote endpoint
router.get('/quote', async (req, res) => {
  try {
    const tenantId = req.user?.instituteCode || req.user?.tenantId;
    const { instrumentId } = req.query;

    if (!instrumentId) return res.status(400).json({ message: 'instrumentId is required' });

    let quote = null;
    if (tenantId) {
      try {
        const source = await MarketDataFactory.getSourceForTenant(tenantId);
        quote = await source.getQuote(instrumentId);
      } catch (e) {}
    }

    if (!quote) {
      const allPrices = marketDataService.getStockPrices();
      quote = allPrices[instrumentId];
    }

    if (!quote) return res.status(404).json({ message: 'Quote not found' });
    res.json(quote);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching quote', error: error.message });
  }
});

// GET Expired Options Historical Candles (Dhan POST /v2/charts/historical)
// Query params: symbol, strike, type, from, to, interval, expiryFlag, expiryCode
const dhanExpiredOptionsService = require('../services/dhanExpiredOptionsService');
router.get('/options/expired-candles', async (req, res) => {
  try {
    const {
      symbol = 'NIFTY 50',
      strike = 'ATM',
      type = 'CALL',
      from,
      to,
      interval = '5',
      expiryFlag = 'WEEK',
      expiryCode = 0,
      segment = null,
    } = req.query;

    if (!from || !to) {
      return res.status(400).json({ message: 'from and to dates are required in YYYY-MM-DD format' });
    }

    const data = await dhanExpiredOptionsService.fetchExpiredOptionCandles({
      underlyingSymbol: symbol,
      strike,
      drvOptionType: type,
      fromDate: from,
      toDate: to,
      interval,
      expiryFlag,
      expiryCode: Number(expiryCode) || 0,
      exchangeSegment: segment,
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching expired option candles', error: error.message });
  }
});

// GET Dynamic Instruments by Segment (Dhan GET /v2/instrument/{exchangeSegment})
const dhanScripMasterService = require('../services/dhanScripMasterService');
router.get('/instruments/segment/:segment', async (req, res) => {
  try {
    const segment = req.params.segment;
    if (!segment) return res.status(400).json({ message: 'Exchange segment is required' });

    const list = await dhanScripMasterService.fetchSegmentInstruments(segment);
    res.json({
      segment: segment.toUpperCase(),
      count: list.length,
      instruments: list.slice(0, req.query.limit ? Number(req.query.limit) : 500),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching segment instruments', error: error.message });
  }
});

// GET Search Instruments in Segment
router.get('/instruments/search', (req, res) => {
  try {
    const { query, segment = 'NSE_EQ', limit = 20 } = req.query;
    if (!query) return res.json([]);

    const results = dhanScripMasterService.searchSegmentInstruments(query, segment, Number(limit));
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Error searching segment instruments', error: error.message });
  }
});

// GET Global Market Snapshot (Crypto, Commodities, Forex, Global Indices)
router.get('/global-snapshot', (req, res) => {
  try {
    const snapshot = marketDataService.getGlobalMarketSnapshot();
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching global market snapshot', error: error.message });
  }
});

// GET Global Instruments Search (Crypto, Forex, Commodities)
router.get('/global-search', (req, res) => {
  try {
    const { q } = req.query;
    const results = marketDataService.searchGlobalInstruments(q);
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Error searching global instruments', error: error.message });
  }
});

module.exports = router;

