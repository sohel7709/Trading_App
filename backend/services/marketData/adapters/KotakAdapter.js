const BrokerAdapter = require('./BrokerAdapter');

class KotakAdapter extends BrokerAdapter {
  constructor(credentials) {
    super(credentials);
  }

  normalizeQuote(raw) {
    if (!raw) return null;
    return {
      instrumentId: String(raw.instrumentToken),
      ltpPaise: Math.round(raw.lastPrice * 100),
      ltp: raw.lastPrice,
      previousClose: raw.previousClose ?? 0,
      ts: Date.now()
    };
  }

  async getQuote(instrumentId) {
    throw new Error('Kotak live integration not fully implemented in MVP');
  }

  async getOptionChain(underlyingId, expiry) {
    throw new Error('Kotak option chain not implemented in MVP');
  }

  async getCandles(instrumentId, resolution, startTs, endTs) {
    return [];
  }
}

module.exports = KotakAdapter;
