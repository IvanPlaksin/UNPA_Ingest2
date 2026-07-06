'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mg = require('../src/services/memgraph.service');

const rules = JSON.stringify([
  { signal: 'header_match', pattern: 'S/RES/\\d+\\s*\\(\\d{4}\\)', weight: 0.40 },
  { signal: 'title_match', keywords: ['s/res/', 'security council resolution', 'sc resolution'], weight: 0.20 },
  { signal: 'keyword_match', keywords: ['security council', 'the security council', 'resolution adopted by the security council', 'acting under chapter vii', 'acting under the charter'], weight: 0.25 },
  { signal: 'section_match', sections: ['THE SECURITY COUNCIL', 'ACTING UNDER CHAPTER VII', 'DECIDES', 'DEMANDS', 'URGES', 'CALLS UPON', 'REAFFIRMING'], weight: 0.15 }
]);

mg.runQuery(
  `MATCH (dt:DocumentType {id: $id})-[:HAS_CLASSIFIER]->(cr:ClassifierRule)
   SET cr.rules = $rules, cr.threshold = 0.55
   RETURN cr.id AS ruleId, dt.id AS dtId`,
  { id: 'SC_RES', rules }
).then(r => {
  console.log('Updated SC_RES classifier:', JSON.stringify(r));
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
