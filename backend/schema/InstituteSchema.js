const { Schema } = require('mongoose');

const InstituteSchema = new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true }, // e.g. "BULLS01"
  
  // Branding Config (INST-02)
  branding: {
    logoUrl: { type: String },
    primaryColor: { type: String, default: '#387ed1' },
    appName: { type: String, default: 'Trading Simulator' }
  },

  // Market Data & Broker Settings
  settings: {
    marketDataMode: { type: String, enum: ['LIVE_BROKER', 'SIMULATED'], default: 'SIMULATED' },
    subscribedSymbols: [{ type: String }], // custom watchlist for this institute
    tickIntervalMs: { type: Number, default: 1000 }, // data refresh interval
  },
  
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

  // SaaS Plan & Quotas (STEP 1)
  plan: {
    type: String,
    enum: ['STARTER', 'GROWTH', 'ENTERPRISE'],
    default: 'STARTER',
    index: true,
  },
  quota: {
    maxStudents: { type: Number, default: 50 },
    maxBatches: { type: Number, default: 3 },
  },
  usage: {
    currentStudents: { type: Number, default: 0 },
    currentBatches: { type: Number, default: 0 },
  },
  features: {
    replay: { type: Boolean, default: false },
    optionsTrading: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
    customBranding: { type: Boolean, default: false },
    brokerIntegration: { type: Boolean, default: false },
  },
}, { timestamps: true });

module.exports = { InstituteSchema };

