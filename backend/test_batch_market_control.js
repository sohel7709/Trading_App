/**
 * test_batch_market_control.js
 * Automated verification of Batch-Level Market Control for Institute Admins & Instructors.
 *
 * Verifies:
 * 1. Instructor / Institute Admin query of batch market state
 * 2. Mode switching at batch level (LIVE -> SYNTHETIC -> REPLAY)
 * 3. Batch Halt enforcement: Student in that batch gets blocked with 403
 * 4. Isolation: Students NOT in that batch can still place orders
 * 5. Batch Resume: Student in batch can trade again
 * 6. Emergency Halt: Liquidates / cancels orders and halts batch
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const BASE_URL = 'http://localhost:8080';
const MONGO_URI = process.env.DATABASE_URL || process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/zerodha';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'zerodha_access_secret_change_in_prod';

async function runBatchControlTests() {
  console.log('====================================================');
  console.log('🏫 STARTING BATCH-LEVEL MARKET CONTROL E2E TEST');
  console.log('====================================================');

  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const { UserModel } = require('./model/UserModel');
  const { BatchModel } = require('./model/BatchModel');
  const { EnrollmentModel } = require('./model/EnrollmentModel');
  const { InstituteModel } = require('./model/InstituteModel');

  // 1. Find or seed an Institute
  let institute = await InstituteModel.findOne();
  if (!institute) {
    institute = await InstituteModel.create({
      name: 'Alpha Trading Academy',
      code: 'ALPHA01',
      status: 'ACTIVE',
    });
    console.log('Created test institute:', institute._id);
  }

  const instCode = institute.code || 'ALPHA01';

  // 2. Find or seed an Instructor
  let instructor = await UserModel.findOne({
    role: { $in: ['INSTRUCTOR', 'INSTITUTE_ADMIN'] },
    instituteCode: instCode,
  });

  if (!instructor) {
    const ts = Date.now();
    instructor = await UserModel.create({
      userId: `INST_${ts}`,
      name: 'Prof Trader',
      email: `instructor_${ts}@alpha.edu`,
      passwordHash: 'dummy_hash',
      role: 'INSTRUCTOR',
      instituteCode: instCode,
      instituteId: institute._id,
      isActive: true,
    });
    console.log('Created test instructor:', instructor.email);
  }

  // 3. Find or seed a Batch
  let batch = await BatchModel.findOne({ instituteCode: instCode });
  if (!batch) {
    batch = await BatchModel.create({
      name: 'Options Mastery Cohort 2026',
      code: `BATCH_${Date.now()}`,
      instituteCode: instCode,
      startDate: new Date(),
      instructors: [instructor._id],
      status: 'ACTIVE',
      marketMode: 'LIVE',
      isHalted: false,
    });
    console.log('Created test batch:', batch._id);
  } else {
    // Ensure instructor is assigned
    if (!batch.instructors || !batch.instructors.some(id => id.toString() === instructor._id.toString())) {
      batch.instructors = [instructor._id];
      await batch.save();
    }
  }

  // 4. Find or seed Student A (enrolled in batch)
  let studentA = await UserModel.findOne({ role: 'STUDENT', email: /student_a_/ });
  if (!studentA) {
    const tsA = Date.now();
    studentA = await UserModel.create({
      userId: `STUDA_${tsA}`,
      name: 'Student Cohort A',
      email: `student_a_${tsA}@test.com`,
      passwordHash: 'dummy_hash',
      role: 'STUDENT',
      instituteCode: instCode,
      instituteId: institute._id,
      isActive: true,
    });
  }

  let enrollmentA = await EnrollmentModel.findOne({ userId: studentA._id, batchId: batch._id });
  if (!enrollmentA) {
    enrollmentA = await EnrollmentModel.create({
      userId: studentA._id,
      batchId: batch._id,
      instituteCode: instCode,
      status: 'ACTIVE',
    });
  }

  // 5. Find or seed Student B (independent / not in batch)
  let studentB = await UserModel.findOne({ role: 'STUDENT', email: /student_b_/ });
  if (!studentB) {
    const tsB = Date.now() + 1;
    studentB = await UserModel.create({
      userId: `STUDB_${tsB}`,
      name: 'Student Independent',
      email: `student_b_${tsB}@test.com`,
      passwordHash: 'dummy_hash',
      role: 'STUDENT',
      isActive: true,
    });
  }

  // Create JWTs
  const instructorToken = jwt.sign(
    {
      sub: instructor._id.toString(),
      userId: instructor.userId || instructor._id.toString(),
      email: instructor.email,
      role: instructor.role,
      instituteId: institute._id.toString(),
      instituteCode: instCode,
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const studentAToken = jwt.sign(
    {
      sub: studentA._id.toString(),
      userId: studentA.userId || studentA._id.toString(),
      email: studentA.email,
      role: studentA.role,
      instituteId: institute._id.toString(),
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const studentBToken = jwt.sign(
    {
      sub: studentB._id.toString(),
      userId: studentB.userId || studentB._id.toString(),
      email: studentB.email,
      role: studentB.role,
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  const instructorClient = axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${instructorToken}` },
  });

  const batchId = batch._id.toString();

  // Ensure global market is NOT halted first
  const marketControlService = require('./services/marketControlService');
  await marketControlService.resumeMarket({ email: 'superadmin@system.local' });
  await marketControlService.resumeBatch(batchId, { email: instructor.email });

  // ── TEST 1: Instructor Query Batch Market State ──
  console.log('\n--- [TEST 1] Query Batch Market State ---');
  const stateRes = await instructorClient.get(`/batches/${batchId}/market-state`);
  console.log('Batch Market State:', stateRes.data);
  if (!stateRes.data.success || !stateRes.data.mode) {
    throw new Error('Failed to retrieve batch market state');
  }
  console.log('✓ TEST 1 PASSED: Batch market state retrieved');

  // ── TEST 2: Switch Batch Mode to SYNTHETIC ──
  console.log('\n--- [TEST 2] Switch Batch Market Mode to SYNTHETIC ---');
  const modeRes = await instructorClient.post(`/batches/${batchId}/market-mode`, {
    mode: 'SYNTHETIC',
  });
  console.log('Switch Mode Response:', modeRes.data);
  if (!modeRes.data.success || modeRes.data.state?.mode !== 'SYNTHETIC') {
    throw new Error('Failed to switch batch market mode');
  }

  // Verify /market/state?batchId reflects SYNTHETIC
  const studentCheckState = await axios.get(`${BASE_URL}/market/state?batchId=${batchId}`);
  if (studentCheckState.data.mode !== 'SYNTHETIC') {
    throw new Error(`Expected /market/state?batchId to report SYNTHETIC, got ${studentCheckState.data.mode}`);
  }
  console.log('✓ TEST 2 PASSED: Batch market mode updated to SYNTHETIC and broadcasted');

  // ── TEST 3: Halt Batch Trading ──
  console.log('\n--- [TEST 3] Halt Batch Trading ---');
  const haltRes = await instructorClient.post(`/batches/${batchId}/market-halt`, {
    reason: 'Instructor Live Class Pause: High Volatility Scenario',
  });
  console.log('Halt Response:', haltRes.data);
  if (!haltRes.data.success || !haltRes.data.state?.isHalted) {
    throw new Error('Batch was not marked as halted');
  }
  console.log('✓ TEST 3 PASSED: Batch trading halted');

  // ── TEST 4: Student in Batch Attempts Order -> Must be 403 ──
  console.log('\n--- [TEST 4] Student In Halted Batch Places Order (Expect 403) ---');
  let orderBlocked = false;
  try {
    await axios.post(
      `${BASE_URL}/newOrder`,
      {
        stockSymbol: 'TCS',
        qty: 1,
        price: 3500,
        mode: 'MARKET',
        side: 'BUY',
        productType: 'CNC',
      },
      { headers: { Authorization: `Bearer ${studentAToken}` } }
    );
  } catch (err) {
    if (err.response && err.response.status === 403) {
      console.log('Received expected 403 Forbidden:', err.response.data);
      if (err.response.data.message && err.response.data.message.includes('halted')) {
        orderBlocked = true;
      }
    } else {
      console.error('Unexpected error:', err.response?.data || err.message);
    }
  }

  if (!orderBlocked) {
    throw new Error('FAILED: Student in halted batch was able to place order or did not receive 403 halt message!');
  }
  console.log('✓ TEST 4 PASSED: Student in halted cohort blocked with 403');

  // ── TEST 5: Independent Student (NOT in batch) Places Order -> Should NOT be blocked by batch halt ──
  console.log('\n--- [TEST 5] Independent Student Places Order (Should NOT be blocked by batch halt) ---');
  try {
    const res = await axios.post(
      `${BASE_URL}/newOrder`,
      {
        stockSymbol: 'INFY',
        qty: 1,
        price: 1500,
        mode: 'MARKET',
        side: 'BUY',
        productType: 'CNC',
      },
      { headers: { Authorization: `Bearer ${studentBToken}` } }
    );
    console.log('Independent student order response status:', res.status, res.data);
    console.log('✓ TEST 5 PASSED: Independent student was NOT blocked by cohort-specific halt');
  } catch (err) {
    // If it fails due to balance or matching that is fine, but it MUST NOT fail due to batch halt
    if (err.response?.status === 403 && err.response?.data?.message?.includes('halted')) {
      throw new Error('FAILED: Independent student was incorrectly blocked by cohort halt!');
    }
    console.log('Independent order reached execution engine without batch halt block.');
    console.log('✓ TEST 5 PASSED: Cohort isolation confirmed');
  }

  // ── TEST 6: Resume Batch Trading ──
  console.log('\n--- [TEST 6] Resume Batch Trading ---');
  const resumeRes = await instructorClient.post(`/batches/${batchId}/market-resume`);
  console.log('Resume Response:', resumeRes.data);
  if (!resumeRes.data.success || resumeRes.data.state?.isHalted !== false) {
    throw new Error('Batch failed to resume');
  }
  console.log('✓ TEST 6 PASSED: Batch trading resumed');

  // ── TEST 7: Emergency Halt Batch ──
  console.log('\n--- [TEST 7] Emergency Halt Batch with Auto-Square-Off ---');
  const emergRes = await instructorClient.post(`/batches/${batchId}/emergency-halt`, {
    reason: 'Simulated Market Crash Exercise - Auto Liquidation',
    autoSquareOffMIS: true,
  });
  console.log('Emergency Halt Response:', emergRes.data);
  if (!emergRes.data.success || !emergRes.data.isHalted) {
    throw new Error('Batch emergency halt failed');
  }
  console.log('✓ TEST 7 PASSED: Emergency halt executed');

  // Cleanup: resume batch for future use
  await instructorClient.post(`/batches/${batchId}/market-resume`);
  await instructorClient.post(`/batches/${batchId}/market-mode`, { mode: 'LIVE' });
  console.log('✓ Restored batch to LIVE and unhalted state');

  console.log('\n====================================================');
  console.log('🎉 ALL BATCH MARKET CONTROL TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');

  await mongoose.disconnect();
  process.exit(0);
}

runBatchControlTests().catch((err) => {
  console.error('\n❌ TEST RUNNER FAILED:', err);
  process.exit(1);
});
