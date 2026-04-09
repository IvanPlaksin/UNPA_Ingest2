/**
 * Diagnose graph compliance against Codex GXE rules
 */
'use strict';

const graphId = process.argv[2] || '96092967-0088-477d-9fcb-f7d6965b8863';

async function diagnose() {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph', 'secret_password_123'), { disableLosslessIntegers: true });
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });

  const r = await session.run(
    `MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
     WHERE c.entryId = $gid OR c.id = $gid
     RETURN g.nodes AS nodes, g.edges AS edges, v.versionNumber AS version, c.name AS name
     ORDER BY v.versionNumber DESC LIMIT 1`,
    { gid: graphId }
  );

  if (!r.records.length) { console.log('Graph not found:', graphId); process.exit(1); }

  const nodes = JSON.parse(r.records[0].get('nodes'));
  const edges = JSON.parse(r.records[0].get('edges'));
  const version = r.records[0].get('version');
  const name = r.records[0].get('name');

  console.log(`Graph: ${name}`);
  console.log(`ID: ${graphId} | Version: ${version} | Nodes: ${nodes.length} | Edges: ${edges.length}\n`);

  const violations = [];
  const dialogKw = ['ask', 'confirm', 'search', 'input', 'select', 'choose'];

  // GXE-001: WAIT_FOR_INPUT (excludes send/notification/create nodes per GXE-007)
  const silentKw = ['send', 'notification', 'create', 'assign', 'route', 'escalation', 'spawn'];
  nodes.forEach(n => {
    const d = n.data || {};
    const label = (d.label || '').toLowerCase();
    const kind = d.kind || d.type || '';
    const tool = (d.tool || d.executorId || '').toLowerCase();
    const hasWait = d.waitForInput || (d.config && d.config.waitForInput) || false;
    const isSilent = silentKw.some(kw => label.startsWith(kw)) || tool.includes('send') || tool.includes('create') || tool.includes('assign') || (d.config && d.config.auto_advance);
    if (kind === 'executor' && dialogKw.some(kw => label.includes(kw)) && !hasWait && !isSilent) {
      violations.push({ rule: 'GXE-001', sev: 'CRITICAL', node: n.id, label: d.label, msg: 'Missing waitForInput:true on dialog node' });
    }
  });
  const startN = nodes.find(n => (n.data && (n.data.kind === 'input' || n.data.type === 'input')));
  if (startN && !(startN.data.waitForInput || (startN.data.config && startN.data.config.waitForInput))) {
    violations.push({ rule: 'GXE-001', sev: 'CRITICAL', node: startN.id, label: startN.data.label, msg: 'Start node missing waitForInput for initial user message' });
  }

  // GXE-002: Condition edges must have labels (true/false for 2-branch, named for multi-branch per GXE-022)
  const condNodes = nodes.filter(n => n.data && (n.data.kind === 'condition' || n.data.type === 'condition'));
  condNodes.forEach(cn => {
    const outE = edges.filter(e => e.source === cn.id);
    const labels = outE.map(e => e.label || (e.data && e.data.label) || 'NONE');
    if (outE.length < 2) {
      violations.push({ rule: 'GXE-002', sev: 'HIGH', node: cn.id, label: cn.data.label, msg: `Condition must have at least 2 outgoing edges, has ${outE.length}` });
    }
    const hasAnyLabels = labels.every(l => l !== 'NONE');
    if (!hasAnyLabels) {
      violations.push({ rule: 'GXE-002', sev: 'CRITICAL', node: cn.id, label: cn.data.label, msg: `Missing labels on edges. Found: [${labels.join(', ')}]` });
    }
  });

  // GXE-003: Tool binding
  nodes.filter(n => n.data && (n.data.kind === 'executor' || n.data.type === 'executor')).forEach(n => {
    if (!n.data.tool && !n.data.executorId) {
      violations.push({ rule: 'GXE-003', sev: 'HIGH', node: n.id, label: n.data.label, msg: 'No tool/executorId binding' });
    }
  });

  // GXE-004: Condition expression
  condNodes.forEach(cn => {
    const expr = cn.data.config && cn.data.config.expression;
    if (!expr || expr.trim() === '') {
      violations.push({ rule: 'GXE-004', sev: 'HIGH', node: cn.id, label: cn.data.label, msg: 'Missing condition expression' });
    }
  });

  // GXE-005: One start, at least one end
  const starts = nodes.filter(n => n.data && (n.data.kind === 'input' || n.data.tool === 'workflow.start'));
  const ends = nodes.filter(n => n.data && (n.data.kind === 'output' || n.data.tool === 'workflow.end'));
  if (starts.length !== 1) violations.push({ rule: 'GXE-005', sev: 'CRITICAL', node: '-', label: '-', msg: `Expected 1 start, found ${starts.length}` });
  if (ends.length === 0) violations.push({ rule: 'GXE-005', sev: 'CRITICAL', node: '-', label: '-', msg: 'No end/output nodes' });

  // GXE-006: Re-execution pattern
  const execNodes = nodes.filter(n => n.data && (n.data.kind === 'executor' || n.data.type === 'executor'));
  const withoutPass = execNodes.filter(n => {
    const c = n.data.config || {};
    return !c.auto_advance && !c.passThrough && !n.data.silent;
  });
  if (withoutPass.length > execNodes.length * 0.5) {
    violations.push({ rule: 'GXE-006', sev: 'MEDIUM', node: '-', label: '-', msg: `${withoutPass.length}/${execNodes.length} executors lack pass-through config` });
  }

  // Structure: unreachable
  const reachable = new Set();
  function dfs(id) { if (reachable.has(id)) return; reachable.add(id); edges.filter(e => e.source === id).forEach(e => dfs(e.target)); }
  if (starts.length > 0) dfs(starts[0].id);
  nodes.forEach(n => {
    if (!reachable.has(n.id)) violations.push({ rule: 'STRUCTURE', sev: 'MEDIUM', node: n.id, label: (n.data||{}).label, msg: 'Unreachable from start' });
  });

  // Report
  console.log('=== COMPLIANCE REPORT ===\n');
  const allRules = ['GXE-001', 'GXE-002', 'GXE-003', 'GXE-004', 'GXE-005', 'GXE-006', 'STRUCTURE'];
  let passed = 0;
  allRules.forEach(rule => {
    const rv = violations.filter(v => v.rule === rule);
    if (rv.length === 0) { console.log(`  PASS  ${rule}`); passed++; }
    else {
      console.log(`  FAIL  ${rule} (${rv.length} violations)`);
      rv.forEach(v => console.log(`        ${v.sev} | ${v.node} | ${v.label} | ${v.msg}`));
    }
  });

  const crit = violations.filter(v => v.sev === 'CRITICAL').length;
  const high = violations.filter(v => v.sev === 'HIGH').length;
  const med = violations.filter(v => v.sev === 'MEDIUM').length;

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total violations: ${violations.length} (CRITICAL: ${crit}, HIGH: ${high}, MEDIUM: ${med})`);
  console.log(`Rules passed: ${passed}/${allRules.length}`);
  console.log(`Compliance: ${Math.round(passed / allRules.length * 100)}%`);

  await session.close();
  await driver.close();
  process.exit(0);
}

diagnose().catch(e => { console.error(e.message); process.exit(1); });
