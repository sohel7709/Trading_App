/**
 * useMarketState.js
 * ─────────────────
 * React hook to access and subscribe to global exchange/market state:
 * - isHalted: boolean (Circuit breaker / emergency halt)
 * - mode: 'LIVE' | 'REPLAY' | 'SYNTHETIC'
 * - reason: string (Explanation for halt)
 * - autoSquareOffMIS: boolean
 * - updatedAt: timestamp
 *
 * Real-time updates via Socket.IO events:
 *   - 'market_update'
 *   - 'market_halted'
 *   - 'market_resumed'
 */

import { useState, useEffect } from 'react';
import { api } from '../api/client';
import useSocket from './useSocket';
import { SOCKET_EVENTS } from '../socket/socketEvents';

export default function useMarketState() {
  const [marketState, setMarketState] = useState({
    mode: 'LIVE',
    isHalted: false,
    reason: '',
    haltedBy: null,
    haltedAt: null,
    loaded: false,
  });

  // Fetch initial market state on mount
  useEffect(() => {
    let isMounted = true;
    api.getMarketState()
      .then((data) => {
        if (isMounted && data) {
          setMarketState((prev) => ({
            ...prev,
            ...data,
            loaded: true,
          }));
        }
      })
      .catch((err) => {
        console.warn('[useMarketState] Initial fetch error:', err.message);
        if (isMounted) {
          setMarketState((prev) => ({ ...prev, loaded: true }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for real-time market updates
  useSocket(SOCKET_EVENTS.MARKET_UPDATE, (update) => {
    if (update) {
      setMarketState((prev) => ({
        ...prev,
        ...update,
        loaded: true,
      }));
    }
  });

  // Listen for emergency halt broadcast
  useSocket(SOCKET_EVENTS.MARKET_HALTED, (haltData) => {
    if (haltData) {
      setMarketState((prev) => ({
        ...prev,
        ...haltData,
        isHalted: true,
        loaded: true,
      }));
    }
  });

  // Listen for market resume broadcast
  useSocket(SOCKET_EVENTS.MARKET_RESUMED, (resumeData) => {
    if (resumeData) {
      setMarketState((prev) => ({
        ...prev,
        ...resumeData,
        isHalted: false,
        reason: '',
        loaded: true,
      }));
    }
  });

  return marketState;
}
