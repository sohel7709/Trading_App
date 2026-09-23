const express = require('express');
const bcrypt = require('bcryptjs');
const { InstituteModel } = require('../model/InstituteModel');
const { BranchModel } = require('../model/BranchModel');
const { UserModel } = require('../model/UserModel');
const { BatchModel } = require('../model/BatchModel');
const { EnrollmentModel } = require('../model/EnrollmentModel');
const { WalletModel } = require('../model/WalletModel');
const { SessionModel } = require('../model/SessionModel');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

async function getInstituteCode(user) {
  if (user?.instituteCode) return user.instituteCode;
  if (user?.instituteId) {
    const inst = await InstituteModel.findById(user.instituteId);
    if (inst?.code) return inst.code;
  }
  if (user?._id) {
    const u = await UserModel.findById(user._id);
    if (u?.instituteCode) return u.instituteCode;
  }
  return 'ADMIN';
}

// ── GET /institute/stats ───────────────────────────────────────────────────
router.get('/stats', requireRole(['INSTITUTE_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    let code = req.user.instituteCode;
    let institute = null;
    if (code) {
      institute = await InstituteModel.findOne({ code });
    } else if (req.user.instituteId) {
      institute = await InstituteModel.findById(req.user.instituteId);
      if (institute) {
        code = institute.code;
        await UserModel.findByIdAndUpdate(req.user._id, { instituteCode: code });
      }
    }

    const [students, batches, instructors] = await Promise.all([
      UserModel.countDocuments({ instituteCode: code, role: 'STUDENT' }),
      BatchModel.countDocuments({ instituteCode: code }),
      UserModel.countDocuments({ instituteCode: code, role: 'INSTRUCTOR' }),
    ]);
    res.json({ 
      students, 
      batches, 
      instructors, 
      institute: institute ? { name: institute.name, code: institute.code } : null 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching stats', error: err.message });
  }
});

// ── GET /institute/instructors ─────────────────────────────────────────────
router.get('/instructors', requireRole(['INSTITUTE_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const code = req.user.instituteCode;
    const instructors = await UserModel.find(
      { instituteCode: code, role: 'INSTRUCTOR' },
      'userId name email isActive createdAt'
    ).sort({ createdAt: -1 });
    res.json(instructors);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching instructors', error: err.message });
  }
});

// ── POST /institute/instructor ─────────────────────────────────────────────
router.post('/instructor', requireRole(['INSTITUTE_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'name, email and password are required' });

    const code = req.user.instituteCode;
    const existing = await UserModel.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = `${code}I${Date.now().toString().slice(-6)}`;

    const instructor = await UserModel.create({
      userId,
      email: email.toLowerCase(),
      name,
      passwordHash,
      role: 'INSTRUCTOR',
      instituteCode: code,
      instituteId: req.user.instituteId || null,
      isActive: true,
    });

    res.status(201).json({
      _id: instructor._id,
      userId: instructor.userId,
      name: instructor.name,
      email: instructor.email,
      role: instructor.role,
      isActive: instructor.isActive,
      createdAt: instructor.createdAt,
    });
  } catch (err) {
    console.error('[Institute] create instructor error:', err);
    res.status(500).json({ message: 'Error creating instructor', error: err.message });
  }
});

// ── PATCH /institute/instructors/:id/status ────────────────────────────────
router.patch('/instructors/:id/status', requireRole(['INSTITUTE_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await UserModel.findOneAndUpdate(
      { _id: req.params.id, instituteCode: req.user.instituteCode, role: 'INSTRUCTOR' },
      { isActive },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Instructor not found' });
    res.json({ message: `Instructor ${isActive ? 'activated' : 'deactivated'}`, user });
  } catch (err) {
    res.status(500).json({ message: 'Error updating instructor status', error: err.message });
  }
});

// ── GET /institute/students ────────────────────────────────────────────────
router.get('/students', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), async (req, res) => {
  try {
    const code = await getInstituteCode(req.user);
    const filter = { role: 'STUDENT' };
    if (code && !['SUPER_ADMIN'].includes(req.user.role)) {
      filter.instituteCode = code;
    }
    const students = await UserModel.find(
      filter,
      'userId name email isActive createdAt'
    ).sort({ createdAt: -1 });

    const userIds = students.map(s => s._id);
    const wallets = await WalletModel.find({ userId: { $in: userIds } });
    const walletMap = {};
    wallets.forEach(w => { walletMap[w.userId.toString()] = w.balancePaise; });

    const enrollments = await EnrollmentModel.find({
      userId: { $in: userIds }, status: 'ACTIVE'
    }).populate('batchId', 'name code');
    const enrollMap = {};
    enrollments.forEach(e => { enrollMap[e.userId.toString()] = e.batchId; });

    const result = students.map(s => ({
      _id: s._id,
      userId: s.userId,
      name: s.name,
      email: s.email,
      isActive: s.isActive,
      createdAt: s.createdAt,
      balancePaise: walletMap[s._id.toString()] || 0,
      batch: enrollMap[s._id.toString()] || null,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching students', error: err.message });
  }
});

// ── POST /institute/student ────────────────────────────────────────────────
router.post('/student', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), async (req, res) => {
  try {
    const { name, email, password, batchId } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'name, email and password are required' });

    const code = await getInstituteCode(req.user);

    // Enforce Institute Student Quota
    const institute = await InstituteModel.findOne({
      $or: [
        { code },
        ...(req.user.instituteId ? [{ _id: req.user.instituteId }] : [])
      ]
    });

    if (institute) {
      const maxStudents = institute.quota?.maxStudents || 50;
      const currentStudents = await UserModel.countDocuments({ instituteCode: code, role: 'STUDENT' });
      if (currentStudents >= maxStudents) {
        return res.status(400).json({
          message: `Student quota exceeded (${currentStudents}/${maxStudents}). Please upgrade your institute plan to register more students.`,
          quotaExceeded: true,
          limit: maxStudents,
          current: currentStudents,
        });
      }
    }

    const existing = await UserModel.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = `${code}S${Date.now().toString().slice(-6)}`;

    const student = await UserModel.create({
      userId,
      email: email.toLowerCase(),
      name,
      passwordHash,
      role: 'STUDENT',
      instituteCode: code,
      instituteId: req.user.instituteId || (institute ? institute._id : null),
      isActive: true,
    });

    // Increment usage counter on institute
    if (institute) {
      await InstituteModel.findByIdAndUpdate(institute._id, {
        $inc: { 'usage.currentStudents': 1 }
      });
    }

    let enrollment = null;
    let wallet = null;

    if (batchId) {
      const batch = await BatchModel.findById(batchId);
      if (batch) {
        enrollment = await EnrollmentModel.create({
          userId: student._id,
          batchId,
          instituteCode: code,
          status: 'ACTIVE',
        });
        const capPaise = batch.startingCapitalPaise || 10000000;
        const capRupees = capPaise / 100;
        wallet = await WalletModel.create({
          userId: student._id,
          balance: capRupees,
          balancePaise: capPaise,
          availableMargin: capRupees,
          blockedMargin: 0,
          blockedMarginPaise: 0,
        });
      }
    }

    res.status(201).json({
      student: {
        _id: student._id,
        userId: student.userId,
        name: student.name,
        email: student.email,
        isActive: student.isActive,
        createdAt: student.createdAt,
      },
      enrollment,
      wallet: wallet ? { balancePaise: wallet.balancePaise } : null,
    });
  } catch (err) {
    console.error('[Institute] create student error:', err);
    if (err.code === 11000) return res.status(409).json({ message: 'Duplicate key error' });
    res.status(500).json({ message: 'Error creating student', error: err.message });
  }
});

// ── PATCH /institute/students/:id/status ──────────────────────────────────
const updateStudentStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const code = await getInstituteCode(req.user);
    const filter = { _id: req.params.id, role: 'STUDENT' };
    if (code && !['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
      filter.instituteCode = code;
    }
    const user = await UserModel.findOneAndUpdate(
      filter,
      { isActive },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Student not found' });
    res.json({ message: `Student ${isActive ? 'activated' : 'deactivated'}`, user });
  } catch (err) {
    res.status(500).json({ message: 'Error updating student status', error: err.message });
  }
};
router.patch('/students/:id/status', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), updateStudentStatus);
router.patch('/student/:id/status', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), updateStudentStatus);

// ── POST /institute/students/:id/batch (Assign / Change Batch) ─────────────
const updateStudentBatch = async (req, res) => {
  try {
    const studentId = req.params.id;
    const { batchId } = req.body;
    const code = await getInstituteCode(req.user);

    const student = await UserModel.findById(studentId);
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ message: 'Student not found' });
    }
    if (code && !['SUPER_ADMIN', 'ADMIN'].includes(req.user.role) && student.instituteCode !== code) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (!batchId) {
      // Unenroll from current active batch
      await EnrollmentModel.updateMany(
        { userId: studentId, status: 'ACTIVE' },
        { status: 'REMOVED' }
      );
      return res.json({ message: 'Student unassigned from batch', batch: null });
    }

    const targetBatch = await BatchModel.findById(batchId);
    if (!targetBatch) return res.status(404).json({ message: 'Batch not found' });

    // Mark previous active enrollments for OTHER batches as REMOVED
    await EnrollmentModel.updateMany(
      { userId: studentId, batchId: { $ne: targetBatch._id }, status: 'ACTIVE' },
      { status: 'REMOVED' }
    );

    // Upsert target batch enrollment to ACTIVE
    const enrollment = await EnrollmentModel.findOneAndUpdate(
      { userId: studentId, batchId: targetBatch._id },
      {
        $set: {
          status: 'ACTIVE',
          instituteCode: targetBatch.instituteCode || code || student.instituteCode,
        },
        $setOnInsert: {
          joinedAt: new Date(),
        }
      },
      { new: true, upsert: true }
    );

    // Check if student has wallet, else initialize with batch capital
    let wallet = await WalletModel.findOne({ userId: studentId });
    if (!wallet) {
      const capPaise = targetBatch.startingCapitalPaise || 10000000;
      const capRupees = capPaise / 100;
      wallet = await WalletModel.create({
        userId: studentId,
        balance: capRupees,
        balancePaise: capPaise,
        availableMargin: capRupees,
        blockedMargin: 0,
        blockedMarginPaise: 0,
      });
    }

    res.json({
      message: `Student assigned to batch "${targetBatch.name}"`,
      batch: { _id: targetBatch._id, name: targetBatch.name, code: targetBatch.code },
      enrollment,
      wallet: { balancePaise: wallet.balancePaise }
    });
  } catch (err) {
    console.error('[updateStudentBatch] Error:', err);
    res.status(500).json({ message: 'Error updating student batch', error: err.message });
  }
};
router.post('/students/:id/batch', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), updateStudentBatch);
router.post('/student/:id/batch', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), updateStudentBatch);

// ── POST /institute/students/:id/reset-password ────────────────────────────
const resetStudentPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const code = await getInstituteCode(req.user);
    const student = await UserModel.findById(req.params.id);
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ message: 'Student not found' });
    }
    if (code && !['SUPER_ADMIN', 'ADMIN'].includes(req.user.role) && student.instituteCode !== code) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    student.passwordHash = await bcrypt.hash(newPassword, 12);
    await student.save();

    // Revoke active sessions for security
    await SessionModel.updateMany({ userId: student._id }, { isRevoked: true });

    res.json({ message: `Password reset successfully for ${student.name}` });
  } catch (err) {
    res.status(500).json({ message: 'Error resetting password', error: err.message });
  }
};
router.post('/students/:id/reset-password', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), resetStudentPassword);
router.post('/student/:id/reset-password', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), resetStudentPassword);

// ── Institute Profile & Branding ───────────────────────────────────────────
router.get('/profile', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), async (req, res) => {
  try {
    const instituteCode = req.user.instituteCode || 'ADMIN';
    const institute = await InstituteModel.findOne({ code: instituteCode });
    if (!institute) return res.status(404).json({ message: 'Institute not found' });
    res.json(institute);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching institute', error: err.message });
  }
});

router.put('/profile', requireRole(['INSTITUTE_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const instituteCode = req.user.instituteCode || 'ADMIN';
    const { name, branding, status } = req.body;
    const institute = await InstituteModel.findOneAndUpdate(
      { code: instituteCode },
      { name, branding, status },
      { new: true, upsert: true }
    );
    res.json({ message: 'Institute profile updated', institute });
  } catch (err) {
    res.status(500).json({ message: 'Error updating institute', error: err.message });
  }
});

// Branch CRUD
router.post('/branches', requireRole(['INSTITUTE_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { name, location, managerId } = req.body;
    const instituteCode = req.user.instituteCode || 'ADMIN';
    const branch = new BranchModel({ name, instituteCode, location, managerId });
    await branch.save();
    res.status(201).json({ message: 'Branch created', branch });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Branch name already exists' });
    res.status(500).json({ message: 'Error creating branch', error: err.message });
  }
});

router.get('/branches', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), async (req, res) => {
  try {
    const instituteCode = req.user.instituteCode || 'ADMIN';
    const branches = await BranchModel.find({ instituteCode }).populate('managerId', 'name email');
    res.json(branches);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching branches', error: err.message });
  }
});

// Member management
router.get('/members', requireRole(['INSTITUTE_ADMIN', 'ADMIN', 'INSTRUCTOR']), async (req, res) => {
  try {
    const instituteCode = req.user.instituteCode || 'ADMIN';
    const members = await UserModel.find({ instituteCode }, '-passwordHash');
    res.json(members);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching members', error: err.message });
  }
});

router.patch('/members/:id/role', requireRole(['INSTITUTE_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['STUDENT', 'INSTRUCTOR', 'ADMIN', 'INSTITUTE_ADMIN'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    const member = await UserModel.findById(req.params.id);
    if (!member) return res.status(404).json({ message: 'User not found' });

    if (req.user.role !== 'SUPER_ADMIN' && member.instituteCode !== req.user.instituteCode) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    member.role = role;
    await member.save();
    res.json({ message: `User role updated to ${role}`, user: member });
  } catch (err) {
    res.status(500).json({ message: 'Error updating role', error: err.message });
  }
});

// Capital Assignment / Adjustment for a student
router.post('/student/:id/capital', requireRole(['INSTITUTE_ADMIN', 'INSTRUCTOR', 'ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const studentId = req.params.id;
    const { amount, mode = 'SET' } = req.body; // amount in INR (Rupees)
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ message: 'Invalid capital amount. Must be a positive number.' });
    }

    const student = await UserModel.findById(studentId);
    if (!student || student.role !== 'STUDENT') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Scoping check for INSTITUTE_ADMIN / INSTRUCTOR
    if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role) && student.instituteCode !== req.user.instituteCode) {
      return res.status(403).json({ message: 'Unauthorized to manage this student' });
    }

    let wallet = await WalletModel.findOne({ userId: studentId });
    if (!wallet) {
      wallet = new WalletModel({
        userId: studentId,
        balance: numAmount,
        balancePaise: Math.round(numAmount * 100),
        availableMargin: numAmount,
        blockedMargin: 0,
        blockedMarginPaise: 0,
      });
    } else {
      if (mode === 'ADD') {
        wallet.balance += numAmount;
        wallet.balancePaise = Math.round(wallet.balance * 100);
        wallet.availableMargin = Math.max(0, wallet.balance - (wallet.usedMargin || 0) - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
      } else {
        wallet.balance = numAmount;
        wallet.balancePaise = Math.round(numAmount * 100);
        wallet.availableMargin = Math.max(0, numAmount - (wallet.usedMargin || 0) - (wallet.misMargin || 0) - (wallet.optionMargin || 0) - (wallet.blockedMargin || 0));
      }
    }

    await wallet.save();
    res.json({
      message: `Capital ${mode === 'ADD' ? 'added to' : 'set for'} student successfully`,
      studentId,
      wallet: {
        balance: wallet.balance,
        balancePaise: wallet.balancePaise,
        availableMargin: wallet.availableMargin,
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating student capital', error: err.message });
  }
});

module.exports = { instituteRouter: router };
