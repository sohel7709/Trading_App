const MarketDataSource = require('./MarketDataSource');
const ReplaySource = require('./ReplaySource');
const BrokerSource = require('./BrokerSource');
const InstituteModel = require('../../model/InstituteModel');

class MarketDataFactory {
  /**
   * Resolve the active MarketDataSource for a given tenant.
   * @param {string} tenantId 
   * @returns {Promise<MarketDataSource>}
   */
  static async getSourceForTenant(tenantId) {
    if (!tenantId) {
      throw new Error('tenantId is required to resolve MarketDataSource');
    }

    const tenant = await InstituteModel.findById(tenantId).select('settings').lean();
    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const mode = tenant.settings?.marketDataMode || 'REPLAY';

    if (mode === 'LIVE_BROKER') {
      return new BrokerSource(tenantId);
    }

    // Default to REPLAY
    return new ReplaySource(tenantId);
  }
}

module.exports = MarketDataFactory;
