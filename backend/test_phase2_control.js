/**
 * test_phase2_control.js
 * Comprehensive automated verification script for Phase 2:
 * 1. Global Market Control Engine (Redis global state, mode switcher, halt/resume)
 * 2. Emergency Halt System (cancels orders, auto-square-off MIS positions)
 * 3. Order Engine & API halt enforcement (rejection with HTTP 403)
 * 4. Safe Impersonation Token generation & restrictions
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const BASE_URL = 'http://localhost:8080';
const MONGO_URI = process.env.DATABASE_URL || process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zerodha';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'secret';

async function runTests() {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 2 E2E VERIFICATION TEST');
  console.log('====================================================');

  let superAdminToken = null;
  let testInstituteId = null;

  // 1. Connect to Mongo to fetch or seed super-admin and an institute
  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const { UserModel } = require('./model/UserModel');
  const { InstituteModel } = require('./model/InstituteModel');

  const superAdmin = await UserModel.findOne({ role: 'SUPER_ADMIN' });
  if (!superAdmin) {
    throw new Error('No SUPER_ADMIN user found in DB. Run seedSuperAdmin.js first.');
  }
  console.log(`✓ Found Super Admin: ${superAdmin.email} (${superAdmin._id})`);

  // Sign token for super admin
  superAdminToken = jwt.sign(
    {
      sub: superAdmin._id.toString(),
      userId: superAdmin.userId || superAdmin._id.toString(),
      email: superAdmin.email,
      role: superAdmin.role,
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const institute = await InstituteModel.findOne();
  if (!institute) {
    throw new Error('No institute found in DB.');
  }
  testInstituteId = institute._id;
  console.log(`✓ Found Test Institute: ${institute.name} (${testInstituteId})`);

  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${superAdminToken}`,
    },
  });

  // ── TEST 1: Public /market/state ──
  console.log('\n--- [TEST 1] Query Public Market State ---');
  const stateRes1 = await axios.get(`${BASE_URL}/market/state`);
  console.log('Market State:', stateRes1.data);
  if (!stateRes1.data.mode) throw new Error('Failed to get market state mode');
  console.log('✓ TEST 1 PASSED');

  // ── TEST 2: Super Admin Switch Mode to SYNTHETIC ──
  console.log('\n--- [TEST 2] Switch Mode to SYNTHETIC ---');
  const modeRes = await client.post('/super-admin/market/mode', { mode: 'SYNTHETIC' });
  console.log('Switch Mode Response:', modeRes.data);
  if (modeRes.data.mode !== 'SYNTHETIC') throw new Error('Failed to switch to SYNTHETIC mode');
  console.log('✓ TEST 2 PASSED');

  // ── TEST 3: Super Admin Halt Market ──
  console.log('\n--- [TEST 3] Halt Market ---');
  const haltRes = await client.post('/super-admin/market/halt', {
    reason: 'Investor Demonstration Circuit Breaker Activated',
  });
  console.log('Halt Response:', haltRes.data);
  if (!haltRes.data.isHalted) throw new Error('Market was not halted');
  console.log('✓ TEST 3 PASSED');

  // ── TEST 4: Verify Order Placement is BLOCKED during Halt ──
  console.log('\n--- [TEST 4] Attempt Order Placement While Halted ---');
  try {
    await axios.post(`${BASE_URL}/newOrder`, {
      stockSymbol: 'RELIANCE',
      qty: 1,
      price: 2500,
      mode: 'MARKET',
      side: 'BUY',
      productType: 'CNC',
    }, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    throw new Error('Order SHOULD HAVE BEEN REJECTED with 403, but succeeded!');
  } catch (err) {
    if (err.response && err.response.status === 403) {
      console.log('✓ Order correctly blocked by Trading Engine with 403 Forbidden:', err.response.data);
    } else {
      throw err;
    }
  }
  console.log('✓ TEST 4 PASSED');

  // ── TEST 5: Emergency Halt with Auto-Square-Off MIS ──
  console.log('\n--- [TEST 5] Emergency Halt with Auto-Square-Off MIS ---');
  const emHaltRes = await client.post('/super-admin/market/emergency-halt', {
    reason: 'Emergency Feed Failure Simulation',
    autoSquareOffMIS: true,
  });
  console.log('Emergency Halt Response:', emHaltRes.data);
  if (!emHaltRes.data.isHalted) throw new Error('Emergency Halt failed');
  console.log('✓ TEST 5 PASSED');

  // ── TEST 6: Resume Market ──
  console.log('\n--- [TEST 6] Resume Market ---');
  const resumeRes = await client.post('/super-admin/market/resume');
  console.log('Resume Response:', resumeRes.data);
  if (resumeRes.data.isHalted !== false) throw new Error('Failed to resume market');
  console.log('✓ TEST 6 PASSED');

  // ── TEST 7: Reset Mode to LIVE ──
  console.log('\n--- [TEST 7] Reset Mode to LIVE ---');
  const liveModeRes = await client.post('/super-admin/market/mode', { mode: 'LIVE' });
  console.log('Reset Mode Response:', liveModeRes.data);
  if (liveModeRes.data.mode !== 'LIVE') throw new Error('Failed to reset mode to LIVE');
  console.log('✓ TEST 7 PASSED');

  // ── TEST 8: Impersonation Token Creation (Support Mode) ──
  console.log('\n--- [TEST 8] Safe Impersonation Token Creation ---');
  const impRes = await client.post(`/super-admin/impersonate/${testInstituteId}`);
  const token = impRes.data.token || impRes.data.accessToken;
  console.log('Impersonation API Response:', {
    tokenLength: token?.length,
    user: impRes.data.user,
    expiresIn: impRes.data.expiresIn,
  });

  const decoded = jwt.decode(token);
  console.log('Decoded Impersonation JWT Payload:', {
    userId: decoded.userId,
    role: decoded.role,
    isImpersonating: decoded.isImpersonating,
    impersonatedBy: decoded.impersonatedBy,
    instituteId: decoded.instituteId,
  });

  if (!decoded.isImpersonating) throw new Error('Token missing isImpersonating flag');
  if (String(decoded.impersonatedBy) !== String(superAdmin._id)) throw new Error('impersonatedBy mismatch');
  console.log('✓ TEST 8 PASSED');

  // ── TEST 9: Restrict Impersonation Middleware Test ──
  console.log('\n--- [TEST 9] Verify Impersonation Security Restrictions ---');
  const { restrictImpersonation } = require('./middleware/restrictImpersonation');
  let rejected = false;
  const mockReq = {
    user: {
      _id: decoded.userId,
      role: 'INSTITUTE_ADMIN',
      isImpersonating: true,
      impersonatedBy: decoded.impersonatedBy,
    },
  };
  const mockRes = {
    status: (code) => ({
      json: (data) => {
        if (code === 403) rejected = true;
        console.log(`Middleware rejection received (${code}):`, data.message);
      },
    }),
  };
  const mockNext = () => {
    throw new Error('Dangerous action should NOT have called next()!');
  };

  restrictImpersonation('delete institute')(mockReq, mockRes, mockNext);
  if (!rejected) throw new Error('restrictImpersonation failed to block destructive action');
  console.log('✓ TEST 9 PASSED');

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 2 TESTS PASSED PERFECTLY (9/9)');
  console.log('====================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Test failed with error:', err.message, err.response?.data || '');
  process.exit(1);
});
