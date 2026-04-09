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
  console.log('Loaded v' + ver + ': ' + nodes.length + ' nodes, ' + edges.length + ' edges');

  // Find orphan nodes (no incoming edges, not start node)
  const startKinds = ['input', 'start'];
  const nodesWithIncoming = new Set(edges.map(e => e.target));
  const orphans = nodes.filter(n => {
    const kind = n.data?.kind || n.data?.type || '';
    return !nodesWithIncoming.has(n.id) && !startKinds.includes(kind);
  });

  console.log('\nOrphan nodes (no incoming, not start):');
  orphans.forEach(n => console.log('  ' + n.id + ' ' + (n.data?.label||'')));

  // Remove orphan nodes and their outgoing edges
  const orphanIds = new Set(orphans.map(n => n.id));

  // Also find nodes only reachable FROM orphans
  function getDescendants(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return visited;
    visited.add(nodeId);
    edges.filter(e => e.source === nodeId).forEach(e => {
      // Only follow if target has no other non-orphan incoming
      const otherIncoming = edges.filter(e2 => e2.target === e.target && !orphanIds.has(e2.source) && e2.source !== nodeId);
      if (otherIncoming.length === 0) {
        getDescendants(e.target, visited);
      }
    });
    return visited;
  }

  const toRemove = new Set();
  for (const orphan of orphans) {
    const desc = getDescendants(orphan.id);
    desc.forEach(id => toRemove.add(id));
  }

  console.log('\nNodes to remove (orphans + exclusive descendants):');
  toRemove.forEach(id => {
    const n = nodes.find(nn => nn.id === id);
    console.log('  ' + id + ' ' + (n?.data?.label||''));
  });

  const beforeN = nodes.length;
  const beforeE = edges.length;
  nodes = nodes.filter(n => !toRemove.has(n.id));
  edges = edges.filter(e => !toRemove.has(e.source) && !toRemove.has(e.target));

  console.log('\nRemoved ' + (beforeN - nodes.length) + ' nodes, ' + (beforeE - edges.length) + ' edges');
  console.log('Now: ' + nodes.length + ' nodes, ' + edges.length + ' edges');

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.nodes = $n, g.edges = $e WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Remove orphan nodes (N16,N17,N18 etc) with no incoming edges that auto-start in scheduler"}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, n: JSON.stringify(nodes), e: JSON.stringify(edges), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
