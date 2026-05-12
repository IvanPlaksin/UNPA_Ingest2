'use strict';

/**
 * Confidence Decay Worker
 *
 * BullMQ-based worker for scheduled decay tasks.
 * Registered at server startup when BullMQ is available.
 *
 * Jobs:
 *   apply-decay             — apply exponential decay to all active current-fact edges
 *   reinforce-from-activity — reinforce edges with recent supporting quanta
 *   cleanup-expired-hypotheses — expire overdue open hypotheses
 */

let _queue    = null;
let _worker   = null;
let _scheduler = null;

const QUEUE_NAME = 'confidence-decay';

// Delay between re-runs if BullMQ unavailable
let _initAttempts = 0;

async function initialize() {
  let Queue, Worker, QueueScheduler;
  try {
    ({ Queue, Worker, QueueScheduler } = require('bullmq'));
  } catch {
    // BullMQ not installed — worker disabled
    console.warn('[decay-worker] bullmq not available — decay scheduling disabled');
    return false;
  }

  let redisConnection;
  try {
    const { getRedis } = require('../services/redis.service');
    redisConnection = getRedis();
  } catch {
    console.warn('[decay-worker] Redis not available — decay scheduling disabled');
    return false;
  }

  const decay       = require('../services/knowledge/tier1/confidence-decay.service');
  const hypothesis  = require('../services/knowledge/tier1/hypothesis.service');

  // Create queue
  _queue = new Queue(QUEUE_NAME, { connection: redisConnection });

  // Schedule recurring jobs (daily at 03:00 UTC)
  try {
    await _queue.add('apply-decay',            {}, { repeat: { cron: '0 3 * * *' } });
    await _queue.add('reinforce-from-activity',{}, { repeat: { cron: '30 3 * * *' } });
    await _queue.add('cleanup-expired-hypotheses', {}, { repeat: { cron: '0 4 * * *' } });
  } catch (err) {
    console.warn('[decay-worker] Failed to schedule jobs:', err.message);
  }

  // Create worker
  _worker = new Worker(QUEUE_NAME, async (job) => {
    console.log(`[decay-worker] Running job: ${job.name}`);

    if (job.name === 'apply-decay') {
      const result = await decay.applyDecay({ batchSize: 500 });
      console.log(`[decay-worker] apply-decay: processed=${result.processed}, decayed=${result.decayed}, hypotheses=${result.hypothesesCreated}`);
      return result;
    }

    if (job.name === 'reinforce-from-activity') {
      // Find recently added KnowledgeQuantum nodes and reinforce associated edges
      const { default: memgraph } = await import('../services/memgraph.service');
      const cutoff = new Date(Date.now() - 86400000).toISOString();
      const quanta = await memgraph.runQuery(
        `MATCH (q:KnowledgeQuantum) WHERE q.created_at >= $cutoff RETURN q.id AS id`,
        { cutoff }
      );
      let reinforced = 0;
      for (const q of quanta) {
        const edges = await memgraph.runQuery(
          `MATCH ()-[r]->() WHERE $qId IN r.source_quanta AND r.status = 'ACTIVE' RETURN id(r) AS eid`,
          { qId: q.id }
        );
        for (const e of edges) {
          await decay.reinforce(e.eid);
          reinforced++;
        }
      }
      console.log(`[decay-worker] reinforce-from-activity: reinforced=${reinforced}`);
      return { reinforced };
    }

    if (job.name === 'cleanup-expired-hypotheses') {
      const result = await hypothesis.checkExpired();
      console.log(`[decay-worker] cleanup-expired-hypotheses: expired=${result.expiredCount}`);
      return result;
    }

  }, { connection: redisConnection, concurrency: 1 });

  _worker.on('failed', (job, err) => {
    console.error(`[decay-worker] Job ${job?.name} failed:`, err.message);
  });

  console.log('[decay-worker] Initialized — daily decay scheduled at 03:00 UTC');
  return true;
}

async function shutdown() {
  if (_worker)    await _worker.close();
  if (_queue)     await _queue.close();
  console.log('[decay-worker] Shutdown complete');
}

// Trigger a single decay pass immediately (used in tests or manual runs)
async function runDecayNow(options = {}) {
  const decay = require('../services/knowledge/tier1/confidence-decay.service');
  return decay.applyDecay(options);
}

module.exports = { initialize, shutdown, runDecayNow };
