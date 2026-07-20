'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function run() {
  const { Queue } = require('bullmq');
  const IORedis = require('ioredis');
  const conn = new IORedis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });
  const q = new Queue('unified-extraction', { connection: conn.duplicate() });

  const failed = await q.getFailed();
  const last = failed.slice(-5);
  console.log(`\n=== FAILED JOBS (last ${last.length}) ===\n`);
  for (const j of last) {
    const src = j.data?.sourceId?.slice(0,8) || '?';
    console.log(`--- JOB ${j.id}`);
    console.log(`  sourceId: ${src}`);
    console.log(`  failedReason: ${j.failedReason}`);
    if (j.stacktrace && j.stacktrace.length > 0) {
      console.log(`  stacktrace[0]:\n${j.stacktrace[0].split('\n').slice(0,8).join('\n')}`);
    }
    console.log();
  }

  await conn.quit();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
