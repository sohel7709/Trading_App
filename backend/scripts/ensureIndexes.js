'use strict';

const mongoose = require('mongoose');

/**
 * ensureIndexes
 * ─────────────
 * Builds high-performance compound indexes across all collections on hot paths
 * for 1,000–1,200 concurrent users.
 * Runs in background to prevent blocking database operations.
 */
async function ensureIndexes() {
    const db = mongoose.connection;
    if (!db || db.readyState !== 1) {
        console.warn('[DB Indexes] MongoDB not connected, skipping index creation.');
        return;
    }

    console.log('[DB Indexes] ⚡ Ensuring compound indexes for high-scale performance...');

    try {
        const collections = await db.db.listCollections().toArray();
        const colNames = new Set(collections.map(c => c.name));

        const indexDefinitions = [
            // Orders collection
            {
                collection: 'orders',
                indexes: [
                    { key: { userId: 1, status: 1, createdAt: -1 }, name: 'idx_orders_user_status_created' },
                    { key: { userId: 1, createdAt: -1 }, name: 'idx_orders_user_created' },
                    { key: { status: 1 }, name: 'idx_orders_status' },
                    { key: { batchId: 1, createdAt: -1 }, name: 'idx_orders_batch_created' },
                ]
            },
            // Positions collection
            {
                collection: 'positions',
                indexes: [
                    { key: { userId: 1 }, name: 'idx_pos_user' },
                    { key: { userId: 1, stockSymbol: 1 }, name: 'idx_pos_user_symbol' },
                    { key: { batchId: 1 }, name: 'idx_pos_batch' },
                ]
            },
            // Option Positions collection
            {
                collection: 'optionpositions',
                indexes: [
                    { key: { userId: 1 }, name: 'idx_opt_pos_user' },
                    { key: { userId: 1, symbol: 1 }, name: 'idx_opt_pos_user_symbol' },
                    { key: { userId: 1, underlyingSymbol: 1, expiry: 1 }, name: 'idx_opt_pos_lookup' },
                ]
            },
            // Closed Positions collection
            {
                collection: 'closedpositions',
                indexes: [
                    { key: { userId: 1, closedAt: -1 }, name: 'idx_closed_pos_user_date' },
                    { key: { userId: 1, dateStr: 1 }, name: 'idx_closed_pos_user_datestr' },
                ]
            },
            // Trades collection
            {
                collection: 'trades',
                indexes: [
                    { key: { userId: 1, createdAt: -1 }, name: 'idx_trades_user_created' },
                    { key: { batchId: 1, createdAt: -1 }, name: 'idx_trades_batch_created' },
                ]
            },
            // PLRecords collection
            {
                collection: 'plrecords',
                indexes: [
                    { key: { userId: 1, date: -1 }, name: 'idx_pl_user_date' },
                    { key: { userId: 1, segment: 1 }, name: 'idx_pl_user_seg' },
                    { key: { batchId: 1, date: -1 }, name: 'idx_pl_batch_date' },
                ]
            },
            // Users collection
            {
                collection: 'users',
                indexes: [
                    { key: { email: 1 }, name: 'idx_users_email' },
                    { key: { username: 1 }, name: 'idx_users_username' },
                    { key: { instituteCode: 1, role: 1 }, name: 'idx_users_inst_role' },
                    { key: { instituteId: 1, role: 1 }, name: 'idx_users_instid_role' },
                    { key: { batchId: 1 }, name: 'idx_users_batch' },
                ]
            },
            // Wallets collection
            {
                collection: 'wallets',
                indexes: [
                    { key: { userId: 1 }, name: 'idx_wallets_user', unique: true },
                ]
            },
            // Holdings collection
            {
                collection: 'holdings',
                indexes: [
                    { key: { userId: 1, stockSymbol: 1 }, name: 'idx_holdings_user_sym' },
                ]
            },
            // Enrollments collection
            {
                collection: 'enrollments',
                indexes: [
                    { key: { userId: 1, status: 1 }, name: 'idx_enroll_user_status' },
                    { key: { batchId: 1, status: 1 }, name: 'idx_enroll_batch_status' },
                ]
            },
            // Risk logs collection
            {
                collection: 'risklogs',
                indexes: [
                    { key: { userId: 1, createdAt: -1 }, name: 'idx_risk_user_created' },
                    { key: { instituteCode: 1, createdAt: -1 }, name: 'idx_risk_inst_created' },
                ]
            },
            // Price alerts collection
            {
                collection: 'pricealerts',
                indexes: [
                    { key: { userId: 1, status: 1 }, name: 'idx_alerts_user_status' },
                ]
            },
            // Sessions collection
            {
                collection: 'sessions',
                indexes: [
                    { key: { userId: 1, expiresAt: 1 }, name: 'idx_sessions_user_exp' },
                ]
            }
        ];

        let createdCount = 0;
        for (const def of indexDefinitions) {
            if (!colNames.has(def.collection)) continue;
            const col = db.collection(def.collection);
            for (const idx of def.indexes) {
                try {
                    await col.createIndex(idx.key, {
                        name: idx.name,
                        background: true,
                        ...(idx.unique ? { unique: true } : {})
                    });
                    createdCount++;
                } catch (idxErr) {
                    // Ignore duplicate key errors if already exists with slightly different opts
                    if (!idxErr.message.includes('already exists')) {
                        console.warn(`[DB Indexes] Note on ${def.collection}.${idx.name}:`, idxErr.message);
                    }
                }
            }
        }

        console.log(`[DB Indexes] ✅ Verified and ensured ${createdCount} performance compound indexes.`);
    } catch (err) {
        console.error('[DB Indexes] Error ensuring indexes:', err.message);
    }
}

module.exports = { ensureIndexes };
