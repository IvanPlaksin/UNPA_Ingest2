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

  // Problem: N11 (Confirm Profile Location) has 3 outgoing edges:
  //   N11 → N15 (Ask Beneficiary)
  //   N11 → N12 (Search Location)
  //   N11 → N16 (Find Beneficiary)
  // All are sequential (no labels), so all 3 activate in parallel.
  //
  // Correct flow per SOP:
  //   N11 confirms location → go to N15 (Ask Beneficiary) — single sequential path
  //   N12 (Search Location) is reached from N10(false) branch
  //   N16 (Find Beneficiary) is reached from N15 answer "other" → after beneficiary name entered
  //
  // Fix: Remove N11→N12 and N11→N16 edges (wrong connections)
  //   N12 already has correct incoming from N10(false)
  //   N16 should be after N15 answers "other"

  const before = edges.length;

  // Remove N11→N12 (Search Location should come from N10 false, not from N11)
  edges = edges.filter(e => !(e.source === 'N11' && e.target === 'N12'));
  console.log('Removed N11->N12');

  // Remove N11→N16 (Find Beneficiary should come after Ask Beneficiary, not from confirm location)
  edges = edges.filter(e => !(e.source === 'N11' && e.target === 'N16'));
  console.log('Removed N11->N16');

  // N16 (Find Beneficiary) needs input from N15 (Ask Beneficiary) when answer is "other"
  // Add N15→N16 edge if not exists
  if (!edges.some(e => e.source === 'N15' && e.target === 'N16')) {
    // But wait — N15 currently goes to N19 (Service Configuration) directly
    // The correct flow: N15 → condition (self?) → N19 (if self) or N16 (if other)
    // For now, keep N15→N19 as the main path (self), will need condition later
    console.log('N15 currently goes to N19 only — self path. N16 path needs condition node.');
  }

  console.log('Removed ' + (before - edges.length) + ' edges. Now: ' + edges.length);

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.edges = $e WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Remove wrong N11->N12 and N11->N16 edges (parallel activation bug). N11 should only go to N15."}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, e: JSON.stringify(edges), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
