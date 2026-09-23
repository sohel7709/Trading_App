const BrokerAdapter = require('./BrokerAdapter');
const dhanDataService = require('../../../dhanDataService');

class DhanAdapter extends BrokerAdapter {
  constructor(credentials) {
    super(credentials);
  }

  normalizeQuote(raw) {
    if (!raw) return null;
    const ltp = raw.last_price ?? 0;
    return {
      instrumentId: String(raw.security_id),
      ltpPaise: Math.round(ltp * 100),
      ltp: ltp,
      previousClose: raw.previous_close_price ?? 0,
      ts: Date.now()
    };
  }

  async getQuote(instrumentId) {
    // For MVP, we can reuse dhanDataService with the global token,
    // or ideally pass this.credentials.accessToken to a localized fetch.
    // Since we're wrapping the existing implementation:
    const data = await dhanDataService.fetchDhanLTP([instrumentId]);
    const raw = data[instrumentId];
    return this.normalizeQuote(raw);
  }

  async getOptionChain(underlyingId, expiry) {
    // Wrapper for Dhan option chain
    const secId = dhanDataService.INDEX_SECURITY_IDS[underlyingId];
    if (!secId) return null;
    
    const dhan = await dhanDataService.fetchDhanOptionChain(secId, expiry);
    if (!dhan) return null;

    return {
      indexName: underlyingId,
      expiry,
      underlyingPrice: dhan.underlyingPrice,
      rows: dhan.rows,
      source: 'DHAN',
      ts: Date.now()
    };
  }

  async getCandles(instrumentId, resolution, startTs, endTs) {
    // Not implemented in MVP for Dhan
    return [];
  }
}

module.exports = DhanAdapter;
