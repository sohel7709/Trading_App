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

module.exports = router;
