'use strict';

/**
 * kotakNeoService.js
 * ──────────────────
 * Integration service for Kotak Neo Trade API (Kotak Securities v2 API).
 * Reads credentials dynamically from BrokerCredentialModel or process.env.
 */

const BrokerCredentialModel = require('./model/BrokerCredentialModel');

const KOTAK_AUTH_BASE = process.env.KOTAK_NEO_AUTH_URL || 'https://napi.kotaksecurities.com';
const KOTAK_GW_BASE   = process.env.KOTAK_NEO_GW_URL   || 'https://gw-napi.kotaksecurities.com';

let accessToken = null;
let sessionToken = null;
let sessionExpiry = 0;
let isAuthenticating = false;

const KOTAK_INDEX_TOKENS = {
  'NIFTY 50':    { exchange: 'nse_cm', token: 'Nifty 50', symbol: 'NIFTY' },
  'BANK NIFTY':  { exchange: 'nse_cm', token: 'Nifty Bank', symbol: 'BANKNIFTY' },
  'FINNIFTY':    { exchange: 'nse_cm', token: 'Nifty Fin Service', symbol: 'FINNIFTY' },
  'MIDCPNIFTY': { exchange: 'nse_cm', token: 'NIFTY MID SELECT', symbol: 'MIDCPNIFTY' },
  'SENSEX':      { exchange: 'bse_cm', token: 'SENSEX', symbol: 'SENSEX' },
};

/**
 * Loads Kotak credentials from database (active provider) or process.env
 */
async function getCredentials() {
  try {
    const dbCred = await BrokerCredentialModel.findOne({ provider: 'KOTAK', isActiveProvider: true }).lean()
      || await BrokerCredentialModel.findOne({ provider: 'KOTAK' }).lean();

    if (dbCred && dbCred.apiKey && dbCred.consumerSecret) {
      return {
        apiKey: dbCred.apiKey,
        consumerSecret: dbCred.consumerSecret,
        mobileNo: dbCred.mobileNo,
        password: dbCred.password,
        mpin: dbCred.mpin || '',
      };
    }
  } catch (e) {
    // best-effort
  }

  if (process.env.KOTAK_NEO_CONSUMER_KEY && process.env.KOTAK_NEO_CONSUMER_SECRET) {
    return {
      apiKey: process.env.KOTAK_NEO_CONSUMER_KEY,
      consumerSecret: process.env.KOTAK_NEO_CONSUMER_SECRET,
      mobileNo: process.env.KOTAK_NEO_MOBILE_NO,
      password: process.env.KOTAK_NEO_PASSWORD,
      mpin: process.env.KOTAK_NEO_MPIN || '',
    };
  }

  return null;
}

/**
 * Checks if Kotak Neo credentials are available
 */
async function isConfigured() {
  const creds = await getCredentials();
  return Boolean(creds && creds.apiKey && creds.consumerSecret);
}

/**
 * Step 1: Generate OAuth Access Token
 */
async function getOAuthAccessToken(key, secret) {
  const authHeader = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(`${KOTAK_AUTH_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OAuth token failed (${res.status}): ${errText.slice(0, 100)}`);
  }

  const json = await res.json();
  return json.access_token;
}

/**
 * Step 2: Validate User & MPIN
 */
async function loginAndGetSession() {
  const creds = await getCredentials();
  if (!creds || isAuthenticating) return false;

  isAuthenticating = true;
  try {
    const token = await getOAuthAccessToken(creds.apiKey, creds.consumerSecret);
    accessToken = token;

    const res = await fetch(`${KOTAK_GW_BASE}/login/1.0/login/v2/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mobileNumber: creds.mobileNo,
        password: creds.password,
        mpin: creds.mpin,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Login validate failed (${res.status}): ${errText.slice(0, 100)}`);
    }

    const json = await res.json();
    if (json?.data?.token || json?.data?.sid) {
      sessionToken = json.data.token || json.data.sid;
      sessionExpiry = Date.now() + 12 * 3600 * 1000;
      console.log('[Kotak Neo] Authenticated successfully');
      return true;
    } else {
      throw new Error(json?.message || 'Invalid Kotak session payload');
    }
  } catch (e) {
    console.warn('[Kotak Neo] Login error:', e.message);
    return false;
  } finally {
    isAuthenticating = false;
  }
}

/**
 * Ensures session token is active
 */
async function ensureSession() {
  if (sessionToken && Date.now() < sessionExpiry) return true;
  return await loginAndGetSession();
}

/**
 * Tests connection with a set of credentials
 */
async function testCredentials({ apiKey, consumerSecret, mobileNo, password, mpin }) {
  try {
    const token = await getOAuthAccessToken(apiKey, consumerSecret);
    const res = await fetch(`${KOTAK_GW_BASE}/login/1.0/login/v2/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mobileNumber: mobileNo, password, mpin: mpin || '' }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch (e) {
    console.warn('[Kotak Neo] Test connection error:', e.message);
    return false;
  }
}

function getHeaders(apiKey) {
  return {
    'Authorization': `Bearer ${sessionToken || accessToken}`,
    'neo-fin-key': apiKey || process.env.KOTAK_NEO_CONSUMER_KEY || '',
    'Content-Type': 'application/json',
  };
}

async function fetchQuotes(instruments = []) {
  if (!(await ensureSession()) || instruments.length === 0) return null;
  const creds = await getCredentials();
  try {
    const res = await fetch(`${KOTAK_GW_BASE}/Quotes/1.0.0/quote`, {
      method: 'POST',
      headers: getHeaders(creds?.apiKey),
      body: JSON.stringify({ instruments }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch (e) {
    console.warn('[Kotak Neo] fetchQuotes error:', e.message);
    return null;
  }
}

async function fetchKotakExpiryList(indexName) {
  if (!(await ensureSession())) return null;
  const creds = await getCredentials();
  try {
    const info = KOTAK_INDEX_TOKENS[indexName] || KOTAK_INDEX_TOKENS['NIFTY 50'];
    const res = await fetch(`${KOTAK_GW_BASE}/optionchain/1.0.0/expirylist`, {
      method: 'POST',
      headers: getHeaders(creds?.apiKey),
      body: JSON.stringify({ underlying: info.symbol }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const list = json?.data || json?.expiries;
    return Array.isArray(list) && list.length > 0 ? list : null;
  } catch (e) {
    console.warn('[Kotak Neo] fetchKotakExpiryList error:', e.message);
    return null;
  }
}

async function fetchKotakOptionChain(indexName, expiry) {
  if (!(await ensureSession()) || !expiry) return null;
  const creds = await getCredentials();
  try {
    const info = KOTAK_INDEX_TOKENS[indexName] || KOTAK_INDEX_TOKENS['NIFTY 50'];
    const res = await fetch(`${KOTAK_GW_BASE}/optionchain/1.0.0/chain`, {
      method: 'POST',
      headers: getHeaders(creds?.apiKey),
      body: JSON.stringify({ underlying: info.symbol, expiry }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const rawChain = json?.data?.chain || json?.data;
    if (!rawChain || !Array.isArray(rawChain)) return null;

    const normalizeSide = (s) => {
      if (!s) return null;
      const ltp = s.ltp || s.lastPrice || 0;
      const prevClose = s.closePrice || s.prevClose || 0;
      const oi = s.openInterest || s.oi || 0;
      return {
        oi,
        oiChange: oi - (s.prevOpenInterest || oi),
        volume: s.volume || 0,
        iv: Math.round((s.impliedVolatility || s.iv || 0) * 100) / 100,
        ltp: Math.round(ltp * 100) / 100,
        change: Math.round((ltp - prevClose) * 100) / 100,
        delta: Math.round((s.greeks?.delta || 0) * 100) / 100,
        bid: s.bidPrice || 0,
        ask: s.askPrice || 0,
      };
    };

    const rows = rawChain
      .map(item => ({
        strike: Math.round(Number(item.strikePrice)),
        ce: normalizeSide(item.ce),
        pe: normalizeSide(item.pe),
      }))
      .filter(r => r.ce && r.pe)
      .sort((a, b) => a.strike - b.strike);

    return {
      underlyingPrice: json?.data?.underlyingPrice || 0,
      rows,
    };
  } catch (e) {
    console.warn('[Kotak Neo] fetchKotakOptionChain error:', e.message);
    return null;
  }
}

module.exports = {
  isConfigured,
  ensureSession,
  testCredentials,
  fetchQuotes,
  fetchKotakExpiryList,
  fetchKotakOptionChain,
  KOTAK_INDEX_TOKENS,
};
