'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function run() {
  const { Queue } = require('bullmq');
  const IORedis = require('ioredis');
  const conn = new IORedis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });
  const q = new Queue('unified-extraction', { connection: conn.duplicate() });

  const completed = await q.getCompleted();
  // Find the A/77/489 job
  const DOC_ID = '6355f0ec-13bb-49fd-b9b8-246213944fb4';
  const j = completed.find(j => j.data?.sourceId === DOC_ID);

  if (!j) { console.log('Job not found'); await conn.quit(); process.exit(0); }

  console.log('\n=== JOB DATA ===');
  console.log(JSON.stringify(j.data, null, 2));

  console.log('\n=== RETURN VALUE ===');
  const rv = j.returnvalue || {};
  console.log(JSON.stringify(rv, null, 2));

  await conn.quit();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
