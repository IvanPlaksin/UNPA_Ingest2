'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const DOC_ID = '449f8a5c-6e2e-4354-9850-978ae22c3295';

async function run() {
  const ts = new Date().toISOString();
  const rows = await mg.runQuery(
    'MATCH (d:Document {id: $id}) SET d.status = $status, d.updatedAt = $ts RETURN d.status AS newStatus, d.id AS id',
    { id: DOC_ID, status: 'CLASSIFIED', ts }
  );
  if (rows.length === 0) {
    console.error('Document not found:', DOC_ID);
    process.exit(1);
  }
  console.log(`Reset document ${rows[0].id} → status: ${rows[0].newStatus}`);
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
