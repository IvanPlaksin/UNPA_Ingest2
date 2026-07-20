'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function run() {
  const { Queue } = require('bullmq');
  const IORedis = require('ioredis');
  const conn = new IORedis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });
  const q = new Queue('unified-extraction', { connection: conn.duplicate() });

  const [waiting, active, completed, failed] = await Promise.all([
    q.getWaiting(), q.getActive(), q.getCompleted(), q.getFailed()
  ]);

  console.log('\n=== WAITING ===');
  waiting.forEach(j => console.log(`  ${j.id} name=${j.name} processedOn=${j.processedOn}`));

  console.log('\n=== ACTIVE ===');
  active.forEach(j => console.log(`  ${j.id}`));

  console.log('\n=== COMPLETED (last 5) ===');
  completed.slice(-5).forEach(j => console.log(`  ${j.id} finishedOn=${new Date(j.finishedOn).toISOString()} src=${j.data?.sourceId?.slice(0,8)}`));

  console.log('\n=== FAILED (last 5) ===');
  failed.slice(-5).forEach(j => console.log(`  ${j.id} reason=${j.failedReason}`));

  await conn.quit();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
