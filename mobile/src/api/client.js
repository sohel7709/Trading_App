import { io } from 'socket.io-client';
import Constants from 'expo-constants';

// Production: set EXPO_PUBLIC_API_URL in eas.json env or .env
// Local dev: set to your machine's IP
export const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'http://10.13.11.71:8080';

const get = async (path) => {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
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
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `POST ${path} failed: ${res.status}`);
  }
  return res.json();
};

const del = async (path) => {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  return res.json();
};

export const api = {
  // Holdings
  getHoldings: () => get('/allHoldings'),

  // Positions
  getPositions: () => get('/allPositions'),
  getDayPositions: () => get('/positions/day'),

  // Orders
  getOrders: () => get('/allOrders'),
  cancelOrder: (id) => del(`/orders/${id}`),
  placeOrder: (order) => post('/newOrder', order),

  // Trades
  getTrades: () => get('/trades'),

  // Wallet
  getWallet: () => get('/wallet'),

  // Funds
  getFunds: () => get('/funds'),
  deposit: (amount) => post('/funds/deposit', { amount }),
  withdraw: (amount) => post('/funds/withdraw', { amount }),

  // Watchlist
  getWatchlists: () => get('/watchlists'),
  createWatchlist: (name) => post('/watchlists', { name }),
  addStock: (id, stockSymbol) => post(`/watchlists/${id}/stock`, { stockSymbol }),
  removeStock: (id, symbol) => del(`/watchlists/${id}/stock/${symbol}`),
  deleteWatchlist: (id) => del(`/watchlists/${id}`),

  // Market
  searchStocks: (q) => get(`/market/search?q=${encodeURIComponent(q)}`),
  getAllStocks: () => get('/market/stocks'),
  getLiveMarket: () => cachedGet('/market/live', 2000),
  getIndexes: () => cachedGet('/market/indexes', 2000),
  getMovers: () => cachedGet('/market/movers', 5000),
  getQuote: (symbol) => get(`/market/quote/${symbol}`),
  getCandles: (symbol, interval = '1d') => get(`/market/candles/${symbol}?interval=${interval}`),
  getHistory: (symbol, days = 30) => get(`/market/history/${symbol}?days=${days}`),
  getIndexCandles: (indexName, interval = '1d') => get(`/market/index-candles/${encodeURIComponent(indexName)}?interval=${interval}`),
  getMarketStatus: () => get('/market/status'),
  getLiveCandles: (indexName, intervalMin = 5) => get(`/market/live-candles/${encodeURIComponent(indexName)}?interval=${intervalMin}`),

  // Option Chain
  getOptionChain: (symbol, expiry) => get(`/market/optionchain/${encodeURIComponent(symbol)}${expiry ? `?expiry=${expiry}` : ''}`),

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

  // IPOs — live from NSE
  getIpos: () => get('/market/ipos'),
};

let socketInstance = null;

export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io(BASE_URL, { transports: ['websocket'] });
  }
  return socketInstance;
};
