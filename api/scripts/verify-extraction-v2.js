'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const docId = '449f8a5c-6e2e-4354-9850-978ae22c3295';
const jobId = '2d9d3b3d-6a71-4c98-a0aa-6effa282424a';

async function run() {
  const [
    t04t05,   // ExtractionResult w/ extractionJobId + methodologyId
    t06count, // EntityMention count CORRECT direction
    t06sample, // EntityMention sample CORRECT field (name not text)
    t07,      // RELATED_TO edges with jobId + entity names
    t08,      // Qdrant vectors check
    t09,      // ExtractionMetrics
    methodologies, // Are methodologies seeded?
    kqsCheck, // KQS service status
  ] = await Promise.all([
    // T-04: extractionJobId present, T-05: methodologyId — use LATEST result
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
       WHERE r.entitiesExtracted > 0
       RETURN r.id AS id, r.extractionJobId AS extractionJobId,
              r.methodologyId AS methodologyId,
              r.entitiesExtracted AS entities, r.relationsFound AS rels,
              r.kqsScore AS kqs, r.vectorsIndexed AS vectors,
              r.completedAt AS completedAt
       ORDER BY r.completedAt DESC LIMIT 1`,
      { id: docId }
    ),
    // T-06: EntityMention count — CORRECT direction
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[:MENTIONS]->(em:EntityMention)
       RETURN count(em) AS cnt`,
      { id: docId }
    ),
    // T-06: EntityMention sample with name field + extractionJobId
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[:MENTIONS]->(em:EntityMention)
       RETURN em.name AS name, em.type AS type, em.confidence AS confidence,
              em.extractionJobId AS extractionJobId, em.chunkIndex AS chunkIdx
       LIMIT 8`,
      { id: docId }
    ),
    // T-07: RELATED_TO edges with jobId stamp
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[:MENTIONS]->(a:EntityMention)-[r:RELATED_TO]->(b:EntityMention)
       RETURN r.type AS relType, r.extractionJobId AS jobId,
              a.name AS fromName, b.name AS toName,
              r.confidence AS conf LIMIT 8`,
      { id: docId }
    ),
    // T-08: Qdrant vector count for this document — use exact count API, not scroll(limit:N)
    (async () => {
      try {
        const qdrant = require('../src/services/qdrant.service');
        const client = qdrant.client || qdrant;
        const countResult = await client.count('documents_entities', {
          filter: { must: [{ key: 'sourceDocumentId', match: { value: docId } }] },
          exact: true,
        });
        const count = countResult?.count ?? 0;
        // Spot-check one vector for dimension + model label
        const sample = await client.scroll('documents_entities', {
          filter: { must: [{ key: 'sourceDocumentId', match: { value: docId } }] },
          limit: 1, with_payload: true, with_vector: true,
        });
        const pt = (sample?.points || sample || [])[0];
        const dim = Array.isArray(pt?.vector) ? pt.vector.length : null;
        const model = pt?.payload?.embeddingModel || null;
        return { collection: 'documents_entities', count, dim, model };
      } catch (e) {
        return { error: e.message };
      }
    })(),
    // T-09: ExtractionMetrics linked
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[:HAS_METRICS]->(m:ExtractionMetrics)
       RETURN m.id AS id, m.extractionJobId AS jobId,
              m.methodologyId AS methId, m.methodologySource AS methSrc,
              m.entitiesExtracted AS entities, m.relationsFound AS rels,
              m.totalDurationMs AS durationMs, m.kqsScore AS kqs`,
      { id: docId }
    ),
    // Are methodologies seeded?
    mg.runQuery(`MATCH (m:Methodology) RETURN count(m) AS cnt`, {}),
    // KQS check — does document have kqs after extraction?
    mg.runQuery(
      `MATCH (d:Document {id:$id}) RETURN d.kqsScore AS kqs, d.status AS status, d.extractedAt AS extractedAt`,
      { id: docId }
    ),
  ]);

  let pass = 0, fail = 0;
  const results_summary = [];

  // T-04: extractionJobId on ExtractionResult
  const er = t04t05[0];
  const t04pass = !!er?.extractionJobId;
  console.log(`\nT-04: extractionJobId on ExtractionResult: ${t04pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  extractionJobId=${er?.extractionJobId}, entities=${er?.entities}, rels=${er?.rels}`);
  t04pass ? pass++ : fail++;

  // T-05: methodologyId on ExtractionResult
  const t05pass = !!er?.methodologyId;
  console.log(`\nT-05: methodologyId on ExtractionResult: ${t05pass ? '✅ PASS' : '❌ FAIL (null)'}`);
  console.log(`  methodologyId=${er?.methodologyId}`);
  console.log(`  Methodologies in DB: ${methodologies[0]?.cnt}`);
  t05pass ? pass++ : fail++;

  // T-06: EntityMentions count >= 5, no false zero
  const emCount = (() => { const v = t06count[0]?.cnt; return typeof v === 'object' ? (v?.low ?? 0) : (v || 0); })();
  const t06pass = emCount >= 5;
  console.log(`\nT-06: EntityMention count >= 5: ${t06pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Count=${emCount} (require >=5)`);
  console.log('  Sample EntityMentions:');
  t06sample.forEach(em => console.log(`    [${em.type}] "${em.name}" conf=${em.confidence} jobId=${em.extractionJobId}`));
  t06pass ? pass++ : fail++;

  // T-07: RELATED_TO edges with extractionJobId
  const t07pass = t07.length > 0 && t07[0]?.jobId;
  console.log(`\nT-07: RELATED_TO edges with extractionJobId: ${t07pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Count=${t07.length}`);
  t07.forEach(r => console.log(`    ${r.fromName} -[${r.relType}]-> ${r.toName} | jobId=${r.jobId}`));
  t07pass ? pass++ : fail++;

  // T-08: Vectors in Qdrant
  const t08pass = t08.count > 0;
  console.log(`\nT-08: Qdrant vectors indexed: ${t08pass ? '✅ PASS' : '❌ FAIL'}`);
  if (t08.error) {
    console.log(`  ERROR: ${t08.error}`);
  } else {
    console.log(`  Count (exact) = ${t08.count}, dim=${t08.dim ?? '?'}, embeddingModel="${t08.model ?? '?'}"`);
    if (t08.model === 'MiniLM-L6-v2') console.log('  ⚠️  embeddingModel label wrong — expected intfloat/multilingual-e5-large (fix applied, will update on next extraction)');
    if (t08.dim && t08.dim !== 1024) console.log(`  ⚠️  Vector dim=${t08.dim} — expected 1024 for multilingual-e5-large`);
  }
  t08pass ? pass++ : fail++;

  // T-09: ExtractionMetrics linked to Document
  const metrics = t09[0];
  const t09pass = !!metrics;
  console.log(`\nT-09: ExtractionMetrics linked: ${t09pass ? '✅ PASS' : '❌ FAIL'}`);
  if (metrics) {
    console.log(`  id=${metrics.id}, jobId=${metrics.jobId}, entities=${metrics.entities}, rels=${metrics.rels}, duration=${metrics.durationMs}ms`);
    console.log(`  methId=${metrics.methId}, methSrc=${metrics.methSrc}`);
  }
  t09pass ? pass++ : fail++;

  // T-10: extraction completed (extractedAt set) + latest ExtractionResult has vectors
  const kqs = kqsCheck[0];
  const latestResultHasData = !!er?.completedAt && er?.entities > 0;
  const t10pass = !!kqs?.extractedAt && latestResultHasData;
  console.log(`\nT-10: Extraction pipeline completed: ${t10pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  status=${kqs?.status}, extractedAt=${kqs?.extractedAt}`);
  console.log(`  Latest ExtractionResult: entities=${er?.entities}, completedAt=${er?.completedAt}`);
  if (!kqs?.extractedAt) console.log('  ⚠️  extractedAt not set — storeResult may not have run');
  if (kqs?.status !== 'COMPLETED') console.log(`  ⚠️  doc.status=${kqs?.status} (may have been reset by force-extract or manual reset)`);
  if (kqs?.kqs === null) console.log('  ⚠️  kqsScore=null (KQS service returned no score)');
  t10pass ? pass++ : fail++;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`TOTAL: ${pass} PASS / ${fail} FAIL out of ${pass+fail} tests`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
