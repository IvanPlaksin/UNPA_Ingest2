'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

async function run() {
  const ts = new Date().toISOString();

  // Update METH-RES-L0 to include actual DocumentType IDs used in the system
  await mg.runQuery(
    `MATCH (m:Methodology {name: 'METH-RES-L0'})
     SET m.targetDocTypes = $types, m.updatedAt = $ts`,
    { types: ['SC_RES', 'GA_RES', 'RESOLUTION', 'DECISION', 'SC_PRST'], ts }
  );
  console.log('Updated METH-RES-L0 targetDocTypes → SC_RES, GA_RES, SC_PRST, RESOLUTION, DECISION');

  // Update METH-POLICY to include ST_SGB, ST_AI, ST_IC
  await mg.runQuery(
    `MATCH (m:Methodology {name: 'METH-POLICY'})
     SET m.targetDocTypes = $types, m.updatedAt = $ts`,
    { types: ['ST_SGB', 'ST_AI', 'ST_IC', 'POLICY', 'ADMINISTRATIVE_INSTRUCTION', 'BULLETIN'], ts }
  );
  console.log('Updated METH-POLICY targetDocTypes → ST_SGB, ST_AI, ST_IC, POLICY...');

  // Update METH-REPORT to include SG_REP, OIOS_REP, JIU_REP, BOA_REP, ICT_STRAT
  await mg.runQuery(
    `MATCH (m:Methodology {name: 'METH-REPORT'})
     SET m.targetDocTypes = $types, m.updatedAt = $ts`,
    { types: ['SG_REP', 'OIOS_REP', 'JIU_REP', 'BOA_REP', 'ICT_STRAT', 'REPORT', 'ANALYTICAL_STUDY', 'NOTE'], ts }
  );
  console.log('Updated METH-REPORT targetDocTypes → SG_REP, OIOS_REP, JIU_REP, BOA_REP...');

  // Verify
  const rows = await mg.runQuery(
    `MATCH (m:Methodology) RETURN m.name AS name, m.targetDocTypes AS types ORDER BY m.name`,
    {}
  );
  console.log('\nFinal state:');
  rows.forEach(r => console.log(`  ${r.name}: ${JSON.stringify(r.types)}`));
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
