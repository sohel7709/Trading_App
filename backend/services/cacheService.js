'use strict';

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Graceful Redis connection that handles disconnects without crashing process
let redis = null;
let isConnected = false;

try {
    redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
            if (times > 5) return null; // Stop reconnecting after 5 attempts if Redis isn't running locally
            return Math.min(times * 200, 2000);
        },
        enableOfflineQueue: false,
    });

    redis.on('connect', () => {
        isConnected = true;
        console.log('[CacheService] ⚡ Redis connected for session & LTP caching');
    });

    redis.on('error', (err) => {
        isConnected = false;
        // Suppress continuous unhandled error logging in dev without Redis
    });
} catch (e) {
    console.warn('[CacheService] Redis initialization skipped:', e.message);
}

// In-memory fallback if Redis is unavailable
const memoryFallback = new Map();

const CacheService = {
    /**
     * Get cached user session details
     * @param {string} userId
     */
    async getUserSession(userId) {
        if (!userId) return null;
        const key = `user:session:${userId}`;
        if (isConnected && redis) {
            try {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            } catch {
                return null;
            }
        }
        const mem = memoryFallback.get(key);
        if (mem && mem.exp > Date.now()) return mem.data;
        return null;
    },

    /**
     * Set cached user session details (default TTL: 15 minutes = 900s)
     * @param {string} userId
     * @param {Object} details
     * @param {number} [ttlSeconds=900]
     */
    async setUserSession(userId, details, ttlSeconds = 900) {
        if (!userId || !details) return;
        const key = `user:session:${userId}`;
        if (isConnected && redis) {
            try {
                await redis.setex(key, ttlSeconds, JSON.stringify(details));
                return;
            } catch {}
        }
        memoryFallback.set(key, { data: details, exp: Date.now() + ttlSeconds * 1000 });
    },

    /**
     * Invalidate cached user session (e.g. on balance change or enrollment change)
     * @param {string} userId
     */
    async invalidateUserSession(userId) {
        if (!userId) return;
        const key = `user:session:${userId}`;
        if (isConnected && redis) {
            try {
                await redis.del(key);
            } catch {}
        }
        memoryFallback.delete(key);
    },

    /**
     * Cache real-time LTPs for an institute in Redis Hash
     * @param {string} instituteCode
     * @param {Object} ltpMap - { [symbol]: ltp }
     */
    async setInstituteLTPs(instituteCode, ltpMap) {
        if (!instituteCode || !ltpMap || Object.keys(ltpMap).length === 0) return;
        const key = `market:ltp:${instituteCode}`;
        if (isConnected && redis) {
            try {
                const pipeline = redis.pipeline();
                pipeline.hset(key, ltpMap);
                pipeline.expire(key, 60); // 60s safety TTL
                await pipeline.exec();
            } catch {}
        }
    },

    /**
     * Get single symbol LTP for an institute from cache
     * @param {string} instituteCode
     * @param {string} symbol
     */
    async getLTP(instituteCode, symbol) {
        if (!instituteCode || !symbol) return null;
        if (isConnected && redis) {
            try {
                const val = await redis.hget(`market:ltp:${instituteCode}`, symbol);
                return val ? parseFloat(val) : null;
            } catch {
                return null;
            }
        }
        return null;
    },

    get isRedisActive() {
        return isConnected;
    },

    getStatus() {
        return {
            status: isConnected ? 'CONNECTED' : (redis && redis.status ? redis.status.toUpperCase() : 'DISCONNECTED'),
            connected: isConnected,
            mode: isConnected ? 'REDIS' : 'IN_MEMORY_FALLBACK',
            url: REDIS_URL ? REDIS_URL.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@') : null
        };
    },

    /**
     * Cache portfolio data for user (TTL: 60 seconds)
     */
    async getPortfolio(userId) {
        if (!userId) return null;
        const key = `user:portfolio:${userId}`;
        if (isConnected && redis) {
            try {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            } catch {
                return null;
            }
        }
        const mem = memoryFallback.get(key);
        if (mem && mem.exp > Date.now()) return mem.data;
        return null;
    },

    async setPortfolio(userId, data, ttlSeconds = 60) {
        if (!userId || !data) return;
        const key = `user:portfolio:${userId}`;
        if (isConnected && redis) {
            try {
                await redis.setex(key, ttlSeconds, JSON.stringify(data));
                return;
            } catch {}
        }
        memoryFallback.set(key, { data, exp: Date.now() + ttlSeconds * 1000 });
    },

    async invalidatePortfolio(userId) {
        if (!userId) return;
        const key = `user:portfolio:${userId}`;
        if (isConnected && redis) {
            try {
                await redis.del(key);
            } catch {}
        }
        memoryFallback.delete(key);
    },

    /**
     * Cache watchlists for user (TTL: 300 seconds)
     */
    async getWatchlists(userId) {
        if (!userId) return null;
        const key = `user:watchlists:${userId}`;
        if (isConnected && redis) {
            try {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            } catch {
                return null;
            }
        }
        const mem = memoryFallback.get(key);
        if (mem && mem.exp > Date.now()) return mem.data;
        return null;
    },

    async setWatchlists(userId, data, ttlSeconds = 300) {
        if (!userId || !data) return;
        const key = `user:watchlists:${userId}`;
        if (isConnected && redis) {
            try {
                await redis.setex(key, ttlSeconds, JSON.stringify(data));
                return;
            } catch {}
        }
        memoryFallback.set(key, { data, exp: Date.now() + ttlSeconds * 1000 });
    },

    async invalidateWatchlists(userId) {
        if (!userId) return;
        const key = `user:watchlists:${userId}`;
        if (isConnected && redis) {
            try {
                await redis.del(key);
            } catch {}
        }
        memoryFallback.delete(key);
    },

    /**
     * Generic Key-Value Cache Get
     */
    async get(key) {
        if (!key) return null;
        if (isConnected && redis) {
            try {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            } catch {}
        }
        const mem = memoryFallback.get(key);
        if (mem && mem.exp > Date.now()) return mem.data;
        return null;
    },

    /**
     * Generic Key-Value Cache Set
     */
    async set(key, data, ttlSeconds = 60) {
        if (!key || data === undefined) return;
        if (isConnected && redis) {
            try {
                await redis.setex(key, ttlSeconds, JSON.stringify(data));
                return;
            } catch {}
        }
        memoryFallback.set(key, { data, exp: Date.now() + ttlSeconds * 1000 });
    },

    /**
     * Cache Leaderboard (TTL: 5 seconds)
     */
    async getLeaderboard(scope = 'global') {
        const key = `leaderboard:${scope}`;
        if (isConnected && redis) {
            try {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            } catch {}
        }
        const mem = memoryFallback.get(key);
        if (mem && mem.exp > Date.now()) return mem.data;
        return null;
    },

    async setLeaderboard(scope = 'global', data, ttlSeconds = 5) {
        if (!data) return;
        const key = `leaderboard:${scope}`;
        if (isConnected && redis) {
            try {
                await redis.setex(key, ttlSeconds, JSON.stringify(data));
                return;
            } catch {}
        }
        memoryFallback.set(key, { data, exp: Date.now() + ttlSeconds * 1000 });
    },

    /**
     * Cache Option Chain (TTL: 3 seconds to stay under broker rate-limits)
     */
    async getOptionChain(symbol, expiry = 'nearest') {
        if (!symbol) return null;
        const key = `oc:${symbol.toUpperCase()}:${expiry}`;
        if (isConnected && redis) {
            try {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            } catch {}
        }
        const mem = memoryFallback.get(key);
        if (mem && mem.exp > Date.now()) return mem.data;
        return null;
    },

    async setOptionChain(symbol, expiry = 'nearest', data, ttlSeconds = 3) {
        if (!symbol || !data) return;
        const key = `oc:${symbol.toUpperCase()}:${expiry}`;
        if (isConnected && redis) {
            try {
                await redis.setex(key, ttlSeconds, JSON.stringify(data));
                return;
            } catch {}
        }
        memoryFallback.set(key, { data, exp: Date.now() + ttlSeconds * 1000 });
    },

    /**
     * Cache Dashboard Summary (TTL: 5 seconds)
     */
    async getDashboardSummary(userId) {
        if (!userId) return null;
        const key = `dashboard:summary:${userId}`;
        if (isConnected && redis) {
            try {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            } catch {}
        }
        const mem = memoryFallback.get(key);
        if (mem && mem.exp > Date.now()) return mem.data;
        return null;
    },

    async setDashboardSummary(userId, data, ttlSeconds = 5) {
        if (!userId || !data) return;
        const key = `dashboard:summary:${userId}`;
        if (isConnected && redis) {
            try {
                await redis.setex(key, ttlSeconds, JSON.stringify(data));
                return;
            } catch {}
        }
        memoryFallback.set(key, { data, exp: Date.now() + ttlSeconds * 1000 });
    },

    async invalidateDashboardSummary(userId) {
        if (!userId) return;
        const key = `dashboard:summary:${userId}`;
        if (isConnected && redis) {
            try {
                await redis.del(key);
            } catch {}
        }
        memoryFallback.delete(key);
    },

    /**
     * Cache PnL Summary (TTL: 5 seconds)
     */
    async getPnlSummary(userId) {
        if (!userId) return null;
        const key = `pnl:summary:${userId}`;
        if (isConnected && redis) {
            try {
                const data = await redis.get(key);
                return data ? JSON.parse(data) : null;
            } catch {}
        }
        const mem = memoryFallback.get(key);
        if (mem && mem.exp > Date.now()) return mem.data;
        return null;
    },

    async setPnlSummary(userId, data, ttlSeconds = 5) {
        if (!userId || !data) return;
        const key = `pnl:summary:${userId}`;
        if (isConnected && redis) {
            try {
                await redis.setex(key, ttlSeconds, JSON.stringify(data));
                return;
            } catch {}
        }
        memoryFallback.set(key, { data, exp: Date.now() + ttlSeconds * 1000 });
    },

    async invalidatePnlSummary(userId) {
        if (!userId) return;
        const key = `pnl:summary:${userId}`;
        if (isConnected && redis) {
            try {
                await redis.del(key);
            } catch {}
        }
        memoryFallback.delete(key);
    }
};

module.exports = CacheService;
