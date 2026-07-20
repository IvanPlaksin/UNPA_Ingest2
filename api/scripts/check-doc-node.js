'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const docId = '449f8a5c-6e2e-4354-9850-978ae22c3295';
mg.runQuery(
  `MATCH (d:Document {id: $id})
   RETURN d.id AS id, d.originalname AS originalname, d.documentTitle AS documentTitle,
          d.unSymbol AS unSymbol, d.documentType AS documentType,
          d.epistemicLayer AS epistemicLayer, d.status AS status,
          d.storagePath AS storagePath`,
  { id: docId }
).then(r => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
