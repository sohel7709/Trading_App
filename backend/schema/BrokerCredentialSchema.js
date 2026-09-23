'use strict';

const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../services/cryptoService');

const BrokerCredentialSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  instituteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', index: true },
  provider: { type: String, enum: ['ZERODHA', 'DHAN', 'KOTAK'], required: true },
  apiKey: { type: String, required: true }, // Client ID (Dhan) / Consumer Key (Kotak)
  accessToken: { type: String }, // Access Token (Dhan)
  consumerSecret: { type: String }, // Kotak Neo Consumer Secret
  mobileNo: { type: String }, // Kotak Neo Registered Mobile
  password: { type: String }, // Kotak Neo Password
  mpin: { type: String }, // Kotak Neo MPIN
  pin: { type: String }, // Dhan Account PIN (6-digit, encrypted)
  totpSecret: { type: String }, // Dhan TOTP Secret Key (Base32, encrypted)
  refreshToken: { type: String },
  expiresAt: { type: Date },
  isActiveProvider: { type: Boolean, default: false },
  autoRenew: { type: Boolean, default: true }, // Automatic 7:00 AM IST daily token renewal
  lastAutoRenewAt: { type: Date },
  lastAutoRenewStatus: { type: String, enum: ['SUCCESS', 'FAILED', 'IDLE'], default: 'IDLE' },
  lastAutoRenewError: { type: String, default: '' },
  // Connection lifecycle
  status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'INVALID', 'NOT_SET', 'CONFIGURED'], default: 'NOT_SET' },
  lastConnectedAt: { type: Date },
  lastError: { type: String, default: '' },
}, { timestamps: true });

BrokerCredentialSchema.index({ tenantId: 1, provider: 1 }, { unique: true });

// Auto-encrypt sensitive credentials before saving
BrokerCredentialSchema.pre('save', function(next) {
  const sensitiveFields = ['apiKey', 'accessToken', 'consumerSecret', 'password', 'mpin', 'pin', 'totpSecret', 'refreshToken'];
  for (const field of sensitiveFields) {
    if (this.isModified(field) && this[field]) {
      this[field] = encrypt(this[field]);
    }
  }
  next();
});

// Helper instance method to retrieve decrypted credential object
BrokerCredentialSchema.methods.getDecrypted = function() {
  return {
    tenantId: this.tenantId,
    instituteId: this.instituteId,
    provider: this.provider,
    apiKey: decrypt(this.apiKey),
    accessToken: decrypt(this.accessToken),
    consumerSecret: decrypt(this.consumerSecret),
    mobileNo: this.mobileNo,
    password: decrypt(this.password),
    mpin: decrypt(this.mpin),
    pin: decrypt(this.pin),
    totpSecret: decrypt(this.totpSecret),
    refreshToken: decrypt(this.refreshToken),
    expiresAt: this.expiresAt,
    isActiveProvider: this.isActiveProvider,
    autoRenew: this.autoRenew !== false,
    lastAutoRenewAt: this.lastAutoRenewAt,
    lastAutoRenewStatus: this.lastAutoRenewStatus,
    lastAutoRenewError: this.lastAutoRenewError,
    status: this.status,
    lastConnectedAt: this.lastConnectedAt,
    lastError: this.lastError,
  };
};

module.exports = BrokerCredentialSchema;
