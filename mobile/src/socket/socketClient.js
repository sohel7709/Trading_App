/**
 * socketClient.js
 * ───────────────
 * Singleton Socket.IO client for the student mobile app.
 *
 * Usage:
 *   import SocketClient from '../socket/socketClient';
 *   SocketClient.connect(token);
 *   SocketClient.on('positionTick', handler);
 *   SocketClient.joinBatch(batchId, userId);
 *   SocketClient.disconnect();
 */

import { io } from 'socket.io-client';
import { BASE_URL } from '../api/client';

// ── Throttle registry (prevents > 1 update/sec per symbol) ──────────────────
const _throttleMap = new Map(); // key → last-emit timestamp

function shouldProcess(key, ms = 1000) {
  const now = Date.now();
  const last = _throttleMap.get(key) || 0;
  if (now - last < ms) return false;
  _throttleMap.set(key, now);
  return true;
}

// ── Singleton state ───────────────────────────────────────────────────────────
let _socket = null;
let _connected = false;
const _listeners = new Map(); // event → Set of handlers

// ── Throttled event wrappers ──────────────────────────────────────────────────
// These events are high-frequency; we gate them client-side so rapid ticks
// don't cause unnecessary React re-renders.
const THROTTLED_EVENTS = new Set(['quote', 'positionTick', 'instructorFeed']);

function _dispatch(event, data) {
  const handlers = _listeners.get(event);
  if (!handlers) return;
  handlers.forEach((fn) => {
    try { fn(data); } catch (e) { console.warn(`[Socket] Handler error on ${event}:`, e); }
  });
}

function _attachCoreListeners(socket) {
  socket.onAny((event, data) => {
    if (THROTTLED_EVENTS.has(event)) {
      // For quote/positionTick, throttle per-symbol key
      const key = data?.symbol || data?.studentId || event;
      if (!shouldProcess(key, 1000)) return;
    }
    _dispatch(event, data);
  });

  socket.on('connect', () => {
    _connected = true;
    _dispatch('_connect', { connected: true });
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    _connected = false;
    _dispatch('_disconnect', { reason });
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    _dispatch('_error', { message: err.message });
    console.warn('[Socket] Connection error:', err.message);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
const SocketClient = {
  /**
   * Initialise and connect the socket with the student's JWT.
   * Calling connect() again when already connected is a no-op.
   */
  connect(token) {
    if (_socket?.connected) return _socket;
    if (_socket) {
      _socket.disconnect();
      _socket = null;
    }

    _socket = io(BASE_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 12000,
    });

    _attachCoreListeners(_socket);
    return _socket;
  },

  /**
   * Disconnect and tear down the socket.
   */
  disconnect() {
    if (_socket) {
      _socket.disconnect();
      _socket = null;
      _connected = false;
    }
  },

  /** True when socket is connected. */
  get isConnected() {
    return _connected;
  },

  /**
   * Register a handler for `event`. Returns an unsubscribe function.
   *
   *   const off = SocketClient.on('positionTick', handler);
   *   // later:
   *   off();
   */
  on(event, handler) {
    if (!event || typeof event !== 'string') {
      console.warn('[SocketClient] Attempted to subscribe to invalid or undefined event:', event);
      return () => {};
    }
    if (typeof handler !== 'function') return () => {};
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(handler);
    return () => SocketClient.off(event, handler);
  },

  off(event, handler) {
    if (!event || typeof event !== 'string') return;
    _listeners.get(event)?.delete(handler);
  },

  /** Ask server to add socket to a batch room. */
  joinBatch(batchId, userId) {
    _socket?.emit('join-batch', { batchId, userId });
  },

  /** Ask server to add socket to institute room for isolated market data. */
  joinInstitute(instituteCode) {
    _socket?.emit('join_institute', { instituteCode });
  },

  /** Emit an announcement (instructor only; students receive it). */
  sendAnnouncement(batchId, message) {
    _socket?.emit('announcement', { batchId, message });
  },

  /** Raw emit fallback. */
  emit(event, data) {
    _socket?.emit(event, data);
  },
};

export default SocketClient;
