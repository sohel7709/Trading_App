const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');

// Uses the existing redis URL or defaults to localhost
const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { maxRetriesPerRequest: null });

const REPLAY_CLOCK_KEY = (tenantId) => `replay:clock:${tenantId}`;
const REPLAY_SPEED_KEY = (tenantId) => `replay:speed:${tenantId}`;

class ReplayClockService {
  constructor() {
    this.queue = new Queue('replay-clock', { connection });
    
    // Worker runs every second (or faster based on speed) to update the clock
    this.worker = new Worker('replay-clock', async (job) => {
      const { tenantId } = job.data;
      const speed = parseInt(await connection.get(REPLAY_SPEED_KEY(tenantId))) || 1;
      
      // Advance clock by 1 second * speed
      await connection.incrby(REPLAY_CLOCK_KEY(tenantId), 1000 * speed);
      
      // Trigger a tick event for this tenant
      // We could use Redis pub/sub here, but for now we'll just let the source fetch it.
    }, { connection });
  }

  async startSession(tenantId, startTs, speed = 1) {
    await connection.set(REPLAY_CLOCK_KEY(tenantId), startTs);
    await connection.set(REPLAY_SPEED_KEY(tenantId), speed);
    
    // Remove any existing jobs for this tenant
    await this.queue.removeRepeatableByKey(`replay-clock:${tenantId}`);
    
    // Add repeatable job every 1 second
    await this.queue.add('tick', { tenantId }, {
      repeat: {
        every: 1000 // 1 real second
      },
      jobId: `replay-clock:${tenantId}`
    });
  }

  async pauseSession(tenantId) {
    // Remove the repeatable job
    const jobs = await this.queue.getRepeatableJobs();
    for (const job of jobs) {
      if (job.id === `replay-clock:${tenantId}`) {
        await this.queue.removeRepeatableByKey(job.key);
      }
    }
  }

  async setSpeed(tenantId, speed) {
    await connection.set(REPLAY_SPEED_KEY(tenantId), speed);
  }

  async getCurrentTs(tenantId) {
    const val = await connection.get(REPLAY_CLOCK_KEY(tenantId));
    return val ? parseInt(val) : null;
  }
}

module.exports = new ReplayClockService();
