'use strict';

/**
 * Dhan Token Renewal — OTP-based login means full auto-login isn't possible.
 *
 * Two practical approaches (choose one or both):
 *
 * OPTION A — Postback URL (1-click, no copy-paste) ← RECOMMENDED
 *   In dhanhq.co/developers → your app → set Postback URL to:
 *     https://your-server.com/dhan/token-postback
 *   Every time you click "Generate Token" on the portal, Dhan automatically
 *   POSTs the new token to your server. You just click the button — done.
 *
 * OPTION B — Admin web page (paste token from browser/phone)
 *   Open https://your-server.com/admin/token in any browser.
 *   Paste the token from the Dhan portal and click Save.
 *   Takes ~15 seconds. No curl, no copy-paste into terminal.
 *
 * The daily cron below logs token status every morning so you see expiry
 * warnings in your server logs without having to check manually.
 */

const cron         = require('node-cron');
const tokenService = require('./tokenService');

// ─── Daily health check (8:30 AM IST = 3:00 AM UTC) ─────────────────────────
function startAutoRenewCron() {
    cron.schedule('0 3 * * 1-6', () => {
        const status = tokenService.getTokenStatus();
        if (!status.configured) {
            console.warn('[TokenCron] No Dhan token configured. Update via POST /admin/update-token or /admin/token web page.');
            return;
        }
        if (status.expired) {
            console.error('[TokenCron] ⛔ Dhan token has EXPIRED. Open https://dhanhq.co/developers → Generate Token, then visit /admin/token to update.');
        } else if (status.hoursLeft < 2) {
            console.error(`[TokenCron] ⚠️  Token expires in ${Math.round(status.hoursLeft * 60)} minutes! Update now via /admin/token`);
        } else if (status.hoursLeft < 6) {
            console.warn(`[TokenCron] ⚠️  Token expires in ${status.hoursLeft}h. Update today via /admin/token`);
        } else {
            console.log(`[TokenCron] ✅ Token valid | ${status.hoursLeft}h remaining | expires ${status.expiresAt}`);
        }
    }, { timezone: 'UTC' });

    // Immediate check on startup
    const status = tokenService.getTokenStatus();
    if (status.configured && status.hoursLeft != null && status.hoursLeft < 8) {
        console.warn(`[TokenCron] ⚠️  Token expires in ${status.hoursLeft}h — update via /admin/token or POST /admin/update-token`);
    }

    console.log('[TokenCron] Daily health check scheduled: 8:30 AM IST (Mon–Sat)');
}

module.exports = { startAutoRenewCron };
