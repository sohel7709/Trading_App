/**
 * @typedef {Object} Quote
 * @property {string} instrumentId - Unique identifier (e.g. symbol)
 * @property {number} ltpPaise - Last traded price in paise (integer to avoid float math issues)
 * @property {number} ltp - Last traded price in rupees
 * @property {number} previousClose - Previous close price
 * @property {number} ts - Timestamp of the quote (Unix epoch)
 */

/**
 * @typedef {Object} OptionSide
 * @property {number} ltp
 * @property {number} oi
 * @property {number} iv
 * @property {number} volume
 * @property {number} change
 */

/**
 * @typedef {Object} OptionStrike
 * @property {number} strike
 * @property {boolean} isATM
 * @property {OptionSide} ce
 * @property {OptionSide} pe
 */

/**
 * @typedef {Object} OptionChain
 * @property {string} indexName
 * @property {string} expiry
 * @property {number} underlyingPrice
 * @property {OptionStrike[]} rows
 * @property {string} source
 * @property {number} ts
 */

/**
 * Base Interface for Market Data Sources (Replay, Broker, Mock)
 * 
 * Implementations MUST NOT throw synchronous errors for temporary network failures.
 * They should return null or a standardized error object.
 */
class MarketDataSource {
  /**
   * Fetch quote for a given instrument.
   * @param {string} instrumentId 
   * @returns {Promise<Quote|null>}
   */
  async getQuote(instrumentId) {
    throw new Error('Method not implemented: getQuote');
  }

  /**
   * Fetch option chain for a given underlying and expiry.
   * @param {string} underlyingId 
   * @param {string|null} expiry (If null, fetch nearest expiry)
   * @returns {Promise<OptionChain|null>}
   */
  async getOptionChain(underlyingId, expiry) {
    throw new Error('Method not implemented: getOptionChain');
  }

  /**
   * Fetch historical candles for an instrument (mainly for Replay/Charts).
   * @param {string} instrumentId 
   * @param {string} resolution 
   * @param {number} startTs 
   * @param {number} endTs 
   * @returns {Promise<Array>}
   */
  async getCandles(instrumentId, resolution, startTs, endTs) {
    throw new Error('Method not implemented: getCandles');
  }
  
  /**
   * Optional: Hook to initialize/connect the source (e.g. connect websockets)
   */
  async connect() {}

  /**
   * Optional: Hook to disconnect the source
   */
  async disconnect() {}
}

module.exports = MarketDataSource;
