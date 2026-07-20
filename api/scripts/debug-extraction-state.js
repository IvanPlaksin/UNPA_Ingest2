'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const DOC_ID = '449f8a5c-6e2e-4354-9850-978ae22c3295';

async function run() {
  // Check document
  const [doc] = await mg.runQuery(
    'MATCH (d:Document {id: $id}) RETURN d.status AS status, d.extractedAt AS extractedAt, d.kqsScore AS kqs',
    { id: DOC_ID }
  );
  console.log('Document:', doc);

  // Check all ExtractionResults
  const results = await mg.runQuery(
    `MATCH (d:Document {id: $id})-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
     RETURN r.id AS id, r.extractionJobId AS jobId, r.methodologyId AS methId,
            r.entitiesExtracted AS entities, r.vectorsIndexed AS vectors,
            r.completedAt AS completedAt
     ORDER BY r.completedAt DESC`,
    { id: DOC_ID }
  );
  console.log('\nExtractionResults:');
  results.forEach(r => console.log(`  [${r.completedAt}] id=${r.id} methId=${r.methId} entities=${r.entities} vectors=${r.vectors}`));

  // Check Methodologies
  const meths = await mg.runQuery(
    `MATCH (m:Methodology) WHERE 'SC_RES' IN m.targetDocTypes RETURN m.id AS id, m.name AS name, m.targetDocTypes AS types`,
    {}
  );
  console.log('\nMethodologies matching SC_RES:');
  meths.forEach(m => console.log(`  ${m.name} id=${m.id}`));

  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
