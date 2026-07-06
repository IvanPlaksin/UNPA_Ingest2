'use strict';
// Run from api/ directory: node scripts/bulk-link-document-entities.js
//
// Links DOCUMENTREF ESEntities to existing DOCUMENT ESEntities.
// Never creates DOCUMENT ESEntities — only links when one already exists
// (created via real importFromDocument extraction).

const neo4j = require('neo4j-driver');
const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph', 'secret_password_123'), { encrypted: false });

async function run(session, query, params = {}) {
  const res = await session.run(query, params);
  return res.records.map(r => {
    const o = {};
    for (const k of r.keys) {
      const v = r.get(k);
      o[k] = (v && typeof v === 'object' && 'low' in v) ? v.low : v;
    }
    return o;
  });
}

async function main() {
  const s = driver.session({ database: 'memgraph' });
  try {
    const now = () => new Date().toISOString();

    // Find all DOCUMENT ESEntities that exist from real extraction
    const docEntities = await run(s,
      `MATCH (e:ESEntity {type: 'DOCUMENT'})
       OPTIONAL MATCH (em:EntityMention)-[:LINKED_TO_ES]->(e)
       WITH e, count(DISTINCT em) AS mentionCount
       WHERE mentionCount > 0
       RETURN e.id AS id, e.name AS name`
    );

    console.log(`Found ${docEntities.length} real DOCUMENT ESEntities to process`);
    let totalLinked = 0;

    for (const doc of docEntities) {
      const ts = now();
      const refs = [];
      const seen = new Set();

      // Exact match by name
      const byExact = await run(s,
        `MATCH (e:ESEntity {type: 'DOCUMENTREF', name: $name})
         RETURN e.id AS id, e.name AS name`,
        { name: doc.name }
      );
      for (const r of byExact) { if (!seen.has(r.id)) { refs.push(r); seen.add(r.id); } }

      let linked = 0;
      for (const ref of refs) {
        if (ref.id === doc.id) continue;
        try {
          await run(s,
            `MATCH (src:ESEntity {id: $srcId}), (tgt:ESEntity {id: $tgtId})
             MERGE (src)-[r:ES_RELATED_TO {relType: $rt}]->(tgt)
             SET r.extractedAt = $ts`,
            { srcId: ref.id, tgtId: doc.id, rt: 'REFERENCES', ts }
          );
          linked++;
        } catch (_) {}
      }

      if (linked > 0) {
        console.log(`  "${doc.name}": linked ${linked} DOCUMENTREF(s)`);
        totalLinked += linked;
      }
    }

    console.log(`\nDone. Linked ${totalLinked} DOCUMENTREF edges total.`);

    const edgeCount = await run(s, `MATCH ()-[r:ES_RELATED_TO {relType: 'REFERENCES'}]->() RETURN count(r) AS c`);
    console.log(`Total REFERENCES edges in ES: ${edgeCount[0]?.c ?? 0}`);

  } finally {
    await s.close();
    await driver.close();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
