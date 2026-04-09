'use strict';
async function fix() {
  const neo4j = require('neo4j-driver');
  const d = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph','secret_password_123'), {disableLosslessIntegers:true});
  const s = d.session();
  const GID = '4760a53b-d01a-4ce0-b1c1-626953c26d67';
  const r = await s.run(
    'MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion) WHERE c.entryId = $gid RETURN g.nodes AS nodes, v.versionNumber AS ver ORDER BY v.versionNumber DESC LIMIT 1',
    { gid: GID }
  );
  let nodes = JSON.parse(r.records[0].get('nodes'));
  const ver = r.records[0].get('ver');
  console.log('Loaded v' + ver);

  // Fix 1: N27 (Assign Handler) — add serviceCode field mapping
  const n27 = nodes.find(n => n.id === 'N27');
  if (n27 && n27.data) {
    n27.data.config = n27.data.config || {};
    n27.data.config.serviceCode = '{{service_code}}';
    n27.data.config.requestId = '{{requestId}}';
    n27.data.config.workOrderId = '{{workOrderId}}';
    console.log('N27: added serviceCode/requestId/workOrderId mappings');
  }

  // Fix 2: N28 (Send Confirmation) — add field mappings
  const n28 = nodes.find(n => n.id === 'N28');
  if (n28 && n28.data) {
    n28.data.config = n28.data.config || {};
    n28.data.config.serviceCode = '{{service_code}}';
    n28.data.config.requestId = '{{requestId}}';
    console.log('N28: added field mappings');
  }

  // Fix 3: N20 (Request Confirmation) — must NOT pass through on confirmed=true from N11
  // N20 is a DIFFERENT confirmation than N11. N11 confirms location, N20 confirms full request.
  // The problem is session.state.confirmed=true from N11 leaks to N20.
  // Solution: N20 should check its own confirmation flag, not generic "confirmed"
  // Add a unique config field so executor knows this is a different confirmation step
  const n20 = nodes.find(n => n.id === 'N20');
  if (n20 && n20.data) {
    n20.data.config = n20.data.config || {};
    // Use requestConfirmed instead of generic confirmed
    n20.data.config.confirmField = 'requestConfirmed';
    n20.data.config.choices = ['Confirm Request', 'Edit', 'Cancel'];
    console.log('N20: added confirmField=requestConfirmed, custom choices');
  }

  // Fix 4: N24 (Request Manager Approval) — field mappings
  const n24 = nodes.find(n => n.id === 'N24');
  if (n24 && n24.data) {
    n24.data.config = n24.data.config || {};
    n24.data.config.serviceCode = '{{service_code}}';
    n24.data.config.requestId = '{{requestId}}';
    console.log('N24: added field mappings');
  }

  // Fix 5: N29 (Approval Rejected) — field mappings
  const n29 = nodes.find(n => n.id === 'N29');
  if (n29 && n29.data) {
    n29.data.config = n29.data.config || {};
    n29.data.config.serviceCode = '{{service_code}}';
    n29.data.config.requestId = '{{requestId}}';
    console.log('N29: added field mappings');
  }

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.nodes = $n WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Fix N27/N28/N24/N29 field mappings, N20 confirmField to prevent pass-through from N11 confirmed"}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, n: JSON.stringify(nodes), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
