'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

mg.runQuery(`MATCH (m:Methodology) RETURN m.id AS id, m.name AS name, m.targetDocTypes AS docTypes, m.targetLayers AS layers, m.status AS status`, {})
  .then(rows => {
    console.log(`Found ${rows.length} methodologies:`);
    rows.forEach(r => console.log(`  [${r.status}] ${r.id} — ${r.name} | types=${JSON.stringify(r.docTypes)} layers=${JSON.stringify(r.layers)}`));
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
