'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const qdrant = require('../src/services/qdrant.service');
const c = qdrant.client || qdrant;

async function test() {
  // Test scroll with with_vector: true
  const r1 = await c.scroll('documents_entities', { limit: 2, with_payload: false, with_vector: true });
  const pts = r1?.points ?? r1 ?? [];
  console.log('scroll points:', pts.length);
  if (pts.length > 0) {
    const v = pts[0].vector;
    console.log('scroll vector:', Array.isArray(v) ? `array len=${v.length} [0]=${v[0]}` : `type=${typeof v} val=${JSON.stringify(v)?.slice(0,60)}`);
  }

  // Compare with retrieve (which works)
  const id = pts[0]?.id;
  if (id) {
    const r2 = await c.retrieve('documents_entities', { ids: [id], with_vector: true, with_payload: false });
    const rpts = r2?.result ?? r2 ?? [];
    if (rpts.length > 0) {
      const v = rpts[0].vector;
      console.log('retrieve vector:', Array.isArray(v) ? `array len=${v.length} [0]=${v[0]}` : `type=${typeof v}`);
    }
  }
}
test().catch(console.error);
