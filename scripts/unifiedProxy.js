const http = require('http');
const net = require('net');

const METRO_PORT = 8081;
const BACKEND_PORT = 8080;
const PROXY_PORT = 8082;

const BACKEND_PREFIXES = [
  '/auth',
  '/all',
  '/order',
  '/orders',
  '/newOrder',
  '/newCoverOrder',
  '/newOptionOrder',
  '/trade',
  '/trades',
  '/wallet',
  '/watchlist',
  '/watchlists',
  '/market',
  '/candles',
  '/socket.io',
  '/instruments',
  '/funds',
  '/portfolio',
  '/dashboard-summary',
  '/profile',
  '/alerts',
  '/options',
  '/optionPositions',
  '/assignments',
  '/institute',
  '/institutes',
  '/super-admin',
  '/student',
  '/notifications',
  '/positions',
  '/baskets',
  '/corporate-actions',
  '/chat',
  '/pnl',
  '/leaderboard',
  '/analytics',
  '/batch',
  '/batches',
  '/brokers',
  '/replay',
  '/allOrders',
  '/allHoldings',
  '/allPositions',
  '/api',
];

function isBackendRequest(req) {
  const url = (req.url || '').split('?')[0];
  return BACKEND_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix + '/') || url.startsWith(prefix + '?'));
}

const server = http.createServer((req, res) => {
  const targetPort = isBackendRequest(req) ? BACKEND_PORT : METRO_PORT;
  const options = {
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${targetPort}` },
  };

  res.on('error', () => { proxyReq.destroy(); });
  req.on('error', () => { proxyReq.destroy(); });

  const proxyReq = http.request(options, (proxyRes) => {
    proxyRes.on('error', () => { res.destroy(); });
    if (!res.headersSent) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
    }
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] ${req.method} ${req.url} -> :${targetPort}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway');
    }
  });

  req.pipe(proxyReq, { end: true });
});

server.on('upgrade', (req, socket, head) => {
  const targetPort = req.url.startsWith('/socket.io') ? BACKEND_PORT : METRO_PORT;
  socket.on('error', () => { /* ignore client disconnect */ });

  const proxySocket = net.connect(targetPort, '127.0.0.1', () => {
    proxySocket.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n') +
      '\r\n\r\n'
    );
    proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxySocket.on('error', (err) => {
    console.error(`[WS Proxy Error] ${req.url} -> :${targetPort}:`, err.message);
    socket.destroy();
  });
});

process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
    // Normal client disconnect, safely ignore
    return;
  }
  console.error('[Unified Proxy Uncaught Exception]:', err);
});

server.listen(PROXY_PORT, () => {
  console.log(`Unified Proxy running on port ${PROXY_PORT} -> Metro(:${METRO_PORT}) & Backend(:${BACKEND_PORT})`);
});
