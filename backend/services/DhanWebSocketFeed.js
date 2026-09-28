'use strict';

/**
 * DhanWebSocketFeed.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Real-time Binary WebSocket Client for DhanHQ v2 Live Market Feed
 * Docs: https://dhanhq.co/docs/v2/live-market-feed/
 *
 * Features:
 * - Persistent connection to wss://api-feed.dhan.co with auto-reconnection
 * - Little-Endian binary decoder for Ticker (2), Quote (4), OI (5), Full (8) packets
 * - Auto ping-pong keeping connection alive
 * - Batched subscription handling (<= 100 instruments per payload)
 * - EventEmitter interface for seamless integration with marketDataService
 */

const EventEmitter = require('events');

const DHAN_WS_BASE = 'wss://api-feed.dhan.co';

// Segment Code -> Segment String mapping
const SEGMENT_NAMES = {
    0: 'IDX_I',
    1: 'NSE_EQ',
    2: 'NSE_FNO',
    3: 'NSE_CURRENCY',
    4: 'BSE_EQ',
    5: 'MCX_COMM',
    7: 'BSE_CURRENCY',
    8: 'BSE_FNO',
};

class DhanWebSocketFeed extends EventEmitter {
    constructor(options = {}) {
        super();
        this.clientId = options.clientId || null;
        this.accessToken = options.accessToken || null;
        this.authType = options.authType || 2;
        this.version = options.version || 2;

        this.ws = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 20;
        this.reconnectTimer = null;
        this.watchdogTimer = null;
        this.lastMessageTime = 0;

        // Subscriptions set: key = `${ExchangeSegment}:${SecurityId}` -> { ExchangeSegment, SecurityId }
        this.subscriptions = new Map();
        this.defaultRequestCode = options.requestCode || 15; // 15: Ticker, 17: Quote, 21: Full
    }

    /**
     * Update credentials dynamically (e.g. after token auto-renewal)
     */
    updateCredentials({ clientId, accessToken }) {
        let changed = false;
        if (clientId && clientId !== this.clientId) {
            this.clientId = clientId;
            changed = true;
        }
        if (accessToken && accessToken !== this.accessToken) {
            this.accessToken = accessToken;
            changed = true;
        }
        if (changed && this.isConnected) {
            console.log('[DhanWS] Credentials updated, reconnecting with fresh token...');
            this.reconnect();
        }
    }

    /**
     * Connect to Dhan Market Feed WebSocket
     */
    connect() {
        if (!this.clientId || !this.accessToken) {
            console.warn('[DhanWS] Cannot connect: clientId or accessToken missing.');
            return;
        }
        if (this.isConnected || this.isConnecting) return;

        this.isConnecting = true;
        this.shouldReconnect = true;
        clearTimeout(this.reconnectTimer);

        const url = `${DHAN_WS_BASE}?version=${this.version}&token=${encodeURIComponent(this.accessToken)}&clientId=${encodeURIComponent(this.clientId)}&authType=${this.authType}`;

        try {
            // Use native Node.js global WebSocket
            const WS = globalThis.WebSocket;
            if (!WS) {
                throw new Error('Native WebSocket not supported in this Node environment.');
            }

            console.log(`[DhanWS] Connecting to Dhan WebSocket feed for Client ID ${this.clientId}...`);
            this.ws = new WS(url);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                this.isConnected = true;
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.lastMessageTime = Date.now();
                console.log('[DhanWS] Connected to Dhan Market Feed WebSocket!');
                this.emit('connected');

                this._startWatchdog();

                // Resubscribe to existing instruments if any
                if (this.subscriptions.size > 0) {
                    this._flushSubscriptions();
                }
            };

            this.ws.onmessage = (event) => {
                this.lastMessageTime = Date.now();
                try {
                    const buffer = Buffer.from(event.data);
                    this._parseBinaryMessages(buffer);
                } catch (err) {
                    console.error('[DhanWS] Error parsing binary message:', err.message);
                }
            };

            this.ws.onerror = (err) => {
                console.error('[DhanWS] WebSocket error:', err?.message || err);
                if (this.listenerCount('error') > 0) {
                    this.emit('error', err);
                }
            };

            this.ws.onclose = (event) => {
                this.isConnected = false;
                this.isConnecting = false;
                this._stopWatchdog();
                console.warn(`[DhanWS] WebSocket closed (code: ${event.code}, reason: ${event.reason || 'None'}).`);
                this.emit('disconnected', event);

                if (this.shouldReconnect) {
                    this._scheduleReconnect();
                }
            };
        } catch (err) {
            this.isConnecting = false;
            console.error('[DhanWS] Failed to initialize WebSocket:', err.message);
            if (this.shouldReconnect) {
                this._scheduleReconnect();
            }
        }
    }

    /**
     * Parse concatenated Little-Endian binary packets from Dhan
     */
    _parseBinaryMessages(buffer) {
        let offset = 0;
        const totalLen = buffer.length;

        while (offset + 8 <= totalLen) {
            const feedCode = buffer.readUInt8(offset);
            const msgLen   = buffer.readInt16LE(offset + 1);
            const segmentId = buffer.readUInt8(offset + 3);
            const secId    = buffer.readInt32LE(offset + 4);

            const segment = SEGMENT_NAMES[segmentId] || `SEG_${segmentId}`;

            // Safety check for corrupt message length
            if (msgLen <= 0 || offset + msgLen > totalLen) {
                // If msgLen exceeds buffer, break out to avoid out of bounds
                break;
            }

            switch (feedCode) {
                case 1: {
                    // Index Packet (Length: 32 bytes)
                    if (offset + 32 <= totalLen) {
                        const ltp   = buffer.readFloatLE(offset + 8);
                        const open  = buffer.readFloatLE(offset + 12);
                        const close = buffer.readFloatLE(offset + 16);
                        const high  = buffer.readFloatLE(offset + 20);
                        const low   = buffer.readFloatLE(offset + 24);
                        const ltt   = buffer.readInt32LE(offset + 28);

                        this.emit('index', {
                            securityId: secId,
                            segment,
                            ltp,
                            open,
                            close,
                            high,
                            low,
                            ltt,
                        });
                    }
                    break;
                }
                case 2: {
                    // Ticker Packet (Length: 16 bytes)
                    if (offset + 16 <= totalLen) {
                        const ltp = buffer.readFloatLE(offset + 8);
                        const ltt = buffer.readInt32LE(offset + 12);

                        this.emit('tick', {
                            securityId: secId,
                            segment,
                            ltp: Math.round(ltp * 100) / 100,
                            ltt,
                        });
                    }
                    break;
                }
                case 4: {
                    // Quote Packet (Length: 50 bytes)
                    if (offset + 50 <= totalLen) {
                        const ltp      = buffer.readFloatLE(offset + 8);
                        const ltq      = buffer.readInt16LE(offset + 12);
                        const ltt      = buffer.readInt32LE(offset + 14);
                        const vwap     = buffer.readFloatLE(offset + 18);
                        const volume   = buffer.readInt32LE(offset + 22);
                        const sellQty  = buffer.readInt32LE(offset + 26);
                        const buyQty   = buffer.readInt32LE(offset + 30);
                        const open     = buffer.readFloatLE(offset + 34);
                        const close    = buffer.readFloatLE(offset + 38);
                        const high     = buffer.readFloatLE(offset + 42);
                        const low      = buffer.readFloatLE(offset + 46);

                        this.emit('quote', {
                            securityId: secId,
                            segment,
                            ltp: Math.round(ltp * 100) / 100,
                            ltq,
                            ltt,
                            vwap: Math.round(vwap * 100) / 100,
                            volume,
                            sellQty,
                            buyQty,
                            open,
                            close,
                            high,
                            low,
                        });
                    }
                    break;
                }
                case 5: {
                    // OI Packet (Length: 12 bytes)
                    if (offset + 12 <= totalLen) {
                        const oi = buffer.readInt32LE(offset + 8);
                        this.emit('oi', {
                            securityId: secId,
                            segment,
                            oi,
                        });
                    }
                    break;
                }
                case 6: {
                    // Prev Close Packet (Length: 16 bytes)
                    if (offset + 16 <= totalLen) {
                        const prevClose = buffer.readFloatLE(offset + 8);
                        const prevOi    = buffer.readInt32LE(offset + 12);
                        this.emit('prevClose', {
                            securityId: secId,
                            segment,
                            prevClose,
                            prevOi,
                        });
                    }
                    break;
                }
                case 8: {
                    // Full Packet (Length: 162 bytes = 62 bytes header/stats + 100 bytes 5-depth)
                    if (offset + 162 <= totalLen) {
                        const ltp      = buffer.readFloatLE(offset + 8);
                        const ltq      = buffer.readInt16LE(offset + 12);
                        const ltt      = buffer.readInt32LE(offset + 14);
                        const vwap     = buffer.readFloatLE(offset + 18);
                        const volume   = buffer.readInt32LE(offset + 22);
                        const sellQty  = buffer.readInt32LE(offset + 26);
                        const buyQty   = buffer.readInt32LE(offset + 30);
                        const oi       = buffer.readInt32LE(offset + 34);
                        const oiDayHigh= buffer.readInt32LE(offset + 38);
                        const oiDayLow = buffer.readInt32LE(offset + 42);
                        const open     = buffer.readFloatLE(offset + 46);
                        const close    = buffer.readFloatLE(offset + 50);
                        const high     = buffer.readFloatLE(offset + 54);
                        const low      = buffer.readFloatLE(offset + 58);

                        // Parse 5-depth bid & ask
                        const depth = { buy: [], sell: [] };
                        let depthOffset = offset + 62;
                        for (let i = 0; i < 5; i++) {
                            const bidQty    = buffer.readInt32LE(depthOffset);
                            const askQty    = buffer.readInt32LE(depthOffset + 4);
                            const bidOrders = buffer.readInt16LE(depthOffset + 8);
                            const askOrders = buffer.readInt16LE(depthOffset + 10);
                            const bidPrice  = buffer.readFloatLE(depthOffset + 12);
                            const askPrice  = buffer.readFloatLE(depthOffset + 16);

                            depth.buy.push({ quantity: bidQty, orders: bidOrders, price: bidPrice });
                            depth.sell.push({ quantity: askQty, orders: askOrders, price: askPrice });
                            depthOffset += 20;
                        }

                        this.emit('full', {
                            securityId: secId,
                            segment,
                            ltp: Math.round(ltp * 100) / 100,
                            ltq,
                            ltt,
                            vwap,
                            volume,
                            sellQty,
                            buyQty,
                            oi,
                            oiDayHigh,
                            oiDayLow,
                            open,
                            close,
                            high,
                            low,
                            depth,
                        });
                    }
                    break;
                }
                case 50: {
                    // Feed Disconnect Packet (Length: 10 bytes)
                    const disCode = buffer.readInt16LE(offset + 8);
                    console.warn(`[DhanWS] Received Disconnect Packet from Dhan Server (Reason Code: ${disCode})`);
                    this.emit('serverDisconnect', { code: disCode });
                    break;
                }
                default:
                    // Unknown or market status packet, skip
                    break;
            }

            offset += msgLen;
        }
    }

    /**
     * Subscribe to a list of instruments
     * @param {Array<{ExchangeSegment: string, SecurityId: string|number}>} instruments
     * @param {number} [requestCode=15] 15=Ticker, 17=Quote, 21=Full
     */
    subscribe(instruments = [], requestCode = null) {
        if (!Array.isArray(instruments) || instruments.length === 0) return;

        const code = requestCode || this.defaultRequestCode;

        for (const inst of instruments) {
            if (inst.SecurityId && inst.ExchangeSegment) {
                const key = `${inst.ExchangeSegment}:${String(inst.SecurityId)}`;
                this.subscriptions.set(key, {
                    ExchangeSegment: inst.ExchangeSegment,
                    SecurityId: String(inst.SecurityId),
                    requestCode: code,
                });
            }
        }

        if (this.isConnected) {
            this._sendSubscriptionBatches(instruments, code);
        }
    }

    /**
     * Unsubscribe from instruments
     */
    unsubscribe(instruments = [], requestCode = null) {
        if (!Array.isArray(instruments) || instruments.length === 0) return;
        const unsubCode = (requestCode || this.defaultRequestCode) + 1; // e.g. 15 -> 16, 17 -> 18, 21 -> 22

        for (const inst of instruments) {
            const key = `${inst.ExchangeSegment}:${String(inst.SecurityId)}`;
            this.subscriptions.delete(key);
        }

        if (this.isConnected) {
            this._sendSubscriptionBatches(instruments, unsubCode);
        }
    }

    /**
     * Internal: Chunk subscription requests into max 100 instruments per payload
     */
    _sendSubscriptionBatches(instruments, requestCode) {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < instruments.length; i += CHUNK_SIZE) {
            const chunk = instruments.slice(i, i + CHUNK_SIZE).map(item => ({
                ExchangeSegment: item.ExchangeSegment,
                SecurityId: String(item.SecurityId),
            }));

            const payload = {
                RequestCode: requestCode,
                InstrumentCount: chunk.length,
                InstrumentList: chunk,
            };

            try {
                if (this.ws && this.ws.readyState === 1) { // 1 = OPEN
                    this.ws.send(JSON.stringify(payload));
                }
            } catch (err) {
                console.error('[DhanWS] Error sending subscription chunk:', err.message);
            }
        }
    }

    /**
     * Resend all active subscriptions after reconnect
     */
    _flushSubscriptions() {
        if (this.subscriptions.size === 0) return;
        console.log(`[DhanWS] Flashing ${this.subscriptions.size} active subscriptions to WebSocket...`);

        // Group by requestCode
        const groups = {};
        for (const item of this.subscriptions.values()) {
            const code = item.requestCode || this.defaultRequestCode;
            if (!groups[code]) groups[code] = [];
            groups[code].push(item);
        }

        for (const [code, list] of Object.entries(groups)) {
            this._sendSubscriptionBatches(list, Number(code));
        }
    }

    /**
     * Schedule reconnect with exponential backoff
     */
    _scheduleReconnect() {
        clearTimeout(this.reconnectTimer);
        this.reconnectAttempts++;
        const backoffMs = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
        console.log(`[DhanWS] Reconnecting in ${(backoffMs / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts})...`);

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, backoffMs);
    }

    /**
     * Proactive watchdog to detect stale / silent connection
     */
    _startWatchdog() {
        this._stopWatchdog();
        this.watchdogTimer = setInterval(() => {
            if (this.isConnected && Date.now() - this.lastMessageTime > 35000) {
                console.warn('[DhanWS] Watchdog: No data/ping received in 35s. Forcing reconnect...');
                this.reconnect();
            }
        }, 10000);
    }

    _stopWatchdog() {
        clearInterval(this.watchdogTimer);
        this.watchdogTimer = null;
    }

    reconnect() {
        this.disconnect();
        this.connect();
    }

    disconnect() {
        this.shouldReconnect = false;
        clearTimeout(this.reconnectTimer);
        this._stopWatchdog();

        if (this.ws) {
            try {
                // Send disconnect packet 12 if open
                if (this.ws.readyState === 1) {
                    this.ws.send(JSON.stringify({ RequestCode: 12 }));
                }
                this.ws.close();
            } catch (_) {}
            this.ws = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
        console.log('[DhanWS] Disconnected cleanly.');
    }
}

module.exports = DhanWebSocketFeed;
