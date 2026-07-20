'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const types = ['GOVERNS','MANDATES','OVERSEES','ESTABLISHED_BY','ESTABLISHES',
  'DEFINES','REPORTS_TO','PART_OF','CHAIRED_BY','IMPLEMENTS','REQUIRES',
  'AUTHORED_BY','FUNDED_BY','REFERENCES','SUPPORTS','COOPERATES_WITH','MENTIONS','RELATED_TO'];

(async () => {
  const rows = await mg.runQuery(
    `MATCH ()-[r]->() WHERE type(r) IN [${types.map(t => `"${t}"`).join(',')}]
       AND r.migratedFrom = 'ES_RELATED_TO'
     RETURN type(r) AS edgeType, count(r) AS cnt ORDER BY cnt DESC`,
    {}
  );
  const total = rows.reduce((s, r) => s + (typeof r.cnt === 'object' ? (r.cnt.low ?? 0) : r.cnt), 0);
  console.log('=== CGE-003 Validation ===');
  rows.forEach(r => {
    const c = typeof r.cnt === 'object' ? (r.cnt.low ?? r.cnt) : r.cnt;
    console.log('  ' + r.edgeType.padEnd(24) + c);
  });
  console.log('  ' + 'TOTAL'.padEnd(24) + total);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
