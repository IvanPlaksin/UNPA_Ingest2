'use strict';
// Run from api/ directory: node scripts/check-doc-entities.js
// Deletes artificial DOCUMENT ESEntities (no EntityMentions linked) and reports DOCUMENTREF status.

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
    // Find artificial DOCUMENT ESEntities: no EntityMentions linked directly
    const artificial = await run(s,
      `MATCH (e:ESEntity {type: 'DOCUMENT'})
       OPTIONAL MATCH (em:EntityMention)-[:LINKED_TO_ES]->(e)
       WITH e, count(DISTINCT em) AS mentionCount
       WHERE mentionCount = 0
       RETURN e.id AS id, e.name AS name, e.provenanceType AS provType`
    );

    console.log(`\nFound ${artificial.length} artificial DOCUMENT ESEntities (no EntityMentions linked):`);
    for (const a of artificial) console.log(`  [${a.provType}] "${a.name}" (${a.id})`);

    if (artificial.length > 0) {
      const ids = artificial.map(a => a.id);
      await run(s, `MATCH (e:ESEntity) WHERE e.id IN $ids DETACH DELETE e`, { ids });
      console.log(`\nDeleted ${artificial.length} artificial DOCUMENT ESEntities.`);
    }

    // Check which DOCUMENTREFs have their referenced document extracted and in ES
    // "In ES" = document has ESEntities with provenanceDocSymbol matching the DOCUMENTREF name
    const refs = await run(s,
      `MATCH (e:ESEntity {type: 'DOCUMENTREF'})
       OPTIONAL MATCH (e)-[:ES_RELATED_TO]->(d:ESEntity {type: 'DOCUMENT'})
       OPTIONAL MATCH (other:ESEntity)
         WHERE other.provenanceDocSymbol = e.name AND other.type <> 'DOCUMENT'
       WITH e, d, count(DISTINCT other) AS extractedEntityCount
       RETURN e.id AS id, e.name AS name,
              d.id AS linkedDocId, d.name AS linkedDocName,
              extractedEntityCount
       ORDER BY e.name`
    );

    console.log('\n=== DOCUMENTREF link status ===');
    let linked = 0, readyToLink = 0, noDoc = 0;
    for (const r of refs) {
      if (r.linkedDocId) {
        console.log(`  LINKED   "${r.name}" → "${r.linkedDocName}"`);
        linked++;
      } else if (r.extractedEntityCount > 0) {
        console.log(`  READY    "${r.name}" — ${r.extractedEntityCount} entities extracted, needs DOCUMENT ESEntity`);
        readyToLink++;
      } else {
        noDoc++;
      }
    }
    console.log(`\nSummary:`);
    console.log(`  Linked to DOCUMENT ESEntity:           ${linked}`);
    console.log(`  READY (doc extracted, entity missing): ${readyToLink}`);
    console.log(`  No document extracted yet:             ${noDoc}`);

    const docCount  = await run(s, `MATCH (e:ESEntity {type: 'DOCUMENT'}) RETURN count(e) AS c`);
    const edgeCount = await run(s, `MATCH ()-[r:ES_RELATED_TO {relType: 'REFERENCES'}]->() RETURN count(r) AS c`);
    console.log(`\nFinal state: ${docCount[0]?.c ?? 0} DOCUMENT ESEntities, ${edgeCount[0]?.c ?? 0} REFERENCES edges`);

  } finally {
    await s.close();
    await driver.close();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
