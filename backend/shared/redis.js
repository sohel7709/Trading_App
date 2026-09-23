'use strict';

const Redis = require('ioredis');
const config = require('./config');

const redisOptions = {
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 150, 2000);
    },
    enableOfflineQueue: true,
};

// 1. Primary Client for Key-Value Caching
const redis = new Redis(config.REDIS_URL, redisOptions);

// 2. Dedicated Client for Publishing Events
const publisher = new Redis(config.REDIS_URL, redisOptions);

// 3. Dedicated Client for Subscribing to Pub/Sub Channels
const subscriber = new Redis(config.REDIS_URL, redisOptions);

redis.on('connect', () => {
    console.log('[Redis] ⚡ Primary Cache connected');
});
redis.on('error', (err) => {
    console.warn('[Redis Cache Error]:', err.message);
});

publisher.on('connect', () => {
    console.log('[Redis] 📡 Publisher connected');
});
publisher.on('error', (err) => {
    console.warn('[Redis Publisher Error]:', err.message);
});

subscriber.on('connect', () => {
    console.log('[Redis] 👂 Subscriber connected');
});
subscriber.on('error', (err) => {
    console.warn('[Redis Subscriber Error]:', err.message);
});

// Channels
const CHANNELS = {
    PRICE_UPDATES: 'PRICE_UPDATES',
    ORDER_UPDATES: 'ORDER_UPDATES',
    PNL_UPDATES: 'PNL_UPDATES',
};

// In-memory fallback if Redis is temporarily unreachable
const memoryPrices = new Map();

/**
 * Cache symbol price in Redis & memory
 */
async function setPrice(symbol, tick) {
    if (!symbol || !tick) return;
    const sym = symbol.toUpperCase();
    const payload = JSON.stringify(tick);
    memoryPrices.set(sym, tick);
    try {
        await redis.set(`price:${sym}`, payload, 'EX', 86400); // 24hr TTL
        if (tick.ltp != null) {
            await redis.hset('market:ltp', sym, tick.ltp);
        }
    } catch (err) {
        // memory fallback active
    }
}

/**
 * Get latest symbol price
 */
async function getPrice(symbol) {
    if (!symbol) return null;
    const sym = symbol.toUpperCase();
    try {
        const raw = await redis.get(`price:${sym}`);
        if (raw) return JSON.parse(raw);
    } catch {}
    return memoryPrices.get(sym) || null;
}

/**
 * Get all latest symbol prices
 */
async function getAllPrices() {
    try {
        const keys = await redis.keys('price:*');
        if (keys.length > 0) {
            const values = await redis.mget(keys);
            const res = {};
            keys.forEach((key, idx) => {
                const sym = key.replace('price:', '');
                if (values[idx]) {
                    try { res[sym] = JSON.parse(values[idx]); } catch {}
                }
            });
            return res;
        }
    } catch {}
    const obj = {};
    for (const [k, v] of memoryPrices.entries()) {
        obj[k] = v;
    }
    return obj;
}

/**
 * Publish real-time tick to PRICE_UPDATES channel
 */
async function publishPriceUpdate(tick) {
    if (!tick) return;
    try {
        await publisher.publish(CHANNELS.PRICE_UPDATES, JSON.stringify(tick));
    } catch (err) {
        console.warn('[Redis Pub Error]:', err.message);
    }
}

/**
 * Publish order events (orderExecuted, optionOrderExecuted, etc.)
 */
async function publishOrderUpdate(userId, event, payload) {
    try {
        await publisher.publish(CHANNELS.ORDER_UPDATES, JSON.stringify({ userId, event, payload }));
    } catch (err) {
        console.warn('[Redis Pub Error]:', err.message);
    }
}

/**
 * Publish PnL updates
 */
async function publishPnlUpdate(userId, payload) {
    try {
        await publisher.publish(CHANNELS.PNL_UPDATES, JSON.stringify({ userId, payload }));
    } catch (err) {
        console.warn('[Redis Pub Error]:', err.message);
    }
}

module.exports = {
    redis,
    publisher,
    subscriber,
    CHANNELS,
    setPrice,
    getPrice,
    getAllPrices,
    publishPriceUpdate,
    publishOrderUpdate,
    publishPnlUpdate,
};
