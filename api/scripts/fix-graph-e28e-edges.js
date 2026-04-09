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
  console.log('Loaded v' + ver);

  // Edge label mappings
  const LABELS = {
    'N03': { 'N06': 'true', 'N04': 'false' },                      // Profile OK → classify; fail → escalate
    'N07': { 'N12': 'high', 'N08': 'medium', 'N09': 'low', 'N10': 'unclassified' }, // Confidence levels
    'N14': { 'N23': 'self_current', 'N15': 'self_different', 'N16': 'other' }, // For-whom
    'N17': { 'N23': 'true', 'N19': 'false' },                       // Location found
    'N18': { 'N23': 'true', 'N20': 'false' },                       // Beneficiary found
    'N25': { 'N26': 'true', 'N13': 'edit', 'N33': 'false' },       // Confirm: create/edit/cancel
    'N29': { 'N30': 'true', 'N31': 'false' },                       // Approval needed → N30 is approval request, but N29 has only 1 edge to N30
  };

  // Fix expressions to use NodeID.field and return correct branch strings
  const EXPR_FIXES = {
    'N14': "N13.beneficiary_type === 'self' || N13.beneficiary_type === 'myself' ? 'self_current' : N13.beneficiary_type === 'different' ? 'self_different' : 'other'",
    'N17': "N15.location != null && N15.location !== '' || N15.found === true",
    'N18': "N16.users && N16.users.length > 0 || N16.found === true",
    'N25': "N24.action === 'confirm' || N24.action === 'yes' || N24.confirmed === true || N24.requestConfirmed === true ? 'true' : N24.action === 'edit' ? 'edit' : 'false'",
    'N29': "N28.requires_approval === true || N28.approval_required === true",
  };

  let fixCount = 0;
  edges = edges.map(e => {
    const labelMap = LABELS[e.source];
    if (labelMap && labelMap[e.target] !== undefined) {
      e.label = labelMap[e.target];
      if (!e.data) e.data = {};
      e.data.label = labelMap[e.target];
      fixCount++;
    }
    return e;
  });

  // Also need to add second edge from N29 if missing (approval_needed → N30, no_approval → N31)
  const n29edges = edges.filter(e => e.source === 'N29');
  if (n29edges.length === 1) {
    // N29 only goes to N30, need edge to N31 for no_approval
    edges.push({ id: 'e-N29-N31', source: 'N29', target: 'N31', label: 'false', data: { label: 'false' } });
    console.log('Added N29->N31 (false/no_approval)');
    fixCount++;
  }

  // Fix expressions
  let exprFix = 0;
  nodes = nodes.map(n => {
    if (EXPR_FIXES[n.id] && n.data?.config) {
      n.data.config.expression = EXPR_FIXES[n.id];
      exprFix++;
    }
    return n;
  });

  console.log('Fixed ' + fixCount + ' edge labels, ' + exprFix + ' expressions');

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.nodes = $n, g.edges = $e WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Add condition edge labels + fix expressions to NodeID.field format"}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, n: JSON.stringify(nodes), e: JSON.stringify(edges), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
