const MarketDataSource = require('./MarketDataSource');
const BrokerCredentialModel = require('../../model/BrokerCredentialModel');
const DhanAdapter = require('./adapters/DhanAdapter');
const ZerodhaAdapter = require('./adapters/ZerodhaAdapter');
const KotakAdapter = require('./adapters/KotakAdapter');

class BrokerSource extends MarketDataSource {
  constructor(tenantId) {
    super();
    this.tenantId = tenantId;
    this.adapter = null; // Will be resolved dynamically
  }

  async initAdapter() {
    if (this.adapter) return this.adapter;
    
    const creds = await BrokerCredentialModel.findOne({ tenantId: this.tenantId }).lean();
    if (!creds) {
      throw new Error(`No broker credentials found for tenant: ${this.tenantId}`);
    }

    switch (creds.provider) {
      case 'DHAN':
        this.adapter = new DhanAdapter(creds);
        break;
      case 'ZERODHA':
        this.adapter = new ZerodhaAdapter(creds);
        break;
      case 'KOTAK':
        this.adapter = new KotakAdapter(creds);
        break;
      default:
        throw new Error(`Unsupported broker provider: ${creds.provider}`);
    }
    return this.adapter;
  }

  async getQuote(instrumentId) {
    const adapter = await this.initAdapter();
    return adapter.getQuote(instrumentId);
  }

  async getOptionChain(underlyingId, expiry) {
    const adapter = await this.initAdapter();
    return adapter.getOptionChain(underlyingId, expiry);
  }

  async getCandles(instrumentId, resolution, startTs, endTs) {
    const adapter = await this.initAdapter();
    return adapter.getCandles(instrumentId, resolution, startTs, endTs);
  }
}

module.exports = BrokerSource;
