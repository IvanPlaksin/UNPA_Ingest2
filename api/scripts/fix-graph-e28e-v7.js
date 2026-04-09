'use strict';
async function fix() {
  const neo4j = require('neo4j-driver');
  const d = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph','secret_password_123'), {disableLosslessIntegers:true});
  const s = d.session();
  const GID = 'e28e578a-5b1b-49b7-bc01-f7ced8d1363a';
  const r = await s.run(
    'MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion) WHERE c.entryId = $gid RETURN g.nodes AS nodes, v.versionNumber AS ver ORDER BY v.versionNumber DESC LIMIT 1', { gid: GID }
  );
  let nodes = JSON.parse(r.records[0].get('nodes'));
  const ver = r.records[0].get('ver');
  console.log('Loaded v' + ver);

  // Fix 1: N18 expression — flowdesk.find_user returns {beneficiary: {id, name, email}, branch: "found"}
  // NOT {users: [...], found: true}
  const n18 = nodes.find(n => n.id === 'N18');
  if (n18 && n18.data?.config) {
    n18.data.config.expression = "N16.beneficiary != null || N16.branch === 'found' || (N16.users && N16.users.length > 0)";
    console.log('N18: fixed expression to check N16.beneficiary or N16.branch');
  }

  // Fix 2: N16 (Find Beneficiary) should wait for user input (name/search query)
  // Currently auto_advance=true, but user needs to enter beneficiary name
  const n16 = nodes.find(n => n.id === 'N16');
  if (n16 && n16.data) {
    // N16 is flowdesk.find_user — it uses searchTerm/userInput to search
    // The problem is it uses session.userInput which is "other" from previous turn
    // It should wait for NEW input (beneficiary name)
    n16.data.waitForInput = true;
    n16.data.config = n16.data.config || {};
    n16.data.config.waitForInput = true;
    n16.data.config.prompt = 'Please enter the name of the staff member you are making this request for:';
    delete n16.data.config.auto_advance;
    console.log('N16: added waitForInput + prompt (was auto_advance)');
  }

  // Fix 3: N15 (Search Different Location) should also wait for input
  const n15 = nodes.find(n => n.id === 'N15');
  if (n15 && n15.data) {
    n15.data.waitForInput = true;
    n15.data.config = n15.data.config || {};
    n15.data.config.waitForInput = true;
    n15.data.config.prompt = 'Please enter the location for this request:';
    delete n15.data.config.auto_advance;
    console.log('N15: added waitForInput + prompt');
  }

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.nodes = $n WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Fix N18 expression (beneficiary not users), N16 waitForInput (need beneficiary name), N15 waitForInput"}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, n: JSON.stringify(nodes), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
