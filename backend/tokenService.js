'use strict';

/**
 * Dhan Token Management
 *
 * Dhan issues 24-hour JWT tokens. This service stores the active token in
 * MongoDB so it survives server restarts, checks expiry, and exposes an
 * /admin/update-token endpoint so you can paste a new token whenever you
 * regenerate it from the Dhan portal without redeploying.
 *
 * 30-DAY SOLUTION:
 * Dhan's portal currently caps tokens at 24 hours. The practical approach:
 *   1. Every morning (9:00 AM IST) go to https://dhanhq.co/developers
 *   2. Click your app → Generate Token
 *   3. POST the new token to /admin/update-token  (see endpoint below)
 *   4. The server auto-picks it up — no restart needed
 *
 * If you want full automation (zero daily effort), set up a daily cron that:
 *   - Logs in to Dhan via TOTP (requires DHAN_TOTP_SECRET env var)
 *   - Calls the portal's internal token-gen API
 *   - Posts the result to /admin/update-token
 * This is optional; the manual flow above takes 30 seconds.
 */

const mongoose = require('mongoose');

// ─── Token storage schema ─────────────────────────────────────────────────────
const tokenSchema = new mongoose.Schema({
    service:     { type: String, default: 'dhan' },
    clientId:    String,
    accessToken: String,
    issuedAt:    Date,
    expiresAt:   Date,
    updatedAt:   { type: Date, default: Date.now },
});
const TokenModel = mongoose.models.DhanToken || mongoose.model('DhanToken', tokenSchema, 'dhan_tokens');

// ─── In-memory cache (avoids DB hit on every API call) ────────────────────────
let _cachedToken = null;
let _cacheExpiry = 0;

function decodeJwtExpiry(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.exp ? new Date(payload.exp * 1000) : null;
    } catch { return null; }
}

function decodeJwtIssuedAt(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.iat ? new Date(payload.iat * 1000) : new Date();
    } catch { return new Date(); }
}

// ─── Load token on startup ────────────────────────────────────────────────────
async function loadTokenFromDB() {
    try {
        const rec = await TokenModel.findOne({ service: 'dhan' });
        if (rec && rec.accessToken) {
            process.env.DHAN_CLIENT_ID    = rec.clientId;
            process.env.DHAN_ACCESS_TOKEN = rec.accessToken;
            _cachedToken = rec.accessToken;
            _cacheExpiry = rec.expiresAt ? rec.expiresAt.getTime() : 0;
            console.log(`[Token] Loaded Dhan token from DB | expires: ${rec.expiresAt?.toISOString() || 'unknown'}`);
            warnIfExpiringSoon(rec.expiresAt);
            return true;
        }
    } catch (e) {
        console.warn('[Token] Could not load from DB:', e.message);
    }
    // Fall back to .env values
    const envToken = process.env.DHAN_ACCESS_TOKEN;
    if (envToken && envToken !== 'YOUR_DHAN_ACCESS_TOKEN') {
        const exp = decodeJwtExpiry(envToken);
        _cachedToken = envToken;
        _cacheExpiry = exp ? exp.getTime() : 0;
        console.log(`[Token] Using .env token | expires: ${exp?.toISOString() || 'unknown'}`);
        warnIfExpiringSoon(exp);
    }
    return false;
}

function warnIfExpiringSoon(expiresAt) {
    if (!expiresAt) return;
    const msLeft = expiresAt.getTime() - Date.now();
    const hoursLeft = msLeft / (1000 * 60 * 60);
    if (hoursLeft < 2) {
        console.error(`[Token] ⚠️  Dhan token EXPIRES IN ${Math.round(hoursLeft * 60)} MINUTES! Update via POST /admin/update-token`);
    } else if (hoursLeft < 6) {
        console.warn(`[Token] ⚠️  Dhan token expires in ${Math.round(hoursLeft)} hours. Update via POST /admin/update-token`);
    }
}

// ─── Save / Update token ──────────────────────────────────────────────────────
async function saveToken(clientId, accessToken) {
    const issuedAt  = decodeJwtIssuedAt(accessToken);
    const expiresAt = decodeJwtExpiry(accessToken);

    // Update env immediately so active requests use new token
    process.env.DHAN_CLIENT_ID    = clientId;
    process.env.DHAN_ACCESS_TOKEN = accessToken;
    _cachedToken = accessToken;
    _cacheExpiry = expiresAt ? expiresAt.getTime() : 0;

    try {
        await TokenModel.findOneAndUpdate(
            { service: 'dhan' },
            { clientId, accessToken, issuedAt, expiresAt, updatedAt: new Date() },
            { upsert: true, new: true }
        );
        console.log(`[Token] Saved new Dhan token | expires: ${expiresAt?.toISOString() || 'unknown'}`);
    } catch (e) {
        console.warn('[Token] DB save failed (token still active in memory):', e.message);
    }

    warnIfExpiringSoon(expiresAt);
    return { clientId, issuedAt, expiresAt };
}

// ─── Status ───────────────────────────────────────────────────────────────────
function getTokenStatus() {
    const token = process.env.DHAN_ACCESS_TOKEN;
    if (!token || token === 'YOUR_DHAN_ACCESS_TOKEN') {
        return { configured: false, status: 'NOT_SET' };
    }
    const expiresAt = decodeJwtExpiry(token);
    const issuedAt  = decodeJwtIssuedAt(token);
    const now = Date.now();
    const msLeft = expiresAt ? expiresAt.getTime() - now : null;
    const hoursLeft = msLeft !== null ? msLeft / (1000 * 60 * 60) : null;

    return {
        configured: true,
        clientId:   process.env.DHAN_CLIENT_ID,
        issuedAt:   issuedAt?.toISOString(),
        expiresAt:  expiresAt?.toISOString(),
        hoursLeft:  hoursLeft !== null ? Math.round(hoursLeft * 10) / 10 : null,
        expired:    msLeft !== null ? msLeft < 0 : false,
        status:     msLeft === null   ? 'UNKNOWN'
                  : msLeft < 0        ? 'EXPIRED'
                  : msLeft < 7200000  ? 'EXPIRING_SOON'   // < 2h
                  : 'VALID',
    };
}

// ─── Periodic expiry check (every 30 min) ────────────────────────────────────
setInterval(() => {
    const expiresAt = decodeJwtExpiry(process.env.DHAN_ACCESS_TOKEN || '');
    if (expiresAt) warnIfExpiringSoon(expiresAt);
}, 30 * 60 * 1000);

module.exports = {
    loadTokenFromDB,
    saveToken,
    getTokenStatus,
    TokenModel,
};
