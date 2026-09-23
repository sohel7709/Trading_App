class BrokerAdapter {
  constructor(credentials) {
    this.credentials = credentials;
  }

  /**
   * Normalizes a raw quote from the broker into the standard Quote format.
   * @param {any} raw 
   * @returns {Quote}
   */
  normalizeQuote(raw) {
    throw new Error('Method not implemented: normalizeQuote');
  }

  /**
   * Fetches quote from broker API
   * @param {string} instrumentId 
   * @returns {Promise<Quote|null>}
   */
  async getQuote(instrumentId) {
    throw new Error('Method not implemented: getQuote');
  }

  /**
   * Fetches option chain from broker API
   * @param {string} underlyingId 
   * @param {string|null} expiry 
   * @returns {Promise<OptionChain|null>}
   */
  async getOptionChain(underlyingId, expiry) {
    throw new Error('Method not implemented: getOptionChain');
  }

  /**
   * Fetches historical candles from broker API
   */
  async getCandles(instrumentId, resolution, startTs, endTs) {
    throw new Error('Method not implemented: getCandles');
  }
}

module.exports = BrokerAdapter;
