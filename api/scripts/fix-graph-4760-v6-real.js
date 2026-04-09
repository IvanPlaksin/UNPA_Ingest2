'use strict';
async function fix() {
  const neo4j = require('neo4j-driver');
  const d = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph','secret_password_123'), {disableLosslessIntegers:true});
  const s = d.session();
  const GID = '4760a53b-d01a-4ce0-b1c1-626953c26d67';
  const r = await s.run(
    'MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion) WHERE c.entryId = $gid RETURN g.edges AS edges, g.nodes AS nodes, v.versionNumber AS ver ORDER BY v.versionNumber DESC LIMIT 1',
    { gid: GID }
  );
  let edges = JSON.parse(r.records[0].get('edges'));
  let nodes = JSON.parse(r.records[0].get('nodes'));
  const ver = r.records[0].get('ver');
  console.log('Loaded v' + ver);

  // Fix 1: N04->N07 edge label "default" → "unclassified"
  // "default" is treated as wildcard by TopologicalScheduler (always matches)
  // This causes N07 to activate even when N04 branch="high"
  edges = edges.map(e => {
    if (e.source === 'N04' && e.target === 'N07' && e.label === 'default') {
      e.label = 'unclassified';
      if (e.data) e.data.label = 'unclassified';
      console.log('FIX: N04->N07 label: default -> unclassified');
    }
    return e;
  });

  // Fix 2: Update N04 expression to return 'unclassified' instead of 'default'
  const n04 = nodes.find(n => n.id === 'N04');
  if (n04 && n04.data && n04.data.config) {
    n04.data.config.expression = n04.data.config.expression.replace("'default'", "'unclassified'");
    console.log('FIX: N04 expression: default -> unclassified');
  }

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.edges = $e, g.nodes = $n WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Fix N04->N07 edge: default->unclassified (default is wildcard in scheduler)"}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, e: JSON.stringify(edges), n: JSON.stringify(nodes), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
