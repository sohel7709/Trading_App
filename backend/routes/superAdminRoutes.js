'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { InstituteModel } = require('../model/InstituteModel');
const { UserModel } = require('../model/UserModel');
const { BatchModel } = require('../model/BatchModel');
const { EnrollmentModel } = require('../model/EnrollmentModel');
const { TradeModel } = require('../model/TradeModel');
const BrokerCredentialModel = require('../model/BrokerCredentialModel');
const AuditLogModel = require('../model/AuditLogModel');
const { logAction } = require('../services/auditService');
const CacheService = require('../services/cacheService');
const kotakNeoService = require('../kotakNeoService');
const dhanDataService = require('../dhanDataService');
const marketControlService = require('../services/marketControlService');
const jwt = require('jsonwebtoken');
const { ACCESS_SECRET } = require('../auth');
const { requireRole } = require('../middleware/requireRole');

const router = express.Router();

const DEFAULT_PLAN_QUOTAS = {
  STARTER: { maxStudents: 50, maxBatches: 3 },
  GROWTH: { maxStudents: 250, maxBatches: 10 },
  ENTERPRISE: { maxStudents: 1000, maxBatches: 50 },
};

// ── Helper: generate candidate institute code from name ─────────────────────
function generateInstituteCode(name) {
  const words = name.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/);
  let code = words.map(w => w.slice(0, 4)).join('').slice(0, 8);
  if (!code) code = 'INST';
  return code;
}

// ── Helper: ensure uniqueness against DB ───────────────────────────────────
async function getUniqueInstituteCode(name, candidate) {
  let base = (candidate || generateInstituteCode(name || 'INST')).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (!base) base = 'INST';
  let code = base;
  let suffix = 1;
  while (await InstituteModel.findOne({ code })) {
    code = `${base}${String(suffix).padStart(2, '0')}`;
    suffix++;
  }
  return code;
}

// ── Broker Health Check Helpers ────────────────────────────────────────────
async function checkDhanConnection() {
  const start = Date.now();
  try {
    const cred = await BrokerCredentialModel.findOne({ isActiveProvider: true, provider: 'DHAN' })
      || await BrokerCredentialModel.findOne({ tenantId: 'ADMIN', provider: 'DHAN' })
      || await BrokerCredentialModel.findOne({ provider: 'DHAN' });

    if (!cred || !cred.apiKey || !cred.accessToken) {
      return { status: 'NOT_CONFIGURED', message: 'No credentials stored in database', latencyMs: 0 };
    }
    const testPromise = dhanDataService.testCredentials({ clientId: cred.apiKey, accessToken: cred.accessToken });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Broker timeout')), 4000));
    const ok = await Promise.race([testPromise, timeoutPromise]);
    return {
      status: ok ? 'CONNECTED' : 'DISCONNECTED',
      latencyMs: Date.now() - start,
      clientId: cred.apiKey ? `${cred.apiKey.slice(0, 4)}***` : undefined,
    };
  } catch (err) {
    return {
      status: 'DISCONNECTED',
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}

async function checkKotakConnection() {
  const start = Date.now();
  try {
    const cred = await BrokerCredentialModel.findOne({ isActiveProvider: true, provider: 'KOTAK' })
      || await BrokerCredentialModel.findOne({ tenantId: 'ADMIN', provider: 'KOTAK' })
      || await BrokerCredentialModel.findOne({ provider: 'KOTAK' });

    if (!cred || !cred.apiKey || !cred.consumerSecret) {
      return { status: 'NOT_CONFIGURED', message: 'No credentials stored in database', latencyMs: 0 };
    }
    const testPromise = kotakNeoService.testCredentials({
      apiKey: cred.apiKey,
      consumerSecret: cred.consumerSecret,
      mobileNo: cred.mobileNo,
      password: cred.password,
      mpin: cred.mpin,
    });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Broker timeout')), 4000));
    const ok = await Promise.race([testPromise, timeoutPromise]);
    return {
      status: ok ? 'CONNECTED' : 'DISCONNECTED',
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: 'DISCONNECTED',
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}

// ── GET /super-admin/generate-code ─────────────────────────────────────────
router.get('/generate-code', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const name = req.query.name || 'Institute';
    const code = await getUniqueInstituteCode(name);
    res.json({ code });
  } catch (err) {
    res.status(500).json({ message: 'Error generating code', error: err.message });
  }
});

// ── GET /super-admin/stats ─────────────────────────────────────────────────
router.get('/stats', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const [institutes, students, trades, activeInstitutes] = await Promise.all([
      InstituteModel.countDocuments(),
      UserModel.countDocuments({ role: 'STUDENT' }),
      TradeModel.countDocuments(),
      InstituteModel.countDocuments({ status: 'ACTIVE' }),
    ]);

    const recentInstitutes = await InstituteModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('ownerId', 'name email');

    res.json({
      institutes,
      activeInstitutes,
      students,
      trades,
      recentInstitutes,
    });
  } catch (err) {
    console.error('[SuperAdmin] stats error:', err);
    res.status(500).json({ message: 'Error fetching stats', error: err.message });
  }
});

// ── GET /super-admin/system-health (STEP 2: SYSTEM HEALTH API) ─────────────
router.get('/system-health', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const io = req.app.get('io');
    
    // Detailed Socket.io room inspection
    const roomsMap = io?.sockets?.adapter?.rooms || new Map();
    const sidsMap = io?.sockets?.adapter?.sids || new Map();

    const activeRooms = [];
    let activeSubscriptionsCount = 0;

    for (const [roomName, socketIds] of roomsMap.entries()) {
      // Skip internal per-socket individual rooms
      if (sidsMap.has(roomName)) continue;

      let type = 'CUSTOM_CHANNEL';
      let purpose = 'General broadcast channel';
      let category = 'SYSTEM';

      if (roomName === 'global') {
        type = 'GLOBAL_BROADCAST';
        purpose = 'Platform-wide broadcast channel: distributes global market status, system-wide notifications, and maintenance alerts.';
        category = 'GLOBAL';
      } else if (roomName.startsWith('user:')) {
        type = 'USER_PRIVATE';
        purpose = `Private student/trader channel (${roomName}): pushes targeted real-time PnL, margin alerts, order executions, and wallet updates.`;
        category = 'USER';
      } else if (roomName.startsWith('institute:')) {
        type = 'TENANT_ISOLATION';
        purpose = `Tenant isolation channel (${roomName}): delivers institute-scoped announcements, admin resets, and dedicated market feed ticks.`;
        category = 'TENANT';
      } else if (roomName.startsWith('batch:')) {
        type = 'CLASSROOM_GRID';
        purpose = `Classroom telemetry channel (${roomName}): streams live student trading matrix, batch leaderboard rankings, and risk alerts to instructors.`;
        category = 'CLASSROOM';
      } else if (roomName.startsWith('chain:')) {
        type = 'OPTION_CHAIN_FEED';
        purpose = `High-speed F&O derivatives channel (${roomName}): broadcasts 1-second live option strikes, IVs, Greeks, and Call/Put bids/asks.`;
        category = 'OPTIONS';
      } else {
        type = 'MARKET_TICK_ROOM';
        purpose = `Symbol price ticker (${roomName}): streams real-time NSE/BSE Last Traded Price (LTP) and depth directly to watchlists and charts.`;
        category = 'MARKET';
      }

      activeSubscriptionsCount += socketIds.size;
      activeRooms.push({
        name: roomName,
        clientsCount: socketIds.size,
        type,
        purpose,
        category,
      });
    }

    // Sort rooms: Option chains first, then Tenant, Classroom, User
    activeRooms.sort((a, b) => b.clientsCount - a.clientsCount);

    const socketStats = io ? {
      activeConnections: io.engine?.clientsCount || 0,
      totalRooms: roomsMap.size,
      functionalRoomsCount: activeRooms.length,
      activeSubscriptionsCount,
      rooms: activeRooms,
      status: 'CONNECTED',
    } : {
      activeConnections: 0,
      totalRooms: 0,
      functionalRoomsCount: 0,
      activeSubscriptionsCount: 0,
      rooms: [],
      status: 'NOT_ATTACHED',
    };

    // Database ping & state
    let dbStatus = 'DISCONNECTED';
    let dbPingMs = 0;
    if (mongoose.connection.readyState === 1) {
      dbStatus = 'CONNECTED';
      const dbStart = Date.now();
      try {
        if (mongoose.connection.db) {
          await mongoose.connection.db.admin().ping();
          dbPingMs = Date.now() - dbStart;
        }
      } catch (_) {}
    } else if (mongoose.connection.readyState === 2) {
      dbStatus = 'CONNECTING';
    }

    // Broker checks
    const [dhanHealth, kotakHealth] = await Promise.all([
      checkDhanConnection(),
      checkKotakConnection(),
    ]);

    // Redis / Cache check
    const redisHealth = CacheService.getStatus();

    const mem = process.memoryUsage();
    const serverHealth = {
      uptimeSeconds: Math.floor(process.uptime()),
      heapUsedMb: +(mem.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMb: +(mem.heapTotal / 1024 / 1024).toFixed(2),
      rssMb: +(mem.rss / 1024 / 1024).toFixed(2),
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
      timestamp: new Date().toISOString(),
    };

    // Calculate aggregated overall system status
    const isHealthy = dbStatus === 'CONNECTED' && (redisHealth.status === 'CONNECTED' || redisHealth.mode === 'IN_MEMORY_FALLBACK');

    res.json({
      status: isHealthy ? 'HEALTHY' : 'DEGRADED',
      broker: {
        dhan: dhanHealth,
        kotak: kotakHealth,
      },
      redis: redisHealth,
      socket: socketStats,
      database: {
        status: dbStatus,
        pingMs: dbPingMs,
        host: mongoose.connection.host || 'MongoDB',
        name: mongoose.connection.name || 'trading_app',
      },
      server: serverHealth,
    });
  } catch (err) {
    console.error('[SuperAdmin] system health error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /super-admin/audit-logs (STEP 3: AUDIT LOG API) ────────────────────
router.get('/audit-logs', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.action) {
      filter.action = req.query.action;
    }
    if (req.query.role) {
      filter.role = req.query.role;
    }
    if (req.query.search) {
      const q = req.query.search.trim();
      filter.$or = [
        { action: { $regex: q, $options: 'i' } },
        { entity: { $regex: q, $options: 'i' } },
        { actorId: { $regex: q, $options: 'i' } },
        { ip: { $regex: q, $options: 'i' } },
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    res.json({
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    });
  } catch (err) {
    console.error('[SuperAdmin] audit logs error:', err);
    res.status(500).json({ message: 'Error fetching audit logs', error: err.message });
  }
});

// ── GET /super-admin/institutes ────────────────────────────────────────────
router.get('/institutes', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const institutes = await InstituteModel.find()
      .sort({ createdAt: -1 })
      .populate('ownerId', 'name email role');

    // Enrich with live student and batch counts per institute
    const enriched = await Promise.all(
      institutes.map(async (inst) => {
        const [studentCount, batchCount] = await Promise.all([
          UserModel.countDocuments({ instituteCode: inst.code, role: 'STUDENT' }),
          BatchModel.countDocuments({ instituteCode: inst.code }),
        ]);

        const plan = inst.plan || 'STARTER';
        const defaultQuota = DEFAULT_PLAN_QUOTAS[plan] || DEFAULT_PLAN_QUOTAS.STARTER;
        const quota = {
          maxStudents: inst.quota?.maxStudents || defaultQuota.maxStudents,
          maxBatches: inst.quota?.maxBatches || defaultQuota.maxBatches,
        };

        return {
          _id: inst._id,
          name: inst.name,
          code: inst.code,
          status: inst.status,
          plan,
          quota,
          usage: {
            currentStudents: studentCount,
            currentBatches: batchCount,
          },
          features: inst.features || {
            replay: false,
            optionsTrading: true,
            analytics: true,
            customBranding: false,
            brokerIntegration: false,
          },
          createdAt: inst.createdAt,
          adminEmail: inst.ownerId?.email || '—',
          adminName: inst.ownerId?.name || '—',
          studentCount,
          batchCount,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error('[SuperAdmin] list institutes error:', err);
    res.status(500).json({ message: 'Error listing institutes', error: err.message });
  }
});

// ── POST /super-admin/institute ────────────────────────────────────────────
router.post('/institute', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const {
      name,
      adminEmail,
      password,
      adminName,
      code: inputCode,
      autoGenerateCode,
      plan = 'STARTER',
      quota,
      features,
    } = req.body;

    if (!name || !adminEmail || !password) {
      return res.status(400).json({ message: 'name, adminEmail and password are required' });
    }

    // Check email uniqueness
    const existingUser = await UserModel.findOne({ email: adminEmail.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    // Resolve institute code
    let code;
    const isAuto = autoGenerateCode === true || autoGenerateCode === 'true' || !inputCode || !inputCode.trim();
    if (!isAuto && inputCode && inputCode.trim()) {
      const sanitized = inputCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (sanitized.length < 2 || sanitized.length > 12) {
        return res.status(400).json({ message: 'Institute code must be between 2 and 12 alphanumeric characters' });
      }
      const existingInstitute = await InstituteModel.findOne({ code: sanitized });
      if (existingInstitute) {
        return res.status(409).json({ message: `Institute code "${sanitized}" is already in use. Please choose another or enable auto-generate.` });
      }
      code = sanitized;
    } else {
      code = await getUniqueInstituteCode(name, inputCode);
    }

    const selectedPlan = ['STARTER', 'GROWTH', 'ENTERPRISE'].includes(plan) ? plan : 'STARTER';
    const defaultQuota = DEFAULT_PLAN_QUOTAS[selectedPlan];
    const initialQuota = {
      maxStudents: quota?.maxStudents || defaultQuota.maxStudents,
      maxBatches: quota?.maxBatches || defaultQuota.maxBatches,
    };

    // Generate unique userId for admin
    const userId = `${code}ADMIN`;
    const passwordHash = await bcrypt.hash(password, 12);

    // Create admin user first
    const adminUser = await UserModel.create({
      userId,
      email: adminEmail.toLowerCase(),
      name: adminName || `${name} Admin`,
      passwordHash,
      role: 'INSTITUTE_ADMIN',
      instituteCode: code,
      isActive: true,
    });

    // Create institute, linking back to owner
    const institute = await InstituteModel.create({
      name,
      code,
      ownerId: adminUser._id,
      status: 'ACTIVE',
      plan: selectedPlan,
      quota: initialQuota,
      usage: {
        currentStudents: 0,
        currentBatches: 0,
      },
      features: features || {
        replay: selectedPlan === 'ENTERPRISE',
        optionsTrading: true,
        analytics: true,
        customBranding: selectedPlan !== 'STARTER',
        brokerIntegration: selectedPlan === 'ENTERPRISE',
      },
    });

    // Back-fill instituteId on user
    adminUser.instituteId = institute._id;
    await adminUser.save();

    // Audit log action
    await logAction({
      actorId: req.user._id,
      role: 'SUPER_ADMIN',
      action: 'CREATE_INSTITUTE',
      entity: 'Institute',
      entityId: institute._id,
      instituteId: institute._id,
      before: null,
      after: {
        name: institute.name,
        code: institute.code,
        plan: institute.plan,
        quota: institute.quota,
        adminEmail: adminUser.email,
      },
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
    });

    res.status(201).json({
      success: true,
      institute: {
        _id: institute._id,
        name: institute.name,
        code: institute.code,
        plan: institute.plan,
        quota: institute.quota,
      },
      admin: { userId: adminUser.userId, email: adminUser.email, name: adminUser.name },
    });
  } catch (err) {
    console.error('[SuperAdmin] create institute error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Duplicate key — institute code or email already exists' });
    }
    res.status(500).json({ message: 'Error creating institute', error: err.message });
  }
});

// ── PATCH /super-admin/institute/:id/plan (STEP 4.1: PLAN UPDATE API) ──────
router.patch('/institute/:id/plan', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { plan, quota } = req.body;
    if (!plan || !['STARTER', 'GROWTH', 'ENTERPRISE'].includes(plan)) {
      return res.status(400).json({ message: 'plan must be STARTER, GROWTH, or ENTERPRISE' });
    }

    const institute = await InstituteModel.findById(req.params.id);
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const defaultQuota = DEFAULT_PLAN_QUOTAS[plan];
    const newQuota = {
      maxStudents: quota?.maxStudents !== undefined ? Number(quota.maxStudents) : (institute.quota?.maxStudents || defaultQuota.maxStudents),
      maxBatches: quota?.maxBatches !== undefined ? Number(quota.maxBatches) : (institute.quota?.maxBatches || defaultQuota.maxBatches),
    };

    const beforeState = {
      plan: institute.plan,
      quota: institute.quota ? { ...institute.quota.toObject?.() || institute.quota } : null,
    };

    institute.plan = plan;
    institute.quota = newQuota;
    await institute.save();

    const afterState = {
      plan: institute.plan,
      quota: institute.quota,
    };

    // Log action
    await logAction({
      actorId: req.user._id,
      role: 'SUPER_ADMIN',
      action: 'UPDATE_PLAN',
      entity: 'Institute',
      entityId: institute._id,
      instituteId: institute._id,
      before: beforeState,
      after: afterState,
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      details: { instituteName: institute.name, code: institute.code },
    });

    res.json({
      message: `Plan updated to ${plan} for ${institute.name}`,
      institute: {
        _id: institute._id,
        name: institute.name,
        code: institute.code,
        plan: institute.plan,
        quota: institute.quota,
      },
    });
  } catch (err) {
    console.error('[SuperAdmin] plan update error:', err);
    res.status(500).json({ message: 'Error updating plan', error: err.message });
  }
});

// ── PATCH /super-admin/institute/:id/features (STEP 4.2: FEATURE TOGGLE API)
router.patch('/institute/:id/features', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const institute = await InstituteModel.findById(req.params.id);
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const beforeFeatures = institute.features ? { ...institute.features.toObject?.() || institute.features } : {};

    // Merge incoming feature flags
    const allowedFeatures = ['replay', 'optionsTrading', 'analytics', 'customBranding', 'brokerIntegration'];
    const newFeatures = { ...beforeFeatures };

    for (const key of allowedFeatures) {
      if (req.body[key] !== undefined) {
        newFeatures[key] = Boolean(req.body[key]);
      }
    }

    institute.features = newFeatures;
    await institute.save();

    // Log action
    await logAction({
      actorId: req.user._id,
      role: 'SUPER_ADMIN',
      action: 'TOGGLE_FEATURES',
      entity: 'Institute',
      entityId: institute._id,
      instituteId: institute._id,
      before: beforeFeatures,
      after: newFeatures,
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      details: { instituteName: institute.name, code: institute.code },
    });

    res.json({
      message: 'Features updated successfully',
      features: institute.features,
    });
  } catch (err) {
    console.error('[SuperAdmin] features update error:', err);
    res.status(500).json({ message: 'Error updating features', error: err.message });
  }
});

// ── GET /super-admin/institute/:id/usage (STEP 4.3: USAGE API) ─────────────
router.get('/institute/:id/usage', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const institute = await InstituteModel.findById(req.params.id);
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const [currentStudents, currentBatches] = await Promise.all([
      UserModel.countDocuments({ instituteCode: institute.code, role: 'STUDENT' }),
      BatchModel.countDocuments({ instituteCode: institute.code }),
    ]);

    // Keep usage in sync in DB
    institute.usage = { currentStudents, currentBatches };
    await institute.save();

    const plan = institute.plan || 'STARTER';
    const defaultQuota = DEFAULT_PLAN_QUOTAS[plan] || DEFAULT_PLAN_QUOTAS.STARTER;
    const quota = {
      maxStudents: institute.quota?.maxStudents || defaultQuota.maxStudents,
      maxBatches: institute.quota?.maxBatches || defaultQuota.maxBatches,
    };

    res.json({
      instituteId: institute._id,
      name: institute.name,
      code: institute.code,
      plan,
      quota,
      usage: {
        currentStudents,
        currentBatches,
        studentUtilizationPercent: Math.min(100, Math.round((currentStudents / quota.maxStudents) * 100)),
        batchUtilizationPercent: Math.min(100, Math.round((currentBatches / quota.maxBatches) * 100)),
      },
      features: institute.features,
      status: institute.status,
    });
  } catch (err) {
    console.error('[SuperAdmin] usage fetch error:', err);
    res.status(500).json({ message: 'Error fetching usage', error: err.message });
  }
});

// ── PATCH /super-admin/institute/:id/status ────────────────────────────────
router.patch('/institute/:id/status', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ message: 'status must be ACTIVE or SUSPENDED' });
    }

    const institute = await InstituteModel.findById(req.params.id);
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const prevStatus = institute.status;
    institute.status = status;
    await institute.save();

    // Toggle all institute non-super-admin users
    await UserModel.updateMany(
      { instituteCode: institute.code, role: { $ne: 'SUPER_ADMIN' } },
      { isActive: status === 'ACTIVE' }
    );

    // Audit log
    await logAction({
      actorId: req.user._id,
      role: 'SUPER_ADMIN',
      action: status === 'ACTIVE' ? 'ACTIVATE_INSTITUTE' : 'SUSPEND_INSTITUTE',
      entity: 'Institute',
      entityId: institute._id,
      instituteId: institute._id,
      before: { status: prevStatus },
      after: { status },
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      details: { instituteName: institute.name, code: institute.code },
    });

    res.json({ message: `Institute ${status.toLowerCase()}`, institute });
  } catch (err) {
    console.error('[SuperAdmin] status update error:', err);
    res.status(500).json({ message: 'Error updating status', error: err.message });
  }
});

// ── PATCH /super-admin/institute/:id/reset-password ───────────────────────
router.patch('/institute/:id/reset-password', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const institute = await InstituteModel.findById(req.params.id);
    if (!institute) return res.status(404).json({ message: 'Institute not found' });

    const adminUser = institute.ownerId
      ? await UserModel.findById(institute.ownerId)
      : await UserModel.findOne({ instituteCode: institute.code, role: 'INSTITUTE_ADMIN' });

    if (!adminUser) {
      return res.status(404).json({ message: 'Institute admin user not found' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    adminUser.passwordHash = passwordHash;
    adminUser.resetPasswordToken = null;
    adminUser.resetPasswordExpires = null;
    await adminUser.save();

    // Audit log
    await logAction({
      actorId: req.user._id,
      role: 'SUPER_ADMIN',
      action: 'RESET_ADMIN_PASSWORD',
      entity: 'Institute',
      entityId: institute._id,
      instituteId: institute._id,
      before: null,
      after: { adminEmail: adminUser.email },
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      details: { instituteName: institute.name, code: institute.code, adminEmail: adminUser.email },
    });

    res.json({
      success: true,
      message: `Password updated for ${adminUser.email}`,
      admin: { userId: adminUser.userId, email: adminUser.email, name: adminUser.name },
    });
  } catch (err) {
    console.error('[SuperAdmin] reset password error:', err);
    res.status(500).json({ message: 'Error resetting password', error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── PHASE 2: MARKET CONTROL & EMERGENCY SYSTEM ───────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /super-admin/market/state ─────────────────────────────────────────────
router.get('/market/state', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const state = marketControlService.getMarketState();
    res.json({ success: true, ...state });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch market state', error: err.message });
  }
});

// ── POST /super-admin/market/mode ─────────────────────────────────────────────
router.post('/market/mode', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode) return res.status(400).json({ success: false, message: 'mode is required (LIVE, REPLAY, SYNTHETIC)' });

    const state = await marketControlService.setMode(mode, req.user);
    res.json({ success: true, message: `Market mode switched to ${state.mode}`, ...state });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ── POST /super-admin/market/halt ─────────────────────────────────────────────
router.post('/market/halt', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { reason } = req.body;
    const state = await marketControlService.haltMarket(reason || 'Market halted by administrator', req.user);
    res.json({ success: true, message: 'Market has been halted', ...state });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /super-admin/market/resume ───────────────────────────────────────────
router.post('/market/resume', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const state = await marketControlService.resumeMarket(req.user);
    res.json({ success: true, message: 'Market trading has resumed', ...state });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /super-admin/market/emergency-halt ───────────────────────────────────
router.post('/market/emergency-halt', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { reason, autoSquareOffMIS } = req.body;
    const result = await marketControlService.emergencyHalt({
      reason: reason || 'EMERGENCY HALT TRIGGERED BY SUPER ADMIN',
      autoSquareOffMIS: Boolean(autoSquareOffMIS),
      user: req.user,
    });
    res.json({
      success: true,
      message: 'Emergency halt triggered successfully',
      ...result,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── PHASE 2: SUPPORT IMPERSONATION SYSTEM ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /super-admin/impersonate/:instituteId ────────────────────────────────
router.post('/impersonate/:instituteId', requireRole(['SUPER_ADMIN']), async (req, res) => {
  try {
    const { instituteId } = req.params;
    const query = mongoose.Types.ObjectId.isValid(instituteId)
      ? { _id: instituteId }
      : { code: String(instituteId).toUpperCase() };

    const institute = await InstituteModel.findOne(query);
    if (!institute) {
      return res.status(404).json({ success: false, message: 'Target institute not found' });
    }

    // Find primary admin user for this institute
    let targetAdmin = institute.ownerId
      ? await UserModel.findById(institute.ownerId)
      : await UserModel.findOne({ instituteCode: institute.code, role: 'INSTITUTE_ADMIN' });

    if (!targetAdmin) {
      targetAdmin = await UserModel.findOne({ instituteCode: institute.code });
    }

    if (!targetAdmin) {
      return res.status(400).json({
        success: false,
        message: 'No administrative account found for this institute to impersonate.',
      });
    }

    // Generate dedicated Support Impersonation JWT (30 min duration)
    const tokenPayload = {
      sub: targetAdmin._id.toString(),
      userId: targetAdmin.userId,
      role: 'INSTITUTE_ADMIN',
      name: targetAdmin.name,
      instituteCode: institute.code,
      instituteId: institute._id.toString(),
      instituteName: institute.name,
      impersonatedBy: req.user._id.toString(),
      impersonatorEmail: req.user.email,
      impersonatorName: req.user.name,
      isImpersonating: true,
    };

    const impersonationToken = jwt.sign(tokenPayload, ACCESS_SECRET, { expiresIn: '30m' });

    // Audit log this security-sensitive action
    await logAction({
      actorId: req.user._id,
      role: 'SUPER_ADMIN',
      action: 'IMPERSONATION_START',
      entity: 'Institute',
      entityId: institute._id,
      instituteId: institute._id,
      ip: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      details: {
        targetInstitute: institute.name,
        targetCode: institute.code,
        targetUserId: targetAdmin.userId,
        targetEmail: targetAdmin.email,
        expiresIn: '30m',
      },
    });

    const userObj = targetAdmin.toObject ? targetAdmin.toObject() : { ...targetAdmin };
    delete userObj.passwordHash;
    delete userObj.resetPasswordToken;

    res.json({
      success: true,
      message: `Impersonating ${institute.name} (Support Mode active for 30 minutes)`,
      accessToken: impersonationToken,
      token: impersonationToken,
      expiresIn: '30m',
      user: {
        ...userObj,
        role: 'INSTITUTE_ADMIN',
        instituteCode: institute.code,
        instituteId: institute._id,
        instituteName: institute.name,
        isImpersonating: true,
        impersonatedBy: req.user.name || req.user.email,
      },
      institute: {
        _id: institute._id,
        name: institute.name,
        code: institute.code,
      },
    });
  } catch (err) {
    console.error('[SuperAdmin] Impersonation error:', err);
    res.status(500).json({ success: false, message: 'Failed to initiate support session', error: err.message });
  }
});

module.exports = { superAdminRouter: router };
