'use strict';

const { client: redisClient } = require('../shared/redis');
const { logAudit } = require('../services/auditService');

// In-memory fallback if Redis is unavailable
const memoryBuckets = new Map();

// Periodic cleanup of in-memory buckets
setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of memoryBuckets.entries()) {
        if (bucket.resetAt <= now) {
            memoryBuckets.delete(key);
        }
    }
}, 60000);

/**
 * Rate Limiter Middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in ms (default: 60,000 = 1 min)
 * @param {number} options.max - Max requests in window (default: 100)
 * @param {string} options.message - Error message on 429
 */
function createRateLimiter(options = {}) {
    const windowMs = options.windowMs || 60 * 1000;
    const max = options.max || 100;
    const message = options.message || 'Too many requests, please slow down.';
    const windowSec = Math.ceil(windowMs / 1000);

    return async function rateLimiter(req, res, next) {
        // Exempt health checks
        if (req.path === '/health' || req.path === '/ping') {
            return next();
        }

        const identifier = req.user?._id?.toString() 
            || req.ip 
            || req.headers['x-forwarded-for'] 
            || req.socket.remoteAddress 
            || 'anonymous';

        const redisKey = `ratelimit:${identifier}`;

        try {
            if (redisClient && redisClient.status === 'ready') {
                const current = await redisClient.incr(redisKey);
                if (current === 1) {
                    await redisClient.expire(redisKey, windowSec);
                }

                const ttl = await redisClient.ttl(redisKey);
                res.setHeader('X-RateLimit-Limit', max);
                res.setHeader('X-RateLimit-Remaining', Math.max(0, max - current));
                res.setHeader('X-RateLimit-Reset', Date.now() + (ttl * 1000));

                if (current > max) {
                    res.setHeader('Retry-After', ttl > 0 ? ttl : windowSec);
                    logAudit({
                        userId: req.user?._id,
                        instituteId: req.instituteId,
                        action: 'RATE_LIMIT_EXCEEDED',
                        ipAddress: req.ip,
                        details: { current, max, path: req.path },
                    }).catch(() => {});

                    return res.status(429).json({
                        success: false,
                        message,
                        retryAfterSeconds: ttl > 0 ? ttl : windowSec,
                    });
                }
                return next();
            }
        } catch (err) {
            // Redis error -> fallback to memory
        }

        // ── In-Memory Fallback ──
        const now = Date.now();
        let bucket = memoryBuckets.get(identifier);
        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + windowMs };
            memoryBuckets.set(identifier, bucket);
        }

        bucket.count++;
        const remaining = Math.max(0, max - bucket.count);
        const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', bucket.resetAt);

        if (bucket.count > max) {
            res.setHeader('Retry-After', retryAfter);
            return res.status(429).json({
                success: false,
                message,
                retryAfterSeconds: retryAfter,
            });
        }

        next();
    };
}

module.exports = {
    createRateLimiter,
    defaultRateLimiter: createRateLimiter({ windowMs: 60 * 1000, max: 100 }),
};
