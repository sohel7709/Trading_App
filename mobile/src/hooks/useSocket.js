/**
 * useSocket.js
 * ────────────
 * React hook: subscribe to socket events inside any component.
 * Automatically unsubscribes on unmount (no memory leaks).
 *
 * Usage:
 *   useSocket(SOCKET_EVENTS.POSITION_TICK, (data) => {
 *     setPositions(prev => applyTick(prev, data));
 *   });
 */

import { useEffect, useRef } from 'react';
import SocketClient from '../socket/socketClient';

/**
 * @param {string} event  - Socket event name (use SOCKET_EVENTS constants)
 * @param {Function} handler - Callback when event fires
 * @param {any[]} deps    - Re-attach deps (optional, usually [])
 */
export default function useSocket(event, handler, deps = []) {
  // Keep handler ref stable so we don't re-subscribe on every render
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!event || typeof event !== 'string') {
      console.warn('[useSocket] Attempted to subscribe to invalid or undefined event:', event);
      return;
    }
    const stableHandler = (data) => handlerRef.current(data);
    const off = SocketClient.on(event, stableHandler);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}
