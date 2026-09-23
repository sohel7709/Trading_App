'use strict';

const redis = require('../shared/redis');

/**
 * Process an incoming market tick:
 * 1. Normalizes data
 * 2. Saves latest price in Redis cache
 * 3. Publishes event to Redis channel 'PRICE_UPDATES'
 */
async function processTick(rawTick) {
    if (!rawTick) return;

    const symbol = (rawTick.symbol || rawTick.tradingSymbol || rawTick.stockSymbol || '').toUpperCase();
    if (!symbol) return;

    const ltp = Number(rawTick.ltp || rawTick.price || rawTick.lastPrice || 0);
    const close = Number(rawTick.close || rawTick.previousClose || rawTick.prevClose || ltp);
    const change = Number(rawTick.change != null ? rawTick.change : (ltp - close));
    const changePercent = Number(rawTick.changePercent != null ? rawTick.changePercent : (close > 0 ? (change / close) * 100 : 0));

    const normalizedTick = {
        symbol,
        ltp: Math.round(ltp * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        high: Number(rawTick.high || ltp),
        low: Number(rawTick.low || ltp),
        open: Number(rawTick.open || ltp),
        close,
        volume: Number(rawTick.volume || 0),
        timestamp: rawTick.timestamp || Date.now(),
        source: rawTick.source || 'BROKER_FEED',
    };

    // 1. Store in Redis
    await redis.setPrice(symbol, normalizedTick);

    // 2. Publish to Pub/Sub
    await redis.publishPriceUpdate(normalizedTick);

    return normalizedTick;
}

/**
 * Process a batch of ticks (e.g. from snapshot)
 */
async function processBatch(ticks) {
    if (!Array.isArray(ticks)) return;
    for (const tick of ticks) {
        await processTick(tick);
    }
}

module.exports = {
    processTick,
    processBatch,
};
