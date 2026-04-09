'use strict';
async function fix() {
  const neo4j = require('neo4j-driver');
  const d = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph','secret_password_123'), {disableLosslessIntegers:true});
  const s = d.session();
  const GID = 'e28e578a-5b1b-49b7-bc01-f7ced8d1363a';
  const r = await s.run(
    'MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion) WHERE c.entryId = $gid RETURN g.nodes AS nodes, g.edges AS edges, v.versionNumber AS ver ORDER BY v.versionNumber DESC LIMIT 1', { gid: GID }
  );
  let nodes = JSON.parse(r.records[0].get('nodes'));
  let edges = JSON.parse(r.records[0].get('edges'));
  const ver = r.records[0].get('ver');
  console.log('Loaded v' + ver + ': ' + nodes.length + ' nodes, ' + edges.length + ' edges');

  // ═══ ADD NODE: N35 — Check Beneficiary Location ═══
  nodes.push({
    id: 'N35',
    type: 'graphNode',
    position: { x: 600, y: 1100 },
    data: {
      id: 'N35',
      label: 'Check Beneficiary Location',
      kind: 'executor',
      tool: 'flowdesk.check_location',
      executorId: 'flowdesk.check_location',
      description: 'Check the location/duty station of the beneficiary from their profile',
      config: { auto_advance: true },
    }
  });
  console.log('Added N35: Check Beneficiary Location');

  // ═══ ADD NODE: N36 — Request Specification Details ═══
  nodes.push({
    id: 'N36',
    type: 'graphNode',
    position: { x: 600, y: 1200 },
    data: {
      id: 'N36',
      label: 'Request Specification',
      kind: 'executor',
      tool: 'flowdesk.confirm_request',
      executorId: 'flowdesk.confirm_request',
      description: 'Ask user for additional specification details based on service type',
      waitForInput: true,
      config: {
        waitForInput: true,
        prompt: 'Please provide any additional details for your request (e.g., preferred laptop model, specifications, urgency, justification):',
        choices: ['Standard configuration', 'Custom specification', 'Skip details'],
        confirmField: 'specificationConfirmed',
      },
    }
  });
  console.log('Added N36: Request Specification');

  // ═══ REWIRE EDGES ═══
  // Current: N18(true) → N23
  // New: N18(true) → N35 → N36 → N23
  // Also: self_different path: N17(true) → N23
  // New: N17(true) → N36 → N23 (self_different already has location from N15)

  // Remove N18→N23(true) edge
  const beforeEdges = edges.length;
  edges = edges.filter(e => !(e.source === 'N18' && e.target === 'N23' && e.label === 'true'));
  console.log('Removed N18→N23(true)');

  // Remove N17→N23(true) edge
  edges = edges.filter(e => !(e.source === 'N17' && e.target === 'N23' && e.label === 'true'));
  console.log('Removed N17→N23(true)');

  // Add new edges:
  // N18(true) → N35 (check beneficiary location)
  edges.push({ id: 'e-N18-N35', source: 'N18', target: 'N35', label: 'true', data: { label: 'true' } });
  // N35 → N36 (ask specification)
  edges.push({ id: 'e-N35-N36', source: 'N35', target: 'N36' });
  // N17(true) → N36 (self_different already has location, go to spec)
  edges.push({ id: 'e-N17-N36', source: 'N17', target: 'N36', label: 'true', data: { label: 'true' } });
  // N36 → N23 (specification done, go to service config)
  edges.push({ id: 'e-N36-N23', source: 'N36', target: 'N23' });

  // Also add N36 for self_current path: N14(self_current) → N23
  // Change to: N14(self_current) → N36 → N23
  edges = edges.filter(e => !(e.source === 'N14' && e.target === 'N23' && e.label === 'self_current'));
  edges.push({ id: 'e-N14-N36', source: 'N14', target: 'N36', label: 'self_current', data: { label: 'self_current' } });
  console.log('Rewired: N14(self_current)→N36→N23, N18(true)→N35→N36→N23, N17(true)→N36→N23');

  console.log('After: ' + nodes.length + ' nodes, ' + edges.length + ' edges (was ' + beforeEdges + ')');

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.nodes = $n, g.edges = $e WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Add N35 (Check Beneficiary Location) + N36 (Request Specification) between N18/N17/N14 and N23. Ensures location check for other user and specification details for all paths."}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, n: JSON.stringify(nodes), e: JSON.stringify(edges), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
