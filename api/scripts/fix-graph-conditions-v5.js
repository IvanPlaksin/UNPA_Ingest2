/**
 * Fix condition expressions v4 → v5
 *
 * Root cause: expressions use input.X but input = initialInput (session state),
 * NOT the output of previous nodes. Node outputs are accessed via node ID: N02.confidence
 *
 * ExecutionContext.getExpressionContext() returns:
 * { input: initialInput, N01: output, N02: output, ... }
 */

'use strict';

async function fix() {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph', 'secret_password_123'), { disableLosslessIntegers: true });
  const session = driver.session();

  const r = await session.run(
    `MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
     WHERE c.entryId = '96092967-0088-477d-9fcb-f7d6965b8863'
     RETURN g.nodes AS nodes, v.versionNumber AS version
     ORDER BY v.versionNumber DESC LIMIT 1`
  );

  let nodes = JSON.parse(r.records[0].get('nodes'));
  const currentVersion = r.records[0].get('version');
  console.log(`Loaded v${currentVersion}\n`);

  // Expression fixes: use node output references instead of input.*
  // N03 checks N02 output → N02.confidence, N02.score
  // N05 checks N04 output → N04.has_location, N04.location
  // N08 checks N07 output → N07.beneficiary_type
  // N12 checks N11 output → N11.action, N11.confirmed
  // N14 checks N10 output → N10.requires_approval (or service config)

  const FIXES = {
    'N03': {
      // N02 (flowdesk.classify_intent) outputs: { confidence: "high", score: 0.95 }
      expression: "N02.confidence === 'high' || N02.confidence === 'medium' || N02.score >= 0.6",
      why: 'Reference N02 output directly, not input (which is session state)'
    },
    'N05': {
      // N04 (flowdesk.check_location) outputs: { has_location: true/false, location: {...} }
      expression: "N04.has_location === true || (N04.location != null && N04.location !== '')",
      why: 'Reference N04 output for location check'
    },
    'N08': {
      // N07 (flowdesk.ask_beneficiary) outputs: { beneficiary_type: "self"|"other" }
      expression: "N07.beneficiary_type === 'self' || N07.beneficiary_type === 'Self' || N07.beneficiary_type === 'myself'",
      why: 'Reference N07 output for beneficiary type'
    },
    'N12': {
      // N11 (flowdesk.confirm_request) outputs: { action: "confirm"|"cancel" }
      expression: "N11.action === 'confirm' || N11.action === 'yes' || N11.confirmed === true",
      why: 'Reference N11 output for confirmation'
    },
    'N14': {
      // N10 (workflow.set_variable / service config) sets requires_approval
      // Also check N13 output if it sets approval flag
      expression: "N10.requires_approval === true || N13.approval_required === true || input.requires_approval === true",
      why: 'Check N10/N13 output and input fallback for approval requirement'
    }
  };

  let fixCount = 0;
  nodes = nodes.map(n => {
    const fix = FIXES[n.id];
    if (fix && n.data?.config) {
      console.log(`FIX ${n.id} (${n.data.label}):`);
      console.log(`  OLD: ${n.data.config.expression}`);
      console.log(`  NEW: ${fix.expression}`);
      console.log(`  WHY: ${fix.why}`);
      n.data.config.expression = fix.expression;
      fixCount++;
    }
    return n;
  });

  console.log(`\nFixed ${fixCount} expressions`);

  const newVersion = currentVersion + 1;
  await session.run(
    `MATCH (c:CatalogEntry {entryId: '96092967-0088-477d-9fcb-f7d6965b8863'})-[:DEFINES]->(g:GraphDefinition)
     SET g.nodes = $nodes
     WITH g
     CREATE (v:GraphVersion {
       versionNumber: $ver, createdAt: $now, createdBy: 'fix-script',
       changeLog: 'Fix condition expressions: use node output refs (N02.confidence) instead of input.* (session state). Root cause: ExecutionContext.input = initialInput, not previous node output.'
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
