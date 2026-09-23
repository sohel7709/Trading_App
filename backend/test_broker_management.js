'use strict';

const mongoose = require('mongoose');
const BrokerCredentialModel = require('./model/BrokerCredentialModel');
const kotakNeoService = require('./kotakNeoService');
const dhanDataService = require('./dhanDataService');

const MONGO_URI = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/zerodha';

(async () => {
  console.log('=== Broker Credential Management Test ===');
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB connected successfully.');

    const tenantId = 'TEST_TENANT';

    // 1. Save Dhan credentials
    await BrokerCredentialModel.findOneAndUpdate(
      { tenantId, provider: 'DHAN' },
      { $set: { apiKey: 'DHAN_CLIENT_123', accessToken: 'DHAN_TOKEN_456', isActiveProvider: true } },
      { upsert: true }
    );
    console.log('Saved Dhan credentials for TEST_TENANT');

    // 2. Save Kotak Neo credentials and switch active provider
    await BrokerCredentialModel.updateMany({ tenantId }, { $set: { isActiveProvider: false } });
    await BrokerCredentialModel.findOneAndUpdate(
      { tenantId, provider: 'KOTAK' },
      {
        $set: {
          apiKey: 'KOTAK_KEY_123',
          consumerSecret: 'KOTAK_SECRET_456',
          mobileNo: '9876543210',
          password: 'KOTAK_PASSWORD',
          mpin: '1234',
          isActiveProvider: true,
        }
      },
      { upsert: true }
    );
    console.log('Saved Kotak Neo credentials and activated for TEST_TENANT');

    // 3. Verify active provider lookup
    const active = await BrokerCredentialModel.findOne({ tenantId, isActiveProvider: true }).lean();
    console.log('Active provider in DB:', active?.provider);

    // Clean up test data
    await BrokerCredentialModel.deleteMany({ tenantId });
    console.log('Cleaned up test tenant credentials.');

  } catch (e) {
    console.warn('Test Error:', e.message);
  } finally {
    await mongoose.disconnect();
    console.log('=== Broker Management Test Complete ===');
  }
})();
