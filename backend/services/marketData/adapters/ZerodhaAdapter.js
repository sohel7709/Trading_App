const BrokerAdapter = require('./BrokerAdapter');

class ZerodhaAdapter extends BrokerAdapter {
  constructor(credentials) {
    super(credentials);
  }

  normalizeQuote(raw) {
    if (!raw) return null;
    return {
      instrumentId: String(raw.instrument_token),
      ltpPaise: Math.round(raw.last_price * 100),
      ltp: raw.last_price,
      previousClose: raw.ohlc?.close ?? 0,
      ts: Date.now()
    };
  }

  async getQuote(instrumentId) {
    throw new Error('Zerodha live integration not fully implemented in MVP');
  }

  async getOptionChain(underlyingId, expiry) {
    throw new Error('Zerodha option chain not implemented in MVP');
  }

  async getCandles(instrumentId, resolution, startTs, endTs) {
    return [];
  }
}

module.exports = ZerodhaAdapter;
