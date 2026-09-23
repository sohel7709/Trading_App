/**
 * useThrottledSocket.js
 * ─────────────────────
 * High-performance React hook for WebSocket event ingestion on mobile.
 *
 * Problem:
 * High-frequency socket ticks (e.g. 5-10 per second across 1,000+ users)
 * cause excessive re-renders on React Native's JS thread, causing list stuttering
 * and dropping scroll frame rate below 30 FPS.
 *
 * Solution:
 * 1. Absorbs ticks in a mutable ref queue (zero render overhead).
 * 2. Batches and coalesces updates at a smooth interval (default 250ms ~ 4 FPS),
 *    maintaining 60 FPS scrolling.
 * 3. Handles delta/diff merge: if the server sends { isDiff: true, diff: {...} },
 *    it incrementally merges into the local price dictionary.
 */

import { useState, useEffect, useRef } from 'react';
import SocketClient from '../socket/socketClient';

/**
 * @param {string} event - Socket event name (e.g. 'marketData')
 * @param {Function} [onBatchCallback] - Optional callback receiving the latest batched data
 * @param {number} [throttleMs=250] - Batching interval in milliseconds
 */
export default function useThrottledSocket(event, onBatchCallback, throttleMs = 250) {
  const [data, setData] = useState(null);
  const pendingRef = useRef(null);
  const callbackRef = useRef(onBatchCallback);
  callbackRef.current = onBatchCallback;

  useEffect(() => {
    // Collect incoming socket events into ref buffer without triggering React renders
    const handler = (incoming) => {
      if (!incoming) return;

      if (incoming.isDiff && incoming.diff) {
        // Delta update: merge diff into pending state
        if (!pendingRef.current) {
          pendingRef.current = { ...incoming, prices: { ...incoming.diff } };
        } else {
          pendingRef.current = {
            ...pendingRef.current,
            ...incoming,
            prices: {
              ...(pendingRef.current.prices || {}),
              ...incoming.diff,
            },
          };
        }
      } else {
        // Full snapshot: replace pending state
        pendingRef.current = incoming;
      }
    };
    if (!event || typeof event !== 'string') {
      console.warn('[useThrottledSocket] Attempted to subscribe to invalid or undefined event:', event);
      return;
    }

    const off = SocketClient.on(event, handler);

    // Periodic flush timer (coalesces events at smooth 250ms intervals)
    const flushTimer = setInterval(() => {
      if (pendingRef.current !== null) {
        const snapshot = pendingRef.current;
        pendingRef.current = null;
        setData(snapshot);
        if (callbackRef.current) {
          callbackRef.current(snapshot);
        }
      }
    }, throttleMs);

    return () => {
      off();
      clearInterval(flushTimer);
    };
  }, [event, throttleMs]);

  return data;
}
