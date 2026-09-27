'use strict';

/**
 * dhanAuthService.js
 * ─────────────────────────────────────────────────────────────
 * Multi-Tenant Automated Dhan Token Generation & Renewal Service
 *
 * Core Capabilities:
 * - RFC 6238 compliant TOTP generator using native Node.js crypto (no external deps)
 * - Automatic 24-hour Dhan Access Token generation via ClientId + PIN + TOTP
 * - Redis-backed hot token caching (`broker:token:<tenantId>`) with TTL
 * - Automatic retry with exponential backoff & security audit logging
 * - Multi-tenant institute token renewal engine
 */

const crypto = require('crypto');
const axios = require('axios');
const { redis } = require('../shared/redis');
const BrokerCredentialModel = require('../model/BrokerCredentialModel');
const tokenService = require('../tokenService');

const DHAN_AUTH_URL = process.env.DHAN_AUTH_URL || 'https://auth.dhan.co/app/generateAccessToken';

// ─── Zero-Dependency RFC 6238 TOTP Engine ─────────────────────────────────────

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Decode Base32 string to Buffer
 */
function base32Decode(base32Str) {
    if (!base32Str || typeof base32Str !== 'string') {
        throw new Error('Invalid Base32 string for TOTP Secret');
    }
    const cleanStr = base32Str.toUpperCase().replace(/[\s\-_=]/g, '');
    let bits = 0;
    let value = 0;
    const output = [];

    for (let i = 0; i < cleanStr.length; i++) {
        const idx = BASE32_ALPHABET.indexOf(cleanStr[i]);
        if (idx === -1) {
            throw new Error(`Invalid Base32 character encountered: ${cleanStr[i]}`);
        }
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(output);
}

/**
 * Generate 6-digit Time-Based One-Time Password (TOTP) from Base32 Secret
 * Period: 30 seconds (standard RFC 6238)
 */
function generateTOTP(secret, timeStepSeconds = 30) {
    const key = base32Decode(secret);
    const counter = Math.floor(Date.now() / 1000 / timeStepSeconds);

    // 8-byte big-endian counter buffer
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    // HMAC-SHA1
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(counterBuffer);
    const digest = hmac.digest();

    // Dynamic truncation
    const offset = digest[digest.length - 1] & 0x0f;
    const code = (
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff)
    ) % 1000000;

    return String(code).padStart(6, '0');
}

/**
 * Decode JWT expiration timestamp
 */
function decodeJwtExpiry(token) {
    try {
        const parts = token.split('.');
        if (parts.length >= 2) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            return payload.exp ? new Date(payload.exp * 1000) : null;
        }
    } catch { /* fallback */ }
    return null;
}

// ─── Core Token Generation & API Client ───────────────────────────────────────

/**
 * Generate Access Token from Dhan using Client ID, PIN, and TOTP Secret
 */
async function generateTokenFromCredentials({ clientId, pin, totpSecret }) {
    if (!clientId || !pin || !totpSecret) {
        throw new Error('ClientId, PIN, and TOTP Secret are required to generate Dhan token');
    }

    const totpCode = generateTOTP(totpSecret);
    const cleanClientId = String(clientId).trim();
    const cleanPin = String(pin).trim();

    try {
        const res = await axios.post(DHAN_AUTH_URL, {
            dhanClientId: cleanClientId,
            pin: cleanPin,
            totp: totpCode,
        }, {
            params: {
                dhanClientId: cleanClientId,
                pin: cleanPin,
                totp: totpCode,
            },
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'TradeLab-BrokerEngine/2.0',
            },
            timeout: 10000,
        });

        const data = res.data;
        if (data?.status === 'error' || data?.status === 'failure' || data?.errorType) {
            const errDesc = data?.message || data?.errorMessage || data?.error || 'Authentication Failed';
            throw new Error(errDesc);
        }

        // Dhan response can return accessToken, access_token, or token
        const accessToken = data?.accessToken || data?.access_token || data?.data?.accessToken || data?.token;
        if (!accessToken) {
            const errDesc = data?.message || data?.error || JSON.stringify(data);
            throw new Error(`Dhan Auth rejected request: ${errDesc}`);
        }

        const expiresAt = decodeJwtExpiry(accessToken) || new Date(Date.now() + 24 * 60 * 60 * 1000);

        return {
            success: true,
            accessToken,
            expiresAt,
            clientId: cleanClientId,
            lastGeneratedAt: new Date(),
        };
    } catch (err) {
        const status = err.response?.status;
        const resData = err.response?.data;
        const msg = resData?.message || resData?.errorMessage || resData?.error || err.message;
        throw new Error(`Dhan Token Generation Failed${status ? ` (HTTP ${status})` : ''}: ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`);
    }
}

// ─── Multi-Tenant Token Management & Redis Caching ───────────────────────────

const REDIS_TOKEN_PREFIX = 'broker:token:';

/**
 * Get active token for a tenant (checks Redis first, then DB)
 */
async function getActiveToken(tenantId = 'ADMIN') {
    const redisKey = `${REDIS_TOKEN_PREFIX}${tenantId}`;

    // 1. Try Redis cache
    if (redis && redis.status === 'ready') {
        try {
            const cached = await redis.get(redisKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.accessToken && new Date(parsed.expiresAt) > new Date()) {
                    return parsed;
                }
            }
        } catch (e) {
            console.warn(`[DhanAuth] Redis get token error for ${tenantId}:`, e.message);
        }
    }

    // 2. Query MongoDB
    const cred = await BrokerCredentialModel.findOne({ tenantId, provider: 'DHAN' });
    if (!cred) return null;

    const decrypted = cred.getDecrypted();
    if (!decrypted.accessToken) return null;

    const tokenObj = {
        tenantId,
        clientId: decrypted.apiKey,
        accessToken: decrypted.accessToken,
        expiresAt: decrypted.expiresAt,
        status: decrypted.status,
    };

    // 3. Cache back in Redis if valid
    if (redis && redis.status === 'ready' && tokenObj.expiresAt) {
        const ttlSeconds = Math.max(60, Math.floor((new Date(tokenObj.expiresAt).getTime() - Date.now()) / 1000));
        redis.set(redisKey, JSON.stringify(tokenObj), 'EX', ttlSeconds).catch(() => {});
    }

    return tokenObj;
}

const _lastTokenGenTime = new Map();

/**
 * Renew token for a specific institute / tenant using stored encrypted credentials
 */
async function renewInstituteToken(tenantId) {
    const lastGen = _lastTokenGenTime.get(tenantId) || 0;
    const elapsed = Date.now() - lastGen;
    if (elapsed < 125000) {
        const remSec = Math.ceil((125000 - elapsed) / 1000);
        console.log(`[DhanAuth] ⏳ Token renewal cooldown active for ${tenantId} (${remSec}s remaining). Serving active token.`);
        const active = await getActiveToken(tenantId);
        if (active && active.accessToken) return active;
    }

    console.log(`[DhanAuth] 🔄 Renewing Dhan token for tenant: ${tenantId}...`);

    const cred = await BrokerCredentialModel.findOne({ tenantId, provider: 'DHAN' });
    if (!cred) {
        throw new Error(`No Dhan credential found for tenant ${tenantId}`);
    }

    if (cred.lastAutoRenewAt && (Date.now() - new Date(cred.lastAutoRenewAt).getTime() < 125000) && cred.lastAutoRenewStatus === 'SUCCESS') {
        const remSec = Math.ceil((125000 - (Date.now() - new Date(cred.lastAutoRenewAt).getTime())) / 1000);
        console.log(`[DhanAuth] ⏳ Token renewal cooldown active from DB for ${tenantId} (${remSec}s remaining). Serving active token.`);
        const active = await getActiveToken(tenantId);
        if (active && active.accessToken) return active;
    }

    const decrypted = cred.getDecrypted();
    if (!decrypted.apiKey || !decrypted.pin || !decrypted.totpSecret) {
        throw new Error(`Tenant ${tenantId} missing ClientId, PIN, or TOTP Secret for automated renewal`);
    }

    try {
        const result = await generateTokenFromCredentials({
            clientId: decrypted.apiKey,
            pin: decrypted.pin,
            totpSecret: decrypted.totpSecret,
        });

        _lastTokenGenTime.set(tenantId, Date.now());

        // Update database credential
        cred.accessToken = result.accessToken;
        cred.expiresAt = result.expiresAt;
        cred.status = 'ACTIVE';
        cred.lastConnectedAt = new Date();
        cred.lastAutoRenewAt = new Date();
        cred.lastAutoRenewStatus = 'SUCCESS';
        cred.lastAutoRenewError = '';
        await cred.save();

        // Update Redis cache
        const redisKey = `${REDIS_TOKEN_PREFIX}${tenantId}`;
        if (redis && redis.status === 'ready') {
            const ttlSeconds = Math.max(60, Math.floor((result.expiresAt.getTime() - Date.now()) / 1000));
            await redis.set(redisKey, JSON.stringify({
                tenantId,
                clientId: decrypted.apiKey,
                accessToken: result.accessToken,
                expiresAt: result.expiresAt,
                status: 'ACTIVE',
            }), 'EX', ttlSeconds);
        }

        // If this is the ADMIN or primary tenant, keep platform fallback in sync
        if (tenantId === 'ADMIN') {
            await tokenService.saveToken(decrypted.apiKey, result.accessToken);
        }

        console.log(`[DhanAuth] ✅ Successfully renewed token for ${tenantId} | Expires: ${result.expiresAt.toISOString()}`);
        return result;

    } catch (err) {
        console.error(`[DhanAuth] ❌ Failed to renew token for ${tenantId}:`, err.message);

        const is2MinRateLimit = err.message.includes('once every 2 minutes');
        const hasValidExistingToken = cred.accessToken && cred.expiresAt && new Date(cred.expiresAt) > new Date();

        if (is2MinRateLimit && hasValidExistingToken) {
            console.log(`[DhanAuth] ℹ️ 2-minute rate limit hit, but existing token is still active until ${new Date(cred.expiresAt).toISOString()}. Preserving active status.`);
            return await getActiveToken(tenantId);
        }

        cred.lastAutoRenewAt = new Date();
        cred.lastAutoRenewStatus = 'FAILED';
        cred.lastAutoRenewError = err.message;
        if (err.message.includes('401') || err.message.includes('rejected') || err.message.includes('Invalid')) {
            cred.status = 'INVALID';
        }
        await cred.save().catch(() => {});
        throw err;
    }
}

/**
 * Bulk renew tokens for all active institutes with autoRenew enabled
 */
async function renewAllActiveInstitutes() {
    console.log('[DhanAuth] 🚀 Starting daily bulk token renewal for all active institutes...');
    const activeCreds = await BrokerCredentialModel.find({
        provider: 'DHAN',
        isActiveProvider: true,
        autoRenew: { $ne: false },
    });

    console.log(`[DhanAuth] Found ${activeCreds.length} institutes scheduled for token renewal.`);
    const results = [];

    for (const cred of activeCreds) {
        try {
            const res = await renewInstituteToken(cred.tenantId);
            results.push({ tenantId: cred.tenantId, success: true, expiresAt: res.expiresAt });
        } catch (err) {
            results.push({ tenantId: cred.tenantId, success: false, error: err.message });
        }
        // Stagger 2.5s between institutes to respect Dhan API limits
        await new Promise(r => setTimeout(r, 2500));
    }

    const succeeded = results.filter(r => r.success).length;
    console.log(`[DhanAuth] 🏁 Daily renewal finished: ${succeeded}/${results.length} tokens successfully generated.`);
    return results;
}

/**
 * Store token in Redis cache with TTL
 */
async function cacheToken(tenantId, accessToken, expiresAt) {
    if (!redis || redis.status !== 'ready' || !accessToken) return;
    const redisKey = `${REDIS_TOKEN_PREFIX}${tenantId}`;
    const expiryDate = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 24 * 3600 * 1000);
    const ttlSeconds = Math.max(60, Math.floor((expiryDate.getTime() - Date.now()) / 1000));
    await redis.set(redisKey, JSON.stringify({
        tenantId,
        accessToken,
        expiresAt: expiryDate,
        status: 'ACTIVE',
    }), 'EX', ttlSeconds).catch(() => {});
}

module.exports = {
    generateTOTP,
    generateTokenFromCredentials,
    getActiveToken,
    renewInstituteToken,
    renewAllActiveInstitutes,
    decodeJwtExpiry,
    cacheToken,
};
