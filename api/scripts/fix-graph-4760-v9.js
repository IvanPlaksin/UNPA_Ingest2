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

  // Fix N22: create_service_request expects serviceCode (camelCase)
  // but session state has service_code (snake_case from classify_intent)
  // Add parameter mapping in node config
  const n22 = nodes.find(n => n.id === 'N22');
  if (n22 && n22.data) {
    // Add serviceCode alias that reads from service_code
    n22.data.config = n22.data.config || {};
    n22.data.config.serviceCode = '{{service_code}}';
    console.log('N22: added serviceCode mapping from service_code');
  }

  // Also fix N24 (Request Manager Approval) and N26 (Create Work Order)
  // which likely have similar field name issues
  const n24 = nodes.find(n => n.id === 'N24');
  if (n24 && n24.data) {
    n24.data.config = n24.data.config || {};
    n24.data.config.serviceCode = '{{service_code}}';
    n24.data.config.requestId = '{{requestId}}';
    console.log('N24: added field mappings');
  }

  const n26 = nodes.find(n => n.id === 'N26');
  if (n26 && n26.data) {
    n26.data.config = n26.data.config || {};
    n26.data.config.serviceCode = '{{service_code}}';
    n26.data.config.requestId = '{{requestId}}';
    console.log('N26: added field mappings');
  }

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.nodes = $n WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Fix N22/N24/N26: serviceCode field mapping (snake_case→camelCase)"}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, n: JSON.stringify(nodes), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
