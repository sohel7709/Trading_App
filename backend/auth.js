const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { UserModel } = require('./model/UserModel');
const { SessionModel } = require('./model/SessionModel');
const { InstituteModel } = require('./model/InstituteModel');
const { BatchModel } = require('./model/BatchModel');
const { EnrollmentModel } = require('./model/EnrollmentModel');
const { WalletModel } = require('./model/WalletModel');
const { logAudit } = require('./services/auditLogger');
const { authenticate } = require('./middleware/authenticate'); // Needed for protected routes

const router = express.Router();

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'zerodha_access_secret_change_in_prod';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'zerodha_refresh_secret_change_in_prod';
const ACCESS_TTL     = '15m';
const REFRESH_DAYS   = 30;

// ── Helpers ──────────────────────────────────────────────────────────────────

function signAccess(user) {
  return jwt.sign(
    { 
      sub: user._id.toString(), 
      userId: user.userId, 
      role: user.role, 
      name: user.name,
      instituteCode: user.instituteCode || '',
      instituteId: user.instituteId ? user.instituteId.toString() : null,
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

async function createSession(userId, req) {
  const rawToken = crypto.randomBytes(64).toString('hex');
  const hash = await bcrypt.hash(rawToken, 10);
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

  const session = await SessionModel.create({
    userId,
    refreshTokenHash: hash,
    deviceLabel: req.headers['user-agent']?.slice(0, 80) || 'Unknown',
    ip: req.ip || req.connection?.remoteAddress || '',
    userAgent: req.headers['user-agent'] || '',
    expiresAt,
  });

  return `${session._id}:${rawToken}`;
}

const CacheService = require('./services/cacheService');

async function enrichUserDetails(user) {
  const userIdStr = (user._id || user.id)?.toString();
  if (userIdStr) {
    const cached = await CacheService.getUserSession(userIdStr);
    if (cached) return cached;
  }

  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.passwordHash;
  delete userObj.resetPasswordToken;
  delete userObj.resetPasswordExpires;

  if (!userObj.instituteCode && userObj.instituteId) {
    const inst = await InstituteModel.findById(userObj.instituteId).lean();
    if (inst) {
      userObj.instituteCode = inst.code;
    }
  }

  if (userObj.role === 'STUDENT') {
    const { EnrollmentModel } = require('./model/EnrollmentModel');
    const { WalletModel } = require('./model/WalletModel');

    // Run lookups in parallel for maximum concurrency speed
    const [enrollment, institute, existingWallet] = await Promise.all([
      EnrollmentModel.findOne({ userId: userObj._id, status: 'ACTIVE' })
        .populate({
          path: 'batchId',
          populate: { path: 'instructors', select: 'name email' }
        })
        .lean(),
      userObj.instituteCode 
        ? InstituteModel.findOne({ code: userObj.instituteCode }).lean()
        : (userObj.instituteId ? InstituteModel.findById(userObj.instituteId).lean() : null),
      WalletModel.findOne({ userId: userObj._id }).lean()
    ]);

    let wallet = existingWallet;
    if (!wallet && enrollment?.batchId?.startingCapitalPaise) {
      const capPaise = enrollment.batchId.startingCapitalPaise;
      const capRupees = capPaise / 100;
      wallet = await WalletModel.create({
        userId: userObj._id,
        balance: capRupees,
        balancePaise: capPaise,
        availableMargin: capRupees,
        usedMargin: 0,
        misMargin: 0,
        optionMargin: 0,
        blockedMargin: 0,
        blockedMarginPaise: 0,
      });
    }

    const enrolledCapital = enrollment?.batchId?.startingCapitalPaise
      ? enrollment.batchId.startingCapitalPaise / 100
      : null;

    userObj.batch = enrollment?.batchId ? {
      _id: enrollment.batchId._id,
      name: enrollment.batchId.name,
      code: enrollment.batchId.code,
      marketMode: enrollment.batchId.marketMode,
      startingCapitalPaise: enrollment.batchId.startingCapitalPaise,
      instructors: enrollment.batchId.instructors?.map(i => i.name) || [],
    } : null;
    userObj.instituteName = institute?.name || userObj.instituteCode || 'TradeLab Institute';
    userObj.startingCapital = wallet?.balance ?? (userObj.startingCapital || (enrolledCapital ?? 500000));
    userObj.balance = wallet?.balance ?? (userObj.startingCapital || (enrolledCapital ?? 500000));
    userObj.balancePaise = wallet?.balancePaise ?? (userObj.startingCapitalPaise || (enrollment?.batchId?.startingCapitalPaise || 50000000));
  }

  if (userIdStr) {
    await CacheService.setUserSession(userIdStr, userObj, 900);
  }

  return userObj;
}


// ── POST /auth/register ───────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { userId, email, password, name } = req.body;
    if (!userId || !email || !password)
      return res.status(400).json({ message: 'userId, email and password are required' });

    const exists = await UserModel.findOne({ $or: [{ userId: userId.toUpperCase() }, { email }] });
    if (exists)
      return res.status(409).json({ message: 'User ID or email already exists' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await UserModel.create({
      userId: userId.toUpperCase(),
      email: email.toLowerCase(),
      name: name || userId,
      passwordHash,
      role: 'TRADER',
    });

    await logAudit({ actorUserId: user._id, action: 'USER_REGISTERED', entityType: 'User', entityId: user._id.toString() }, req);

    const accessToken = signAccess(user);
    const refreshToken = await createSession(user._id, req);

    return res.status(201).json({
      accessToken,
      refreshToken,
      user: { userId: user.userId, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('[Auth] register error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ── POST /auth/register-student ───────────────────────────────────────────────
router.post('/register-student', async (req, res) => {
  try {
    const { name, email, password, instituteCode, batchCode } = req.body;
    if (!email || !password || !instituteCode) {
      return res.status(400).json({ message: 'Email, password and instituteCode are required' });
    }

    const cleanInstCode = instituteCode.trim().toUpperCase();
    const inst = await InstituteModel.findOne({ code: cleanInstCode, isActive: { $ne: false } });
    if (!inst) {
      return res.status(404).json({ message: `Institute with code "${cleanInstCode}" not found or inactive` });
    }

    const cleanEmail = email.trim().toLowerCase();
    const exists = await UserModel.findOne({ email: cleanEmail });
    if (exists) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    // Generate unique userId
    const baseId = (cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'STU').toUpperCase().slice(0, 10);
    let candidateId = baseId;
    let counter = 1;
    while (await UserModel.findOne({ userId: candidateId })) {
      candidateId = `${baseId}${counter++}`;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await UserModel.create({
      userId: candidateId,
      email: cleanEmail,
      name: name || candidateId,
      passwordHash,
      role: 'STUDENT',
      instituteId: inst._id,
      instituteCode: inst.code,
      isActive: true,
    });

    // Find batch by batchCode or pick the first active batch in the institute
    let batch = null;
    if (batchCode) {
      batch = await BatchModel.findOne({ code: batchCode.trim().toUpperCase(), instituteCode: inst.code, status: 'ACTIVE' });
    }
    if (!batch) {
      batch = await BatchModel.findOne({ instituteCode: inst.code, status: 'ACTIVE' });
    }

    const startingCapitalPaise = batch?.startingCapitalPaise || 10000000;
    const startingCapitalRupees = startingCapitalPaise / 100;

    if (batch) {
      await EnrollmentModel.create({
        batchId: batch._id,
        userId: user._id,
        instituteCode: inst.code,
        instituteId: inst._id,
        status: 'ACTIVE',
        enrolledAt: new Date(),
        startingCapitalPaise,
      });
    }

    // Create wallet with starting capital
    await WalletModel.create({
      userId: user._id,
      balance: startingCapitalRupees,
      balancePaise: startingCapitalPaise,
      availableMargin: startingCapitalRupees,
      usedMargin: 0,
      misMargin: 0,
      optionMargin: 0,
      blockedMargin: 0,
      blockedMarginPaise: 0,
    });

    await logAudit({ actorUserId: user._id, action: 'STUDENT_SELF_REGISTERED', entityType: 'User', entityId: user._id.toString() }, req);

    const accessToken = signAccess(user);
    const refreshToken = await createSession(user._id, req);
    const enrichedUser = await enrichUserDetails(user);

    return res.status(201).json({
      success: true,
      message: 'Student registered successfully',
      accessToken,
      refreshToken,
      user: enrichedUser,
    });
  } catch (err) {
    console.error('[Auth] register-student error:', err);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { userId, email, password, instituteCode } = req.body;
    
    // We can accept either userId or email
    const loginIdentifier = email || userId;
    
    if (!loginIdentifier || !password)
      return res.status(400).json({ message: 'Email/userId and password are required' });

    // Build query
    const query = { isActive: true };
    if (loginIdentifier.includes('@')) {
      query.email = loginIdentifier.toLowerCase();
    } else {
      query.userId = loginIdentifier.toUpperCase();
    }
    
    // If institute code provided, verify it too (except for Super Admins)
    if (instituteCode && instituteCode !== 'ADMIN') {
      // query.instituteCode = instituteCode.toUpperCase();
    }

    const user = await UserModel.findOne(query);
    if (!user)
      return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res.status(401).json({ message: 'Invalid user ID or password' });

    // Seat Limit Enforcement: Auto-kick oldest sessions if at limit
    const limit = user.seatLimit || 2;
    let activeSessions = await SessionModel.find({ userId: user._id, isRevoked: false, expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 });
    
    if (activeSessions.length >= limit) {
      const numToRevoke = activeSessions.length - limit + 1;
      const sessionsToRevoke = activeSessions.slice(0, numToRevoke);
      
      for (const sess of sessionsToRevoke) {
        sess.isRevoked = true;
        await sess.save();
        await logAudit({ actorUserId: user._id, action: 'SESSION_AUTO_REVOKED_SEAT_LIMIT', entityType: 'Session', entityId: sess._id.toString() }, req);
      }
    }

    // Auto-resolve instituteCode from instituteId if missing
    if (!user.instituteCode && user.instituteId) {
      const inst = await InstituteModel.findById(user.instituteId);
      if (inst) {
        user.instituteCode = inst.code;
        await user.save();
      }
    }

    const enrichedUser = await enrichUserDetails(user);
    const accessToken = signAccess(user);
    const refreshToken = await createSession(user._id, req);

    await logAudit({ actorUserId: user._id, action: 'LOGIN', entityType: 'Session', entityId: user._id.toString() }, req);

    return res.json({
      accessToken,
      token: accessToken,
      refreshToken,
      user: enrichedUser,
    });
  } catch (err) {
    console.error('[Auth] login error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


// ── POST /auth/refresh ────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== 'string' || !refreshToken.includes(':'))
      return res.status(400).json({ message: 'Valid refreshToken required' });

    const [sessionId, rawToken] = refreshToken.split(':');
    const session = await SessionModel.findById(sessionId);
    
    if (!session) return res.status(401).json({ message: 'Invalid refresh token' });

    const match = await bcrypt.compare(rawToken, session.refreshTokenHash);
    if (!match) return res.status(401).json({ message: 'Invalid refresh token' });

    if (session.isRevoked) {
      // Reuse detected!
      await logAudit({ actorUserId: session.userId, action: 'TOKEN_REUSE_DETECTED', entityType: 'Session', entityId: session._id.toString() }, req);
      await SessionModel.updateMany({ userId: session.userId }, { isRevoked: true });
      return res.status(401).json({ message: 'Security breach detected. All active sessions have been revoked.' });
    }

    if (session.expiresAt < new Date()) {
      return res.status(401).json({ message: 'Refresh token expired' });
    }

    const user = await UserModel.findById(session.userId);
    if (!user || !user.isActive)
      return res.status(401).json({ message: 'User not found or inactive' });

    // Rotate: revoke old session, create new one
    session.isRevoked = true;
    await session.save();

    const accessToken = signAccess(user);
    const newRefreshToken = await createSession(user._id, req);

    return res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('[Auth] refresh error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken && typeof refreshToken === 'string' && refreshToken.includes(':')) {
      const [sessionId, rawToken] = refreshToken.split(':');
      const session = await SessionModel.findById(sessionId);
      if (session && !session.isRevoked) {
        const match = await bcrypt.compare(rawToken, session.refreshTokenHash);
        if (match) {
          session.isRevoked = true;
          await session.save();
          await logAudit({ actorUserId: session.userId, action: 'LOGOUT', entityType: 'Session', entityId: session._id.toString() }, req);
        }
      }
    }
    return res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('[Auth] logout error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ── POST /auth/forgot ─────────────────────────────────────────────────────────
router.post('/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const user = await UserModel.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 10);

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    await user.save();

    await logAudit({ actorUserId: user._id, action: 'FORGOT_PASSWORD_REQUESTED', entityType: 'User', entityId: user._id.toString() }, req);

    // In production, send email here. For MVP, we return it.
    return res.json({ message: 'Password reset link generated', resetToken });
  } catch (err) {
    console.error('[Auth] forgot error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ── POST /auth/reset ──────────────────────────────────────────────────────────
router.post('/reset', async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!email || !resetToken || !newPassword) return res.status(400).json({ message: 'Missing fields' });

    const user = await UserModel.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user || !user.resetPasswordToken || !user.resetPasswordExpires) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    if (user.resetPasswordExpires < new Date()) {
      return res.status(400).json({ message: 'Reset token has expired' });
    }

    const match = await bcrypt.compare(resetToken, user.resetPasswordToken);
    if (!match) return res.status(400).json({ message: 'Invalid reset token' });

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    // Revoke all existing sessions for security
    await SessionModel.updateMany({ userId: user._id }, { isRevoked: true });
    
    await logAudit({ actorUserId: user._id, action: 'PASSWORD_RESET_SUCCESS', entityType: 'User', entityId: user._id.toString() }, req);

    return res.json({ message: 'Password has been reset successfully. All existing sessions revoked.' });
  } catch (err) {
    console.error('[Auth] reset error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /auth/sessions ────────────────────────────────────────────────────────
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const sessions = await SessionModel.find({
      userId: req.user._id,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    }).select('-refreshTokenHash');
    return res.json(sessions);
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ── POST /auth/sessions/revoke ────────────────────────────────────────────────
router.post('/sessions/revoke', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ message: 'sessionId required' });

    const session = await SessionModel.findOne({ _id: sessionId, userId: req.user._id });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    session.isRevoked = true;
    await session.save();

    await logAudit({ actorUserId: req.user._id, action: 'SESSION_REVOKED', entityType: 'Session', entityId: sessionId }, req);

    return res.json({ message: 'Session revoked' });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ── POST /auth/sessions/revoke-all ────────────────────────────────────────────
router.post('/sessions/revoke-all', authenticate, async (req, res) => {
  try {
    await SessionModel.updateMany({ userId: req.user._id }, { isRevoked: true });
    await logAudit({ actorUserId: req.user._id, action: 'ALL_SESSIONS_REVOKED', entityType: 'User', entityId: req.user._id.toString() }, req);
    return res.json({ message: 'All sessions revoked' });
  } catch (err) {
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const userObj = await enrichUserDetails(req.user);
    if (req.user?.isImpersonating) {
      userObj.isImpersonating = true;
      userObj.impersonatedBy = req.user.impersonatedBy;
    }
    return res.json({ user: userObj });
  } catch (err) {
    const plain = req.user?.toObject ? req.user.toObject() : { ...req.user };
    if (req.user?.isImpersonating) {
      plain.isImpersonating = true;
      plain.impersonatedBy = req.user.impersonatedBy;
    }
    return res.json({ user: plain });
  }
});


module.exports = { authRouter: router, ACCESS_SECRET };
