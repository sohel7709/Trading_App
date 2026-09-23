/**
 * socketEvents.js
 * ───────────────
 * Canonical event name constants for Socket.IO.
 * Import from here everywhere — never use raw string literals.
 */

// ── Server → Client ───────────────────────────────────────────────────────────
export const SOCKET_EVENTS = {
  // Market data
  QUOTE: 'quote',               // option chain LTP tick      { symbol, strike, optionType, ltp, oi }
  MARKET_DATA: 'marketData',    // index/stock/commodity tick  { prices, indexes, commodities, status }
  MARKET_DATA_STATUS: 'marketDataStatus', // connection status { instituteCode, status, error }

  // Student portfolio
  POSITION_TICK: 'positionTick',// live P&L update             { userId, positions[], totalPnl }
  ORDER_UPDATE: 'orderUpdate',  // order status change         { orderId, status, rejectionReason }

  // Instructor feed
  INSTRUCTOR_FEED: 'instructorFeed', // per-student row update { studentId, pnl, margin, riskStatus, lastOrder }

  // Collaboration
  ANNOUNCEMENT: 'announcement', // instructor broadcast        { batchId, message, from, timestamp }
  CHAT_MESSAGE: 'chat',         // peer chat                   { room, message, username, timestamp }

  // Session control
  SESSION_CONTROL: 'sessionControl', // { action: 'START'|'PAUSE'|'RESUME'|'STOP', speed }

  // Market Control & Circuit Breaker
  MARKET_UPDATE: 'market_update',    // { mode, isHalted, reason, autoSquareOffMIS, ... }
  MARKET_HALTED: 'market_halted',    // { mode, isHalted: true, reason }
  MARKET_RESUMED: 'market_resumed',  // { mode, isHalted: false }

  // Internal connection events (dispatched by socketClient.js)
  _CONNECT: '_connect',
  _DISCONNECT: '_disconnect',
  _ERROR: '_error',
};

// ── Client → Server ───────────────────────────────────────────────────────────
export const SOCKET_EMIT = {
  JOIN_BATCH: 'join-batch',         // { batchId, userId }
  JOIN_INSTITUTE: 'join_institute', // { instituteCode }
  ANNOUNCEMENT: 'announcement',     // { batchId, message }
  CHAT: 'chat',                     // { room, message }
};
