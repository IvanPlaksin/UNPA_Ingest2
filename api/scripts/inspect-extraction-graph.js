'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const docId = '449f8a5c-6e2e-4354-9850-978ae22c3295';
const jobId = '2d9d3b3d-6a71-4c98-a0aa-6effa282424a'; // from ExtractionResult

async function run() {
  const [
    nodeLabels, relTypes, entityNodes, relToEdges, entityMentions,
    docRelations, extractionResult, kqsData
  ] = await Promise.all([
    // What node labels exist near this document?
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[r]-(n)
       RETURN DISTINCT labels(n) AS labels, type(r) AS relType, count(n) AS cnt
       ORDER BY cnt DESC`,
      { id: docId }
    ),
    // All relationship types in graph involving this doc
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[r]-()
       RETURN DISTINCT type(r) AS relType, count(r) AS cnt ORDER BY cnt DESC`,
      { id: docId }
    ),
    // Entity nodes that have extractionJobId = our jobId
    mg.runQuery(
      `MATCH (e:Entity) WHERE e.extractionJobId = $jId OR e.jobId = $jId
       RETURN e.id AS id, e.text AS text, e.type AS type, e.extractionJobId AS jobId LIMIT 5`,
      { jId: jobId }
    ),
    // RELATED_TO edges — check all (not filtered by jobId)
    mg.runQuery(
      `MATCH (a)-[r:RELATED_TO]->(b)
       WHERE r.sourceDocumentId = $docId OR r.documentId = $docId
       RETURN r.type AS relType, r.extractionJobId AS jobId, a.text AS from, b.text AS to
       LIMIT 5`,
      { docId }
    ),
    // EntityMention nodes without relationship filter
    mg.runQuery(
      `MATCH (em:EntityMention) WHERE em.documentId = $docId OR em.sourceDocumentId = $docId
       RETURN em.text AS text, em.type AS type, em.extractionJobId AS jobId LIMIT 5`,
      { docId }
    ),
    // All nodes connected to document regardless of label
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[r]-(n)
       RETURN labels(n) AS nodeLabels, type(r) AS relType, count(n) AS cnt
       ORDER BY cnt DESC LIMIT 15`,
      { id: docId }
    ),
    // ExtractionResult fields
    mg.runQuery(
      `MATCH (d:Document {id:$id})-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
       RETURN r LIMIT 1`,
      { id: docId }
    ),
    // KQS — check ExtractionResult for kqsScore
    mg.runQuery(
      `MATCH (r:ExtractionResult {id:'38a6e1ac-11ab-4096-a76d-765f30e803d6'})
       RETURN r.kqsScore AS kqs, r.extractionJobId AS jobId, r.methodologyId AS methId,
              r.documentType AS docType, r.epistemicLayer AS layer, r.status AS status`,
      {}
    ),
  ]);

  console.log('\n=== Document relationships ===');
  relTypes.forEach(r => console.log(`  ${r.relType}: ${JSON.stringify(r.cnt)}`));

  console.log('\n=== Node labels connected to document ===');
  docRelations.forEach(r => console.log(`  labels=${JSON.stringify(r.nodeLabels)} via ${r.relType}: ${JSON.stringify(r.cnt)}`));

  console.log('\n=== Entity nodes with this jobId ===');
  console.log(JSON.stringify(entityNodes, null, 2));

  console.log('\n=== EntityMention nodes with this docId ===');
  console.log(JSON.stringify(entityMentions, null, 2));

  console.log('\n=== RELATED_TO edges for this doc ===');
  console.log(JSON.stringify(relToEdges, null, 2));

  console.log('\n=== ExtractionResult full node ===');
  if (extractionResult[0]) {
    const r = extractionResult[0].r || extractionResult[0];
    console.log(JSON.stringify(r, null, 2));
  }

  console.log('\n=== KQS in ExtractionResult ===');
  console.log(JSON.stringify(kqsData, null, 2));

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
