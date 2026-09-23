'use strict';

/**
 * marketControlService.js
 * ─────────────────────────────────────────────────────────────
 * Phase 2 Central Market Control Engine:
 * - Redis-backed Global Market State:
 *   { mode: 'LIVE' | 'REPLAY' | 'SYNTHETIC', isHalted: boolean, haltReason: string, haltedAt: string, updatedAt: string, updatedBy: string }
 * - Real-time Redis Pub/Sub: channel 'MARKET_EVENTS'
 * - Socket.io Global Broadcasts:
 *   - 'market_update'
 *   - 'market_halted'
 *   - 'market_resumed'
 * - Emergency Halt System with optional MIS auto square-off and pending order cancellation
 * - Synthetic Market Tick Walk Generator when in SYNTHETIC mode
 */

const { redis, publisher, subscriber } = require('../shared/redis');
const { logAction } = require('./auditService');

const MARKET_STATE_KEY = 'GLOBAL_MARKET_STATE';
const MARKET_EVENTS_CHANNEL = 'MARKET_EVENTS';

// Default in-memory state
let currentMarketState = {
    mode: 'LIVE', // 'LIVE' | 'REPLAY' | 'SYNTHETIC'
    isHalted: false,
    haltReason: null,
    haltedAt: null,
    updatedAt: new Date().toISOString(),
    updatedBy: 'SYSTEM',
};

const batchMarketStateMap = new Map();

let _io = null;
let _syntheticInterval = null;

class MarketControlService {
    constructor() {
        this._initialized = false;
    }

    /**
     * Initialize service with Socket.IO instance and load initial state from Redis
     */
    async init(io) {
        if (io) _io = io;
        if (this._initialized) return;

        try {
            // Load state from Redis if available
            const savedState = await redis.get(MARKET_STATE_KEY);
            if (savedState) {
                const parsed = JSON.parse(savedState);
                currentMarketState = { ...currentMarketState, ...parsed };
                console.log(`[MarketControl] 🔄 Loaded initial state from Redis: mode=${currentMarketState.mode}, isHalted=${currentMarketState.isHalted}`);
            } else {
                await redis.set(MARKET_STATE_KEY, JSON.stringify(currentMarketState));
            }

            // Subscribe to Redis Pub/Sub for cross-instance real-time synchronization
            if (subscriber) {
                subscriber.subscribe(MARKET_EVENTS_CHANNEL, (err) => {
                    if (err) console.warn('[MarketControl] Failed to subscribe to MARKET_EVENTS:', err.message);
                    else console.log('[MarketControl] 📡 Subscribed to MARKET_EVENTS Pub/Sub channel');
                });

                subscriber.on('message', (channel, message) => {
                    if (channel === MARKET_EVENTS_CHANNEL) {
                        try {
                            const event = JSON.parse(message);
                            this._handleRemoteEvent(event);
                        } catch (err) {
                            console.warn('[MarketControl] Error parsing MARKET_EVENTS message:', err.message);
                        }
                    }
                });
            }

            // If initialized in SYNTHETIC mode, start generator
            if (currentMarketState.mode === 'SYNTHETIC' && !currentMarketState.isHalted) {
                this._startSyntheticMarket();
            }

            this._initialized = true;
        } catch (e) {
            console.warn('[MarketControl] Init fallback to memory:', e.message);
            this._initialized = true;
        }
    }

    /**
     * Get current market state (synchronous cached read with async background sync)
     */
    getMarketState() {
        return { ...currentMarketState };
    }

    /**
     * Check if market is currently halted
     */
    isHalted() {
        return Boolean(currentMarketState.isHalted);
    }

    /**
     * Switch Market Mode: 'LIVE' | 'REPLAY' | 'SYNTHETIC'
     */
    async setMode(mode, user = null) {
        const validModes = ['LIVE', 'REPLAY', 'SYNTHETIC'];
        const normalized = String(mode).toUpperCase();
        if (!validModes.includes(normalized)) {
            throw new Error(`Invalid market mode: ${mode}. Allowed modes: ${validModes.join(', ')}`);
        }

        const previousMode = currentMarketState.mode;
        currentMarketState.mode = normalized;
        currentMarketState.updatedAt = new Date().toISOString();
        currentMarketState.updatedBy = user?.name || user?.email || 'ADMIN';

        await this._persistAndPublish({
            type: 'MODE_CHANGE',
            previousMode,
            mode: normalized,
            state: currentMarketState,
            updatedBy: currentMarketState.updatedBy,
        });

        // Mode-specific switching logic
        if (normalized === 'SYNTHETIC') {
            this._startSyntheticMarket();
        } else {
            this._stopSyntheticMarket();
        }

        // Log audit trail
        logAction({
            action: 'MARKET_MODE_SWITCH',
            actor: user?._id || null,
            details: { previousMode, newMode: normalized },
        }).catch(() => {});

        console.log(`[MarketControl] 🔀 Market Mode switched: ${previousMode} → ${normalized} by ${currentMarketState.updatedBy}`);
        return { ...currentMarketState };
    }

    /**
     * Halt Market (Emergency Stop or Maintenance)
     */
    async haltMarket(reason = 'Market halted by administrator', user = null) {
        currentMarketState.isHalted = true;
        currentMarketState.haltReason = reason;
        currentMarketState.haltedAt = new Date().toISOString();
        currentMarketState.updatedAt = currentMarketState.haltedAt;
        currentMarketState.updatedBy = user?.name || user?.email || 'ADMIN';

        await this._persistAndPublish({
            type: 'HALT',
            reason,
            haltedAt: currentMarketState.haltedAt,
            state: currentMarketState,
            updatedBy: currentMarketState.updatedBy,
        });

        logAction({
            action: 'MARKET_HALT',
            actor: user?._id || null,
            details: { reason },
        }).catch(() => {});

        console.log(`[MarketControl] 🛑 MARKET HALTED! Reason: "${reason}" by ${currentMarketState.updatedBy}`);
        return { ...currentMarketState };
    }

    /**
     * Resume Market
     */
    async resumeMarket(user = null) {
        const previousReason = currentMarketState.haltReason;
        currentMarketState.isHalted = false;
        currentMarketState.haltReason = null;
        currentMarketState.haltedAt = null;
        currentMarketState.updatedAt = new Date().toISOString();
        currentMarketState.updatedBy = user?.name || user?.email || 'ADMIN';

        await this._persistAndPublish({
            type: 'RESUME',
            previousReason,
            resumedAt: currentMarketState.updatedAt,
            state: currentMarketState,
            updatedBy: currentMarketState.updatedBy,
        });

        if (currentMarketState.mode === 'SYNTHETIC') {
            this._startSyntheticMarket();
        }

        logAction({
            action: 'MARKET_RESUME',
            actor: user?._id || null,
            details: { previousReason },
        }).catch(() => {});

        console.log(`[MarketControl] ▶️ MARKET RESUMED by ${currentMarketState.updatedBy}`);
        return { ...currentMarketState };
    }

    /**
     * Emergency Halt System (Halts market, optionally cancels all pending orders and squares off MIS positions)
     */
    async emergencyHalt({ reason = 'CRITICAL EMERGENCY HALT TRIGGERED', autoSquareOffMIS = false, user = null }) {
        await this.haltMarket(reason, user);

        let squaredOffCount = 0;
        let cancelledOrdersCount = 0;

        if (autoSquareOffMIS) {
            try {
                const { OrdersModel } = require('../model/OrdersModel');
                const { PositionsModel } = require('../model/PositionsModel');
                const orderEngine = require('../orderEngine');

                // 1. Cancel all resting PENDING orders
                const pendingOrders = await OrdersModel.find({ status: 'PENDING' });
                for (const ord of pendingOrders) {
                    ord.status = 'CANCELLED';
                    ord.rejectionReason = `Emergency Halt: ${reason}`;
                    await ord.save();
                    cancelledOrdersCount++;
                }

                // 2. Square off all open MIS positions
                const misPositions = await PositionsModel.find({ productType: 'MIS' });
                for (const pos of misPositions) {
                    try {
                        const marketDataService = require('../marketDataService');
                        const live = marketDataService.getStockPrice(pos.stockSymbol);
                        const exitPrice = live?.ltp || pos.avgPrice;
                        await orderEngine.squareOffPosition(pos._id, exitPrice);
                        squaredOffCount++;
                    } catch (e) {
                        console.error(`[EmergencyHalt] Square-off failed for pos ${pos._id}:`, e.message);
                    }
                }
            } catch (err) {
                console.error('[EmergencyHalt] Execution error during square-off:', err.message);
            }
        }

        logAction({
            action: 'EMERGENCY_HALT',
            actor: user?._id || null,
            details: { reason, autoSquareOffMIS, cancelledOrdersCount, squaredOffCount },
        }).catch(() => {});

        return {
            ...currentMarketState,
            cancelledOrdersCount,
            squaredOffCount,
        };
    }

    /**
     * Save to Redis and publish event to cluster + Sockets
     */
    async _persistAndPublish(event) {
        try {
            await redis.set(MARKET_STATE_KEY, JSON.stringify(currentMarketState));
        } catch (e) {
            console.warn('[MarketControl] Redis set error:', e.message);
        }

        // Publish to Redis channel
        try {
            if (publisher) {
                await publisher.publish(MARKET_EVENTS_CHANNEL, JSON.stringify(event));
            }
        } catch (e) {
            console.warn('[MarketControl] Redis publish error:', e.message);
        }

        // Broadcast to all Socket.IO clients directly
        this._broadcastSocketEvent(event);
    }

    /**
     * Handle remote event received via Redis Pub/Sub from another cluster node
     */
    _handleRemoteEvent(event) {
        if (!event || !event.state) return;
        if (event.batchId) {
            batchMarketStateMap.set(String(event.batchId), event.state);
            if (_io) {
                _io.to(`batch:${event.batchId}`).emit('batch_market_update', event.state);
                _io.to(String(event.batchId)).emit('batch_market_update', event.state);
            }
            return;
        }
        currentMarketState = { ...currentMarketState, ...event.state };
        this._broadcastSocketEvent(event);
    }

    /**
     * Broadcast to connected clients via Socket.IO
     */
    _broadcastSocketEvent(event) {
        if (!_io) return;

        // General update event
        _io.emit('market_update', currentMarketState);

        // Specific trigger events
        if (event.type === 'HALT') {
            _io.emit('market_halted', {
                reason: currentMarketState.haltReason,
                haltedAt: currentMarketState.haltedAt,
            });
        } else if (event.type === 'RESUME') {
            _io.emit('market_resumed', {
                resumedAt: currentMarketState.updatedAt,
            });
        }
    }

    /**
     * Synthetic Market Price Walk Generator (for SYNTHETIC mode)
     */
    _startSyntheticMarket() {
        if (_syntheticInterval) return;
        console.log('[MarketControl] 🎲 Starting Synthetic Price Generator (Brownian Motion)');

        const marketDataService = require('../marketDataService');

        _syntheticInterval = setInterval(() => {
            if (currentMarketState.isHalted) return;

            const tracked = marketDataService.getTrackedSymbols();
            const prices = marketDataService.getStockPrices();

            for (const sym of tracked) {
                const quote = prices[sym];
                if (!quote || !quote.ltp) continue;

                // Drift + random perturbation (-0.15% to +0.15%)
                const deltaPct = (Math.random() - 0.495) * 0.003;
                let newLtp = Math.round((quote.ltp * (1 + deltaPct)) * 100) / 100;
                const pc = quote.previousClose || quote.ltp;
                const change = Math.round((newLtp - pc) * 100) / 100;
                const changePercent = pc > 0 ? Math.round((change / pc) * 10000) / 100 : 0;

                quote.ltp = newLtp;
                quote.change = change;
                quote.changePercent = changePercent;
                quote.high = Math.max(quote.high || newLtp, newLtp);
                quote.low = Math.min(quote.low || newLtp, newLtp);
                quote.source = 'SYNTHETIC';
            }

            // Synthetic index updates
            const indexes = marketDataService.getIndexData();
            for (const [name, idx] of Object.entries(indexes)) {
                if (!idx || !idx.ltp) continue;
                const deltaPct = (Math.random() - 0.495) * 0.002;
                let newLtp = Math.round((idx.ltp * (1 + deltaPct)) * 100) / 100;
                const pc = idx.previousClose || idx.ltp;
                const change = Math.round((newLtp - pc) * 100) / 100;
                const changePercent = pc > 0 ? Math.round((change / pc) * 10000) / 100 : 0;

                idx.ltp = newLtp;
                idx.change = change;
                idx.changePercent = changePercent;
                idx.high = Math.max(idx.high || newLtp, newLtp);
                idx.low = Math.min(idx.low || newLtp, newLtp);
                idx.source = 'SYNTHETIC';
            }
        }, 1000);
    }

    _stopSyntheticMarket() {
        if (_syntheticInterval) {
            clearInterval(_syntheticInterval);
            _syntheticInterval = null;
            console.log('[MarketControl] 🛑 Stopped Synthetic Price Generator');
        }
    }

    /**
     * ─── BATCH-LEVEL MARKET CONTROL ───────────────────────────────────────────
     */

    /**
     * Get or load batch-level market state
     */
    async getBatchMarketState(batchId) {
        if (!batchId) return null;
        const bIdStr = String(batchId);

        // 1. Check in-memory map
        if (batchMarketStateMap.has(bIdStr)) {
            return { ...batchMarketStateMap.get(bIdStr) };
        }

        // 2. Check Redis
        try {
            const redisVal = await redis.get(`BATCH_MARKET_STATE:${bIdStr}`);
            if (redisVal) {
                const parsed = JSON.parse(redisVal);
                batchMarketStateMap.set(bIdStr, parsed);
                return { ...parsed };
            }
        } catch (e) {
            // Redis error fallback
        }

        // 3. Fallback to MongoDB
        try {
            const { BatchModel } = require('../model/BatchModel');
            const batch = await BatchModel.findById(batchId);
            if (batch) {
                const state = {
                    batchId: bIdStr,
                    batchCode: batch.code,
                    mode: batch.marketMode || 'LIVE',
                    isHalted: Boolean(batch.isHalted),
                    haltReason: batch.haltReason || null,
                    haltedAt: batch.haltedAt ? batch.haltedAt.toISOString() : null,
                    haltedBy: batch.haltedBy || null,
                    updatedAt: batch.updatedAt ? batch.updatedAt.toISOString() : new Date().toISOString(),
                };
                batchMarketStateMap.set(bIdStr, state);
                redis.set(`BATCH_MARKET_STATE:${bIdStr}`, JSON.stringify(state)).catch(() => {});
                return state;
            }
        } catch (err) {
            console.warn('[MarketControl] Error loading batch state from DB:', err.message);
        }

        return null;
    }

    /**
     * Check if a batch is halted (checks global halt first, then batch halt)
     */
    async isBatchHalted(batchId) {
        if (currentMarketState.isHalted) {
            return {
                isHalted: true,
                reason: currentMarketState.haltReason || 'Exchange Circuit Breaker Active',
                scope: 'GLOBAL',
            };
        }
        if (!batchId) {
            return { isHalted: false, reason: null, scope: null };
        }
        const bState = await this.getBatchMarketState(batchId);
        if (bState && bState.isHalted) {
            return {
                isHalted: true,
                reason: bState.haltReason || 'Trading halted for this batch by instructor',
                scope: 'BATCH',
            };
        }
        return { isHalted: false, reason: null, scope: null };
    }

    /**
     * Synchronous batch halt check using cached memory map
     */
    isBatchHaltedSync(batchId) {
        if (currentMarketState.isHalted) {
            return {
                isHalted: true,
                reason: currentMarketState.haltReason || 'Exchange Circuit Breaker Active',
                scope: 'GLOBAL',
            };
        }
        if (!batchId) return { isHalted: false, reason: null, scope: null };
        const cached = batchMarketStateMap.get(String(batchId));
        if (cached && cached.isHalted) {
            return {
                isHalted: true,
                reason: cached.haltReason || 'Trading halted for this batch by instructor',
                scope: 'BATCH',
            };
        }
        return { isHalted: false, reason: null, scope: null };
    }

    /**
     * Set batch market mode ('LIVE' | 'REPLAY' | 'SYNTHETIC' | 'DELAYED')
     */
    async setBatchMode(batchId, mode, user = null) {
        const validModes = ['LIVE', 'REPLAY', 'SYNTHETIC', 'DELAYED'];
        const normalized = String(mode).toUpperCase();
        if (!validModes.includes(normalized)) {
            throw new Error(`Invalid batch market mode: ${mode}. Allowed: ${validModes.join(', ')}`);
        }

        const { BatchModel } = require('../model/BatchModel');
        const batch = await BatchModel.findById(batchId);
        if (!batch) throw new Error('Batch not found');

        const prevMode = batch.marketMode;
        batch.marketMode = normalized;
        await batch.save();

        const bIdStr = String(batchId);
        const state = {
            batchId: bIdStr,
            batchCode: batch.code,
            mode: normalized,
            isHalted: Boolean(batch.isHalted),
            haltReason: batch.haltReason || null,
            haltedAt: batch.haltedAt ? batch.haltedAt.toISOString() : null,
            haltedBy: batch.haltedBy || null,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.name || user?.email || 'INSTRUCTOR',
        };

        batchMarketStateMap.set(bIdStr, state);
        try {
            await redis.set(`BATCH_MARKET_STATE:${bIdStr}`, JSON.stringify(state));
        } catch (e) {
            // ignore
        }

        // Broadcast to batch rooms
        if (_io) {
            _io.to(`batch:${bIdStr}`).emit('batch_market_update', state);
            _io.to(bIdStr).emit('batch_market_update', state);
            _io.to(`batch:${bIdStr}`).emit('market_update', {
                ...state,
                scope: 'BATCH',
            });
            _io.to(bIdStr).emit('market_update', {
                ...state,
                scope: 'BATCH',
            });
        }

        // Publish to Redis channel
        if (publisher) {
            publisher.publish(MARKET_EVENTS_CHANNEL, JSON.stringify({
                type: 'BATCH_MODE_CHANGE',
                batchId: bIdStr,
                mode: normalized,
                state,
            })).catch(() => {});
        }

        logAction({
            action: 'BATCH_MARKET_MODE_SWITCH',
            actor: user?._id || null,
            details: { batchId: bIdStr, batchCode: batch.code, prevMode, newMode: normalized },
        }).catch(() => {});

        console.log(`[MarketControl] 🔀 Batch [${batch.code}] mode switched to ${normalized} by ${user?.name || 'ADMIN'}`);
        return state;
    }

    /**
     * Halt batch trading
     */
    async haltBatch(batchId, reason = 'Batch trading halted by instructor', user = null) {
        const { BatchModel } = require('../model/BatchModel');
        const batch = await BatchModel.findById(batchId);
        if (!batch) throw new Error('Batch not found');

        batch.isHalted = true;
        batch.haltReason = reason;
        batch.haltedAt = new Date();
        batch.haltedBy = user?.name || user?.email || 'INSTRUCTOR';
        await batch.save();

        const bIdStr = String(batchId);
        const state = {
            batchId: bIdStr,
            batchCode: batch.code,
            mode: batch.marketMode || 'LIVE',
            isHalted: true,
            haltReason: reason,
            haltedAt: batch.haltedAt.toISOString(),
            haltedBy: batch.haltedBy,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.name || user?.email || 'INSTRUCTOR',
        };

        batchMarketStateMap.set(bIdStr, state);
        try {
            await redis.set(`BATCH_MARKET_STATE:${bIdStr}`, JSON.stringify(state));
        } catch (e) {
            // ignore
        }

        // Broadcast to batch rooms
        if (_io) {
            _io.to(`batch:${bIdStr}`).emit('batch_market_update', state);
            _io.to(bIdStr).emit('batch_market_update', state);
            _io.to(`batch:${bIdStr}`).emit('market_halted', {
                reason,
                haltedAt: state.haltedAt,
                scope: 'BATCH',
                batchId: bIdStr,
            });
            _io.to(bIdStr).emit('market_halted', {
                reason,
                haltedAt: state.haltedAt,
                scope: 'BATCH',
                batchId: bIdStr,
            });
        }

        if (publisher) {
            publisher.publish(MARKET_EVENTS_CHANNEL, JSON.stringify({
                type: 'BATCH_HALT',
                batchId: bIdStr,
                reason,
                state,
            })).catch(() => {});
        }

        logAction({
            action: 'BATCH_HALT',
            actor: user?._id || null,
            details: { batchId: bIdStr, batchCode: batch.code, reason },
        }).catch(() => {});

        console.log(`[MarketControl] 🛑 Batch [${batch.code}] HALTED by ${state.haltedBy} (Reason: ${reason})`);
        return state;
    }

    /**
     * Resume batch trading
     */
    async resumeBatch(batchId, user = null) {
        const { BatchModel } = require('../model/BatchModel');
        const batch = await BatchModel.findById(batchId);
        if (!batch) throw new Error('Batch not found');

        const prevReason = batch.haltReason;
        batch.isHalted = false;
        batch.haltReason = null;
        batch.haltedAt = null;
        batch.haltedBy = null;
        await batch.save();

        const bIdStr = String(batchId);
        const state = {
            batchId: bIdStr,
            batchCode: batch.code,
            mode: batch.marketMode || 'LIVE',
            isHalted: false,
            haltReason: null,
            haltedAt: null,
            haltedBy: null,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.name || user?.email || 'INSTRUCTOR',
        };

        batchMarketStateMap.set(bIdStr, state);
        try {
            await redis.set(`BATCH_MARKET_STATE:${bIdStr}`, JSON.stringify(state));
        } catch (e) {
            // ignore
        }

        // Broadcast to batch rooms
        if (_io) {
            _io.to(`batch:${bIdStr}`).emit('batch_market_update', state);
            _io.to(bIdStr).emit('batch_market_update', state);
            _io.to(`batch:${bIdStr}`).emit('market_resumed', {
                resumedAt: state.updatedAt,
                scope: 'BATCH',
                batchId: bIdStr,
            });
            _io.to(bIdStr).emit('market_resumed', {
                resumedAt: state.updatedAt,
                scope: 'BATCH',
                batchId: bIdStr,
            });
        }

        if (publisher) {
            publisher.publish(MARKET_EVENTS_CHANNEL, JSON.stringify({
                type: 'BATCH_RESUME',
                batchId: bIdStr,
                state,
            })).catch(() => {});
        }

        logAction({
            action: 'BATCH_RESUME',
            actor: user?._id || null,
            details: { batchId: bIdStr, batchCode: batch.code, prevReason },
        }).catch(() => {});

        console.log(`[MarketControl] ▶️ Batch [${batch.code}] RESUMED by ${user?.name || 'ADMIN'}`);
        return state;
    }

    /**
     * Emergency Halt for a batch (Halts, cancels pending orders for batch students, optional MIS square-off)
     */
    async emergencyHaltBatch({ batchId, reason = 'Emergency batch trading halt', autoSquareOffMIS = false, user = null }) {
        const state = await this.haltBatch(batchId, reason, user);

        let cancelledOrdersCount = 0;
        let squaredOffCount = 0;

        try {
            const { EnrollmentModel } = require('../model/EnrollmentModel');
            const { OrdersModel } = require('../model/OrdersModel');
            const { PositionsModel } = require('../model/PositionsModel');
            const orderEngine = require('../orderEngine');

            // Find all active students in this batch
            const enrollments = await EnrollmentModel.find({ batchId, status: 'ACTIVE' });
            const studentIds = enrollments.map(e => e.userId);

            if (studentIds.length > 0) {
                // Cancel pending orders for these students
                const pendingOrders = await OrdersModel.find({ userId: { $in: studentIds }, status: 'PENDING' });
                for (const ord of pendingOrders) {
                    ord.status = 'CANCELLED';
                    ord.rejectionReason = `Batch Emergency Halt: ${reason}`;
                    await ord.save();
                    cancelledOrdersCount++;
                }

                if (autoSquareOffMIS) {
                    const misPositions = await PositionsModel.find({ userId: { $in: studentIds }, productType: 'MIS' });
                    for (const pos of misPositions) {
                        try {
                            const marketDataService = require('../marketDataService');
                            const live = marketDataService.getStockPrice(pos.stockSymbol);
                            const exitPrice = live?.ltp || pos.avgPrice;
                            await orderEngine.squareOffPosition(pos._id, exitPrice);
                            squaredOffCount++;
                        } catch (e) {
                            console.error(`[EmergencyHaltBatch] Square-off failed for pos ${pos._id}:`, e.message);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[EmergencyHaltBatch] Error during order cancellation/square-off:', err.message);
        }

        return {
            ...state,
            cancelledOrdersCount,
            squaredOffCount,
        };
    }
}

module.exports = new MarketControlService();
