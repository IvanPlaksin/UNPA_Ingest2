'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const DOC_ID = '6355f0ec-13bb-49fd-b9b8-246213944fb4';

async function run() {
  // Document state
  const [doc] = await mg.runQuery(
    `MATCH (d:Document {id: $id})
     RETURN d.status AS status, d.documentType AS dtype, d.epistemicLayer AS layer,
            d.extractedAt AS extractedAt, d.failedAt AS failedAt, d.failureReason AS reason,
            d.kqsScore AS kqs, d.updatedAt AS updatedAt`,
    { id: DOC_ID }
  );
  console.log('\n=== Document ===');
  console.log(JSON.stringify(doc, null, 2));

  // All ExtractionResults (not just latest)
  const results = await mg.runQuery(
    `MATCH (d:Document {id: $id})-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
     RETURN r.id AS id, r.status AS status, r.methodologyId AS methId,
            r.entitiesExtracted AS ents, r.vectorsIndexed AS vecs,
            r.errorMessage AS errMsg, r.failedAt AS failedAt,
            r.completedAt AS completedAt, r.extractionJobId AS jobId
     ORDER BY r.completedAt DESC`,
    { id: DOC_ID }
  );
  console.log('\n=== ExtractionResults ===');
  for (const r of results) console.log(JSON.stringify(r, null, 2));

  // ExtractionMetrics
  const metrics = await mg.runQuery(
    `MATCH (d:Document {id: $id})-[:HAS_METRICS]->(m:ExtractionMetrics)
     RETURN m.id AS id, m.entitiesExtracted AS ents, m.relationsFound AS rels,
            m.totalDurationMs AS ms, m.errorMessage AS err, m.status AS status
     ORDER BY m.startedAt DESC`,
    { id: DOC_ID }
  );
  console.log('\n=== ExtractionMetrics ===');
  for (const m of metrics) console.log(JSON.stringify(m, null, 2));

  // BullMQ completed jobs for this doc
  const { Queue } = require('bullmq');
  const IORedis = require('ioredis');
  const conn = new IORedis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });
  const q = new Queue('unified-extraction', { connection: conn.duplicate() });
  const completed = await q.getCompleted();
  const mine = completed.filter(j => j.data?.sourceId === DOC_ID || j.data?.documentId === DOC_ID);
  console.log('\n=== BullMQ completed jobs for this doc ===');
  for (const j of mine) {
    console.log(`  jobId=${j.id}`);
    console.log(`  returnValue:`, JSON.stringify(j.returnvalue || {}).slice(0, 300));
  }

  await conn.quit();
  process.exit(0);
}
run().catch(e => { console.error(e.message, e.stack); process.exit(1); });
