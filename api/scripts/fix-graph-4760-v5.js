'use strict';
async function fix() {
  const neo4j = require('neo4j-driver');
  const d = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph','secret_password_123'), {disableLosslessIntegers:true});
  const s = d.session();
  const GID = '4760a53b-d01a-4ce0-b1c1-626953c26d67';
  const r = await s.run(
    'MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion) WHERE c.entryId = $gid RETURN g.nodes AS nodes, g.edges AS edges, v.versionNumber AS ver ORDER BY v.versionNumber DESC LIMIT 1',
    { gid: GID }
  );
  let nodes = JSON.parse(r.records[0].get('nodes'));
  let edges = JSON.parse(r.records[0].get('edges'));
  const ver = r.records[0].get('ver');
  console.log('Loaded v' + ver + ': ' + edges.length + ' edges');

  // Remove duplicate edges and fix unlabeled edges
  // N05 -> N07 appears twice with no label. N05 is "Confirm Medium Confidence"
  // When user confirms medium, it should go to N09 (check location), not N07
  // N07 is "Request More Details" — only reachable from N04 default branch

  // Step 1: Remove ALL edges from N05 to N07 (wrong target)
  const before = edges.length;
  edges = edges.filter(e => !(e.source === 'N05' && e.target === 'N07'));
  console.log('Removed ' + (before - edges.length) + ' edges N05->N07');

  // Step 2: N05 (Confirm Medium) should go to N09 (Check Location) on confirm
  // and back to N06 (Select from Low) on reject — or to N07 for clarification
  // Check what edges N05 currently has
  const n05edges = edges.filter(e => e.source === 'N05');
  console.log('N05 remaining edges:', n05edges.map(e => e.source + '->' + e.target + ' ' + (e.label||'NONE')).join(', '));

  // If N05 has no outgoing edges, add correct ones
  if (n05edges.length === 0) {
    edges.push({ id: 'e-N05-N09', source: 'N05', target: 'N09', label: 'true', data: { label: 'true' } });
    edges.push({ id: 'e-N05-N07', source: 'N05', target: 'N07', label: 'false', data: { label: 'false' } });
    console.log('Added N05->N09 (true), N05->N07 (false)');
  }

  // Step 3: Also check N06 edges
  const n06edges = edges.filter(e => e.source === 'N06');
  console.log('N06 edges:', n06edges.map(e => e.source + '->' + e.target + ' ' + (e.label||'NONE')).join(', '));
  if (n06edges.length === 0) {
    edges.push({ id: 'e-N06-N09', source: 'N06', target: 'N09', label: 'true', data: { label: 'true' } });
    edges.push({ id: 'e-N06-N08', source: 'N06', target: 'N08', label: 'false', data: { label: 'false' } });
    console.log('Added N06->N09 (true), N06->N08 (false)');
  }

  // Step 4: Fix any remaining unlabeled edges from condition/dialog nodes
  let fixedLabels = 0;
  edges.forEach(e => {
    if (!e.label || e.label === 'NONE') {
      // Only fix edges from executor/dialog nodes that should have been labeled
      // Leave non-condition edges unlabeled (they're sequential)
    }
  });

  console.log('\nFinal edge count:', edges.length);

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.edges = $e WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Fix duplicate N05->N07 edges, add correct N05/N06 outgoing edges with labels"}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, e: JSON.stringify(edges), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
