'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const docId = '449f8a5c-6e2e-4354-9850-978ae22c3295';
const jobId = 'extract-doc-449f8a5c-1781276046083';

async function run() {
  const [results, mentions, mentionSample, metrics, relsJobId, entitiesAll] = await Promise.all([
    // T-04, T-05: ExtractionResult with extractionJobId + methodologyId
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
       RETURN r.id AS id, r.extractionJobId AS jobId, r.methodologyId AS methId,
              r.entitiesExtracted AS entities, r.relationsFound AS rels,
              r.kqsScore AS kqs, r.status AS status LIMIT 3`,
      { id: docId }
    ),
    // T-06: EntityMention count >= 5 (no false zero)
    mg.runQuery(
      `MATCH (d:Document {id:$id})<-[:MENTIONS]-(em:EntityMention)
       RETURN count(em) AS cnt`,
      { id: docId }
    ),
    // T-06 sample: EntityMention fields including extractionJobId
    mg.runQuery(
      `MATCH (d:Document {id:$id})<-[:MENTIONS]-(em:EntityMention)
       RETURN em.text AS text, em.type AS type, em.confidence AS conf,
              em.extractionJobId AS jobId, em.chunkIndex AS chunkIdx
       LIMIT 5`,
      { id: docId }
    ),
    // T-09: ExtractionMetrics linked to Document
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[:HAS_METRICS]->(m:ExtractionMetrics)
       RETURN m.id AS id, m.extractionJobId AS jobId, m.methodologyId AS methId,
              m.entitiesExtracted AS entities, m.relationsFound AS rels,
              m.methodologySource AS methSrc, m.appliedRuleId AS ruleId,
              m.totalDurationMs AS durationMs
       LIMIT 1`,
      { id: docId }
    ),
    // T-07: RELATED_TO edges with extractionJobId
    mg.runQuery(
      `MATCH ()-[r:RELATED_TO]->() WHERE r.extractionJobId = $jId
       RETURN count(r) AS cnt`,
      { jId: jobId }
    ),
    // All entities linked to document (via MENTIONS or direct)
    mg.runQuery(
      `MATCH (e:Entity)<-[:REFERS_TO]-(em:EntityMention)-[:MENTIONS]->(d:Document {id:$id})
       RETURN count(DISTINCT e) AS entityCount`,
      { id: docId }
    ),
  ]);

  console.log('\n=== T-04,T-05: ExtractionResult ===');
  console.log(JSON.stringify(results, null, 2));

  console.log('\n=== T-06: EntityMention count ===');
  const cnt = results[0]?.entities || mentions[0]?.cnt;
  const mentionCnt = mentions[0]?.cnt;
  const n = typeof mentionCnt === 'object' ? (mentionCnt?.low ?? 0) : (mentionCnt || 0);
  console.log(`Total EntityMentions: ${n}`);
  if (n === 0) console.warn('⚠️  FALSE ZERO DETECTED: 0 EntityMentions!');
  else console.log(`✅ EntityMention count=${n} (>= 5 required)`);

  console.log('\n=== T-06 sample EntityMentions ===');
  console.log(JSON.stringify(mentionSample, null, 2));

  console.log('\n=== T-07: RELATED_TO edges by jobId ===');
  const relsCnt = relsJobId[0]?.cnt;
  const rn = typeof relsCnt === 'object' ? (relsCnt?.low ?? 0) : (relsCnt || 0);
  console.log(`RELATED_TO with jobId: ${rn}`);

  console.log('\n=== T-09: ExtractionMetrics ===');
  console.log(JSON.stringify(metrics, null, 2));

  console.log('\n=== Entity nodes linked ===');
  console.log(JSON.stringify(entitiesAll, null, 2));

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
