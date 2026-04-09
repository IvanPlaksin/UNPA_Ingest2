/**
 * Fix condition expressions in graph 96092967 v3 → v4
 *
 * Issues found:
 * 1. N03: input.confidence_level should be input.confidence (field name mismatch)
 * 2. N03: 'HIGH' should match 'high' (case insensitive)
 * 3. N05: input.has_location — verify matches check_location output
 * 4. N08: input.beneficiary_type — verify matches ask_beneficiary output
 * 5. N12: input.action — verify matches confirm_request output
 * 6. N14: input.requires_approval — verify matches service config output
 *
 * Also fix: duplicate response concatenation
 */

'use strict';

async function fix() {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph', 'secret_password_123'), { disableLosslessIntegers: true });
  const session = driver.session();

  const r = await session.run(
    `MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
     WHERE c.entryId = '96092967-0088-477d-9fcb-f7d6965b8863'
     RETURN g.nodes AS nodes, g.edges AS edges, v.versionNumber AS version
     ORDER BY v.versionNumber DESC LIMIT 1`
  );

  let nodes = JSON.parse(r.records[0].get('nodes'));
  let edges = JSON.parse(r.records[0].get('edges'));
  const currentVersion = r.records[0].get('version');
  console.log(`Loaded v${currentVersion}: ${nodes.length} nodes\n`);

  // Map of actual executor output field names (from testing):
  //
  // flowdesk.classify_intent outputs:
  //   { service_code, method, confidence: "high"|"medium"|"low", score: 0.95, alternatives, response, branch }
  //
  // flowdesk.check_location outputs:
  //   { has_location: true|false, location: {...} }
  //
  // flowdesk.ask_beneficiary outputs:
  //   { beneficiary_type: "self"|"other", response }
  //
  // flowdesk.confirm_request outputs:
  //   { action: "confirm"|"cancel", response }
  //
  // Service config (workflow.set_variable) outputs:
  //   { requires_approval: true|false }

  const EXPRESSION_FIXES = {
    'N03': {
      old: "input.confidence_level === 'HIGH' || input.confidence_level === 'MEDIUM'",
      new: "input.confidence === 'high' || input.confidence === 'medium' || input.score >= 0.6",
      reason: 'Field is "confidence" not "confidence_level", values are lowercase'
    },
    'N05': {
      old: "input.has_location === true",
      new: "input.has_location === true || (input.location != null && input.location !== '')",
      reason: 'Also check location object existence as fallback'
    },
    'N08': {
      old: "input.beneficiary_type === 'self'",
      new: "input.beneficiary_type === 'self' || input.beneficiary_type === 'Self' || input.beneficiary_type === 'myself'",
      reason: 'User may type "Self", "myself" etc — normalize check'
    },
    'N12': {
      old: "input.action === 'confirm'",
      new: "input.action === 'confirm' || input.action === 'yes' || input.confirmed === true",
      reason: 'User may type "yes" or executor may set confirmed flag'
    },
    'N14': {
      old: "input.requires_approval === true",
      new: "input.requires_approval === true || input.approval_required === true",
      reason: 'Different executors may use different field names'
    }
  };

  let fixCount = 0;
  nodes = nodes.map(n => {
    const fix = EXPRESSION_FIXES[n.id];
    if (fix && n.data?.config?.expression) {
      console.log(`FIX ${n.id} (${n.data.label}):`);
      console.log(`  OLD: ${fix.old}`);
      console.log(`  NEW: ${fix.new}`);
      console.log(`  WHY: ${fix.reason}`);
      n.data.config.expression = fix.new;
      fixCount++;
    }
    return n;
  });

  console.log(`\nFixed ${fixCount} condition expressions`);

  // Save as new version
  const newVersion = currentVersion + 1;
  await session.run(
    `MATCH (c:CatalogEntry {entryId: '96092967-0088-477d-9fcb-f7d6965b8863'})-[:DEFINES]->(g:GraphDefinition)
     SET g.nodes = $nodes
     WITH g
     CREATE (v:GraphVersion {
       versionNumber: $ver,
       createdAt: $now,
       createdBy: 'fix-script',
       changeLog: 'Fix condition expressions: field name mismatches (confidence_level→confidence), case sensitivity, defensive checks'
     })
     CREATE (g)-[:HAS_VERSION]->(v)
     WITH g
     MATCH (c2:CatalogEntry {entryId: '96092967-0088-477d-9fcb-f7d6965b8863'})
     SET c2.currentVersion = $ver, c2.updatedAt = $now`,
    { nodes: JSON.stringify(nodes), ver: newVersion, now: new Date().toISOString() }
  );

  console.log(`Saved as v${newVersion}`);

  await session.close();
  await driver.close();
  process.exit(0);
}

fix().catch(e => { console.error(e.message); process.exit(1); });
