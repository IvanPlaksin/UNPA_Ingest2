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

  // Fix N04: defensive expression checking both N02 and N03 outputs
  const n04 = nodes.find(n => n.id === 'N04');
  if (n04 && n04.data && n04.data.config) {
    n04.data.config.expression = [
      "(N02.confidence === 'high' || N03.confidence === 'high' || N02.score >= 0.85 || N03.score >= 0.85",
      "|| N02.branch === 'high_confidence' || N03.branch === 'high_confidence'",
      "|| (N02.service_code != null && N02.service_code !== '') || (N03.service_code != null && N03.service_code !== ''))",
      "? 'high'",
      ": (N02.confidence === 'medium' || N03.confidence === 'medium' || N02.score >= 0.70 || N03.score >= 0.70)",
      "? 'medium'",
      ": (N02.confidence === 'low' || N03.confidence === 'low' || N02.score >= 0.40 || N03.score >= 0.40)",
      "? 'low'",
      ": 'default'"
    ].join(' ');
    console.log('N04 expression fixed');
  }

  // Fix N07 (Request More Details): workflow.wait_input also needs expected_inputs
  // Change to flowdesk.confirm_request which handles dialog properly
  const n07 = nodes.find(n => n.id === 'N07');
  if (n07) {
    n07.data.tool = 'flowdesk.confirm_request';
    n07.data.executorId = 'flowdesk.confirm_request';
    console.log('N07: workflow.wait_input -> flowdesk.confirm_request');
  }

  // Fix N19 (Service Configuration ai.generate): add system_prompt/user_prompt
  const n19 = nodes.find(n => n.id === 'N19');
  if (n19 && n19.data && n19.data.config) {
    if (!n19.data.config.system_prompt) {
      n19.data.config.system_prompt = 'You are a UN FlowDesk service configuration assistant. Present configuration options based on the classified service type.';
      n19.data.config.user_prompt = 'Configure service options for the user request based on available information.';
      console.log('N19: added system_prompt/user_prompt for ai.generate');
    }
  }

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.nodes = $n WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Fix N04 expression (N02+N03), N07 tool, N19 prompts"}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, n: JSON.stringify(nodes), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
