/**
 * Fix graph 96092967-0088-477d-9fcb-f7d6965b8863 for Codex compliance.
 *
 * Fixes:
 * 1. GXE-001: Add waitForInput to dialog nodes
 * 2. GXE-002: Add true/false labels to condition edges
 * 3. GXE-003: Add tool/executorId to all executor nodes
 * 4. GXE-006: Add auto_advance/passThrough config
 *
 * Creates new version (v3) preserving v2.
 */

'use strict';

async function fix() {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph', 'secret_password_123'), { disableLosslessIntegers: true });
  const session = driver.session();

  // Load current version
  const r = await session.run(
    `MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
     WHERE c.entryId = '96092967-0088-477d-9fcb-f7d6965b8863'
     RETURN g, g.nodes AS nodes, g.edges AS edges, v.versionNumber AS version
     ORDER BY v.versionNumber DESC LIMIT 1`
  );

  let nodes = JSON.parse(r.records[0].get('nodes'));
  let edges = JSON.parse(r.records[0].get('edges'));
  const currentVersion = r.records[0].get('version');

  console.log(`Loaded v${currentVersion}: ${nodes.length} nodes, ${edges.length} edges\n`);

  // ═══════════════════════════════════════════════════════════════
  // FIX 1: GXE-001 — Add waitForInput to dialog nodes
  // ═══════════════════════════════════════════════════════════════
  const DIALOG_NODES = {
    'N01': { waitForInput: true, prompt: 'How can I help you today?' },
    'N06': { waitForInput: true, prompt: 'Please enter your location or duty station' },
    'N07': { waitForInput: true, prompt: 'Is this request for yourself or someone else?', options: ['For myself', 'For someone else'] },
    'N09': { waitForInput: true, prompt: 'Please enter the name of the beneficiary' },
    'N11': { waitForInput: true, prompt: 'Please review and confirm your request', options: ['Confirm', 'Cancel'] },
  };

  let fix1Count = 0;
  nodes = nodes.map(n => {
    const fix = DIALOG_NODES[n.id];
    if (fix) {
      n.data = { ...n.data, waitForInput: true, config: { ...n.data?.config, ...fix } };
      fix1Count++;
      console.log(`  GXE-001 FIX: ${n.id} ${n.data.label} → waitForInput: true`);
    }
    return n;
  });

  // ═══════════════════════════════════════════════════════════════
  // FIX 2: GXE-002 — Add true/false labels to condition edges
  // ═══════════════════════════════════════════════════════════════
  // Mapping: condition → [true_target, false_target]
  const CONDITION_BRANCHES = {
    'N03': { true: 'N04', false: 'N20' },   // Classification OK → proceed; LOW → escalate
    'N05': { true: 'N07', false: 'N06' },   // Location found → ask beneficiary; not → search
    'N08': { true: 'N10', false: 'N09' },   // Self request → config; other → find beneficiary
    'N12': { true: 'N13', false: 'N22' },   // Confirmed → create SR; cancelled → exit
    'N14': { true: 'N15', false: 'N16' },   // Needs approval → request; no → work order
  };

  let fix2Count = 0;
  edges = edges.map(e => {
    const branches = CONDITION_BRANCHES[e.source];
    if (branches) {
      if (e.target === branches.true) {
        e.label = 'true';
        if (!e.data) e.data = {};
        e.data.label = 'true';
        fix2Count++;
        console.log(`  GXE-002 FIX: ${e.source}→${e.target} label: "true"`);
      } else if (e.target === branches.false) {
        e.label = 'false';
        if (!e.data) e.data = {};
        e.data.label = 'false';
        fix2Count++;
        console.log(`  GXE-002 FIX: ${e.source}→${e.target} label: "false"`);
      }
    }
    return e;
  });

  // ═══════════════════════════════════════════════════════════════
  // FIX 3: GXE-003 — Add tool/executorId bindings
  // ═══════════════════════════════════════════════════════════════
  const TOOL_BINDINGS = {
    'N01': 'workflow.start',
    'N02': 'flowdesk.classify_intent',
    'N03': 'workflow.condition',
    'N04': 'flowdesk.check_location',
    'N05': 'workflow.condition',
    'N06': 'flowdesk.search_location',
    'N07': 'flowdesk.ask_beneficiary',
    'N08': 'workflow.condition',
    'N09': 'flowdesk.find_user',
    'N10': 'workflow.set_variable',
    'N11': 'flowdesk.confirm_request',
    'N12': 'workflow.condition',
    'N13': 'flowdesk.create_service_request',
    'N14': 'workflow.condition',
    'N15': 'flowdesk.request_approval',
    'N16': 'flowdesk.create_work_order',
    'N17': 'flowdesk.assign_handler',
    'N18': 'flowdesk.send_notification',
    'N19': 'workflow.end',
    'N20': 'flowdesk.spawn_process',
    'N21': 'workflow.end',
    'N22': 'workflow.end',
  };

  let fix3Count = 0;
  nodes = nodes.map(n => {
    const tool = TOOL_BINDINGS[n.id];
    if (tool && !n.data?.tool && !n.data?.executorId) {
      n.data = { ...n.data, tool, executorId: tool };
      fix3Count++;
      console.log(`  GXE-003 FIX: ${n.id} ${n.data.label} → tool: ${tool}`);
    }
    return n;
  });

  // ═══════════════════════════════════════════════════════════════
  // FIX 4: GXE-006 — Add auto_advance for silent/pass-through nodes
  // ═══════════════════════════════════════════════════════════════
  const SILENT_NODES = ['N02', 'N04', 'N10', 'N13', 'N15', 'N16', 'N17', 'N18', 'N20'];
  let fix4Count = 0;
  nodes = nodes.map(n => {
    if (SILENT_NODES.includes(n.id)) {
      n.data = { ...n.data, config: { ...n.data?.config, auto_advance: true } };
      fix4Count++;
    }
    return n;
  });

  console.log(`\nFixes applied: GXE-001=${fix1Count}, GXE-002=${fix2Count}, GXE-003=${fix3Count}, GXE-006=${fix4Count}`);

  // ═══════════════════════════════════════════════════════════════
  // Save as new version (v3)
  // ═══════════════════════════════════════════════════════════════
  const newVersion = currentVersion + 1;

  await session.run(
    `MATCH (c:CatalogEntry {entryId: '96092967-0088-477d-9fcb-f7d6965b8863'})-[:DEFINES]->(g:GraphDefinition)
     SET g.nodes = $nodes, g.edges = $edges
     WITH g
     CREATE (v:GraphVersion {
       versionNumber: $ver,
       createdAt: $now,
       createdBy: 'fix-script',
       changeLog: 'Codex compliance fixes: GXE-001 (waitForInput), GXE-002 (edge labels), GXE-003 (tool bindings), GXE-006 (auto_advance)'
     })
     CREATE (g)-[:HAS_VERSION]->(v)
     WITH g
     MATCH (c2:CatalogEntry {entryId: '96092967-0088-477d-9fcb-f7d6965b8863'})
     SET c2.currentVersion = $ver, c2.updatedAt = $now
     RETURN g`,
    {
      nodes: JSON.stringify(nodes),
      edges: JSON.stringify(edges),
      ver: newVersion,
      now: new Date().toISOString()
    }
  );

  console.log(`\nSaved as version ${newVersion}`);

  await session.close();
  await driver.close();
  process.exit(0);
}

fix().catch(e => { console.error(e.message); process.exit(1); });
