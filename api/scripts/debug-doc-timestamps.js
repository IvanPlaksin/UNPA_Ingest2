'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const DOC_ID = '449f8a5c-6e2e-4354-9850-978ae22c3295';

async function run() {
  const [doc] = await mg.runQuery(
    `MATCH (d:Document {id: $id})
     RETURN d.status AS status, d.extractedAt AS extractedAt,
            d.updatedAt AS updatedAt, d.classifiedAt AS classifiedAt,
            d.documentType AS docType, d.epistemicLayer AS layer`,
    { id: DOC_ID }
  );
  console.log('All doc timestamps:', JSON.stringify(doc, null, 2));
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
