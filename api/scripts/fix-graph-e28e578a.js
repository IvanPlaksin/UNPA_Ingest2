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

  // Tool bindings
  const TOOLS = {
    'N01': 'workflow.start',
    'N02': 'flowdesk.check_location',     // Load User Profile → check location as proxy
    'N03': 'workflow.condition',
    'N04': 'flowdesk.spawn_process',       // Escalate Profile Failure
    'N05': 'workflow.end',
    'N06': 'flowdesk.classify_intent',     // Intent Classification L1/L2
    'N07': 'workflow.condition',            // Classification Confidence
    'N08': 'flowdesk.confirm_request',     // Confirm Medium Confidence
    'N09': 'flowdesk.confirm_request',     // Re-describe Request
    'N10': 'flowdesk.spawn_process',       // Escalate Classification
    'N11': 'workflow.end',
    'N12': 'flowdesk.check_location',      // Silent Location Check
    'N13': 'flowdesk.ask_beneficiary',     // For-Whom Determination
    'N14': 'workflow.condition',            // For-Whom Route
    'N15': 'flowdesk.search_location',     // Search Different Location
    'N16': 'flowdesk.find_user',           // Find Beneficiary
    'N17': 'workflow.condition',            // Location Found Check
    'N18': 'workflow.condition',            // Staff Member Found Check
    'N19': 'flowdesk.spawn_process',       // Escalate Location
    'N20': 'flowdesk.spawn_process',       // Escalate Beneficiary
    'N21': 'workflow.end',
    'N22': 'workflow.end',
    'N23': 'ai.generate',                  // Service Configuration
    'N24': 'flowdesk.confirm_request',     // Request Confirmation
    'N25': 'workflow.condition',            // Confirmation Choice
    'N26': 'workflow.end',
    'N27': 'flowdesk.assign_handler',      // Route to Handler
    'N28': 'flowdesk.create_service_request', // Create SR
    'N29': 'workflow.condition',            // Approval Required
    'N30': 'flowdesk.request_approval',    // Request Supervisor Approval
    'N31': 'flowdesk.create_work_order',   // Create Work Order
    'N32': 'flowdesk.send_notification',   // Notify Requester
    'N33': 'workflow.end',
  };

  // waitForInput nodes
  const WAIT_NODES = ['N01', 'N08', 'N09', 'N13', 'N15', 'N24'];

  // Silent auto-advance nodes
  const SILENT_NODES = ['N02', 'N04', 'N06', 'N10', 'N12', 'N16', 'N19', 'N20', 'N23', 'N27', 'N28', 'N30', 'N31', 'N32'];

  // N24 confirmField (separate from other confirms)
  const CONFIRM_FIELDS = { 'N24': 'requestConfirmed' };

  // Field mappings for downstream executors
  const FIELD_MAPPINGS = {
    'N27': { serviceCode: '{{service_code}}', requestId: '{{requestId}}' },
    'N28': { serviceCode: '{{service_code}}' },
    'N30': { serviceCode: '{{service_code}}', requestId: '{{requestId}}' },
    'N31': { serviceCode: '{{service_code}}', requestId: '{{requestId}}' },
    'N32': { serviceCode: '{{service_code}}', requestId: '{{requestId}}', handler: '{{handler.name}}' },
  };

  // N23 (ai.generate) needs system_prompt/user_prompt
  const AI_PROMPTS = {
    'N23': { system_prompt: 'You are a UN FlowDesk service configuration assistant.', user_prompt: 'Configure service options for the user request.' },
  };

  // Condition expressions fix (use NodeID.field format)
  const EXPRESSIONS = {
    'N03': "N02.has_location !== undefined || N02.location != null",
    'N07': "(N06.confidence === 'high' || N06.score >= 0.85 || N06.branch === 'high_confidence' || (N06.service_code != null && N06.service_code !== '')) ? 'high' : (N06.confidence === 'medium' || N06.score >= 0.70) ? 'medium' : (N06.confidence === 'low' || N06.score >= 0.40) ? 'low' : 'unclassified'",
  };

  let fixes = { tools: 0, wait: 0, silent: 0, confirm: 0, fields: 0, ai: 0, expr: 0 };

  nodes = nodes.map(n => {
    // Tool binding
    if (TOOLS[n.id] && (!n.data?.tool || n.data.tool === '-')) {
      n.data = n.data || {};
      n.data.tool = TOOLS[n.id];
      n.data.executorId = TOOLS[n.id];
      fixes.tools++;
    }
    // waitForInput
    if (WAIT_NODES.includes(n.id)) {
      n.data = n.data || {};
      n.data.waitForInput = true;
      n.data.config = n.data.config || {};
      n.data.config.waitForInput = true;
      fixes.wait++;
    }
    // auto_advance
    if (SILENT_NODES.includes(n.id)) {
      n.data = n.data || {};
      n.data.config = n.data.config || {};
      n.data.config.auto_advance = true;
      fixes.silent++;
    }
    // confirmField
    if (CONFIRM_FIELDS[n.id]) {
      n.data = n.data || {};
      n.data.config = n.data.config || {};
      n.data.config.confirmField = CONFIRM_FIELDS[n.id];
      fixes.confirm++;
    }
    // Field mappings
    if (FIELD_MAPPINGS[n.id]) {
      n.data = n.data || {};
      n.data.config = { ...(n.data.config || {}), ...FIELD_MAPPINGS[n.id] };
      fixes.fields++;
    }
    // AI prompts
    if (AI_PROMPTS[n.id]) {
      n.data = n.data || {};
      n.data.config = { ...(n.data.config || {}), ...AI_PROMPTS[n.id] };
      fixes.ai++;
    }
    // Expressions
    if (EXPRESSIONS[n.id] && n.data?.config) {
      n.data.config.expression = EXPRESSIONS[n.id];
      fixes.expr++;
    }
    return n;
  });

  console.log('Fixes:', JSON.stringify(fixes));

  const newVer = ver + 1;
  await s.run(
    'MATCH (c:CatalogEntry {entryId: $gid})-[:DEFINES]->(g:GraphDefinition) SET g.nodes = $n WITH g CREATE (v:GraphVersion {versionNumber: $v, createdAt: $now, createdBy: "fix-script", changeLog: "Full Codex compliance: tool bindings, waitForInput, auto_advance, confirmField, field mappings, expressions"}) CREATE (g)-[:HAS_VERSION]->(v) WITH g MATCH (c2:CatalogEntry {entryId: $gid}) SET c2.currentVersion = $v, c2.updatedAt = $now',
    { gid: GID, n: JSON.stringify(nodes), v: newVer, now: new Date().toISOString() }
  );
  console.log('Saved as v' + newVer);
  await s.close(); await d.close(); process.exit(0);
}
fix().catch(e => { console.error(e.message); process.exit(1); });
