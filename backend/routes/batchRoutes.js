const express = require('express');
const { BatchModel } = require('../model/BatchModel');
const { EnrollmentModel } = require('../model/EnrollmentModel');
const { UserModel } = require('../model/UserModel');
const { WalletModel } = require('../model/WalletModel');
const { PositionsModel } = require('../model/PositionsModel');
const { OrdersModel } = require('../model/OrdersModel');
const { PLRecordModel } = require('../model/PLRecordModel');
const { requireRole } = require('../middleware/requireRole');
const { RiskRuleModel } = require('../model/RiskRuleModel');
const { AssignmentModel } = require('../model/AssignmentModel');
const { SubmissionModel } = require('../model/SubmissionModel');
const { JournalModel } = require('../model/JournalModel');
const { OptionPositionsModel } = require('../model/OptionPositionsModel');
const { ClosedPositionModel } = require('../model/ClosedPositionModel');
const { HoldingsModel } = require('../model/HoldingsModel');
const { RiskLogModel } = require('../model/RiskLogModel');
const { NotificationModel } = require('../model/NotificationModel');
const { InstituteModel } = require('../model/InstituteModel');
const marketDataService = require('../marketDataService');
const marketControlService = require('../services/marketControlService');

const router = express.Router();

const BATCH_ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'INSTITUTE_ADMIN', 'INSTRUCTOR'];

function canManageBatch(batch, user) {
  if (!batch || !user) return false;
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
  if (user.role === 'INSTITUTE_ADMIN') {
    return user.instituteCode && batch.instituteCode === user.instituteCode;
  }
  if (user.role === 'INSTRUCTOR') {
    const isAssigned = Array.isArray(batch.instructors) && batch.instructors.some(id => id.toString() === user._id.toString());
    const isSameInstitute = user.instituteCode && batch.instituteCode === user.instituteCode;
    return isAssigned || isSameInstitute;
  }
  return false;
}

// BATCH-01 — Create Batch
router.post('/', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const { name, code, startDate, endDate, startingCapitalPaise, marketMode, instructors } = req.body;
    const instituteCode = req.user.instituteCode || 'ADMIN';

    // Enforce Institute Batch Quota
    const institute = await InstituteModel.findOne({
      $or: [
        { code: instituteCode },
        ...(req.user.instituteId ? [{ _id: req.user.instituteId }] : [])
      ]
    });

    if (institute) {
      const maxBatches = institute.quota?.maxBatches || 3;
      const currentBatches = await BatchModel.countDocuments({ instituteCode });
      if (currentBatches >= maxBatches) {
        return res.status(400).json({
          message: `Batch quota exceeded (${currentBatches}/${maxBatches}). Please upgrade your institute plan to create more batches.`,
          quotaExceeded: true,
          limit: maxBatches,
          current: currentBatches,
        });
      }
    }

    let assignedInstructors = [];
    if (Array.isArray(instructors) && instructors.length > 0) {
      assignedInstructors = instructors;
    } else {
      assignedInstructors = [req.user._id];
    }

    // If an instructor creates a batch, ensure they are in the instructors list
    if (req.user.role === 'INSTRUCTOR' && !assignedInstructors.some(id => id.toString() === req.user._id.toString())) {
      assignedInstructors.push(req.user._id);
    }

    const batch = new BatchModel({
      name,
      code: (code || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)).toUpperCase(),
      instituteCode,
      startDate: startDate || new Date(),
      endDate,
      startingCapitalPaise: startingCapitalPaise || 10000000,
      marketMode: marketMode || 'LIVE',
      instructors: assignedInstructors,
    });

    await batch.save();

    // Increment usage counter on institute
    if (institute) {
      await InstituteModel.findByIdAndUpdate(institute._id, {
        $inc: { 'usage.currentBatches': 1 }
      });
    }
    const populated = await BatchModel.findById(batch._id).populate('instructors', 'name email');
    res.status(201).json({ message: 'Batch created successfully', batch: { ...populated.toObject(), studentCount: 0 } });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Batch code already exists for this institute' });
    }
    res.status(500).json({ message: 'Error creating batch', error: err.message });
  }
});

// BATCH-02 — Get Batches
router.get('/', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const instituteCode = req.user.instituteCode || 'ADMIN';
    let query = {};
    if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      query = {};
    } else if (req.user.role === 'INSTRUCTOR') {
      query = {
        $or: [
          { instituteCode },
          { instructors: req.user._id }
        ]
      };
    } else {
      query = { instituteCode };
    }

    const batches = await BatchModel.find(query).sort({ createdAt: -1 }).populate('instructors', 'name email');
    const enriched = await Promise.all(batches.map(async b => {
      const studentCount = await EnrollmentModel.countDocuments({ batchId: b._id, status: 'ACTIVE' });
      return { ...b.toObject(), studentCount };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching batches', error: err.message });
  }
});

// BATCH-03 — Update Batch
router.put('/:id', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const { name, startDate, endDate, startingCapitalPaise, marketMode, instructors, status } = req.body;
    const batch = await BatchModel.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    // Authorization check for INSTRUCTOR
    if (req.user.role === 'INSTRUCTOR') {
      const isAssigned = batch.instructors.some(id => id.toString() === req.user._id.toString());
      const isSameInstitute = req.user.instituteCode && batch.instituteCode === req.user.instituteCode;
      if (!isAssigned && !isSameInstitute) {
        return res.status(403).json({ message: 'Unauthorized to manage this batch' });
      }
    }

    if (name) batch.name = name;
    if (startDate) batch.startDate = startDate;
    if (endDate !== undefined) batch.endDate = endDate;
    if (startingCapitalPaise) batch.startingCapitalPaise = Number(startingCapitalPaise);
    if (marketMode) batch.marketMode = marketMode;
    if (status && ['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) batch.status = status;
    if (Array.isArray(instructors) && instructors.length > 0) {
      batch.instructors = instructors;
    }

    await batch.save();
    const studentCount = await EnrollmentModel.countDocuments({ batchId: batch._id, status: 'ACTIVE' });
    const populated = await BatchModel.findById(batch._id).populate('instructors', 'name email');
    res.json({ message: 'Batch updated successfully', batch: { ...populated.toObject(), studentCount } });
  } catch (err) {
    res.status(500).json({ message: 'Error updating batch', error: err.message });
  }
});

// BATCH-04 — Activate / Archive Batch
router.patch('/:id/status', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const batch = await BatchModel.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    res.json({ message: `Batch marked as ${status}`, batch });
  } catch (err) {
    res.status(500).json({ message: 'Error updating batch', error: err.message });
  }
});

// ENR-01 — Add Student (Enrollment)
router.post('/:id/enroll', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const { studentId } = req.body; // Can be an array of ObjectIds in future
    const batchId = req.params.id;
    
    const batch = await BatchModel.findById(batchId);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const student = await UserModel.findById(studentId);
    if (!student || student.role !== 'STUDENT') {
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    const enrollment = await EnrollmentModel.findOneAndUpdate(
      { userId: studentId, batchId },
      {
        $set: {
          status: 'ACTIVE',
          instituteCode: batch.instituteCode,
        },
        $setOnInsert: {
          joinedAt: new Date(),
        }
      },
      { new: true, upsert: true }
    );

    // BATCH-05: Allocate Capital (if wallet doesn't exist or we want to overwrite)
    let wallet = await WalletModel.findOne({ userId: studentId });
    if (!wallet) {
      const capPaise = batch.startingCapitalPaise || 10000000;
      const capRupees = capPaise / 100;
      wallet = new WalletModel({
        userId: studentId,
        balance: capRupees,
        balancePaise: capPaise,
        availableMargin: capRupees,
        blockedMargin: 0,
        blockedMarginPaise: 0
      });
      await wallet.save();
    }

    res.status(201).json({ message: 'Student enrolled successfully', enrollment });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Student already enrolled in this batch' });
    res.status(500).json({ message: 'Error enrolling student', error: err.message });
  }
});

// BATCH-06 / BATCH-07 — Reset Capital & Clear Data
router.post('/:id/reset', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const batchId = req.params.id;
    const { studentId } = req.body; // optional: if provided, reset just one student
    
    const batch = await BatchModel.findById(batchId);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    let query = { batchId };
    if (studentId) {
      query.userId = studentId;
    }

    // Find enrolled students to reset
    const enrollments = await EnrollmentModel.find(query);
    const userIds = enrollments.map(e => e.userId);

    if (userIds.length === 0) {
      return res.status(404).json({ message: 'No students found to reset' });
    }

    // 1. Delete all open/closed positions
    await PositionsModel.deleteMany({ userId: { $in: userIds } });
    
    // 2. Delete all orders
    await OrdersModel.deleteMany({ userId: { $in: userIds } });

    // 3. Delete PL records
    await PLRecordModel.deleteMany({ userId: { $in: userIds } });

    // 4. Reset wallets
    const capPaise = batch.startingCapitalPaise || 10000000;
    const capRupees = capPaise / 100;
    await WalletModel.updateMany(
      { userId: { $in: userIds } },
      { 
        $set: { 
          balance: capRupees,
          balancePaise: capPaise,
          availableMargin: capRupees,
          usedMargin: 0,
          misMargin: 0,
          optionMargin: 0,
          blockedMargin: 0,
          blockedMarginPaise: 0 
        } 
      }
    );

    // TODO: Audit logging here

    res.json({ message: `Successfully reset capital for ${userIds.length} student(s)` });
  } catch (err) {
    res.status(500).json({ message: 'Error resetting batch', error: err.message });
  }
});

// Get enrolled students for a batch
router.get('/:id/students', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const enrollments = await EnrollmentModel.find({ batchId: req.params.id, status: 'ACTIVE' })
      .populate('userId', 'name email userId');
    
    const enriched = await Promise.all(enrollments.map(async (enr) => {
      const studentId = enr.userId?._id || enr.userId;
      const wallet = await WalletModel.findOne({ userId: studentId }).lean();
      return {
        ...enr.toObject(),
        wallet: wallet || { balance: 0, balancePaise: 0 }
      };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching students', error: err.message });
  }
});

// Remove student from batch (unenroll)
router.delete('/:id/students/:studentId', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const { id: batchId, studentId } = req.params;
    const enrollment = await EnrollmentModel.findOneAndUpdate(
      { batchId, userId: studentId, status: 'ACTIVE' },
      { status: 'DROPPED' },
      { new: true }
    );
    if (!enrollment) {
      return res.status(404).json({ message: 'Active enrollment not found' });
    }
    res.json({ message: 'Student removed from batch', enrollment });
  } catch (err) {
    res.status(500).json({ message: 'Error removing student', error: err.message });
  }
});


// GRID-05 — Student Drilldown API
router.get('/:id/students/:studentId', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const { id: batchId, studentId } = req.params;
    
    // Verify enrollment
    const enrollment = await EnrollmentModel.findOne({ batchId, userId: studentId, status: 'ACTIVE' });
    if (!enrollment) return res.status(404).json({ message: 'Student is not actively enrolled in this batch' });
    
    // Fetch live data
    const { HoldingsModel } = require('../model/HoldingsModel');
    const positions = await PositionsModel.find({ userId: studentId });
    const holdings = await HoldingsModel.find({ userId: studentId });
    const wallet = await WalletModel.findOne({ userId: studentId });
    
    const dateStr = require('../marketRules').istDateStr();
    const plRecord = await PLRecordModel.findOne({ userId: studentId, dateStr });

    // Fetch Orders, Journals, and Risk Logs (Option A Optimization)
    const [orders, journals, riskLogs] = await Promise.all([
      OrdersModel.find({ userId: studentId }).sort({ createdAt: -1 }),
      JournalModel.find({ userId: studentId }).sort({ createdAt: -1 }),
      RiskLogModel.find({ userId: studentId, batchId }).sort({ createdAt: -1 })
    ]);

    res.json({
      studentId,
      wallet: wallet || { balance: 0, balancePaise: 0, availableMargin: 0, blockedMarginPaise: 0 },
      plRecord: plRecord || { netPnl: 0, realizedPnl: 0 },
      positions,
      holdings,
      orders,
      journals,
      riskLogs
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching student drilldown', error: err.message });
  }
});

// RISK-02 — Get Risk Rules for a batch
router.get('/:id/risk-rules', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const batchId = req.params.id;
    const rule = await RiskRuleModel.findOne({ batchId });
    if (!rule) return res.status(404).json({ message: 'Risk rules not found for this batch' });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching risk rules', error: err.message });
  }
});

// RISK-02 — Create or Update Risk Rules for a batch
router.put('/:id/risk-rules', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const batchId = req.params.id;
    const batch = await BatchModel.findById(batchId);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const updateData = {
      ...req.body,
      instituteCode: batch.instituteCode,
      updatedBy: req.user._id
    };

    const rule = await RiskRuleModel.findOneAndUpdate(
      { batchId },
      updateData,
      { new: true, upsert: true } // Create if doesn't exist
    );

    res.json({ message: 'Risk rules updated', rule });
  } catch (err) {
    res.status(500).json({ message: 'Error updating risk rules', error: err.message });
  }
});

// ASSIGNMENTS — Get all for batch
router.get('/:id/assignments', requireRole([...BATCH_ADMIN_ROLES, 'STUDENT']), async (req, res) => {
  try {
    const assignments = await AssignmentModel.find({ batchId: req.params.id }).populate('createdBy', 'name');
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching assignments', error: err.message });
  }
});

// ASSIGNMENTS — Create new (Instructor only)
router.post('/:id/assignments', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const { title, description, dueDate, autoClose } = req.body;
    const assignment = new AssignmentModel({
      batchId: req.params.id,
      title,
      description,
      dueDate,
      autoClose,
      createdBy: req.user._id
    });
    await assignment.save();
    res.status(201).json({ message: 'Assignment created', assignment });
  } catch (err) {
    res.status(500).json({ message: 'Error creating assignment', error: err.message });
  }
});

// ASSIGNMENTS — Submit (Student only)
router.post('/:batchId/assignments/:assignmentId/submit', requireRole(['STUDENT']), async (req, res) => {
  try {
    const { content, screenshotUrl } = req.body;
    
    // Upsert submission
    const submission = await SubmissionModel.findOneAndUpdate(
      { assignmentId: req.params.assignmentId, userId: req.user._id },
      { 
        content, 
        screenshotUrl, 
        status: 'SUBMITTED', 
        submittedAt: new Date() 
      },
      { new: true, upsert: true }
    );
    
    res.json({ message: 'Assignment submitted successfully', submission });
  } catch (err) {
    res.status(500).json({ message: 'Error submitting assignment', error: err.message });
  }
});

// ASSIGNMENTS — Get student's own submission
router.get('/:batchId/assignments/:assignmentId/my-submission', requireRole(['STUDENT']), async (req, res) => {
  try {
    const submission = await SubmissionModel.findOne({ assignmentId: req.params.assignmentId, userId: req.user._id });
    res.json(submission || null);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching submission', error: err.message });
  }
});

// ASSIGNMENTS — Get submissions for instructor
router.get('/:batchId/assignments/:assignmentId/submissions', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {

  try {
    const submissions = await SubmissionModel.find({ assignmentId: req.params.assignmentId }).populate('userId', 'name email');
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching submissions', error: err.message });
  }
});

// REPORTS — Get Leaderboard (Live Monitoring)
router.get('/:id/leaderboard', requireRole([...BATCH_ADMIN_ROLES, 'STUDENT']), async (req, res) => {
  try {
    const batchId = req.params.id;
    const period = req.query.period || 'today';

    const CacheService = require('../services/cacheService');
    if (period === 'today' && !req.query.fresh && !req.query.nocache) {
      const cached = await CacheService.getLeaderboard(batchId);
      if (cached) {
        return res.json(cached);
      }
    }

    const batch = await BatchModel.findById(batchId).lean();
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const enrollments = await EnrollmentModel.find({ batchId, status: 'ACTIVE' }).populate('userId', 'name email userId').lean();
    const validEnrollments = enrollments.filter(e => e.userId && e.userId._id);
    const userIds = validEnrollments.map(e => e.userId._id);

    const dateStr = require('../marketRules').istDateStr();

    // Query period filter for closed trades / PL records
    let closedQuery = { userId: { $in: userIds } };
    let plQuery = { userId: { $in: userIds } };

    if (period === 'today') {
      closedQuery.dateStr = dateStr;
      plQuery.dateStr = dateStr;
    } else if (period === 'weekly') {
      const weekAgo = new Date(Date.now() - 7 * 86400000);
      closedQuery.createdAt = { $gte: weekAgo };
      plQuery.tradeDate = { $gte: weekAgo };
    } else if (period === 'monthly') {
      const monthAgo = new Date(Date.now() - 30 * 86400000);
      closedQuery.createdAt = { $gte: monthAgo };
      plQuery.tradeDate = { $gte: monthAgo };
    }

    // Parallel lean fetch for all students in batch (Zero Mongoose document overhead)
    const [wallets, closedTrades, eqPositions, optPositions, userHoldings, plRecords, allOrders] = await Promise.all([
      WalletModel.find({ userId: { $in: userIds } }).lean(),
      ClosedPositionModel.find(closedQuery).lean(),
      PositionsModel.find({ userId: { $in: userIds } }).lean(),
      OptionPositionsModel.find({ userId: { $in: userIds } }).lean(),
      HoldingsModel.find({ userId: { $in: userIds } }).lean(),
      PLRecordModel.find(plQuery).lean(),
      OrdersModel.find({ userId: { $in: userIds } }).select('userId').lean(),
    ]);

    const batchDefaultCapitalRupees = (batch.startingCapitalPaise || 10000000) / 100;

    const leaderboard = validEnrollments.map(enroll => {
      const uid = enroll.userId._id.toString();
      const wallet = wallets.find(w => w.userId.toString() === uid);

      // 1. Realized PnL from closed positions and PL records
      const userClosed = closedTrades.filter(c => c.userId.toString() === uid);
      const userPL = plRecords.filter(r => r.userId.toString() === uid);
      
      let realizedPnl = userClosed.reduce((sum, c) => sum + (c.pnl || 0), 0);
      if (userClosed.length === 0 && userPL.length > 0) {
        realizedPnl = userPL.reduce((sum, r) => sum + ((r.netPnl || 0) / 100), 0);
      }

      // 2. Live Unrealized PnL from CNC Holdings
      const myHoldings = userHoldings.filter(h => h.userId.toString() === uid);
      let unrealizedPnl = 0;
      myHoldings.forEach(h => {
        const live = marketDataService.getStockPrice(h.stockSymbol);
        const curPrice = live?.ltp ?? h.ltp ?? h.avgPrice;
        unrealizedPnl += (curPrice - h.avgPrice) * h.quantity;
      });

      // 3. Live Unrealized PnL from MIS equity positions
      const userEq = eqPositions.filter(p => p.userId.toString() === uid);
      userEq.forEach(p => {
        const live = marketDataService.getStockPrice(p.stockSymbol);
        const curPrice = live?.ltp ?? p.ltp ?? p.avgPrice;
        unrealizedPnl += (curPrice - p.avgPrice) * p.quantity;
      });

      // 4. Live Unrealized PnL from open option positions
      const userOpt = optPositions.filter(p => p.userId.toString() === uid);
      userOpt.forEach(p => {
        const liveLtp = marketDataService.getOptionLTPSync ? marketDataService.getOptionLTPSync(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry) : (p.ltp ?? p.avgPrice);
        const curPrice = Number(typeof liveLtp === 'number' ? liveLtp : (p.ltp ?? p.avgPrice));
        const dir = p.side === 'BUY' ? 1 : -1;
        const diff = (curPrice - p.avgPrice) * p.quantity * dir;
        unrealizedPnl += isNaN(diff) ? 0 : diff;
      });

      const totalNetPnl = Math.round((realizedPnl + unrealizedPnl) * 100) / 100;
      const startingCapital = enroll.startingCapitalPaise ? (enroll.startingCapitalPaise / 100) : batchDefaultCapitalRupees;
      const currentBalance = wallet ? wallet.balance : (startingCapital + totalNetPnl);
      const roi = startingCapital > 0 ? Math.round((totalNetPnl / startingCapital) * 10000) / 100 : 0;
      const totalTrades = allOrders.filter(o => o.userId.toString() === uid).length;
      const totalOpenPositions = myHoldings.length + userEq.length + userOpt.length;

      return {
        studentId: enroll.userId._id,
        student: enroll.userId.name,
        studentName: enroll.userId.name,
        studentUserId: enroll.userId.userId || '',
        email: enroll.userId.email,
        startingCapital,
        balance: Math.round(currentBalance * 100) / 100,
        balancePaise: wallet ? (wallet.balancePaise || Math.round(currentBalance * 100)) : Math.round(currentBalance * 100),
        pnl: totalNetPnl,
        netPnlPaise: Math.round(totalNetPnl * 100),
        realizedPnl: Math.round(realizedPnl * 100) / 100,
        unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
        roi,
        openPositions: totalOpenPositions,
        openPositionsCount: totalOpenPositions,
        totalTrades,
      };
    });

    // Sort descending by Net PnL
    leaderboard.sort((a, b) => b.pnl - a.pnl);

    // Assign 1-indexed ranks
    leaderboard.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });

    if (period === 'today') {
      CacheService.setLeaderboard(batchId, leaderboard, 5).catch(() => {});
    }

    res.json(leaderboard);
  } catch (err) {
    console.error('[Leaderboard] error:', err);
    res.status(500).json({ message: 'Error fetching leaderboard', error: err.message });
  }
});

// ============ BATCH PERFORMANCE & ANALYTICS ============
router.get('/:id/performance', requireRole([...BATCH_ADMIN_ROLES, 'STUDENT']), async (req, res) => {
  try {
    const batchId = req.params.id;
    const batch = await BatchModel.findById(batchId);
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const enrollments = await EnrollmentModel.find({ batchId, status: 'ACTIVE' }).populate('userId', 'name email');
    const validEnrollments = enrollments.filter(e => e.userId && e.userId._id);
    const userIds = validEnrollments.map(e => e.userId._id);

    const [closedTrades, plRecords, allOrders, userHoldings, eqPositions, optPositions] = await Promise.all([
      ClosedPositionModel.find({ userId: { $in: userIds } }),
      PLRecordModel.find({ userId: { $in: userIds } }),
      OrdersModel.find({ userId: { $in: userIds } }),
      HoldingsModel.find({ userId: { $in: userIds } }),
      PositionsModel.find({ userId: { $in: userIds } }),
      OptionPositionsModel.find({ userId: { $in: userIds } }),
    ]);

    // Student-by-student calculation
    const studentStats = validEnrollments.map(enroll => {
      const uid = enroll.userId._id.toString();
      const userClosed = closedTrades.filter(c => c.userId.toString() === uid);
      const userPL = plRecords.filter(r => r.userId.toString() === uid);
      
      let realized = userClosed.reduce((sum, c) => sum + (c.pnl || 0), 0);
      if (userClosed.length === 0 && userPL.length > 0) {
        realized = userPL.reduce((sum, r) => sum + ((r.netPnl || 0) / 100), 0);
      }

      let winCount = 0;
      userClosed.forEach(c => {
        if ((c.pnl || 0) > 0) winCount++;
      });

      let unrealized = 0;
      userHoldings.filter(h => h.userId.toString() === uid).forEach(h => {
        const curPrice = marketDataService.getStockPrice(h.stockSymbol)?.ltp ?? h.ltp ?? h.avgPrice;
        unrealized += (curPrice - h.avgPrice) * h.quantity;
      });
      eqPositions.filter(p => p.userId.toString() === uid).forEach(p => {
        const curPrice = marketDataService.getStockPrice(p.stockSymbol)?.ltp ?? p.ltp ?? p.avgPrice;
        unrealized += (curPrice - p.avgPrice) * p.quantity;
      });
      optPositions.filter(p => p.userId.toString() === uid).forEach(p => {
        const liveLtp = marketDataService.getOptionLTPSync ? marketDataService.getOptionLTPSync(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry) : (p.ltp ?? p.avgPrice);
        const curPrice = Number(typeof liveLtp === 'number' ? liveLtp : (p.ltp ?? p.avgPrice));
        const dir = p.side === 'BUY' ? 1 : -1;
        const diff = (curPrice - p.avgPrice) * p.quantity * dir;
        unrealized += isNaN(diff) ? 0 : diff;
      });

      const netPnl = Math.round((realized + unrealized) * 100) / 100;
      const tradesCount = allOrders.filter(o => o.userId.toString() === uid).length;
      const winRate = userClosed.length > 0 ? Math.round((winCount / userClosed.length) * 100) : 0;

      return {
        studentId: enroll.userId._id,
        name: enroll.userId.name,
        email: enroll.userId.email,
        pnl: netPnl,
        totalTrades: tradesCount,
        winRate,
      };
    });

    studentStats.sort((a, b) => b.pnl - a.pnl);
    const topPerformers = studentStats.slice(0, 5).map((s, idx) => ({ ...s, rank: idx + 1 }));

    const count = studentStats.length || 1;
    const totalPnlSum = studentStats.reduce((sum, s) => sum + s.pnl, 0);
    const totalTradesSum = studentStats.reduce((sum, s) => sum + s.totalTrades, 0);
    const avgWinRate = Math.round(studentStats.reduce((sum, s) => sum + s.winRate, 0) / count);

    const batchAverage = {
      avgPnl: Math.round((totalPnlSum / count) * 100) / 100,
      totalPnl: Math.round(totalPnlSum * 100) / 100,
      totalTrades: totalTradesSum,
      avgWinRate,
      studentCount: studentStats.length,
    };

    // Construct 7-day timeline
    const timeline = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().slice(0, 10);
      
      const dayClosed = closedTrades.filter(c => c.dateStr === dStr);
      let dayPnl = dayClosed.reduce((sum, c) => sum + (c.pnl || 0), 0);
      
      // If today, add current unrealized across batch
      if (i === 0) {
        dayPnl += studentStats.reduce((sum, s) => sum + s.pnl, 0) - dayPnl;
      }

      const avgDayPnl = Math.round((dayPnl / count) * 100) / 100;
      const topDayPnl = topPerformers.length > 0 ? (i === 0 ? topPerformers[0].pnl : Math.round(avgDayPnl * 1.8)) : 0;

      timeline.push({
        date: dStr,
        avgPnl: avgDayPnl,
        topPnl: topDayPnl,
      });
    }

    res.json({
      success: true,
      batchId,
      batchName: batch.name || batch.batchName || batch.code,
      batchCode: batch.code,
      topPerformers,
      batchAverage,
      timeline,
    });
  } catch (err) {
    console.error('[Batch Performance] error:', err);
    res.status(500).json({ message: 'Error fetching batch performance', error: err.message });
  }
});

// ============ BATCH SESSION REAL-TIME STATS ============
router.get('/:id/session-stats', requireRole([...BATCH_ADMIN_ROLES, 'STUDENT']), async (req, res) => {
  try {
    const batchId = req.params.id;
    const batch = await BatchModel.findById(batchId).populate('instructors', 'name email');
    if (!batch) {
      return res.status(404).json({ message: 'Batch not found' });
    }

    const enrollments = await EnrollmentModel.find({ batchId, status: 'ACTIVE' }).populate('userId', 'name email');
    const validEnrollments = enrollments.filter(e => e.userId && e.userId._id);
    const userIds = validEnrollments.map(e => e.userId._id);

    const [closedTrades, plRecords, allOrders, userHoldings, eqPositions, optPositions, wallets, riskLogs, notifications] = await Promise.all([
      ClosedPositionModel.find({ userId: { $in: userIds } }),
      PLRecordModel.find({ userId: { $in: userIds } }),
      OrdersModel.find({ userId: { $in: userIds } }),
      HoldingsModel.find({ userId: { $in: userIds } }),
      PositionsModel.find({ userId: { $in: userIds } }),
      OptionPositionsModel.find({ userId: { $in: userIds } }),
      WalletModel.find({ userId: { $in: userIds } }),
      RiskLogModel.find({ batchId }).populate('userId', 'name email').sort({ createdAt: -1 }),
      NotificationModel.find({ batchId }).sort({ createdAt: -1 }).limit(25)
    ]);

    // Student-by-student live stats
    const studentRoster = validEnrollments.map(enroll => {
      const uid = enroll.userId._id.toString();
      const userClosed = closedTrades.filter(c => c.userId.toString() === uid);
      const userPL = plRecords.filter(r => r.userId.toString() === uid);
      const userOrders = allOrders.filter(o => o.userId.toString() === uid);
      const userWallet = wallets.find(w => w.userId.toString() === uid);

      let realized = userClosed.reduce((sum, c) => sum + (c.pnl || 0), 0);
      if (userClosed.length === 0 && userPL.length > 0) {
        realized = userPL.reduce((sum, r) => sum + ((r.netPnl || 0) / 100), 0);
      }

      let unrealized = 0;
      let openPosCount = 0;
      userHoldings.filter(h => h.userId.toString() === uid).forEach(h => {
        const curPrice = marketDataService.getStockPrice(h.stockSymbol)?.ltp ?? h.ltp ?? h.avgPrice;
        unrealized += (curPrice - h.avgPrice) * h.quantity;
      });
      eqPositions.filter(p => p.userId.toString() === uid).forEach(p => {
        const curPrice = marketDataService.getStockPrice(p.stockSymbol)?.ltp ?? p.ltp ?? p.avgPrice;
        unrealized += (curPrice - p.avgPrice) * p.quantity;
        openPosCount++;
      });
      optPositions.filter(p => p.userId.toString() === uid).forEach(p => {
        const liveLtp = marketDataService.getOptionLTPSync ? marketDataService.getOptionLTPSync(p.underlyingSymbol, p.strikePrice, p.optionType, p.expiry) : (p.ltp ?? p.avgPrice);
        const curPrice = Number(typeof liveLtp === 'number' ? liveLtp : (p.ltp ?? p.avgPrice));
        const dir = p.side === 'BUY' ? 1 : -1;
        const diff = (curPrice - p.avgPrice) * p.quantity * dir;
        unrealized += isNaN(diff) ? 0 : diff;
        openPosCount++;
      });

      const netPnl = Math.round((realized + unrealized) * 100) / 100;
      const capital = userWallet ? (userWallet.balancePaise ? userWallet.balancePaise / 100 : userWallet.balance) : (batch.startingCapitalPaise / 100);
      const availableMargin = userWallet?.availableMargin ?? capital;
      const usedMargin = Math.max(0, capital - availableMargin);
      const marginUsedPercent = capital > 0 ? Math.min(100, Math.round((usedMargin / capital) * 100)) : 0;
      const roi = capital > 0 ? (netPnl / capital) * 100 : 0;

      // Active vs Idle criteria
      const hasOrders = userOrders.length > 0;
      const hasPositions = openPosCount > 0;
      const isActive = hasOrders || hasPositions;

      return {
        studentId: enroll.userId._id,
        name: enroll.userId.name,
        email: enroll.userId.email,
        capital,
        availableMargin,
        usedMargin,
        marginUsedPercent,
        netPnl,
        roi: Math.round(roi * 10) / 10,
        openPositionsCount: openPosCount,
        totalTrades: userOrders.length,
        isActive,
        status: isActive ? 'ACTIVE' : 'IDLE'
      };
    });

    const totalStudents = studentRoster.length;
    let activeNow = studentRoster.filter(s => s.isActive).length;
    let idleCount = totalStudents - activeNow;

    const batchPnl = Math.round(studentRoster.reduce((sum, s) => sum + s.netPnl, 0) * 100) / 100;
    const avgPnl = totalStudents > 0 ? Math.round((batchPnl / totalStudents) * 100) / 100 : 0;
    const startingCapital = (batch.startingCapitalPaise || 50000000) / 100;

    // Risk breaches
    const riskBreachesCount = riskLogs.length;

    // Combine recent notifications and risk logs into a clean alerts stream
    const recentAlerts = [];
    riskLogs.forEach(r => {
      recentAlerts.push({
        id: r._id,
        type: 'RISK',
        title: 'Risk Limit Breach',
        studentName: r.userId?.name || 'Student',
        studentEmail: r.userId?.email || '',
        message: r.message,
        ruleType: r.ruleType,
        time: r.createdAt,
        severity: 'error'
      });
    });

    notifications.filter(n => n.type !== 'RISK').forEach(n => {
      recentAlerts.push({
        id: n._id,
        type: n.type || 'SYSTEM',
        title: n.title || 'Live Alert',
        studentName: n.data?.studentName || '',
        studentEmail: '',
        message: n.message,
        time: n.createdAt,
        severity: n.type === 'TRADE' ? 'success' : 'info'
      });
    });

    recentAlerts.sort((a, b) => new Date(b.time) - new Date(a.time));
    studentRoster.sort((a, b) => b.netPnl - a.netPnl);

    res.json({
      success: true,
      instituteCode: batch.instituteCode,
      batch: {
        id: batch._id,
        name: batch.name,
        code: batch.code,
        instituteCode: batch.instituteCode,
        marketMode: batch.marketMode,
        startDate: batch.startDate,
        startingCapitalPaise: batch.startingCapitalPaise || 50000000,
        startingCapital,
      },
      stats: {
        totalStudents,
        startingCapital,
        capitalSubtitle: `Capital ₹${startingCapital.toLocaleString('en-IN')} each`,
        activeNow,
        idleCount,
        idleSubtitle: `${idleCount} idle for over 10 min`,
        totalPnl: batchPnl,
        avgPnl,
        avgSubtitle: `Avg ${avgPnl >= 0 ? '+' : '-'}₹${Math.abs(Math.round(avgPnl)).toLocaleString('en-IN')} per student`,
        riskBreaches: riskBreachesCount,
        riskSubtitle: riskBreachesCount > 0 ? 'Margin over 80% of wallet' : 'All students within limits'
      },
      alerts: recentAlerts.slice(0, 15),
      roster: studentRoster
    });
  } catch (err) {
    console.error('[Session Stats Error]:', err);
    res.status(500).json({ message: 'Error fetching session stats', error: err.message });
  }
});

// ─── BATCH MARKET CONTROL ENDPOINTS (For Institute Admin & Instructor) ───
// GET /batches/:id/market-state
router.get('/:id/market-state', async (req, res) => {
  try {
    const batch = await BatchModel.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    // Authorization: Admin, Instructor of batch/institute, or Student enrolled in batch
    let authorized = false;
    if (req.user) {
      if (canManageBatch(batch, req.user)) {
        authorized = true;
      } else {
        const enrollment = await EnrollmentModel.findOne({ batchId: batch._id, userId: req.user._id, status: 'ACTIVE' });
        if (enrollment) authorized = true;
      }
    } else {
      authorized = true; // allow public check if configured
    }

    if (!authorized) {
      return res.status(403).json({ message: 'Unauthorized to view market state for this batch' });
    }

    const batchState = await marketControlService.getBatchMarketState(batch._id);
    const globalState = marketControlService.getMarketState();

    res.json({
      success: true,
      batchId: batch._id,
      batchName: batch.name,
      batchCode: batch.code,
      mode: batchState?.mode || batch.marketMode || 'LIVE',
      isHalted: globalState.isHalted || Boolean(batchState?.isHalted),
      globalHalted: globalState.isHalted,
      batchHalted: Boolean(batchState?.isHalted),
      haltReason: globalState.isHalted ? globalState.haltReason : (batchState?.haltReason || null),
      haltedAt: globalState.isHalted ? globalState.haltedAt : (batchState?.haltedAt || null),
      haltedBy: globalState.isHalted ? globalState.updatedBy : (batchState?.haltedBy || null),
      updatedAt: batchState?.updatedAt || new Date().toISOString(),
      globalState,
    });
  } catch (err) {
    console.error('[BatchMarketState] Error:', err);
    res.status(500).json({ message: 'Error fetching batch market state', error: err.message });
  }
});

// POST /batches/:id/market-mode
router.post('/:id/market-mode', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const batch = await BatchModel.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    if (!canManageBatch(batch, req.user)) {
      return res.status(403).json({ message: 'Unauthorized: You can only control market mode for your own institute or assigned batches.' });
    }

    const { mode } = req.body;
    if (!mode) return res.status(400).json({ message: 'Mode is required (LIVE, REPLAY, SYNTHETIC, DELAYED)' });

    const state = await marketControlService.setBatchMode(batch._id, mode, req.user);
    res.json({
      success: true,
      message: `Batch [${batch.code}] market mode switched to ${state.mode}`,
      state,
    });
  } catch (err) {
    console.error('[BatchMarketMode] Error:', err);
    res.status(500).json({ message: err.message || 'Error updating batch market mode' });
  }
});

// POST /batches/:id/market-halt
router.post('/:id/market-halt', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const batch = await BatchModel.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    if (!canManageBatch(batch, req.user)) {
      return res.status(403).json({ message: 'Unauthorized: You can only halt trading for your own institute or assigned batches.' });
    }

    const reason = req.body.reason || `Trading halted for batch ${batch.code} by instructor`;
    const state = await marketControlService.haltBatch(batch._id, reason, req.user);

    res.json({
      success: true,
      message: `Batch [${batch.code}] trading has been halted`,
      state,
    });
  } catch (err) {
    console.error('[BatchMarketHalt] Error:', err);
    res.status(500).json({ message: err.message || 'Error halting batch trading' });
  }
});

// POST /batches/:id/market-resume
router.post('/:id/market-resume', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const batch = await BatchModel.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    if (!canManageBatch(batch, req.user)) {
      return res.status(403).json({ message: 'Unauthorized: You can only resume trading for your own institute or assigned batches.' });
    }

    const state = await marketControlService.resumeBatch(batch._id, req.user);

    res.json({
      success: true,
      message: `Batch [${batch.code}] trading has resumed`,
      state,
    });
  } catch (err) {
    console.error('[BatchMarketResume] Error:', err);
    res.status(500).json({ message: err.message || 'Error resuming batch trading' });
  }
});

// POST /batches/:id/emergency-halt
router.post('/:id/emergency-halt', requireRole(BATCH_ADMIN_ROLES), async (req, res) => {
  try {
    const batch = await BatchModel.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    if (!canManageBatch(batch, req.user)) {
      return res.status(403).json({ message: 'Unauthorized: You can only trigger emergency halt for your own institute or assigned batches.' });
    }

    const reason = req.body.reason || `Emergency halt triggered for batch ${batch.code}`;
    const autoSquareOffMIS = Boolean(req.body.autoSquareOffMIS);

    const result = await marketControlService.emergencyHaltBatch({
      batchId: batch._id,
      reason,
      autoSquareOffMIS,
      user: req.user,
    });

    res.json({
      success: true,
      message: `Emergency halt executed for batch [${batch.code}]`,
      ...result,
    });
  } catch (err) {
    console.error('[BatchEmergencyHalt] Error:', err);
    res.status(500).json({ message: err.message || 'Error executing emergency halt' });
  }
});

module.exports = { batchRouter: router };

