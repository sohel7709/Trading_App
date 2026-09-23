const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const { BatchModel } = require('./model/BatchModel');
const { EnrollmentModel } = require('./model/EnrollmentModel');
const { PositionsModel } = require('./model/PositionsModel');
const { WalletModel } = require('./model/WalletModel');
const marketDataService = require('./marketDataService');

const redisClient = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null
});

// Queue for the 1-second MTM loop
const mtmQueue = new Queue('mtm-engine', { connection: redisClient });

// Set up the Worker
let ioInstance = null;
let previousGridState = {}; // In-memory cache for delta computation

const mtmWorker = new Worker('mtm-engine', async job => {
  if (job.name === 'process-mtm' && ioInstance) {
    try {
      // Find all ACTIVE batches
      const batches = await BatchModel.find({ status: 'ACTIVE' });
      
      for (const batch of batches) {
        const batchIdStr = batch._id.toString();
        // Get all enrollments for this batch
        const enrollments = await EnrollmentModel.find({ batchId: batch._id, status: 'ACTIVE' })
          .populate('userId', 'name userId');

        const liveGridData = {};
        const stockPrices = marketDataService.getStockPrices(); // Get all current market prices
        const deltaPayload = [];

        for (const enrollment of enrollments) {
          const userId = enrollment.userId._id;
          
          // Calculate net PnL and Margin used
          const positions = await PositionsModel.find({ userId });
          let netPnlPaise = 0;
          let marginUsedPaise = 0;
          
          for (const pos of positions) {
            const currentPricePaise = stockPrices[pos.symbol] || pos.averagePricePaise; // fallback
            const pnl = (currentPricePaise - pos.averagePricePaise) * pos.quantity;
            netPnlPaise += pnl;
            
            marginUsedPaise += Math.abs(pos.averagePricePaise * pos.quantity);
          }

          const riskFlags = [];
          if (netPnlPaise < -500000) { // -5000 Rs dummy
            riskFlags.push('MAX_LOSS_BREACH');
          }

          const studentData = {
            enrollmentId: enrollment._id.toString(),
            studentName: enrollment.userId.name,
            netPnlPaise,
            openPositions: positions.length,
            marginUsedPaise,
            lastOrderAt: new Date().toISOString(), // In reality, fetch from OrdersModel
            riskFlags
          };

          liveGridData[studentData.enrollmentId] = studentData;

          // Compute Delta
          const prevStudentData = previousGridState[batchIdStr]?.[studentData.enrollmentId];
          if (!prevStudentData || 
              prevStudentData.netPnlPaise !== studentData.netPnlPaise || 
              prevStudentData.openPositions !== studentData.openPositions) {
            deltaPayload.push(studentData);
          }
        }

        // Save to Redis: `live:grid:<batchId>`
        const redisKey = `live:grid:${batchIdStr}`;
        await redisClient.set(redisKey, JSON.stringify(liveGridData));

        // Update local memory
        previousGridState[batchIdStr] = liveGridData;

        // Emit Delta via Socket.io
        if (deltaPayload.length > 0) {
          ioInstance.to(`batch:${batchIdStr}`).emit('instructorFeed', deltaPayload);
        }
      }
    } catch (err) {
      console.error('[MTM Engine] Error:', err);
    }
  }
}, { connection: redisClient });

async function startMTMEngine(io) {
  ioInstance = io;

  await mtmQueue.add('process-mtm', {}, {
    jobId: 'mtm-engine-singleton',
    repeat: {
      every: 1000 // 1 second
    }
  });
  console.log('[MTM Engine] Started 1-second background worker');
}

module.exports = { startMTMEngine, redisClient };
