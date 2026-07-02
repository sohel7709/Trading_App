'use strict';

/**
 * Dhan Token Auto-Renewal
 *
 * Two strategies, tried in order:
 *
 * 1. CREDENTIALS AUTO-LOGIN (zero-click)
 *    Set DHAN_USER_ID + DHAN_PASSWORD in .env.
 *    Every morning at 8:30 AM IST this module logs in to Dhan and
 *    generates a fresh token automatically — no portal visit needed.
 *
 * 2. POSTBACK URL (one-click, no copy-paste)
 *    Set the Postback URL in your Dhan app to:
 *      https://your-server.com/dhan/token-postback
 *    Then whenever you click "Generate Token" on dhanhq.co/developers,
 *    Dhan POSTs the token straight to your server — no copy-paste.
 *
 * Manual fallback:
 *    POST /admin/update-token   { clientId, accessToken }
 */

const cron        = require('node-cron');
const axios       = require('axios');
const tokenService = require('./tokenService');

// Dhan portal endpoints (internal, reverse-engineered from dhanhq.co portal)
const DHAN_LOGIN_URL     = 'https://api.dhan.co/v1/login';
const DHAN_TOKEN_GEN_URL = 'https://api.dhan.co/v1/generateToken';

// ─── Auto-login flow ──────────────────────────────────────────────────────────
async function autoRenewToken() {
    const userId   = process.env.DHAN_USER_ID;
    const password = process.env.DHAN_PASSWORD;
    const clientId = process.env.DHAN_CLIENT_ID;
    const appId    = process.env.DHAN_APP_ID;  // e.g. "14d9a7aa"

    if (!userId || !password) {
        console.warn('[AutoRenew] DHAN_USER_ID or DHAN_PASSWORD not set — skipping auto-renewal');
        console.warn('[AutoRenew] Either set credentials in .env, or update token manually via POST /admin/update-token');
        return false;
    }

    console.log('[AutoRenew] Attempting Dhan token auto-renewal...');

    try {
        // Step 1: Login to Dhan portal
        const loginRes = await axios.post(DHAN_LOGIN_URL, {
            userId,
            password,
        }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
        });

        const sessionToken = loginRes.data?.data?.sessionToken || loginRes.data?.sessionToken;
        if (!sessionToken) {
            throw new Error('No session token in login response — check credentials or Dhan portal endpoint');
        }

        // Step 2: Generate a new access token
        const tokenRes = await axios.post(DHAN_TOKEN_GEN_URL, {
            appId: appId || '',
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`,
                'access-token': sessionToken,
            },
            timeout: 15000,
        });

        const accessToken = tokenRes.data?.data?.accessToken
            || tokenRes.data?.accessToken
            || tokenRes.data?.access_token
            || tokenRes.data?.token;

        if (!accessToken) {
            throw new Error('No access token in token generation response');
        }

        await tokenService.saveToken(clientId, accessToken);
        console.log('[AutoRenew] ✅ Token auto-renewed successfully');
        return true;

    } catch (err) {
        const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        console.error(`[AutoRenew] ❌ Auto-renewal failed: ${detail}`);
        console.error('[AutoRenew] Fallback: update token manually → POST /admin/update-token');
        return false;
    }
}

// ─── Schedule: 8:30 AM IST daily ─────────────────────────────────────────────
// node-cron uses server time; we adjust to IST (UTC+5:30) → 3:00 AM UTC
function startAutoRenewCron() {
    // Run at 3:00 AM UTC = 8:30 AM IST, Mon-Sat
    cron.schedule('0 3 * * 1-6', async () => {
        console.log('[AutoRenew] Scheduled token renewal triggered (8:30 AM IST)');
        const ok = await autoRenewToken();
        if (!ok) {
            // Log status so you see it in server logs
            const status = tokenService.getTokenStatus();
            console.warn(`[AutoRenew] Current token status: ${status.status} | hoursLeft: ${status.hoursLeft}`);
        }
    }, {
        timezone: 'UTC',
    });

    // Also check on startup: if token expires within 8 hours, try to renew immediately
    const status = tokenService.getTokenStatus();
    if (status.configured && (status.expired || (status.hoursLeft != null && status.hoursLeft < 8))) {
        console.log('[AutoRenew] Token expires in <8h on startup — attempting immediate renewal...');
        autoRenewToken();
    }

    console.log('[AutoRenew] Cron scheduled: daily at 8:30 AM IST (Mon–Sat)');
}

module.exports = { startAutoRenewCron, autoRenewToken };
