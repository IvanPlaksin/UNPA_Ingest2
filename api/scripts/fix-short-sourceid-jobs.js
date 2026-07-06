'use strict';
/**
 * fix-short-sourceid-jobs.js
 *
 * Fixes 20 failed BullMQ jobs that were enqueued with 8-char sourceIds (truncated UUIDs).
 * Steps:
 *   1. Remove all stale failed jobs with 8-char sourceIds from BullMQ
 *   2. For EXTRACTION_FAILED documents: reset Memgraph status → CLASSIFIED and re-enqueue
 *      with the correct full UUID
 *   3. COMPLETED documents need no re-extraction (already processed)
 */

require('dotenv').config();
const { Queue } = require('bullmq');
const neo4j     = require('neo4j-driver');

// ── Memgraph connection ───────────────────────────────────────────────────────
const MG_URI  = 'bolt://localhost:7687';
const MG_USER = 'memgraph';
const MG_PASS = 'secret_password_123';

function driver() {
  return neo4j.driver(MG_URI, neo4j.auth.basic(MG_USER, MG_PASS));
}

async function runQuery(cypher, params = {}) {
  const d = driver();
  const session = d.session();
  try {
    const result = await session.run(cypher, params);
    return result.records.map(r => {
      const obj = {};
      r.keys.forEach(k => {
        const v = r.get(k);
        obj[k] = (v && typeof v === 'object' && 'low' in v) ? v.low : v;
      });
      return obj;
    });
  } finally {
    await session.close();
    await d.close();
  }
}

// ── BullMQ connection ─────────────────────────────────────────────────────────
const QUEUE_NAME = 'unified-extraction';
const redisConn  = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

// ── Short-id → Full-UUID mapping (from Memgraph query) ───────────────────────
const SHORT_TO_FULL = {
  '312b74cc': '312b74cc-2a3c-4ef5-945e-458b86037568',  // COMPLETED
  'b9343e49': 'b9343e49-0b84-40a9-9638-c95f78a509c6',  // COMPLETED
  'b671a462': 'b671a462-26d3-4616-9099-9e2ca6903f7d',  // EXTRACTION_FAILED → re-queue
  '8e58f9ee': '8e58f9ee-a3a3-4468-92d5-3ce5be264407',  // COMPLETED
  '08f4b10e': '08f4b10e-7fb4-4135-9a1e-7285fb9a42cc',  // COMPLETED
  '79791d79': '79791d79-c3a8-4477-9eaf-bbceca42c162',  // COMPLETED
  '0b61c47f': '0b61c47f-156d-4b55-9c4f-3a08721eea0f',  // COMPLETED
  'a6016c96': 'a6016c96-54aa-44fc-8248-2f1095caa68c',  // COMPLETED
  'a571cb35': 'a571cb35-8c80-4be4-8e77-4eac790f4d45',  // COMPLETED
  'c239aec2': 'c239aec2-8d6d-48e3-a30f-4af78e5b582a',  // EXTRACTION_FAILED → re-queue
  '3a1aff26': '3a1aff26-f62a-48ef-8bf9-2cf060a825ba',  // COMPLETED
  'd3b107e3': 'd3b107e3-0185-4d57-8224-919c1f0b33b8',  // EXTRACTION_FAILED → re-queue
  '9f1ca167': '9f1ca167-2602-424a-93c3-6450bb95db1f',  // COMPLETED
  'a54e8ee9': 'a54e8ee9-be81-4906-877c-3a2964834e88',  // EXTRACTION_FAILED → re-queue
  'dd789c9a': 'dd789c9a-aa85-4580-b497-1129a213ff9b',  // COMPLETED
  'e8a0f1de': 'e8a0f1de-9b15-4885-9cc3-9d66e1e37514',  // COMPLETED
  'e36ae86a': 'e36ae86a-1dcd-4c9e-8199-e54114e9c6fc',  // COMPLETED
  'e0056677': 'e0056677-3d1a-4757-96f9-9c302a8033b7',  // COMPLETED
  'dc90bda2': 'dc90bda2-cc76-4564-90e0-364911c03b2a',  // COMPLETED
  '92092ee7': '92092ee7-b79b-4686-90d4-74e1333af818',  // COMPLETED
};

const NEEDS_REQUEUE = new Set(['b671a462', 'c239aec2', 'd3b107e3', 'a54e8ee9']);

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const queue = new Queue(QUEUE_NAME, { connection: redisConn });

  try {
    // 1. Get all failed jobs
    console.log('\n=== Step 1: Scan BullMQ failed jobs ===');
    const failedJobs = await queue.getFailed(0, 200);
    const shortJobs  = failedJobs.filter(j => j.data?.sourceId?.length === 8);
    console.log(`Total failed: ${failedJobs.length}, with 8-char sourceId: ${shortJobs.length}`);

    // 2. Remove stale jobs from BullMQ
    console.log('\n=== Step 2: Remove stale failed BullMQ jobs ===');
    let removed = 0;
    for (const job of shortJobs) {
      const sid = job.data.sourceId;
      const full = SHORT_TO_FULL[sid];
      if (!full) {
        console.log(`  SKIP ${job.id} — no mapping for sourceId=${sid}`);
        continue;
      }
      await job.remove();
      removed++;
      console.log(`  REMOVED ${job.id}  (${sid} → ${full})`);
    }
    console.log(`Removed ${removed} stale jobs.`);

    // 3. Reset Memgraph status for EXTRACTION_FAILED docs
    const now = new Date().toISOString();
    const toRequeue = Object.entries(SHORT_TO_FULL)
      .filter(([short]) => NEEDS_REQUEUE.has(short))
      .map(([, full]) => full);

    console.log('\n=== Step 3: Reset Memgraph status for EXTRACTION_FAILED docs ===');
    await runQuery(
      `UNWIND $ids AS docId
       MATCH (d:Document {id: docId})
       SET d.status = 'CLASSIFIED', d.updatedAt = $now`,
      { ids: toRequeue, now }
    );
    console.log(`Reset ${toRequeue.length} documents to CLASSIFIED:`);
    toRequeue.forEach(id => console.log(`  ${id}`));

    // 4. Re-enqueue with correct full UUIDs
    console.log('\n=== Step 4: Re-enqueue EXTRACTION_FAILED documents ===');
    const DEFAULT_JOB_OPTIONS = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail:     false,
    };
    for (const fullId of toRequeue) {
      const jobId = `extract-doc-${fullId.slice(0, 8)}-${Date.now()}`;
      await queue.add('extract', {
        mode: 'DOCUMENT',
        sourceId: fullId,
        workspaceId: null,
        adapterName: 'document',
        options: {},
        enqueuedAt: now,
      }, { ...DEFAULT_JOB_OPTIONS, jobId, priority: 5 });
      console.log(`  ENQUEUED ${jobId} (sourceId=${fullId})`);
    }

    // 5. Verify Memgraph status update
    console.log('\n=== Step 5: Verify Memgraph ===');
    const rows = await runQuery(
      `UNWIND $ids AS docId
       MATCH (d:Document {id: docId})
       RETURN d.id AS id, d.status AS status, d.originalname AS name`,
      { ids: toRequeue }
    );
    rows.forEach(r => console.log(`  ${r.status.padEnd(12)} ${r.id.slice(0,8)}… ${r.name}`));

    console.log('\n✓ Done.');
  } finally {
    await queue.close();
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
