'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const DOC_ID = '8f1db129-823d-4ea5-a481-2e1dcec544f4';

async function run() {
  console.log('\n=== ANALYSIS: Document vs Qdrant vectors ===\n');

  // 1. Document metadata
  const [doc] = await mg.runQuery(
    'MATCH (d:Document {id: $id}) RETURN d.fileSize AS sz, d.status AS st, d.originalname AS name',
    { id: DOC_ID }
  );
  console.log('Document:', doc.name);
  console.log('  fileSize =', doc.sz, 'bytes =', (doc.sz / 1024).toFixed(1), 'KB');

  // 2. ExtractionResult
  const [er] = await mg.runQuery(
    `MATCH (d:Document {id: $id})-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
     RETURN r.entitiesExtracted AS ents, r.vectorsIndexed AS vecs, r.completedAt AS ts
     ORDER BY r.completedAt DESC LIMIT 1`,
    { id: DOC_ID }
  );
  const vecs = typeof er?.vecs === 'object' ? (er.vecs?.low ?? 0) : (er?.vecs || 0);
  const ents = typeof er?.ents === 'object' ? (er.ents?.low ?? 0) : (er?.ents || 0);
  console.log('\nExtractionResult (latest):');
  console.log('  vectorsIndexed      =', vecs);
  console.log('  entitiesExtracted   =', ents);

  // 3. EntityMentions in Memgraph
  const emRows = await mg.runQuery(
    'MATCH (d:Document {id: $id})-[:MENTIONS]->(em:EntityMention) RETURN count(em) AS cnt',
    { id: DOC_ID }
  );
  const emCnt = typeof emRows[0]?.cnt === 'object' ? (emRows[0].cnt?.low ?? 0) : (emRows[0]?.cnt || 0);
  console.log('\nEntityMentions in Memgraph:', emCnt);

  // 4. Qdrant - actual count via count API
  console.log('\n=== Qdrant check ===');
  const qdrant = require('../src/services/qdrant.service');
  const client = qdrant.client || qdrant;

  // Try count endpoint
  try {
    const countResult = await client.count('documents_entities', {
      filter: { must: [{ key: 'sourceDocumentId', match: { value: DOC_ID } }] },
      exact: true,
    });
    console.log('Qdrant COUNT (exact) =', countResult?.count ?? JSON.stringify(countResult));
  } catch (e) {
    console.log('count() API error:', e.message);
  }

  // Scroll with high limit to get real count
  try {
    const allPoints = [];
    let offset = null;
    let page = 0;
    do {
      const opts = {
        filter: { must: [{ key: 'sourceDocumentId', match: { value: DOC_ID } }] },
        limit: 100,
        with_payload: true,
      };
      if (offset) opts.offset = offset;
      const result = await client.scroll('documents_entities', opts);
      const pts = result?.points || result || [];
      allPoints.push(...pts);
      offset = result?.next_page_offset;
      page++;
    } while (offset && page < 10);

    console.log('Qdrant SCROLL (all pages) =', allPoints.length, 'points');
    if (allPoints.length > 0) {
      console.log('\nSample payload fields:');
      const p = allPoints[0].payload || {};
      Object.entries(p).forEach(([k, v]) => console.log(`  ${k}: ${JSON.stringify(v)?.slice(0, 80)}`));
    }
  } catch (e) {
    console.log('scroll() error:', e.message);
  }

  // 5. Analysis
  console.log('\n=== DIAGNOSIS ===');
  const fileKB = (doc.sz / 1024).toFixed(1);
  const chunkSize = 5000; // METH-POLICY config
  const estimatedTextChars = doc.sz * 0.6; // ~60% of PDF bytes is text
  const estimatedChunks = Math.ceil(estimatedTextChars / chunkSize);

  console.log(`File size: ${fileKB} KB`);
  console.log(`Estimated text chars: ~${Math.round(estimatedTextChars)} (60% of bytes)`);
  console.log(`METH-POLICY chunk size: ${chunkSize} chars`);
  console.log(`Expected text chunks: ~${estimatedChunks}`);
  console.log(`Entities extracted: ${ents}`);
  console.log(`Vectors indexed (ExtractionResult): ${vecs}`);
  console.log(`\nISSUE: Qdrant scroll(limit=5) returns 5 — but ExtractionResult.vectorsIndexed=${vecs}`);
  console.log('The verify script used limit:5 → truncated to 5, actual count may be different');

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
