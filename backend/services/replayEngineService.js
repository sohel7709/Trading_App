'use strict';

const ReplaySessionModel = require('../model/ReplaySessionModel');
const CandleModel = require('../model/CandleModel');

const SPEED_DELAYS = {
    1: 1000, // 1 real sec = 1 min
    2: 500,  // 0.5 real sec = 1 min
    5: 200,  // 0.2 real sec = 1 min
};

class ReplayEngineService {
    constructor() {
        this.activeSessions = new Map(); // userId -> { timer, candles, sessionDoc }
        this.io = null;
    }

    init(io) {
        this.io = io;
        console.log('[ReplayEngine] ✅ ReplayEngineService initialized');
    }

    getSpeedDelay(speed) {
        return SPEED_DELAYS[speed] || 1000;
    }

    /**
     * Generate realistic 375 1-minute intraday candles (09:15 to 15:30 IST)
     * if historical DB data is not yet seeded for the selected date.
     */
    generateFallbackDayCandles(symbol, dateStr) {
        const candles = [];
        const baseDate = new Date(dateStr || '2024-07-01');
        baseDate.setHours(9, 15, 0, 0);

        let currentPrice = symbol.includes('NIFTY') ? 24150 : (symbol.includes('BANKNIFTY') ? 51200 : 2850);
        const volatility = currentPrice * 0.0008;

        for (let i = 0; i < 375; i++) {
            const time = new Date(baseDate.getTime() + i * 60 * 1000);
            const delta = (Math.random() - 0.49) * volatility;
            const open = Math.round(currentPrice * 100) / 100;
            const close = Math.round((currentPrice + delta) * 100) / 100;
            const high = Math.round((Math.max(open, close) + Math.random() * (volatility * 0.5)) * 100) / 100;
            const low = Math.round((Math.min(open, close) - Math.random() * (volatility * 0.5)) * 100) / 100;
            const volume = Math.floor(500 + Math.random() * 4500);

            candles.push({
                symbol,
                timeframe: '1m',
                open,
                high,
                low,
                close,
                volume,
                timestamp: time.getTime(),
                timeStr: time.toTimeString().slice(0, 5),
            });
            currentPrice = close;
        }
        return candles;
    }

    async loadCandles(symbol, dateStr) {
        try {
            const startOfDay = new Date(dateStr).getTime();
            const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
            const dbCandles = await CandleModel.find({
                instrumentId: symbol,
                ts: { $gte: startOfDay, $lte: endOfDay }
            }).sort({ ts: 1 }).lean();

            if (dbCandles && dbCandles.length > 50) {
                return dbCandles.map(c => ({
                    symbol,
                    timeframe: '1m',
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: c.volume || 0,
                    timestamp: c.ts,
                }));
            }
        } catch (e) {
            console.warn('[ReplayEngine] Database candle fetch error, falling back:', e.message);
        }

        return this.generateFallbackDayCandles(symbol, dateStr);
    }

    /**
     * Start or resume replay session
     */
    async startSession(userId, { symbol = 'NIFTY 50', date = '2024-07-01', speed = 1, instituteId = null } = {}) {
        this.stopSessionTimer(userId);

        let session = await ReplaySessionModel.findOne({ userId, status: { $in: ['PLAYING', 'PAUSED'] } });
        let candles;

        if (!session || session.symbol !== symbol || session.date !== date) {
            candles = await this.loadCandles(symbol, date);
            session = await ReplaySessionModel.create({
                userId,
                instituteId,
                symbol,
                date,
                speed,
                currentIndex: 0,
                totalCandles: candles.length,
                status: 'PLAYING',
                virtualBalance: 500000,
                realizedPnl: 0,
                positions: [],
                trades: [],
            });
        } else {
            session.status = 'PLAYING';
            if (speed) session.speed = speed;
            await session.save();
            candles = await this.loadCandles(session.symbol, session.date);
        }

        const state = {
            sessionDoc: session,
            candles,
            timer: null,
        };
        this.activeSessions.set(userId.toString(), state);

        this.scheduleTick(userId.toString());

        return session;
    }

    scheduleTick(userIdStr) {
        const state = this.activeSessions.get(userIdStr);
        if (!state) return;

        const delay = this.getSpeedDelay(state.sessionDoc.speed);
        state.timer = setInterval(async () => {
            await this.processNextTick(userIdStr);
        }, delay);
    }

    async processNextTick(userIdStr) {
        const state = this.activeSessions.get(userIdStr);
        if (!state || state.sessionDoc.status !== 'PLAYING') return;

        const { sessionDoc, candles } = state;
        if (sessionDoc.currentIndex >= candles.length) {
            sessionDoc.status = 'COMPLETED';
            this.stopSessionTimer(userIdStr);
            await sessionDoc.save();
            if (this.io) {
                this.io.to(`user:${userIdStr}`).emit('replay_completed', {
                    sessionId: sessionDoc._id,
                    finalPnl: sessionDoc.realizedPnl,
                });
            }
            return;
        }

        const candle = candles[sessionDoc.currentIndex];
        sessionDoc.currentIndex++;

        // Update mark-to-market LTP for open positions
        if (sessionDoc.positions && sessionDoc.positions.length > 0) {
            sessionDoc.positions.forEach(p => {
                p.ltp = candle.close;
            });
        }

        // Periodic persist every 15 candles
        if (sessionDoc.currentIndex % 15 === 0) {
            sessionDoc.save().catch(() => {});
        }

        if (this.io) {
            this.io.to(`user:${userIdStr}`).emit('replay_tick', {
                sessionId: sessionDoc._id,
                symbol: sessionDoc.symbol,
                candle,
                currentIndex: sessionDoc.currentIndex,
                totalCandles: candles.length,
                speed: sessionDoc.speed,
                progressPercent: Math.round((sessionDoc.currentIndex / candles.length) * 100),
            });
        }
    }

    async pauseSession(userId) {
        const uid = userId.toString();
        this.stopSessionTimer(uid);
        const session = await ReplaySessionModel.findOneAndUpdate(
            { userId, status: 'PLAYING' },
            { $set: { status: 'PAUSED' } },
            { new: true }
        );
        if (this.activeSessions.has(uid)) {
            this.activeSessions.get(uid).sessionDoc.status = 'PAUSED';
        }
        return session;
    }

    async resumeSession(userId) {
        const uid = userId.toString();
        const session = await ReplaySessionModel.findOneAndUpdate(
            { userId, status: 'PAUSED' },
            { $set: { status: 'PLAYING' } },
            { new: true }
        );
        if (!session) return null;

        if (this.activeSessions.has(uid)) {
            const state = this.activeSessions.get(uid);
            state.sessionDoc.status = 'PLAYING';
            this.stopSessionTimer(uid);
            this.scheduleTick(uid);
        } else {
            await this.startSession(userId, {
                symbol: session.symbol,
                date: session.date,
                speed: session.speed,
            });
        }
        return session;
    }

    async setSpeed(userId, speed) {
        const validSpeed = [1, 2, 5].includes(Number(speed)) ? Number(speed) : 1;
        const uid = userId.toString();
        const session = await ReplaySessionModel.findOneAndUpdate(
            { userId, status: { $in: ['PLAYING', 'PAUSED'] } },
            { $set: { speed: validSpeed } },
            { new: true }
        );

        if (this.activeSessions.has(uid)) {
            const state = this.activeSessions.get(uid);
            state.sessionDoc.speed = validSpeed;
            if (state.sessionDoc.status === 'PLAYING') {
                this.stopSessionTimer(uid);
                this.scheduleTick(uid);
            }
        }
        return session;
    }

    async jumpTo(userId, targetIndex) {
        const uid = userId.toString();
        const state = this.activeSessions.get(uid);
        let maxCandles = state ? state.candles.length : 375;
        const index = Math.max(0, Math.min(Number(targetIndex) || 0, maxCandles - 1));

        const session = await ReplaySessionModel.findOneAndUpdate(
            { userId, status: { $in: ['PLAYING', 'PAUSED'] } },
            { $set: { currentIndex: index } },
            { new: true }
        );

        if (state) {
            state.sessionDoc.currentIndex = index;
            const candle = state.candles[index];
            if (this.io && candle) {
                this.io.to(`user:${uid}`).emit('replay_tick', {
                    sessionId: session._id,
                    symbol: session.symbol,
                    candle,
                    currentIndex: index,
                    totalCandles: state.candles.length,
                    progressPercent: Math.round((index / state.candles.length) * 100),
                });
            }
        }
        return session;
    }

    /**
     * Place trade in isolated replay environment
     */
    async placeReplayTrade(userId, { side, quantity, productType = 'MIS' }) {
        const uid = userId.toString();
        const state = this.activeSessions.get(uid);
        if (!state) {
            throw new Error('No active replay session. Start a replay session first.');
        }

        const session = state.sessionDoc;
        const currentCandle = state.candles[session.currentIndex] || state.candles[state.candles.length - 1];
        const execPrice = currentCandle.close;
        const qty = Number(quantity);

        let realized = 0;
        let pos = session.positions.find(p => p.symbol === session.symbol && p.productType === productType);

        if (!pos) {
            pos = {
                symbol: session.symbol,
                quantity: side === 'BUY' ? qty : -qty,
                avgPrice: execPrice,
                ltp: execPrice,
                side,
                productType,
            };
            session.positions.push(pos);
        } else {
            const isClosing = (pos.quantity > 0 && side === 'SELL') || (pos.quantity < 0 && side === 'BUY');
            if (isClosing) {
                const closeQty = Math.min(Math.abs(pos.quantity), qty);
                const dir = pos.quantity > 0 ? 1 : -1;
                realized = (execPrice - pos.avgPrice) * closeQty * dir;
                session.realizedPnl += Math.round(realized * 100) / 100;
                session.virtualBalance += Math.round(realized * 100) / 100;

                if (pos.quantity > 0) pos.quantity -= closeQty;
                else pos.quantity += closeQty;

                if (pos.quantity === 0) {
                    session.positions = session.positions.filter(p => p !== pos);
                }
            } else {
                const totalQty = Math.abs(pos.quantity) + qty;
                pos.avgPrice = Math.round(((pos.avgPrice * Math.abs(pos.quantity)) + (execPrice * qty)) / totalQty * 100) / 100;
                pos.quantity += (side === 'BUY' ? qty : -qty);
            }
        }

        session.trades.push({
            symbol: session.symbol,
            quantity: qty,
            price: execPrice,
            side,
            pnl: Math.round(realized * 100) / 100,
            timestamp: currentCandle.timestamp,
        });

        await session.save();

        if (this.io) {
            this.io.to(`user:${uid}`).emit('replay_trade_executed', {
                sessionId: session._id,
                trade: session.trades[session.trades.length - 1],
                positions: session.positions,
                virtualBalance: session.virtualBalance,
                realizedPnl: session.realizedPnl,
            });
        }

        return {
            success: true,
            execPrice,
            positions: session.positions,
            virtualBalance: session.virtualBalance,
            realizedPnl: session.realizedPnl,
        };
    }

    async getSessionState(userId) {
        const uid = userId.toString();
        const session = await ReplaySessionModel.findOne({
            userId,
            status: { $in: ['PLAYING', 'PAUSED', 'COMPLETED'] }
        }).sort({ updatedAt: -1 }).lean();

        if (!session) return null;

        const state = this.activeSessions.get(uid);
        const candle = state?.candles ? state.candles[session.currentIndex] : null;

        return {
            ...session,
            currentCandle: candle,
        };
    }

    stopSessionTimer(userIdStr) {
        if (this.activeSessions.has(userIdStr)) {
            const state = this.activeSessions.get(userIdStr);
            if (state.timer) {
                clearInterval(state.timer);
                state.timer = null;
            }
        }
    }
}

module.exports = new ReplayEngineService();
