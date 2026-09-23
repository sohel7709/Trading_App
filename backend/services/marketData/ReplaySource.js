const MarketDataSource = require('./MarketDataSource');
const CandleModel = require('../../model/CandleModel');
const OptionChainSnapModel = require('../../model/OptionChainSnapModel');

class ReplaySource extends MarketDataSource {
  constructor(tenantId) {
    super();
    this.tenantId = tenantId;
  }

  async getQuote(instrumentId) {
    const clockTs = await this.getCurrentClockTs();
    if (!clockTs) return null;

    // Find the closest candle AT OR BEFORE the clock timestamp
    const candle = await CandleModel.findOne({
      instrumentId,
      ts: { $lte: clockTs }
    }).sort({ ts: -1 }).lean();

    if (!candle) return null;

    return {
      instrumentId: candle.instrumentId,
      ltpPaise: Math.round(candle.close * 100),
      ltp: candle.close,
      previousClose: candle.open, // Simplified for MVP
      ts: candle.ts
    };
  }

  async getOptionChain(underlyingId, expiry) {
    const clockTs = await this.getCurrentClockTs();
    if (!clockTs) return null;

    const query = { indexName: underlyingId, ts: { $lte: clockTs } };
    if (expiry) query.expiry = expiry;

    const snap = await OptionChainSnapModel.findOne(query).sort({ ts: -1 }).lean();
    if (!snap) return null;

    return {
      indexName: snap.indexName,
      expiry: snap.expiry,
      underlyingPrice: snap.underlyingPrice,
      rows: snap.rows,
      source: 'REPLAY',
      ts: snap.ts
    };
  }

  async getCandles(instrumentId, resolution, startTs, endTs) {
    return CandleModel.find({
      instrumentId,
      resolution,
      ts: { $gte: startTs, $lte: endTs }
    }).sort({ ts: 1 }).lean();
  }

  async getCurrentClockTs() {
    return require('./ReplayClockService').getCurrentTs(this.tenantId);
  }
}

module.exports = ReplaySource;
