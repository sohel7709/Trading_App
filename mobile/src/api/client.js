import { io } from 'socket.io-client';
import { getAccessToken, refreshAccessToken, clearTokens } from '../services/authService';
import { BASE_URL } from './baseUrl';

export { BASE_URL };

// ── Auth-aware fetch wrapper ──────────────────────────────────────────────────
let _refreshing = null; // dedupe concurrent refresh attempts

async function authFetch(path, options = {}, retry = true) {
  const token = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    'bypass-tunnel-reminder': 'true',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    // Try to refresh once
    try {
      if (!_refreshing) _refreshing = refreshAccessToken().finally(() => { _refreshing = null; });
      await _refreshing;
      return authFetch(path, options, false); // retry once with new token
    } catch {
      await clearTokens();
      throw new Error('SESSION_EXPIRED');
    }
  }

  return res;
}

const get = async (path) => {
  const res = await authFetch(path);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  // Guard: if the server returns HTML or Expo manifest instead of JSON API response,
  // it means BASE_URL is pointing to the wrong server (e.g. Expo bundler not backend).
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    console.error(`[API] GET ${path} returned non-JSON (${ct}). Check BASE_URL:`, BASE_URL);
    throw new Error(`GET ${path} returned non-JSON. BASE_URL may be wrong.`);
  }
  return res.json();
};

// Shared short-TTL cache + in-flight de-dupe for hot, frequently-polled GETs.
// Many screens render <IndexTicker/> and fetch the same market data on mount;
// this collapses those into a single network request and serves repeats from
// cache. Live freshness still comes from the websocket push.
const _cache = new Map();     // path -> { at, data }
const _inflight = new Map();  // path -> Promise

const cachedGet = (path, ttl = 2000) => {
  const now = Date.now();
  const hit = _cache.get(path);
  if (hit && now - hit.at < ttl) return Promise.resolve(hit.data);
  if (_inflight.has(path)) return _inflight.get(path);
  const p = get(path)
    .then((data) => { _cache.set(path, { at: Date.now(), data }); _inflight.delete(path); return data; })
    .catch((e) => { _inflight.delete(path); throw e; });
  _inflight.set(path, p);
  return p;
};

const post = async (path, body) => {
  const res = await authFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `POST ${path} failed: ${res.status}`);
  }
  return res.json();
};

const del = async (path) => {
  const res = await authFetch(path, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return res.json();
};

const patch = async (path, body) => {
  const res = await authFetch(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `PATCH ${path} failed: ${res.status}`);
  }
  return res.json();
};

export const api = {
  // Global Market State & Circuit Breaker
  getMarketState: () => get('/market/state'),

  // Combined Dashboard & Fast Home Summary
  getDashboardSummary: () => get('/dashboard-summary'),

  // Unified Portfolio & Overview
  getPortfolio: () => get('/portfolio'),

  // Holdings
  getHoldings: () => get('/allHoldings'),

  // Positions
  getPositions: () => get('/allPositions'),
  getDayPositions: () => get('/positions/day'),
  getDayPnl: () => get('/positions/dayPnl'),
  squareOffPosition: (id, quantity) => post(`/positions/${id}/squareoff`, quantity ? { quantity } : {}),
  squareOffTrade: (positionId, lotsOrQty) => post('/trade/square-off', { positionId, quantity: lotsOrQty, lots: lotsOrQty }),

  // Student Analytics & Activity
  getStudentPnlHistory: (studentId) => get(`/student/${studentId}/pnl-history`),
  getStudentActivity: (studentId) => get(`/student/${studentId}/activity`),

  // Notifications & Alerts
  getNotifications: () => get('/notifications'),
  markNotificationsRead: () => patch('/notifications/mark-read', {}),

  // Orders & Unified Trade
  getOrders: () => get('/allOrders'),
  cancelOrder: (id) => del(`/orders/${id}`),
  placeOrder: (order) => post('/newOrder', order),
  placeTrade: (order) => post('/trade', order),
  modifyOrder: (id, changes) => patch(`/orders/${id}`, changes),
  placeCoverOrder: (order) => post('/newCoverOrder', order),

  // Baskets
  getBaskets: () => get('/baskets'),
  createBasket: (name, legs) => post('/baskets', { name, legs }),
  deleteBasket: (id) => del(`/baskets/${id}`),
  executeBasket: (id) => post(`/baskets/${id}/execute`, {}),

  // Corporate actions
  getCorporateActions: () => get('/corporate-actions'),
  applyCorporateActions: () => post('/corporate-actions/apply', {}),

  // Trades
  getTrades: (query = '') => get(`/trades${query}`),

  // Wallet
  getWallet: () => get('/wallet'),

  // Funds
  getFunds: () => get('/funds'),
  deposit: (amount, method, upiApp) => post('/funds/deposit', { amount, method, upiApp }),
  withdraw: (amount) => post('/funds/withdraw', { amount }),

  // Watchlist
  getWatchlists: () => get('/watchlists'),
  createWatchlist: (name) => post('/watchlists', { name }),
  addStockToWatchlist: (id, symbol) => post(`/watchlists/${id}/stock`, { symbol, stockSymbol: symbol }),
  removeStockFromWatchlist: (id, symbol) => del(`/watchlists/${id}/stock/${encodeURIComponent(symbol)}`),
  deleteWatchlist: (id) => del(`/watchlists/${id}`),

  // Market
  searchInstruments: (query) => get(`/market/search?q=${encodeURIComponent(query)}`),
  getAllStocks: () => get('/market/stocks'),
  getLiveMarket: () => cachedGet('/market/live', 2000),
  getMarketData: () => cachedGet('/market/live', 2000),
  getIndexes: () => cachedGet('/market/indexes', 2000),
  getMovers: () => cachedGet('/market/movers', 5000),
  getQuote: (symbol, exchange) => get(`/market/quote/${symbol}${exchange ? `?exchange=${exchange}` : ''}`),
  getCandles: (symbol, interval = '1d') => get(`/market/candles/${symbol}?interval=${interval}`),
  getHistory: (symbol, days = 30) => get(`/market/history/${symbol}?days=${days}`),
  getIndexCandles: (indexName, interval = '1d') => get(`/market/index-candles/${encodeURIComponent(indexName)}?interval=${interval}`),
  getMarketStatus: () => get('/market/status'),
  getLiveCandles: (indexName, intervalMin = 5) => get(`/market/live-candles/${encodeURIComponent(indexName)}?interval=${intervalMin}`),

  // Option Chain
  getOptionChain: (symbol, expiry) => get(`/market/optionchain/${encodeURIComponent(symbol)}${expiry ? `?expiry=${expiry}` : ''}`),

  // Option paper trading
  getOptionPositions: () => get('/optionPositions'),
  placeOptionOrder: (order) => post('/newOptionOrder', order),
  squareOffOptionPosition: (id, lots) => post(`/optionPositions/${id}/squareoff`, lots ? { lots } : {}),

  // Alerts
  getAlerts: () => get('/alerts'),
  createAlert: (data) => post('/alerts', data),
  deleteAlert: (id) => del(`/alerts/${id}`),

  // Chat
  getChatHistory: () => get('/chat/history'),

  // P&L — reads the seeded P&L history (imported trade log)
  getPnl: (segment, from, to) =>
    get(`/pnl/records?segment=${segment}&from=${from}&to=${to}&limit=1000`),
  getPnlCharges: (from, to, segment = 'combined') =>
    get(`/pnl/charges?segment=${segment}&from=${from}&to=${to}`),
  getMonthlyBreakdown: (segment, from, to) =>
    get(`/pnl/monthly-breakdown?segment=${segment}&from=${from}&to=${to}`),

  // IPOs — live from NSE
  getIpos: () => get('/market/ipos'),
};

export const getSocket = () => {
  // Use the single global socket instance from SocketClient to eliminate duplicate socket connections
  const SocketClient = require('../socket/socketClient').default;
  return SocketClient.getSocket();
};
