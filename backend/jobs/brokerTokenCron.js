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

    // ─── 2. Hourly Proactive Expiry Heartbeat ────────────────────────────────
    // Runs at minute 15 of every hour to catch any token expiring in < 90 minutes
    cron.schedule('15 * * * *', async () => {
        try {
            const now = Date.now();
            const thresholdTime = new Date(now + 90 * 60 * 1000); // 90 mins ahead

            const expiringSoon = await BrokerCredentialModel.find({
                provider: 'DHAN',
                isActiveProvider: true,
                autoRenew: { $ne: false },
                expiresAt: { $gt: new Date(now), $lt: thresholdTime },
            });

            if (expiringSoon.length > 0) {
                console.log(`[BrokerTokenCron] ⚠️ Found ${expiringSoon.length} tokens expiring in < 90m. Auto-renewing proactively...`);
                for (const cred of expiringSoon) {
                    try {
                        await dhanAuthService.renewInstituteToken(cred.tenantId);
                    } catch (e) {
                        console.warn(`[BrokerTokenCron] Proactive renewal failed for ${cred.tenantId}:`, e.message);
                    }
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        } catch (err) {
            console.warn('[BrokerTokenCron] Expiry check error:', err.message);
        }
    }, {
        timezone: 'Asia/Kolkata',
    });

    console.log('[BrokerTokenCron] ✅ 7:00 AM IST daily cron & hourly expiry heartbeats scheduled');
}

module.exports = {
    initBrokerTokenCron,
};
