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

  // ═══ NEW NODES ═══

  // N37 — Condition: Beneficiary Has Location?
  nodes.push({
    id: 'N37', type: 'graphNode', position: { x: 650, y: 1150 },
    data: {
      id: 'N37', label: 'Beneficiary Location Check', kind: 'condition',
      tool: 'workflow.condition', executorId: 'workflow.condition',
      config: {
        expression: "N35.has_location === true || (N35.location != null && N35.location !== '')",
      },
    }
  });
  console.log('Added N37: Beneficiary Location Check (condition)');

  // N38 — Confirm or Change Location (when beneficiary HAS location)
  nodes.push({
    id: 'N38', type: 'graphNode', position: { x: 550, y: 1250 },
    data: {
      id: 'N38', label: 'Confirm Beneficiary Location', kind: 'executor',
      tool: 'flowdesk.confirm_request', executorId: 'flowdesk.confirm_request',
      waitForInput: true,
      config: {
        waitForInput: true,
        prompt: 'The beneficiary is located at their registered duty station. Would you like to use this location or select a different one?',
        choices: ['Use registered location', 'Select different location'],
        confirmField: 'beneficiaryLocationConfirmed',
      },
    }
  });
  console.log('Added N38: Confirm Beneficiary Location (waitForInput)');

  // N39 — Select Location (when no location OR user chose different)
  nodes.push({
    id: 'N39', type: 'graphNode', position: { x: 750, y: 1250 },
    data: {
      id: 'N39', label: 'Select Beneficiary Location', kind: 'executor',
      tool: 'flowdesk.search_location', executorId: 'flowdesk.search_location',
      waitForInput: true,
      config: {
        waitForInput: true,
        prompt: 'Please enter the location for this service request:',
      },
    }
  });
  console.log('Added N39: Select Beneficiary Location (waitForInput)');

  // ═══ REWIRE EDGES ═══

  // Remove: N35 → N36 (old direct connection)
  edges = edges.filter(e => !(e.source === 'N35' && e.target === 'N36'));
  console.log('Removed N35→N36');

  // Remove: N36 → N23 (N36 will now be AFTER N23, as final confirmation)
  edges = edges.filter(e => !(e.source === 'N36' && e.target === 'N23'));
  console.log('Removed N36→N23');

  // Remove: N23 → N24 (N36 goes between N23 and N24)
  edges = edges.filter(e => !(e.source === 'N23' && e.target === 'N24'));
  console.log('Removed N23→N24');

  // Remove: N14(self_current) → N36 (self goes to spec first, then confirm)
  edges = edges.filter(e => !(e.source === 'N14' && e.target === 'N36' && e.label === 'self_current'));
  console.log('Removed N14(self_current)→N36');

  // Remove: N17(true) → N36 (self_different goes through spec then confirm)
  edges = edges.filter(e => !(e.source === 'N17' && e.target === 'N36' && e.label === 'true'));
  console.log('Removed N17(true)→N36');

  // NEW EDGES:

  // N35 → N37 (check location result)
  edges.push({ id: 'e-N35-N37', source: 'N35', target: 'N37' });

  // N37(true) → N38 (has location → confirm/change)
  edges.push({ id: 'e-N37-N38', source: 'N37', target: 'N38', label: 'true', data: { label: 'true' } });

  // N37(false) → N39 (no location → select)
  edges.push({ id: 'e-N37-N39', source: 'N37', target: 'N39', label: 'false', data: { label: 'false' } });

  // N38 → N23 (after confirm location → service config)
  edges.push({ id: 'e-N38-N23', source: 'N38', target: 'N23' });

  // N39 → N23 (after select location → service config)
  edges.push({ id: 'e-N39-N23', source: 'N39', target: 'N23' });

  // N23 → N36 (service config → request specification)
  edges.push({ id: 'e-N23-N36', source: 'N23', target: 'N36' });

  // N36 → N24 (specification → final confirmation)
  edges.push({ id: 'e-N36-N24', source: 'N36', target: 'N24' });

  // self_current: N14 → N23 directly (already has location from N12)
  edges.push({ id: 'e-N14-N23-self', source: 'N14', target: 'N23', label: 'self_current', data: { label: 'self_current' } });

  // self_different N17(true) → N23 (already searched location via N15)
  edges.push({ id: 'e-N17-N23', source: 'N17', target: 'N23', label: 'true', data: { label: 'true' } });

  console.log('Added 9 new edges');
  console.log('Final: ' + nodes.length + ' nodes, ' + edges.length + ' edges');

  /*
   * NEW FLOW SUMMARY:
   *
   * self_current:   N14 → N23(config) → N36(spec) → N24(confirm) → ...
   * self_different: N14 → N15(search) → N17 → N23(config) → N36(spec) → N24(confirm) → ...
   * other (found):  N14 → N16(find) → N18 → N35(check loc) → N37(condition)
   *                   → true:  N38(confirm/change loc) → N23 → N36 → N24
   *                   → false: N39(select loc) → N23 → N36 → N24
   */

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.nodes = $n, g.edges = $e WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Add N37(condition loc check), N38(confirm loc), N39(select loc). Restructure: other→check loc→confirm/select→config→spec→confirm. Self paths go directly to config→spec→confirm."}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, n: JSON.stringify(nodes), e: JSON.stringify(edges), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
