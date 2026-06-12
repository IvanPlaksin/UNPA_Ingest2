'use strict';
/**
 * Entity Store Index Migration
 *
 * Creates indexes for ESEntity, ESCluster, ESLayoutSnapshot labels
 * required for viewport queries and the cluster pyramid hierarchy.
 *
 * Run: node api/scripts/migrate-entity-store-indexes.js
 */
require('dotenv').config();
const neo4j = require('neo4j-driver');

const driver = neo4j.driver(
  process.env.NEO4J_URI || process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME || process.env.MEMGRAPH_USER || 'memgraph',
    process.env.NEO4J_PASSWORD || process.env.MEMGRAPH_PASSWORD || 'secret_password_123'
  )
);

const INDEXES = [
  // ESEntity — filtering and viewport range queries
  { label: 'ESEntity',          property: 'namespace' },
  { label: 'ESEntity',          property: 'type' },
  { label: 'ESEntity',          property: 'id' },
  { label: 'ESEntity',          property: 'x' },
  { label: 'ESEntity',          property: 'y' },

  // ESCluster — pyramid hierarchy and viewport
  { label: 'ESCluster',         property: 'namespace' },
  { label: 'ESCluster',         property: 'level' },
  { label: 'ESCluster',         property: 'id' },
  { label: 'ESCluster',         property: 'cx' },
  { label: 'ESCluster',         property: 'cy' },

  // ESLayoutSnapshot — fast lookup by namespace
  { label: 'ESLayoutSnapshot',  property: 'namespace' },
];

async function createIndex(session, label, property) {
  const q = `CREATE INDEX ON :${label}(${property})`;
  try {
    await session.run(q);
    console.log(`  [OK]   :${label}(${property})`);
  } catch (err) {
    if (/already exists/i.test(err.message)) {
      console.log(`  [SKIP] :${label}(${property}) — exists`);
    } else {
      console.error(`  [FAIL] :${label}(${property}):`, err.message);
    }
  }
}

async function main() {
  console.log('=== Entity Store Index Migration ===');
  const session = driver.session();
  try {
    for (const { label, property } of INDEXES) {
      await createIndex(session, label, property);
    }

    // Verify
    const info = await session.run('SHOW INDEX INFO');
    const esIndexes = info.records.filter(r => {
      const lbl = r._fields[1];
      return typeof lbl === 'string' && lbl.startsWith('ES');
    });
    console.log(`\nVerification: ${esIndexes.length} ES* indexes in database`);
    esIndexes.forEach(r => console.log(`  :${r._fields[1]}(${JSON.stringify(r._fields[2])})`));

    console.log('\n=== Migration Complete ===');
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(err => { console.error('[FATAL]', err); process.exit(1); });
