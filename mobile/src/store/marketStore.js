/**
 * marketStore.js
 * ──────────────
 * High-performance centralized real-time market data store for mobile.
 *
 * Architecture:
 * 1. Single global WebSocket listener for 'marketData'
 * 2. 200ms buffer queue — coalesces rapid ticks to prevent JS thread blocking
 * 3. Granular symbol-level subscription:
 *    - Components subscribing to `RELIANCE` re-render ONLY when `RELIANCE` ticks
 *    - Prevents full-list re-renders across Watchlist, Option Chain, & Dashboard
 * 4. Zero memory leaks: automatically unregisters listeners on component unmount
 */

import { useState, useEffect, useRef } from 'react';
import SocketClient from '../socket/socketClient';

class MarketStore {
  constructor() {
    this._prices = {};       // symbol -> { symbol, ltp, change, changePercent, high, low, volume }
    this._indexes = {};      // indexName -> { name, ltp, change, changePercent }
    this._pendingDiffs = {}; // symbol -> updated data
    this._pendingIndexDiffs = {};
    
    this._symbolSubscribers = new Map(); // symbol -> Set of callbacks
    this._indexSubscribers = new Set();  // Set of callbacks
    this._globalSubscribers = new Set(); // Set of callbacks

    this._flushTimer = null;
    this._isListening = false;
    this._throttleMs = 200; // 200ms flush batching (~5 FPS UI updates, keeping 60 FPS scrolling)
  }

  init() {
    if (this._isListening) return;
    this._isListening = true;

    // Connect to single global socket
    SocketClient.on('marketData', (data) => {
      this._enqueue(data);
    });

    // Start 200ms batch flush interval
    this._flushTimer = setInterval(() => {
      this._flush();
    }, this._throttleMs);
  }

  _enqueue(data) {
    if (!data) return;

    // Process stock diffs/prices
    const updates = data.diff || data.prices;
    if (updates && typeof updates === 'object') {
      for (const [sym, quote] of Object.entries(updates)) {
        if (quote && typeof quote === 'object') {
          this._pendingDiffs[sym] = {
            ...(this._pendingDiffs[sym] || this._prices[sym] || {}),
            ...quote,
            symbol: sym,
          };
        }
      }
    }

    // Process index data
    if (data.indexes && typeof data.indexes === 'object') {
      for (const [name, idx] of Object.entries(data.indexes)) {
        if (idx && typeof idx === 'object') {
          this._pendingIndexDiffs[name] = {
            ...(this._pendingIndexDiffs[name] || this._indexes[name] || {}),
            ...idx,
            name,
          };
        }
      }
    }
  }

  _flush() {
    const hasPriceUpdates = Object.keys(this._pendingDiffs).length > 0;
    const hasIndexUpdates = Object.keys(this._pendingIndexDiffs).length > 0;

    if (!hasPriceUpdates && !hasIndexUpdates) return;

    // Apply and notify changed symbols
    if (hasPriceUpdates) {
      const changedSymbols = Object.keys(this._pendingDiffs);
      for (const sym of changedSymbols) {
        const nextQuote = this._pendingDiffs[sym];
        const prevQuote = this._prices[sym];

        // Only notify if price/change actually changed
        const hasChanged = !prevQuote ||
          prevQuote.ltp !== nextQuote.ltp ||
          prevQuote.change !== nextQuote.change ||
          prevQuote.changePercent !== nextQuote.changePercent;

        this._prices[sym] = nextQuote;

        if (hasChanged) {
          const subs = this._symbolSubscribers.get(sym);
          if (subs && subs.size > 0) {
            subs.forEach(cb => {
              try { cb(nextQuote); } catch (e) { console.warn('[MarketStore] Symbol subscriber error:', e); }
            });
          }
        }
      }
      this._pendingDiffs = {};
    }

    // Apply and notify index subscribers
    if (hasIndexUpdates) {
      for (const [name, idx] of Object.entries(this._pendingIndexDiffs)) {
        this._indexes[name] = idx;
      }
      this._pendingIndexDiffs = {};

      const currentIndexes = { ...this._indexes };
      this._indexSubscribers.forEach(cb => {
        try { cb(currentIndexes); } catch (e) { console.warn('[MarketStore] Index subscriber error:', e); }
      });
    }

    // Notify global subscribers (throttled batch)
    if (this._globalSubscribers.size > 0) {
      const snapshot = { prices: { ...this._prices }, indexes: { ...this._indexes } };
      this._globalSubscribers.forEach(cb => {
        try { cb(snapshot); } catch (e) { console.warn('[MarketStore] Global subscriber error:', e); }
      });
    }
  }

  /**
   * Seed store from REST snapshot
   */
  seed(prices = {}, indexes = {}) {
    if (prices && typeof prices === 'object') {
      Object.assign(this._prices, prices);
    }
    if (indexes && typeof indexes === 'object') {
      Object.assign(this._indexes, indexes);
    }
  }

  getPrice(symbol) {
    if (!symbol) return null;
    return this._prices[symbol.toUpperCase()] || null;
  }

  getAllPrices() {
    return this._prices;
  }

  getIndex(name) {
    if (!name) return null;
    return this._indexes[name] || null;
  }

  getAllIndexes() {
    return this._indexes;
  }

  /**
   * Subscribe to a single symbol's price updates.
   * Returns an unsubscribe function.
   */
  subscribeSymbol(symbol, callback) {
    if (!symbol || typeof callback !== 'function') return () => {};
    const symUpper = symbol.toUpperCase();
    if (!this._symbolSubscribers.has(symUpper)) {
      this._symbolSubscribers.set(symUpper, new Set());
    }
    this._symbolSubscribers.get(symUpper).add(callback);

    // Immediate callback if we already have a cached price
    if (this._prices[symUpper]) {
      callback(this._prices[symUpper]);
    }

    return () => {
      const subs = this._symbolSubscribers.get(symUpper);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this._symbolSubscribers.delete(symUpper);
        }
      }
    };
  }

  /**
   * Subscribe to index updates. Returns unsubscribe function.
   */
  subscribeIndexes(callback) {
    if (typeof callback !== 'function') return () => {};
    this._indexSubscribers.add(callback);
    if (Object.keys(this._indexes).length > 0) {
      callback(this._indexes);
    }
    return () => {
      this._indexSubscribers.delete(callback);
    };
  }

  /**
   * Subscribe to full market store flushes. Returns unsubscribe function.
   */
  subscribeGlobal(callback) {
    if (typeof callback !== 'function') return () => {};
    this._globalSubscribers.add(callback);
    return () => {
      this._globalSubscribers.delete(callback);
    };
  }
}

export const marketStore = new MarketStore();
marketStore.init();

/**
 * React hook: Subscribe to a single symbol.
 * ONLY re-renders when this specific symbol's price changes!
 */
export function useLiveSymbol(symbol) {
  const [quote, setQuote] = useState(() => marketStore.getPrice(symbol));
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  useEffect(() => {
    if (!symbol) return;
    const unsub = marketStore.subscribeSymbol(symbol, (newQuote) => {
      setQuote(newQuote);
    });
    return unsub;
  }, [symbol]);

  return quote;
}

/**
 * React hook: Subscribe to live indexes (NIFTY 50, BANK NIFTY, etc.)
 */
export function useLiveIndexes() {
  const [indexes, setIndexes] = useState(() => marketStore.getAllIndexes());

  useEffect(() => {
    const unsub = marketStore.subscribeIndexes((nextIndexes) => {
      setIndexes(nextIndexes);
    });
    return unsub;
  }, []);

  return indexes;
}
