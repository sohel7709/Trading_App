'use strict';

/**
 * brokerTokenCron.js
 * ─────────────────────────────────────────────────────────────
 * Automated Cron Job for 24-Hour Broker Token Renewals
 *
 * Schedules:
 * 1. 07:00 AM IST Daily: Primary renewal for all active institutes before market opens
 * 2. Hourly Heartbeat: Proactive check that auto-renews any token with < 90m validity
 */

const cron = require('node-cron');
const dhanAuthService = require('../services/dhanAuthService');
const BrokerCredentialModel = require('../model/BrokerCredentialModel');

let _cronStarted = false;

/**
 * Proactive Self-Healing Check:
 * Renews any active Dhan credential if:
 * - Token is already expired (expiresAt <= now)
 * - Token expires within 90 minutes (expiresAt < now + 90m)
 * - Token or expiresAt is missing
 */
async function checkAndRenewExpiringTokens(reason = 'watchdog') {
    try {
        const now = Date.now();
        const thresholdTime = new Date(now + 90 * 60 * 1000); // 90 mins ahead

        const activeCreds = await BrokerCredentialModel.find({
            provider: 'DHAN',
            isActiveProvider: true,
            autoRenew: { $ne: false },
        });

        const needingRenewal = activeCreds.filter(cred => {
            const dec = typeof cred.getDecrypted === 'function' ? cred.getDecrypted() : cred;
            // Must have credentials configured for automated renewal
            if (!dec.apiKey || !dec.pin || !dec.totpSecret) {
                return false;
            }
            // If missing token or missing expiry date -> renew immediately
            if (!cred.accessToken || !cred.expiresAt) {
                return true;
            }
            // If expired or expiring within 90 mins -> renew immediately
            return new Date(cred.expiresAt).getTime() < thresholdTime.getTime();
        });

        if (needingRenewal.length > 0) {
            console.log(`[BrokerTokenCron] ⚠️ [${reason}] Found ${needingRenewal.length} tokens needing renewal (expired or expiring in < 90m). Auto-renewing...`);
            for (const cred of needingRenewal) {
                try {
                    await dhanAuthService.renewInstituteToken(cred.tenantId);
                } catch (e) {
                    console.warn(`[BrokerTokenCron] [${reason}] Renewal failed for tenant ${cred.tenantId}:`, e.message);
                }
                await new Promise(r => setTimeout(r, 2000));
            }
        } else {
            console.log(`[BrokerTokenCron] ✅ [${reason}] All active Dhan tokens valid & healthy.`);
        }
    } catch (err) {
        console.warn(`[BrokerTokenCron] ❌ [${reason}] Expiry check error:`, err.message);
    }
}

function initBrokerTokenCron() {
    if (_cronStarted) return;
    _cronStarted = true;

    console.log('[BrokerTokenCron] ⏰ Initializing Automated 7:00 AM IST Token Renewal Engine...');

    // ─── 1. Primary 7:00 AM IST Daily Renewal ────────────────────────────────
    // Standard cron format in Asia/Kolkata: minute=0, hour=7
    cron.schedule('0 7 * * *', async () => {
        console.log('[BrokerTokenCron] 🌅 7:00 AM IST Daily Token Renewal Triggered');
        try {
            await dhanAuthService.renewAllActiveInstitutes();
        } catch (err) {
            console.error('[BrokerTokenCron] ❌ Daily renewal job encountered an error:', err.message);
        }
    }, {
        timezone: 'Asia/Kolkata',
    });

    // ─── 2. Hourly Proactive Expiry Heartbeat (Runs at minute 15 of every hour) ─
    cron.schedule('15 * * * *', async () => {
        await checkAndRenewExpiringTokens('hourly-heartbeat');
    }, {
        timezone: 'Asia/Kolkata',
    });

    // ─── 3. Startup Self-Healing Check (Runs 5s after boot to catch missed crons) ─
    setTimeout(() => {
        checkAndRenewExpiringTokens('startup-self-healing').catch(err => {
            console.warn('[BrokerTokenCron] Startup self-healing check error:', err.message);
        });
    }, 5000);

    console.log('[BrokerTokenCron] ✅ 7:00 AM IST daily cron, hourly heartbeats & startup self-healing scheduled');
}

module.exports = {
    initBrokerTokenCron,
    checkAndRenewExpiringTokens,
};
