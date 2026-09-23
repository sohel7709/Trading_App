/**
 * seedSuperAdmin.js
 * Run once to create the platform's Super Admin user.
 *
 * Usage:
 *   node backend/seedSuperAdmin.js
 *
 * Credentials are read from environment or hardcoded defaults below.
 * Change them before running in production!
 */
require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { UserSchema } = require('./schema/UserSchema');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

// ── Configurable credentials ─────────────────────────────────────────────
const SUPER_ADMIN_EMAIL    = process.env.SUPER_ADMIN_EMAIL    || 'superadmin@tradelab.io';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'TradeLab@2024!';
const SUPER_ADMIN_NAME     = process.env.SUPER_ADMIN_NAME     || 'Platform Super Admin';
const SUPER_ADMIN_USER_ID  = 'SUPERADMIN01';

async function seed() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set. Check your backend/.env file.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const UserModel = mongoose.model('User', UserSchema);

  const existing = await UserModel.findOne({
    $or: [{ userId: SUPER_ADMIN_USER_ID }, { email: SUPER_ADMIN_EMAIL }]
  });

  if (existing) {
    console.log(`ℹ️  Super Admin already exists: ${existing.email} (role: ${existing.role})`);
    if (existing.role !== 'SUPER_ADMIN') {
      existing.role = 'SUPER_ADMIN';
      await existing.save();
      console.log('✅ Role updated to SUPER_ADMIN');
    }
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
  const superAdmin = await UserModel.create({
    userId: SUPER_ADMIN_USER_ID,
    email: SUPER_ADMIN_EMAIL,
    name: SUPER_ADMIN_NAME,
    passwordHash,
    role: 'SUPER_ADMIN',
    instituteCode: '',
    isActive: true,
  });

  console.log('🎉 Super Admin created successfully!');
  console.log('─'.repeat(40));
  console.log(`  Email   : ${superAdmin.email}`);
  console.log(`  Password: ${SUPER_ADMIN_PASSWORD}`);
  console.log(`  UserId  : ${superAdmin.userId}`);
  console.log(`  Role    : ${superAdmin.role}`);
  console.log('─'.repeat(40));
  console.log('⚠️  Save these credentials securely. Change the password after first login.');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
