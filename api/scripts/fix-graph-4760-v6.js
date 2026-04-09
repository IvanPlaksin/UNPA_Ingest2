'use strict';
async function fix() {
  const neo4j = require('neo4j-driver');
  const d = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph','secret_password_123'), {disableLosslessIntegers:true});
  const s = d.session();
  const GID = '4760a53b-d01a-4ce0-b1c1-626953c26d67';
  const r = await s.run(
    'MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion) WHERE c.entryId = $gid RETURN g.edges AS edges, v.versionNumber AS ver ORDER BY v.versionNumber DESC LIMIT 1',
    { gid: GID }
  );
  let edges = JSON.parse(r.records[0].get('edges'));
  const ver = r.records[0].get('ver');
  console.log('Loaded v' + ver + ': ' + edges.length + ' edges');

  // Fix N05->N09: add label (sequential, not condition — user confirmed medium)
  // N05 is not a condition node, it's an executor (confirm_request)
  // So its outgoing edge is sequential, no label needed
  // The issue is that N07 was activated because it had inDegree from N04(default) + N05(×2)
  // Now N05->N07 removed, N05->N09 remains (sequential)

  // But wait — N05 IS a dialog node with waitForInput. After user confirms,
  // it goes to N09. This is a sequential edge, label not required.
  // Same for N06->N09.

  // The REAL problem: N07 still has inDegree from N04(default).
  // When N04 goes "high", N07 gets skipped from N04.
  // But then merge fix decrements N07 inDegree...
  // N07 has only 1 incoming edge now (N04 default). InDegree starts at 1.
  // N04 skips N07 → N07 stays PENDING with inDegree 1.
  // But if _skipUnreachable sets it SKIPPED, why is it WAITING?

  // Checking: N07 is NOT a condition target, it's a direct N04 default branch target
  // When N04 branch=high, _skipUnreachable skips N07.
  // But N07 executor returns WAIT_FOR_INPUT before it can be skipped?
  // No — skip happens before execution.

  // Let me check: does the N05→N09 edge without label cause N09 to wait for N05?
  // N09 has edges from N04(high) AND from N05(no label) — it's a merge node!
  // When N04 branch=high, N05 is SKIPPED, N09 has inDegree 2 (from N04 + N05)
  // Merge fix should decrement, but N05 edge has no label...

  // Actually the fix is simpler: make N05 and N06 edges properly labeled
  // so the scheduler knows they're sequential continuations

  // For non-condition nodes, edges should NOT have condition labels
  // They should be plain sequential edges. The scheduler handles them fine.
  // But N05->N09 edge makes N09 a merge node with N04->N09.
  // Solution: just make sure labels are consistent

  // Let's verify and log all edges involving these nodes
  ['N04','N05','N06','N07','N09'].forEach(id => {
    const inE = edges.filter(e => e.target === id);
    const outE = edges.filter(e => e.source === id);
    console.log(id + ' IN:' + inE.map(e => ' ' + e.source + '(' + (e.label||'-') + ')').join('') +
                ' | OUT:' + outE.map(e => ' ' + e.target + '(' + (e.label||'-') + ')').join(''));
  });

  console.log('\nSaved as v' + ver + ' (no changes, analysis only)');
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
