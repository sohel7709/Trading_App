'use strict';

const jwt = require('jsonwebtoken');
const config = require('../shared/config');
const { subscriber, CHANNELS } = require('../shared/redis');
const { UserModel } = require('../shared/db');

class SocketHandler {
    constructor() {
        this.io = null;
        this.tickBuffer = new Map(); // symbol -> latest tick
        this.isBroadcasting = false;
        this.broadcastInterval = null;
    }

    /**
     * Initialize with Socket.IO instance
     */
    init(io) {
        this.io = io;

        // 1. Setup client authentication & room management
        this._setupAuth();

        // 2. Setup client connection listeners
        this._setupConnections();

        // 3. Setup Redis Pub/Sub listener
        this._setupRedisSubscriptions();

        // 4. Start 300ms throttled broadcaster
        this._startThrottledBroadcaster(300);

        console.log('[SocketServer] ✅ SocketHandler initialized with 300ms throttle buffer');
    }

    /**
     * Authenticate connecting clients via JWT
     */
    _setupAuth() {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth?.token 
                    || socket.handshake.query?.token 
                    || socket.handshake.headers?.authorization?.replace('Bearer ', '');
                
                if (token) {
                    try {
                        const payload = jwt.verify(token, config.ACCESS_SECRET);
                        const user = await UserModel.findById(payload.sub).select('-passwordHash');
                        if (user && user.isActive) {
                            socket.user = user;
                            socket.userId = user._id.toString();
                            return next();
                        }
                    } catch (jwtErr) {
                        // Allow guest/unauthenticated connections to view public market data
                    }
                }
                return next();
            } catch (err) {
                return next();
            }
        });
    }

    /**
     * Handle client room joining
     */
    _setupConnections() {
        this.io.on('connection', (socket) => {
            // Join global market data room
            socket.join('global');

            if (socket.userId) {
                // Join private user rooms for targeted execution events
                socket.join(`user:${socket.userId}`);
                socket.join(socket.userId);

                if (socket.user?.instituteCode) {
                    socket.join(`institute:${socket.user.instituteCode}`);
                }
                console.log(`[SocketServer] 👤 User connected: ${socket.user.username || socket.userId} (${socket.id})`);
            } else {
                console.log(`[SocketServer] 🌐 Guest connected: ${socket.id}`);
            }

            // Client option chain subscription handler
            socket.on('subscribeOptionChain', (data) => {
                const room = `chain:${data?.indexName || 'NIFTY 50'}`;
                socket.join(room);
            });

            socket.on('unsubscribeOptionChain', (data) => {
                const room = `chain:${data?.indexName || 'NIFTY 50'}`;
                socket.leave(room);
            });

            socket.on('disconnect', () => {
                // cleanup
            });
        });
    }

    /**
     * Subscribe to Redis Pub/Sub channels
     */
    _setupRedisSubscriptions() {
        subscriber.subscribe(CHANNELS.PRICE_UPDATES, CHANNELS.ORDER_UPDATES, CHANNELS.PNL_UPDATES, (err) => {
            if (err) console.error('[SocketServer] Redis subscription error:', err);
        });

        subscriber.on('message', (channel, message) => {
            try {
                const data = JSON.parse(message);
                if (channel === CHANNELS.PRICE_UPDATES) {
                    // Buffer tick into 300ms queue instead of emitting immediately
                    if (data?.symbol) {
                        this.tickBuffer.set(data.symbol, data);
                    }
                } else if (channel === CHANNELS.ORDER_UPDATES) {
                    // Immediate dispatch for order execution events
                    const { userId, event, payload } = data;
                    if (userId) {
                        this.io.to(`user:${userId}`).emit(event, payload);
                        this.io.to(userId).emit(event, payload);
                    }
                } else if (channel === CHANNELS.PNL_UPDATES) {
                    const { userId, payload } = data;
                    if (userId) {
                        this.io.to(`user:${userId}`).emit('pnl_update', payload);
                    }
                }
            } catch (e) {
                console.warn('[SocketServer] Pub/Sub message parse error:', e.message);
            }
        });
    }

    /**
     * Throttled batch broadcaster (300ms interval)
     * Prevents high-frequency ticks from flooding the client's UI thread
     */
    _startThrottledBroadcaster(intervalMs = 300) {
        if (this.broadcastInterval) clearInterval(this.broadcastInterval);
        this.broadcastInterval = setInterval(() => {
            if (this.tickBuffer.size === 0) return;

            const diff = {};
            for (const [sym, tick] of this.tickBuffer.entries()) {
                diff[sym] = tick;
            }
            this.tickBuffer.clear();

            // 1. Broadcast individual price update array for new components
            this.io.to('global').emit('price_update', {
                diff,
                count: Object.keys(diff).length,
                timestamp: Date.now(),
            });

            // 2. Broadcast backward-compatible marketData delta
            this.io.to('global').emit('marketData', {
                diff,
                isDiff: true,
                lastUpdated: new Date().toISOString(),
            });
        }, intervalMs);
    }
}

module.exports = new SocketHandler();
