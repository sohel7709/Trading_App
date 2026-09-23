require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { UserModel } = require('./model/UserModel');
const { BatchModel } = require('./model/BatchModel');
const { EnrollmentModel } = require('./model/EnrollmentModel');
const { WalletModel } = require('./model/WalletModel');
const { OrdersModel } = require('./model/OrdersModel');
const { ClosedPositionModel } = require('./model/ClosedPositionModel');
const { RiskLogModel } = require('./model/RiskLogModel');
const { NotificationModel } = require('./model/NotificationModel');

async function seedBatch24A() {
  await mongoose.connect(process.env.DATABASE_URL);
  console.log('Connected to MongoDB');

  const instituteCode = 'TEST1';
  let instructor = await UserModel.findOne({ email: 'intructor1@gmail.com' });
  if (!instructor) {
    instructor = await UserModel.findOne({ role: 'INSTRUCTOR', instituteCode });
  }
  if (!instructor) {
    console.error('No instructor found for TEST1');
    process.exit(1);
  }

  // 1. Find or create Batch 24-A
  const batchCode = 'BATCH24A';
  let batch = await BatchModel.findOne({ instituteCode, code: batchCode });
  const startDate = new Date();
  startDate.setHours(9, 15, 0, 0); // 9:15 AM

  if (!batch) {
    batch = new BatchModel({
      name: 'Batch 24-A · Options basics',
      code: batchCode,
      instituteCode,
      startDate,
      startingCapitalPaise: 50000000, // ₹5,00,000 each
      marketMode: 'LIVE',
      status: 'ACTIVE',
      instructors: [instructor._id]
    });
    await batch.save();
    console.log('Created Batch 24-A:', batch._id);
  } else {
    batch.name = 'Batch 24-A · Options basics';
    batch.startDate = startDate;
    batch.startingCapitalPaise = 50000000;
    batch.status = 'ACTIVE';
    if (!batch.instructors.includes(instructor._id)) {
      batch.instructors.push(instructor._id);
    }
    await batch.save();
    console.log('Updated Batch 24-A:', batch._id);
  }

  // 2. Ensure 32 students exist and are enrolled
  const studentNames = [
    'Aarav Sharma', 'Aditya Patel', 'Ananya Iyer', 'Aryan Nair',
    'Bhavna Joshi', 'Chetan Rao', 'Devika Pillai', 'Dhruv Mehta',
    'Esha Kulkarni', 'Gaurav Sen', 'Harshita Reddy', 'Ishaan Gupta',
    'Jhanvi Deshmukh', 'Kabir Malhotra', 'Kavya Singhania', 'Manish Bansal',
    'Neha Chawla', 'Nikhil Kapoor', 'Pooja Bhatt', 'Pranav Menon',
    'Priyanka Roy', 'Rahul Saxena', 'Rhea Chakraborty', 'Rohan Agarwal',
    'Sakshi Verma', 'Sameer Dixit', 'Sanya Mir', 'Siddharth Jain',
    'Tanvi Sethi', 'Utkarsh Trivedi', 'Varun Kashyap', 'Vidya Nair'
  ];

  const hashedPw = await bcrypt.hash('Password123!', 10);
  const enrolledStudentIds = [];

  // PnL distribution for the 28 active students: total exactly 102,340
  // Sum = 102,340. Avg across 32 students = +3,198 per student
  const activePnls = [
    30200, 14200, 11800, 9500, 8200, 7600, 6800, 5900, 5100, 4800,
    4200, 3900, 3500, 3100, 2800, 2400, 1900, 1500, 890, 450,
    -650, -1200, -1850, -2400, -3200, -4500, -6800, -5800
  ];

  for (let i = 0; i < studentNames.length; i++) {
    const name = studentNames[i];
    const email = `student24a_${i + 1}@institute.edu`;
    let user = await UserModel.findOne({ email });
    if (!user) {
      user = new UserModel({
        userId: `B24A${String(i + 1).padStart(3, '0')}`,
        name,
        email,
        passwordHash: hashedPw,
        role: 'STUDENT',
        instituteCode,
        status: 'ACTIVE'
      });
      await user.save();
    }
    enrolledStudentIds.push(user._id);

    // Enroll
    await EnrollmentModel.findOneAndUpdate(
      { batchId: batch._id, userId: user._id },
      { status: 'ACTIVE', instituteCode },
      { upsert: true, new: true }
    );

    // Setup wallet: ₹5,00,000 capital
    const startingCapital = 500000;
    const isStudentActive = i < 28;
    const pnl = isStudentActive ? activePnls[i] : 0;
    const marginUsed = isStudentActive ? Math.min(420000, Math.max(50000, 180000 + (i * 8000))) : 0;

    await WalletModel.findOneAndUpdate(
      { userId: user._id },
      {
        balance: startingCapital + pnl,
        balancePaise: (startingCapital + pnl) * 100,
        availableMargin: startingCapital - marginUsed,
        usedMargin: marginUsed,
        misMargin: Math.round(marginUsed * 0.6),
        optionMargin: Math.round(marginUsed * 0.4)
      },
      { upsert: true, new: true }
    );

    // Create trade orders / closed positions if active
    if (isStudentActive) {
      await ClosedPositionModel.deleteMany({ userId: user._id });
      await OrdersModel.deleteMany({ userId: user._id });

      const entryPrice = 120 + (i * 2);
      const qty = (i % 4 + 1) * 50;
      const exitPrice = Math.max(1, entryPrice + Math.round(pnl / qty));
      const closed = new ClosedPositionModel({
        userId: user._id,
        kind: 'option',
        symbol: i % 2 === 0 ? 'NIFTY 24500 CE' : 'BANKNIFTY 52000 PE',
        quantity: qty,
        avgPrice: entryPrice,
        exitPrice: exitPrice,
        pnl,
        dateStr: new Date().toISOString().slice(0, 10),
        closedAt: new Date(Date.now() - (i * 12 * 60 * 1000))
      });
      await closed.save();

      const order = new OrdersModel({
        userId: user._id,
        stockSymbol: i % 2 === 0 ? 'NIFTY 24500 CE' : 'BANKNIFTY 52000 PE',
        quantity: qty,
        price: entryPrice,
        side: 'BUY',
        type: 'MARKET',
        status: 'EXECUTED',
        createdAt: new Date(Date.now() - (i * 15 * 60 * 1000))
      });
      await order.save();
    }
  }

  // 3. Create exactly 3 Risk Breaches
  await RiskLogModel.deleteMany({ batchId: batch._id });
  const breachStudents = [enrolledStudentIds[26], enrolledStudentIds[27], enrolledStudentIds[25]];

  const risk1 = new RiskLogModel({
    userId: breachStudents[0],
    batchId: batch._id,
    ruleType: 'MAX_MARGIN_UTILIZATION',
    message: 'Margin utilization reached 84% of wallet balance (limit 80%)'
  });
  await risk1.save();

  const risk2 = new RiskLogModel({
    userId: breachStudents[1],
    batchId: batch._id,
    ruleType: 'MAX_MARGIN_UTILIZATION',
    message: 'Margin utilization reached 82% of wallet balance (limit 80%)'
  });
  await risk2.save();

  const risk3 = new RiskLogModel({
    userId: breachStudents[2],
    batchId: batch._id,
    ruleType: 'MAX_LOSS_PER_DAY',
    message: 'Daily loss exceeded ₹5,000 threshold (-₹6,800 today)'
  });
  await risk3.save();

  // 4. Notifications
  await NotificationModel.deleteMany({ batchId: batch._id });
  const notifs = [
    {
      userId: instructor._id,
      batchId: batch._id,
      type: 'RISK',
      title: 'Risk Limit Breach',
      message: 'Sakshi Verma exceeded maximum margin utilization (84% / 80%)',
      read: false
    },
    {
      userId: instructor._id,
      batchId: batch._id,
      type: 'RISK',
      title: 'Risk Limit Breach',
      message: 'Sameer Dixit exceeded maximum margin utilization (82% / 80%)',
      read: false
    },
    {
      userId: instructor._id,
      batchId: batch._id,
      type: 'RISK',
      title: 'Loss Warning',
      message: 'Sanya Mir breached max daily loss threshold (-₹6,800)',
      read: false
    },
    {
      userId: instructor._id,
      batchId: batch._id,
      type: 'TRADE',
      title: 'Large Profit Executed',
      message: 'Aarav Sharma booked +₹30,200 profit on NIFTY 24500 CE',
      read: false
    }
  ];
  await NotificationModel.insertMany(notifs);

  console.log('Successfully seeded Batch 24-A with 32 students, 28 active, 4 idle, +₹102,340 P&L, and 3 risk breaches!');
  await mongoose.disconnect();
}

seedBatch24A().catch(err => {
  console.error(err);
  process.exit(1);
});
