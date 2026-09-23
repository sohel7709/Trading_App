require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { UserSchema } = require('./schema/UserSchema');

const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);

async function seedUser() {
  await mongoose.connect(process.env.DATABASE_URL);
  console.log('Connected to MongoDB');

  await UserModel.deleteMany({});

  const passwordHash = await bcrypt.hash('Sohel@2024', 12);
  
  // 1. Admin
  const admin = await UserModel.create({
    userId: 'ADMIN123',
    email: 'admin@buildsoft.com',
    name: 'Sohel Admin',
    passwordHash,
    role: 'ADMIN',
    isVerified: true,
    isActive: true,
  });

  // 2. Instructor
  const instructor = await UserModel.create({
    userId: 'INST123',
    email: 'instructor@institute.edu',
    name: 'Ms. Rao (Instructor)',
    passwordHash,
    role: 'INSTRUCTOR',
    instituteCode: 'SRM-2026',
    isVerified: true,
    isActive: true,
  });

  // 3. Student
  const student = await UserModel.create({
    userId: 'STUD123',
    email: 'student@institute.edu',
    name: 'Aarav (Student)',
    passwordHash,
    role: 'STUDENT',
    instituteCode: 'SRM-2026',
    isVerified: true,
    isActive: true,
  });

  console.log(`\n✓ Seed complete. Use these credentials to login:\n`);
  console.log(`=== ADMIN (Web Dashboard: /admin/login) ===`);
  console.log(`  Email    : ${admin.email}`);
  console.log(`  Password : Sohel@2024\n`);
  
  console.log(`=== INSTRUCTOR (Web Dashboard: /login) ===`);
  console.log(`  Code     : SRM-2026`);
  console.log(`  Email    : ${instructor.email}`);
  console.log(`  Password : Sohel@2024\n`);

  console.log(`=== STUDENT (Mobile App) ===`);
  console.log(`  Code     : SRM-2026`);
  console.log(`  Email    : ${student.email}`);
  console.log(`  Password : Sohel@2024\n`);

  await mongoose.disconnect();
  process.exit(0);
}

seedUser().catch(err => { console.error(err); process.exit(1); });
