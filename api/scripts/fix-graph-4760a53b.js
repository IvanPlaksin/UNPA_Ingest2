/**
 * Fix graph 4760a53b-d01a-4ce0-b1c1-626953c26d67 ("Ex SOP 2") v1 → v2
 *
 * Fixes: GXE-001 (waitForInput), GXE-002 (edge labels), GXE-003 (tool bindings),
 *        GXE-006 (auto_advance), GXE-011 (expressions), GXE-019 (node output refs)
 */
'use strict';

async function fix() {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph', 'secret_password_123'), { disableLosslessIntegers: true });
  const session = driver.session();

  const GID = '4760a53b-d01a-4ce0-b1c1-626953c26d67';
  const r = await session.run(
    `MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
     WHERE c.entryId = $gid RETURN g.nodes AS nodes, g.edges AS edges, v.versionNumber AS ver
     ORDER BY v.versionNumber DESC LIMIT 1`, { gid: GID }
  );

  let nodes = JSON.parse(r.records[0].get('nodes'));
  let edges = JSON.parse(r.records[0].get('edges'));
  const ver = r.records[0].get('ver');
  console.log(`Loaded v${ver}: ${nodes.length} nodes, ${edges.length} edges\n`);

  // ═══ FIX 1: GXE-003 — Tool bindings ═══
  const TOOLS = {
    'N01': 'workflow.start',
    'N02': 'workflow.wait_input',       // User input node, NOT ai.generate
    'N03': 'flowdesk.classify_intent',
    'N04': 'workflow.condition',
    'N05': 'flowdesk.confirm_request',  // Confirm medium confidence
    'N06': 'flowdesk.confirm_request',  // Select from low confidence
    'N07': 'workflow.wait_input',       // Request more details
    'N08': 'flowdesk.spawn_process',    // Escalate to human
    'N09': 'flowdesk.check_location',
    'N10': 'workflow.condition',
    'N11': 'flowdesk.confirm_request',  // Confirm profile location
    'N12': 'flowdesk.search_location',
    'N13': 'workflow.condition',
    'N14': 'flowdesk.confirm_request',  // Select location
    'N15': 'flowdesk.ask_beneficiary',
    'N16': 'flowdesk.find_user',
    'N17': 'workflow.condition',
    'N18': 'flowdesk.confirm_request',  // Select beneficiary
    'N19': 'ai.generate',              // Service configuration (LLM)
    'N20': 'flowdesk.confirm_request',  // Request confirmation
    'N21': 'workflow.condition',
    'N22': 'flowdesk.create_service_request',
    'N23': 'workflow.condition',
    'N24': 'flowdesk.request_approval',
    'N25': 'workflow.condition',
    'N26': 'flowdesk.create_work_order',
    'N27': 'flowdesk.assign_handler',
    'N28': 'flowdesk.send_notification',
    'N29': 'flowdesk.send_notification', // Approval rejected notification
    'N30': 'workflow.end',
    'N31': 'workflow.end',
    'N32': 'workflow.end',
  };

  // ═══ FIX 2: GXE-001 — waitForInput ═══
  const WAIT_NODES = {
    'N01': { waitForInput: true, prompt: 'How can I help you today?' },
    'N02': { waitForInput: true },  // Already has prompt in config
    'N05': { waitForInput: true },
    'N06': { waitForInput: true },
    'N07': { waitForInput: true },
    'N11': { waitForInput: true },
    'N12': { waitForInput: true, prompt: 'Please enter your location' },
    'N14': { waitForInput: true },
    'N15': { waitForInput: true },
    'N18': { waitForInput: true },
    'N20': { waitForInput: true },
  };

  // ═══ FIX 3: GXE-006 — auto_advance for silent nodes ═══
  const SILENT_NODES = ['N03', 'N08', 'N09', 'N16', 'N19', 'N22', 'N24', 'N26', 'N27', 'N28', 'N29'];

  // ═══ FIX 4: GXE-002 — Edge labels (multi-branch support) ═══
  // N04: 4 branches (high, medium, low, unclassified)
  // N10: 2 branches (found, not_found)
  // N13: 3 branches (single_match, multiple_matches, no_match)
  // N17: 2 branches (found, not_found)
  // N21: 3 branches (create, edit, cancel)
  // N23: 2 branches (approval_needed, direct_process)
  // N25: 2 branches (approved, rejected)
  const EDGE_LABELS = {
    'N04': { 'N09': 'high', 'N05': 'medium', 'N06': 'low', 'N07': 'default' },
    'N10': { 'N11': 'true', 'N12': 'false' },
    'N13': { 'N15': 'true', 'N14': 'multiple', 'N08': 'false' },
    'N17': { 'N18': 'true', 'N08': 'false' },
    'N21': { 'N22': 'true', 'N19': 'edit', 'N31': 'false' },
    'N23': { 'N24': 'true', 'N26': 'false' },
    'N25': { 'N26': 'true', 'N29': 'false' },
  };

  // ═══ FIX 5: GXE-019 + GXE-021 — Expressions with node output refs ═══
  const EXPRESSIONS = {
    'N04': "N03.confidence === 'high' || N03.score >= 0.85 ? 'high' : N03.confidence === 'medium' || N03.score >= 0.70 ? 'medium' : N03.confidence === 'low' || N03.score >= 0.40 ? 'low' : 'default'",
    'N10': "N09.has_location === true || (N09.location != null && N09.location !== '')",
    'N13': "N12.locations && N12.locations.length === 1 ? 'true' : N12.locations && N12.locations.length > 1 ? 'multiple' : 'false'",
    'N17': "N16.users && N16.users.length > 0 || N16.found === true",
    'N21': "N20.action === 'confirm' || N20.action === 'yes' || N20.confirmed === true ? 'true' : N20.action === 'edit' ? 'edit' : 'false'",
    'N23': "N22.requires_approval === true || N22.approval_required === true",
    'N25': "N24.approved === true || N24.status === 'approved'",
  };

  // Apply all fixes
  let fix1 = 0, fix2 = 0, fix3 = 0, fix4 = 0, fix5 = 0;

  nodes = nodes.map(n => {
    // Tool binding
    if (TOOLS[n.id] && !n.data?.tool) {
      n.data = { ...n.data, tool: TOOLS[n.id], executorId: TOOLS[n.id] };
      fix1++;
    }
    // waitForInput
    if (WAIT_NODES[n.id]) {
      n.data = { ...n.data, ...WAIT_NODES[n.id], config: { ...n.data?.config, ...WAIT_NODES[n.id] } };
      fix2++;
    }
    // auto_advance
    if (SILENT_NODES.includes(n.id)) {
      n.data = { ...n.data, config: { ...n.data?.config, auto_advance: true } };
      fix3++;
    }
    // Expressions
    if (EXPRESSIONS[n.id] && n.data?.config) {
      n.data.config.expression = EXPRESSIONS[n.id];
      fix5++;
    }
    return n;
  });

  // Edge labels
  edges = edges.map(e => {
    const labelMap = EDGE_LABELS[e.source];
    if (labelMap && labelMap[e.target]) {
      e.label = labelMap[e.target];
      if (!e.data) e.data = {};
      e.data.label = labelMap[e.target];
      fix4++;
    }
    return e;
  });

  console.log(`Fixes: tools=${fix1}, waitForInput=${fix2}, auto_advance=${fix3}, edgeLabels=${fix4}, expressions=${fix5}`);

  // Save as v2
  const newVer = ver + 1;
  await session.run(
    `MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition)
     SET g.nodes = $nodes, g.edges = $edges
     WITH g
     CREATE (v:GraphVersion {
       versionNumber: $v, createdAt: $now, createdBy: 'fix-script',
       changeLog: 'Full Codex compliance: GXE-001(waitForInput), GXE-002(edge labels incl multi-branch), GXE-003(tool bindings), GXE-006(auto_advance), GXE-019(node output refs), GXE-021(cached variants)'
     })
     CREATE (g)-[:HAS_VERSION]->(v)
     WITH g
     MATCH (c2:CatalogEntry {entryId: $gid})
     SET c2.currentVersion = $v, c2.updatedAt = $now`,
    { gid: GID, nodes: JSON.stringify(nodes), edges: JSON.stringify(edges), v: newVer, now: new Date().toISOString() }
  );

  console.log(`Saved as v${newVer}`);
  await session.close();
  await driver.close();
  process.exit(0);
}

fix().catch(e => { console.error(e.message); process.exit(1); });
