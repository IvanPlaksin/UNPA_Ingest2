'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const DOC_ID = '449f8a5c-6e2e-4354-9850-978ae22c3295';

mg.runQuery(
  'MATCH (d:Document {id: $id}) RETURN d.status AS s, d.extractedAt AS at',
  { id: DOC_ID }
).then(r => {
  const row = r[0];
  console.log(row ? `${row.s} (extractedAt: ${row.at})` : 'NOT FOUND');
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
