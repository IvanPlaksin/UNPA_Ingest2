/**
 * Fix N03 condition expression v5 → v6
 *
 * Problem: On cached results, N02 returns { method: "cached", branch: "high_confidence" }
 * WITHOUT confidence/score fields. Expression must handle all N02 output variants:
 * - Fresh: { confidence: "high", score: 0.95 }
 * - Cached: { branch: "high_confidence", service_code: "IT-HW-LAP" }
 */
'use strict';

async function fix() {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph', 'secret_password_123'), { disableLosslessIntegers: true });
  const session = driver.session();

  const r = await session.run(
    `MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
     WHERE c.entryId = '96092967-0088-477d-9fcb-f7d6965b8863'
     RETURN g.nodes AS nodes, v.versionNumber AS version
     ORDER BY v.versionNumber DESC LIMIT 1`
  );

  let nodes = JSON.parse(r.records[0].get('nodes'));
  const currentVersion = r.records[0].get('version');
  console.log(`Loaded v${currentVersion}\n`);

  // Fix N03: handle all variants of N02 output
  const n03 = nodes.find(n => n.id === 'N03');
  if (n03) {
    const oldExpr = n03.data.config.expression;
    // Defensive expression covering: fresh result, cached result, and service_code existence
    const newExpr = "N02.confidence === 'high' || N02.confidence === 'medium' || N02.score >= 0.6 || N02.branch === 'high_confidence' || (N02.service_code != null && N02.service_code !== '')";
    console.log(`N03 OLD: ${oldExpr}`);
    console.log(`N03 NEW: ${newExpr}`);
    console.log(`WHY: Cached results have branch/service_code but no confidence/score`);
    n03.data.config.expression = newExpr;
  }

  const newVersion = currentVersion + 1;
  await session.run(
    `MATCH (c:CatalogEntry {entryId: '96092967-0088-477d-9fcb-f7d6965b8863'})-[:DEFINES]->(g:GraphDefinition)
     SET g.nodes = $nodes
     WITH g
     CREATE (v:GraphVersion {
       versionNumber: $ver, createdAt: $now, createdBy: 'fix-script',
       changeLog: 'Fix N03: handle cached classify_intent output (branch/service_code instead of confidence/score)'
     })
     CREATE (g)-[:HAS_VERSION]->(v)
     WITH g
     MATCH (c2:CatalogEntry {entryId: '96092967-0088-477d-9fcb-f7d6965b8863'})
     SET c2.currentVersion = $ver, c2.updatedAt = $now`,
    { nodes: JSON.stringify(nodes), ver: newVersion, now: new Date().toISOString() }
  );

  console.log(`\nSaved as v${newVersion}`);
  await session.close();
  await driver.close();
  process.exit(0);
}

fix().catch(e => { console.error(e.message); process.exit(1); });
