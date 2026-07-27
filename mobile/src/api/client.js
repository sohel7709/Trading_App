import { io } from 'socket.io-client';
import Constants from 'expo-constants';

// Production: set EXPO_PUBLIC_API_URL in eas.json env or .env
// Local dev: set to your machine's IP
export const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'http://10.101.64.71:8080';

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

const patch = async (path, body) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `PATCH ${path} failed: ${res.status}`);
  }
  return res.json();
};

export const api = {
  // Holdings
  getHoldings: () => get('/allHoldings'),

  // Positions
  getPositions: () => get('/allPositions'),
  getDayPositions: () => get('/positions/day'),
  getDayPnl: () => get('/positions/dayPnl'),
  getClosedPositions: () => get('/closedPositions'),
  squareOffPosition: (id, quantity) => post(`/positions/${id}/squareoff`, quantity ? { quantity } : {}),

  // Orders
  getOrders: () => get('/allOrders'),
  cancelOrder: (id) => del(`/orders/${id}`),
  placeOrder: (order) => post('/newOrder', order),
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
  getTrades: () => get('/trades'),

  // Wallet
  getWallet: () => get('/wallet'),

  // Funds
  getFunds: () => get('/funds'),
  deposit: (amount, method, upiApp) => post('/funds/deposit', { amount, method, upiApp }),
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

let socketInstance = null;

export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io(BASE_URL, {
      // Prefer websocket, but ALLOW polling fallback. websocket-only meant
      // that if the raw WS handshake failed on the device's network (common
      // on mobile carriers / proxies / some wifi), socket.io never connected
      // and no marketData ticks arrived — REST kept working so holdings
      // loaded, but the LTP sat frozen at the last fetched value. Polling
      // almost always gets through and upgrades to ws when possible.
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
  }
  return socketInstance;
};
