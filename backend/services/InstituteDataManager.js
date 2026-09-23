'use strict';

/**
 * InstituteDataManager
 * ────────────────────
 * Multi-tenant market data engine supporting up to 100 institutes simultaneously.
 *
 * Architecture & Strategies:
 * 1. Per-Institute Independence: Each institute uses its own broker API key (Dhan).
 * 2. Rate Limiting & Staggering:
 *    - Tick start times are staggered evenly across 1000ms.
 *    - Outbound HTTP fetches are constrained by a ConcurrencyLimiter (max 15 concurrent).
 *    - 429 backoff handling per institute without affecting other institutes.
 * 3. Graceful Fallback & Stop Market Data:
 *    - If an institute's API key fails or is missing, falls back to the global API key (.env / Admin).
 *    - If the global API key is ALSO not working / missing, market data is STOPPED immediately.
 * 4. Full MCX Universe & Commodities:
 *    - Includes all major MCX commodities (CRUDEOIL, GOLD, SILVER, NATURALGAS, COPPER, etc.)
 *    - Automatically parses and broadcasts commodity quotes alongside equities and indices.
 * 5. Isolated Socket Rooms:
 *    - Broadcasts to room `institute:<code>` so each student receives their institute's data feed.
 */

const { InstituteModel } = require('../model/InstituteModel');
const BrokerCredentialModel = require('../model/BrokerCredentialModel');
const dhanDataService = require('../dhanDataService');
const marketDataService = require('../marketDataService');
const { isMarketOpen, isActualMarketHours } = require('../marketRules');
const CacheService = require('./cacheService');
const dhanAuthService = require('./dhanAuthService');

function isLiveMarketActive() {
    try {
        const marketControlService = require('./marketControlService');
        const state = marketControlService.getMarketState ? marketControlService.getMarketState() : null;
        if (state?.isHalted) return false;
        if (state?.mode === 'SYNTHETIC' || state?.mode === 'REPLAY') return true;
    } catch { /* ignore */ }
    return isActualMarketHours('FO') || isActualMarketHours('EQ');
}

// Default NIFTY 50 Equity Basket
const DEFAULT_EQUITY_SYMBOLS = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
    'HINDUNILVR', 'KOTAKBANK', 'SBIN', 'BHARTIARTL', 'ITC',
    'LT', 'WIPRO', 'AXISBANK', 'SUNPHARMA', 'TATAMOTORS',
    'TITAN', 'ADANIENT', 'ADANIPORTS', 'NTPC', 'MARUTI',
    'POWERGRID', 'HCLTECH', 'TATASTEEL', 'ULTRACEMCO', 'ASIANPAINT',
    'BAJFINANCE', 'ONGC', 'JSWSTEEL', 'TECHM',
    'DIVISLAB', 'CIPLA', 'DRREDDY', 'GRASIM', 'HDFCLIFE',
    'SBILIFE', 'BPCL', 'BAJAJFINSV', 'TATAPOWER', 'KPITTECH',
    'COALINDIA', 'EICHERMOT', 'BRITANNIA', 'HEROMOTOCO', 'HINDALCO',
    'APOLLOHOSP', 'INDUSINDBK', 'SHREECEM', 'M&M', 'BAJAJ-AUTO',
];

// Default MCX Commodity Basket (All core commodities + mini variants)
const DEFAULT_COMMODITY_SYMBOLS = [
    'CRUDEOIL', 'CRUDEOILM',
    'NATURALGAS', 'NATGASMINI',
    'GOLD', 'GOLDM', 'GOLDPETAL', 'GOLDGUINEA',
    'SILVER', 'SILVERM', 'SILVERMIC',
    'COPPER', 'COPPERM',
    'ZINC', 'ZINCM',
    'LEAD', 'LEADM',
    'ALUMINIUM', 'ALUMINI',
    'NICKEL',
    'COTTON',
    'MENTHAOIL',
    'MCXBULLDEX',
];

const DEFAULT_ALL_SYMBOLS = [...DEFAULT_EQUITY_SYMBOLS, ...DEFAULT_COMMODITY_SYMBOLS];

// Concurrency limiter to protect outbound network socket pool across 100 institutes
class ConcurrencyLimiter {
    constructor(maxConcurrent = 15) {
        this.max = maxConcurrent;
        this.running = 0;
        this.queue = [];
    }

    async run(fn) {
        if (this.running >= this.max) {
            await new Promise(resolve => this.queue.push(resolve));
        }
        this.running++;
        try {
            return await fn();
        } finally {
            this.running--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                next();
            }
        }
    }
}

class InstituteDataManager {
    constructor(io) {
        this._io = io;
        // instituteCode → connection state
        this._connections = new Map();
        // Concurrency limiter for outbound broker API calls
        this._limiter = new ConcurrencyLimiter(15);
        this._instIndex = 0;
        this._globalFallbackCache = null;
        this._globalFallbackInflight = null;
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Start data feeds for all active institutes with staggered offsets.
     */
    async startAll() {
        try {
            const institutes = await InstituteModel.find({ status: 'ACTIVE' }).lean();
            let started = 0;
            this._instIndex = 0;

            for (const inst of institutes) {
                try {
                    const ok = await this.start(inst.code);
                    if (ok) started++;
                    this._instIndex++;
                    // Stagger start sequence by 50ms (avoids connection burst)
                    await new Promise(r => setTimeout(r, 50));
                } catch (e) {
                    console.error(`[InstDataMgr] Failed to start ${inst.code}:`, e.message);
                }
            }

            console.log(`[InstDataMgr] Started ${started}/${institutes.length} institute data feeds`);
        } catch (e) {
            console.error('[InstDataMgr] startAll error:', e.message);
        }
    }

    /**
     * Start or reconfigure data feed for a single institute.
     * Implements fallback to global key, and stops market data if both fail.
     * @param {string} instituteCode
     * @param {Object} [existingCred] - Optional pre-loaded credential
     */
    async start(instituteCode, existingCred) {
        // Stop existing intervals if running
        if (this._connections.has(instituteCode)) {
            this.stop(instituteCode);
        }

        // 1. Fetch institute credentials & active token
        let cred = existingCred;
        if (!cred) {
            cred = await BrokerCredentialModel.findOne({
                tenantId: instituteCode,
                isActiveProvider: true,
            });
        }

        let credentials = null;
        let isUsingFallback = false;

        // Try getting active token from Redis cache or auto-generation via TOTP
        let activeToken = null;
        try {
            activeToken = await dhanAuthService.getActiveToken(instituteCode);
        } catch (_) {}

        const effectiveApiKey = cred?.apiKey;
        const effectiveAccessToken = activeToken || (cred && typeof cred.getDecrypted === 'function' ? cred.getDecrypted().accessToken : cred?.accessToken);

        if (effectiveApiKey && effectiveAccessToken) {
            credentials = { clientId: effectiveApiKey, accessToken: effectiveAccessToken };
        } else {
            // No institute credential -> attempt fallback to global
            const globalCreds = dhanDataService.getGlobalCredentials();
            if (globalCreds) {
                console.log(`[InstDataMgr] Institute ${instituteCode} has no valid API token; using global fallback`);
                credentials = globalCreds;
                isUsingFallback = true;
            } else {
                console.warn(`[InstDataMgr] Institute ${instituteCode} has no API key/token and no global fallback -> STOPPING market data`);
                this._broadcastStopped(instituteCode, 'No broker API configured and global fallback unavailable');
                await this._updateCredentialStatus(instituteCode, 'STOPPED', 'No broker API credentials and no global fallback');
                return false;
            }
        }

        // 2. Load custom symbols if configured
        const institute = await InstituteModel.findOne({ code: instituteCode }).lean();
        const customSymbols = institute?.settings?.subscribedSymbols || [];
        const symbols = customSymbols.length > 0
            ? [...new Set([...customSymbols, ...DEFAULT_ALL_SYMBOLS])]
            : DEFAULT_ALL_SYMBOLS;

        const tickMs = institute?.settings?.tickIntervalMs || 1000;
        // Stagger tick offset across 1000ms: offset = (index * 20) % 1000 ms
        const staggerOffsetMs = (this._instIndex * 20) % 1000;

        const conn = {
            instituteCode,
            credentials,
            isUsingFallback,
            symbols,
            prices: {},
            indexes: {},
            commodities: {},
            movers: { gainers: [], losers: [] },
            status: 'STARTING',
            lastError: '',
            lastUpdated: null,
            consecutiveErrors: 0,
            rateLimitBackoffUntil: 0,
            tickInterval: null,
            fullInterval: null,
            staggerTimeout: null,
            _busy: false,
        };

        this._connections.set(instituteCode, conn);

        // Initial snapshot fetch
        const initialSuccess = await this._performFetch(conn, true);
        if (!initialSuccess) {
            // If it failed due to a 429 rate-limit backoff, do NOT stop market data; let the loop retry
            if (conn.rateLimitBackoffUntil > Date.now() || conn.lastError.includes('429')) {
                console.warn(`[InstDataMgr] Institute ${instituteCode} initial fetch hit rate limit; will retry automatically in next loop cycle.`);
                conn.status = 'ACTIVE';
            } else if (!conn.isUsingFallback) {
                // Check if fallback can save it, or if both failed
                console.warn(`[InstDataMgr] Institute ${instituteCode} initial fetch failed; attempting global fallback...`);
                const globalCreds = dhanDataService.getGlobalCredentials();
                if (globalCreds) {
                    conn.credentials = globalCreds;
                    conn.isUsingFallback = true;
                    const fallbackSuccess = await this._performFetch(conn, true);
                    if (!fallbackSuccess && !conn.lastError.includes('429')) {
                        this._stopMarketData(instituteCode, 'Initial fetch failed on both institute key and global fallback');
                        return false;
                    }
                } else {
                    this._stopMarketData(instituteCode, 'Initial fetch failed and no global fallback available');
                    return false;
                }
            } else {
                this._stopMarketData(instituteCode, 'Initial fetch failed on global fallback API key');
                return false;
            }
        }

        // Fast tick loop with initial stagger delay
        conn.staggerTimeout = setTimeout(() => {
            conn.tickInterval = setInterval(async () => {
                if (conn._busy) return;
                // Freeze during off-market hours
                if (!isLiveMarketActive()) return;

                // Respect rate-limit backoff if previously triggered
                if (Date.now() < conn.rateLimitBackoffUntil) return;

                conn._busy = true;
                try {
                    await this._performFetch(conn, false);
                } finally {
                    conn._busy = false;
                }
            }, tickMs);
        }, staggerOffsetMs);

        // Full snapshot loop (15s — OHLC + 52W refresh)
        conn.fullInterval = setInterval(async () => {
            if (!isLiveMarketActive()) return; // Freeze during off-market hours
            if (Date.now() < conn.rateLimitBackoffUntil) return;
            try {
                await this._performFetch(conn, true);
            } catch { /* Handled in tick loop */ }
        }, 15000);

        return true;
    }

    /**
     * Stop market data feed for an institute.
     */
    stop(instituteCode) {
        const conn = this._connections.get(instituteCode);
        if (!conn) return;

        if (conn.staggerTimeout) clearTimeout(conn.staggerTimeout);
        if (conn.tickInterval) clearInterval(conn.tickInterval);
        if (conn.fullInterval) clearInterval(conn.fullInterval);
        this._connections.delete(instituteCode);
        console.log(`[InstDataMgr] ⏹ ${instituteCode} — data feed stopped`);
    }

    /**
     * Restart market data feed (e.g., when credentials updated in dashboard).
     */
    async restart(instituteCode) {
        this.stop(instituteCode);
        return await this.start(instituteCode);
    }

    /**
     * Get cached market data for an institute.
     * Returns institute prices, or falls back to global if active.
     */
    getPrices(instituteCode) {
        const conn = this._connections.get(instituteCode);
        if (conn && (conn.status === 'ACTIVE' || conn.status === 'FALLBACK_GLOBAL')) {
            return {
                prices: conn.prices,
                indexes: conn.indexes,
                commodities: conn.commodities,
                movers: conn.movers,
                lastUpdated: conn.lastUpdated,
                status: conn.status,
                source: conn.isUsingFallback ? 'DHAN_GLOBAL_FALLBACK' : 'INSTITUTE_LIVE',
            };
        }

        // If stopped, return stopped state with fallback prices so mobile app does not render blank
        if (conn && conn.status === 'STOPPED') {
            const hasPrices = conn.prices && Object.keys(conn.prices).length > 0;
            const fallbackPrices = marketDataService.getStockPrices();
            const fallbackIndexes = marketDataService.getIndexData();
            return {
                prices: hasPrices ? conn.prices : fallbackPrices,
                indexes: (conn.indexes && Object.keys(conn.indexes).length > 0) ? conn.indexes : fallbackIndexes,
                commodities: conn.commodities || {},
                movers: conn.movers || marketDataService.getMarketMovers(),
                lastUpdated: conn.lastUpdated || new Date().toISOString(),
                status: 'STOPPED',
                source: 'SIMULATED_FALLBACK',
                isSimulated: true,
                error: conn.lastError,
            };
        }

        // Fallback to global marketDataService if available
        return {
            prices: marketDataService.getStockPrices(),
            indexes: marketDataService.getIndexData(),
            commodities: {},
            movers: marketDataService.getMarketMovers(),
            lastUpdated: marketDataService.getLastUpdated(),
            status: 'GLOBAL',
            source: marketDataService.getDataSource(),
        };
    }

    /**
     * Get price of a specific symbol for an institute (stocks or commodities).
     */
    getStockPrice(instituteCode, symbol) {
        const conn = this._connections.get(instituteCode);
        if (conn && conn.prices[symbol]) return conn.prices[symbol];
        if (conn && conn.commodities[symbol]) return conn.commodities[symbol];
        return marketDataService.getStockPrice(symbol);
    }

    /**
     * Get commodity quotes for an institute.
     */
    getCommodities(instituteCode) {
        const conn = this._connections.get(instituteCode);
        return conn ? conn.commodities : {};
    }

    /**
     * Get status of all or a specific institute feed.
     */
    getStatus(instituteCode) {
        if (instituteCode) {
            const conn = this._connections.get(instituteCode);
            return conn
                ? {
                    code: instituteCode,
                    status: conn.status,
                    isUsingFallback: conn.isUsingFallback,
                    lastError: conn.lastError,
                    lastUpdated: conn.lastUpdated,
                    symbolCount: conn.symbols.length,
                }
                : { code: instituteCode, status: 'NOT_CONNECTED' };
        }

        const statuses = {};
        for (const [code, conn] of this._connections) {
            statuses[code] = {
                status: conn.status,
                isUsingFallback: conn.isUsingFallback,
                lastError: conn.lastError,
                lastUpdated: conn.lastUpdated,
            };
        }
        return statuses;
    }

    get activeCount() {
        let c = 0;
        for (const conn of this._connections.values()) {
            if (conn.status === 'ACTIVE' || conn.status === 'FALLBACK_GLOBAL') c++;
        }
        return c;
    }

    // ── Internal Helpers ────────────────────────────────────────────────────

    /**
     * Perform quote fetch with rate limiting and fallback/stop logic.
     */
    async _performFetch(conn, fullSnapshot) {
        const instituteCode = conn.instituteCode;

        try {
            // Deduplicate global fallback requests across all institutes on fallback
            let data;
            if (conn.isUsingFallback) {
                if (this._globalFallbackCache && (Date.now() - this._globalFallbackCache.timestamp < 4000)) {
                    data = this._globalFallbackCache.data;
                } else if (this._globalFallbackInflight) {
                    data = await this._globalFallbackInflight;
                } else {
                    this._globalFallbackInflight = this._limiter.run(async () => {
                        return await dhanDataService.fetchDhanSnapshotForInstitute(conn.symbols, conn.credentials);
                    }).finally(() => {
                        this._globalFallbackInflight = null;
                    });
                    data = await this._globalFallbackInflight;
                    this._globalFallbackCache = { timestamp: Date.now(), data };
                }
            } else {
                // Execute via ConcurrencyLimiter to prevent bursting for institute-specific credentials
                data = await this._limiter.run(async () => {
                    return await dhanDataService.fetchDhanSnapshotForInstitute(conn.symbols, conn.credentials);
                });
            }

            const diffPrices = {};
            const ltpMap = {};

            // Merge Equities and track diffs
            for (const [sym, quote] of Object.entries(data.stocks || {})) {
                if (quote.ltp > 0) {
                    conn.prices[sym] = quote;
                    ltpMap[sym] = quote.ltp;
                    if (!conn.previousLtp || conn.previousLtp[sym] !== quote.ltp) {
                        diffPrices[sym] = quote;
                        if (!conn.previousLtp) conn.previousLtp = {};
                        conn.previousLtp[sym] = quote.ltp;
                    }
                }
            }
            // Merge Indices
            for (const [name, quote] of Object.entries(data.indexes || {})) {
                if (quote.ltp > 0) conn.indexes[name] = quote;
            }
            // Merge Commodities and track diffs
            for (const [sym, quote] of Object.entries(data.commodities || {})) {
                if (quote.ltp > 0) {
                    conn.commodities[sym] = quote;
                    conn.prices[sym] = quote; // also accessible via prices
                    ltpMap[sym] = quote.ltp;
                    if (!conn.previousLtp || conn.previousLtp[sym] !== quote.ltp) {
                        diffPrices[sym] = quote;
                        if (!conn.previousLtp) conn.previousLtp = {};
                        conn.previousLtp[sym] = quote.ltp;
                    }
                }
            }

            // Asynchronously update Redis LTP cache for sub-millisecond lookups
            CacheService.setInstituteLTPs(instituteCode, ltpMap).catch(() => {});

            conn.lastUpdated = new Date().toISOString();
            conn.consecutiveErrors = 0;
            conn.lastError = '';

            const activeStatus = conn.isUsingFallback ? 'FALLBACK_GLOBAL' : 'ACTIVE';
            if (conn.status !== activeStatus) {
                conn.status = activeStatus;
                await this._updateCredentialStatus(instituteCode, activeStatus, conn.isUsingFallback ? 'Operating on global fallback key' : '');
            }

            // Compute movers & broadcast
            if (fullSnapshot) {
                const sorted = Object.values(conn.prices)
                    .filter(s => s.changePercent !== undefined && s.ltp > 0)
                    .sort((a, b) => b.changePercent - a.changePercent);
                conn.movers = {
                    gainers: sorted.slice(0, 5),
                    losers: sorted.slice(-5).reverse(),
                };

                // Full snapshot payload
                const fullPayload = {
                    prices: conn.prices,
                    indexes: conn.indexes,
                    commodities: conn.commodities,
                    movers: conn.movers,
                    lastUpdated: conn.lastUpdated,
                    status: activeStatus,
                    source: conn.isUsingFallback ? 'DHAN_GLOBAL_FALLBACK' : 'INSTITUTE_LIVE',
                    isDiff: false,
                };
                this._io.to(`institute:${instituteCode}`).emit('marketData', fullPayload);
            } else {
                // High-efficiency delta tick (diff only) to scale to 1,200 concurrent sockets
                const deltaPayload = {
                    diff: diffPrices,
                    indexes: conn.indexes,
                    commodities: conn.commodities,
                    lastUpdated: conn.lastUpdated,
                    status: activeStatus,
                    source: conn.isUsingFallback ? 'DHAN_GLOBAL_FALLBACK' : 'INSTITUTE_LIVE',
                    isDiff: true,
                };
                this._io.to(`institute:${instituteCode}`).emit('marketData', deltaPayload);
            }
            return true;

        } catch (e) {
            const errMsg = e.message || '';
            conn.lastError = errMsg;

            // Handle Rate Limit 429 — temporary throttling, NOT key failure
            if (errMsg.includes('429') || errMsg.includes('Too many requests') || errMsg.includes('805')) {
                console.warn(`[InstDataMgr] ⚠️ Rate limit 429 hit for ${instituteCode} — backing off 10s`);
                conn.rateLimitBackoffUntil = Date.now() + 10000;
                return false;
            }

            conn.consecutiveErrors++;

            // Handle Key Expiry / Authentication Failure (401/403)
            if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('Authentication') || conn.consecutiveErrors >= 5) {
                // Attempt self-healing token auto-renewal via TOTP credentials first
                if (!conn.isUsingFallback && !conn._renewing && (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('Authentication'))) {
                    conn._renewing = true;
                    try {
                        console.log(`[InstDataMgr] 🔄 Token expired for ${instituteCode}. Triggering automatic TOTP token regeneration...`);
                        const renewed = await dhanAuthService.renewInstituteToken(instituteCode);
                        if (renewed && renewed.accessToken) {
                            conn.credentials.accessToken = renewed.accessToken;
                            conn.consecutiveErrors = 0;
                            conn.lastError = '';
                            console.log(`[InstDataMgr] ✅ Auto-renewal successful for ${instituteCode}! Retrying fetch.`);
                            conn._renewing = false;
                            return await this._performFetch(conn, fullSnapshot);
                        }
                    } catch (renewErr) {
                        console.warn(`[InstDataMgr] ⚠️ Auto-renewal attempt failed for ${instituteCode}: ${renewErr.message}`);
                    } finally {
                        conn._renewing = false;
                    }
                }

                if (!conn.isUsingFallback) {
                    console.warn(`[InstDataMgr] Institute ${instituteCode} key failed (${errMsg}). Switching to global fallback...`);
                    const globalCreds = dhanDataService.getGlobalCredentials();
                    if (globalCreds) {
                        conn.credentials = globalCreds;
                        conn.isUsingFallback = true;
                        conn.consecutiveErrors = 0;
                        try {
                            const fallbackData = await this._limiter.run(async () => {
                                return await dhanDataService.fetchDhanSnapshotForInstitute(conn.symbols, globalCreds);
                            });
                            // Successfully fetched via fallback!
                            conn.status = 'FALLBACK_GLOBAL';
                            conn.lastError = `Institute key failed (${errMsg}). Using global fallback API key.`;
                            await this._updateCredentialStatus(instituteCode, 'FALLBACK_GLOBAL', conn.lastError);
                            return true;
                        } catch (fallbackErr) {
                            console.error(`[InstDataMgr] Global fallback ALSO failed for ${instituteCode}: ${fallbackErr.message}`);
                            this._stopMarketData(instituteCode, `Both institute API key and global fallback failed: ${fallbackErr.message}`);
                            return false;
                        }
                    } else {
                        this._stopMarketData(instituteCode, `Institute API key failed and no global fallback configured: ${errMsg}`);
                        return false;
                    }
                } else {
                    // Global fallback also failed -> STOP MARKET DATA
                    this._stopMarketData(instituteCode, `Global fallback API key failed: ${errMsg}`);
                    return false;
                }
            }

            conn.lastError = errMsg;
            return false;
        }
    }

    /**
     * Stop market data completely for an institute and notify students and admins.
     */
    _stopMarketData(instituteCode, reason) {
        console.error(`[InstDataMgr] 🛑 STOPPING market data for institute: ${instituteCode} — ${reason}`);
        let conn = this._connections.get(instituteCode);
        if (conn) {
            conn.status = 'STOPPED';
            conn.lastError = reason;
            if (conn.tickInterval) clearInterval(conn.tickInterval);
            if (conn.fullInterval) clearInterval(conn.fullInterval);
        } else {
            conn = {
                instituteCode,
                status: 'STOPPED',
                lastError: reason,
                symbols: [],
                prices: {},
                indexes: {},
                commodities: {},
                movers: { gainers: [], losers: [] },
                lastUpdated: new Date().toISOString(),
                isUsingFallback: false,
            };
            this._connections.set(instituteCode, conn);
        }

        this._broadcastStopped(instituteCode, reason);
        this._updateCredentialStatus(instituteCode, 'STOPPED', reason);
    }

    _broadcastStopped(instituteCode, reason) {
        // Broadcast status update
        this._io.to(`institute:${instituteCode}`).emit('marketDataStatus', {
            instituteCode,
            status: 'STOPPED',
            error: reason,
            timestamp: new Date().toISOString(),
        });

        // Broadcast payload with simulated fallback prices so students never see a blank screen
        const fallbackPrices = marketDataService.getStockPrices();
        const fallbackIndexes = marketDataService.getIndexData();
        this._io.to(`institute:${instituteCode}`).emit('marketData', {
            prices: fallbackPrices,
            indexes: fallbackIndexes,
            commodities: {},
            movers: marketDataService.getMarketMovers(),
            lastUpdated: new Date().toISOString(),
            status: 'STOPPED',
            source: 'SIMULATED_FALLBACK',
            isSimulated: true,
            error: reason,
        });
    }

    async _updateCredentialStatus(instituteCode, status, error) {
        try {
            await BrokerCredentialModel.findOneAndUpdate(
                { tenantId: instituteCode, isActiveProvider: true },
                {
                    status,
                    lastError: error || '',
                    ...(status === 'ACTIVE' || status === 'FALLBACK_GLOBAL' ? { lastConnectedAt: new Date() } : {}),
                }
            );
        } catch (e) {
            console.warn(`[InstDataMgr] Failed to update credential status for ${instituteCode}:`, e.message);
        }
    }
}

module.exports = InstituteDataManager;
