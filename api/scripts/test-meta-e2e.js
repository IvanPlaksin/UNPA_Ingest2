#!/usr/bin/env node
/**
 * META-GRAPH E2E Test Runner
 *
 * Comprehensive end-to-end test for the iNeed META-GRAPH (G0) pipeline.
 * Tests all 4 graph definitions, all 34 AOPEG executors, and exercises
 * the RuntimeEngine with linearized happy-path DAGs.
 *
 * Phases:
 *   Phase 1 — Graph structure validation (all 4 graphs)
 *   Phase 2 — Executor registry verification (34 executors)
 *   Phase 3 — Mock-only happy path (no external services)
 *   Phase 4 — Service-dependent path (needs Memgraph)
 *   Phase 5 — Full META-GRAPH structure test (toAOPEGDag conversion)
 *
 * Usage:
 *   node api/scripts/test-meta-e2e.js
 *   node api/scripts/test-meta-e2e.js --phase 3     (run specific phase)
 *   node api/scripts/test-meta-e2e.js --skip-memgraph (skip Phase 4)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.chdir(path.join(__dirname, '..'));

// Force mock LLM mode for tests
process.env.MOCK_LLM = '1';

// ====================================================================
// HELPERS
// ====================================================================

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  \u2705 ${name}${detail ? ' \u2014 ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  \u274c ${name}${detail ? ' \u2014 ' + detail : ''}`);
    failed++;
  }
  return condition;
}

function skip(name, reason = '') {
  console.log(`  \u23ed ${name}${reason ? ' \u2014 ' + reason : ''}`);
  skipped++;
}

function section(title) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(64)}`);
}

function subsection(title) {
  console.log(`\n  --- ${title} ---`);
}

// ====================================================================
// PHASE 1: GRAPH STRUCTURE VALIDATION
// ====================================================================

function phase1_graphStructure(graphLoader) {
  section('Phase 1: Graph Structure Validation');

  const graphs = graphLoader.listGraphs();
  check('4 graphs loaded', graphs.length === 4, `found ${graphs.length}`);

  const expectedGraphs = [
    { id: 'INEED-G0-META-INTAKE-V1', minNodes: 15, minEdges: 15 },
    { id: 'INEED-G1-IT-HARDWARE-V1', minNodes: 20, minEdges: 20 },
    { id: 'INEED-G2-HR-ACCESS-V1', minNodes: 10, minEdges: 10 },
    { id: 'INEED-G3-FACILITIES-WORKSPACE-V1', minNodes: 10, minEdges: 10 },
  ];

  for (const eg of expectedGraphs) {
    subsection(eg.id);
    const graphDef = graphLoader.getGraph(eg.id);
    check(`Graph exists: ${eg.id}`, !!graphDef);
    if (!graphDef) continue;

    const nodeCount = graphDef.nodes.length;
    const edgeCount = graphDef.edges.length;
    check(`Nodes >= ${eg.minNodes}`, nodeCount >= eg.minNodes, `${nodeCount} nodes`);
    check(`Edges >= ${eg.minEdges}`, edgeCount >= eg.minEdges, `${edgeCount} edges`);

    // Check node structure
    const nodeIds = new Set(graphDef.nodes.map(n => n.id));
    const missingTool = graphDef.nodes.filter(n => !n.data?.tool);
    check('All nodes have tool defined', missingTool.length === 0,
      missingTool.length > 0 ? `missing: ${missingTool.map(n => n.id).join(', ')}` : 'OK');

    // Check edge integrity
    const danglingEdges = graphDef.edges.filter(
      e => !nodeIds.has(e.source) || !nodeIds.has(e.target)
    );
    check('No dangling edges', danglingEdges.length === 0,
      danglingEdges.length > 0 ? `dangling: ${danglingEdges.map(e => e.id).join(', ')}` : 'OK');

    // Check start/end nodes
    const startNodes = graphDef.nodes.filter(n => n.type === 'start');
    const endNodes = graphDef.nodes.filter(n => n.type === 'end');
    check('Has start node', startNodes.length >= 1, `${startNodes.length} start node(s)`);
    check('Has end node', endNodes.length >= 1, `${endNodes.length} end node(s)`);

    // Check for wait_input nodes
    const waitNodes = graphDef.nodes.filter(n => n.type === 'wait_input');
    console.log(`    wait_input nodes: ${waitNodes.length > 0 ? waitNodes.map(n => n.id).join(', ') : 'none'}`);

    // Check for condition nodes with labeled edges
    const conditionNodes = graphDef.nodes.filter(n => n.type === 'condition');
    const labeledEdges = graphDef.edges.filter(e => !!e.label);
    console.log(`    condition nodes: ${conditionNodes.length}, labeled edges: ${labeledEdges.length}`);
  }
}

// ====================================================================
// PHASE 2: EXECUTOR REGISTRY VERIFICATION
// ====================================================================

function phase2_executorRegistry(mcpRegistry, pluginRegistry) {
  section('Phase 2: Executor Registry Verification');

  const stats = pluginRegistry.getStats();
  check('34+ executors registered', stats.executorCount >= 34, `${stats.executorCount} executors`);
  check('7+ plugins loaded', stats.pluginCount >= 7, `${stats.pluginCount} plugins`);

  // Check all executor types needed by META-GRAPH (G0)
  subsection('META-GRAPH (G0) executor types');
  const g0Tools = [
    'workflow.start', 'workflow.end', 'workflow.condition',
    'graph.query_profile', 'ai.generate', 'vector.search',
    'workflow.validate', 'workflow.spawn_graph', 'notification.send',
    'workflow.wait_input',
  ];
  for (const tool of g0Tools) {
    const t = mcpRegistry.getTool(tool);
    check(`Tool: ${tool}`, !!t);
  }

  // Check G1 executor types
  subsection('Business graph (G1/G2/G3) executor types');
  const bizTools = [
    'workflow.set_variable', 'graph.create_node', 'graph.query',
  ];
  for (const tool of bizTools) {
    const t = mcpRegistry.getTool(tool);
    check(`Tool: ${tool}`, !!t);
  }

  // List all domains
  const domains = stats.domains || [];
  console.log(`\n  Domains: ${domains.join(', ')}`);
}

// ====================================================================
// PHASE 3: MOCK-ONLY HAPPY PATH
// ====================================================================

async function phase3_mockHappyPath(mcpRegistry) {
  section('Phase 3: Mock-Only Happy Path (no external services)');

  const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');

  // Linearized G0 happy path with mock data:
  //   START → AI_GENERATE (mock) → CONDITION → NOTIFY → END
  //
  // This tests the engine flow without needing Memgraph, Qdrant, or LLM.
  const MOCK_DAG = {
    id: 'META-E2E-MOCK-PATH',
    nodes: [
      {
        id: 'M01_START',
        executorType: 'workflow.start',
        parameters: {
          inputs: [
            { name: 'user_id', type: 'string', required: true },
            { name: 'raw_text', type: 'string', required: true },
          ],
        },
        ports: { input: ['default'], output: ['default'] },
      },
      {
        id: 'M02_AI_EXTRACT',
        executorType: 'ai.generate',
        parameters: {
          system_prompt: 'Extract intent from user request. Return JSON.',
          user_prompt: 'I need a new laptop for data analysis.',
          mock_response: {
            intent: 'hardware_request',
            category: 'IT',
            subcategory: 'laptop',
            urgency: 'medium',
            impact: 'individual',
            confidence: 0.92,
            missing_params: [],
          },
        },
        ports: { input: ['default'], output: ['default'] },
      },
      {
        id: 'M03_CONDITION',
        executorType: 'workflow.condition',
        parameters: {
          expression: 'true',  // always true for happy path
        },
        ports: { input: ['default'], output: ['default'] },
      },
      {
        id: 'M04_SET_CATEGORY',
        executorType: 'workflow.set_variable',
        parameters: {
          name: 'category',
          value: 'IT',
        },
        ports: { input: ['default'], output: ['default'] },
      },
      {
        id: 'M05_NOTIFY',
        executorType: 'notification.send',
        parameters: {
          recipients: ['TS-001'],
          subject: 'E2E Test: Request Accepted',
          body: 'Your IT hardware request has been received.',
          channel: 'ineed_activity',
          priority: 'normal',
        },
        ports: { input: ['default'], output: ['default'] },
      },
      {
        id: 'M06_END',
        executorType: 'workflow.end',
        parameters: {
          outputs: ['category', 'intent'],
        },
        ports: { input: ['default'], output: ['default'] },
      },
    ],
    edges: [
      { id: 'ME1', sourceNodeId: 'M01_START', targetNodeId: 'M02_AI_EXTRACT' },
      { id: 'ME2', sourceNodeId: 'M02_AI_EXTRACT', targetNodeId: 'M03_CONDITION' },
      { id: 'ME3', sourceNodeId: 'M03_CONDITION', targetNodeId: 'M04_SET_CATEGORY' },
      { id: 'ME4', sourceNodeId: 'M04_SET_CATEGORY', targetNodeId: 'M05_NOTIFY' },
      { id: 'ME5', sourceNodeId: 'M05_NOTIFY', targetNodeId: 'M06_END' },
    ],
    entryNodeId: 'M01_START',
    exitNodeIds: ['M06_END'],
  };

  const engine = new RuntimeEngine(mcpRegistry, {
    enableValidation: false,
    nodeTimeoutMs: 10000,
    graphTimeoutMs: 30000,
  });

  const events = { completed: [], failed: [] };
  engine.on('node:completed', (ev) => {
    events.completed.push(ev.nodeId);
    console.log(`    [completed] ${ev.nodeId}`);
  });
  engine.on('node:failed', (ev) => {
    events.failed.push({ nodeId: ev.nodeId, error: ev.error });
    console.log(`    [failed] ${ev.nodeId}: ${JSON.stringify(ev.error).substring(0, 120)}`);
  });

  console.log('  Executing mock happy-path DAG (6 nodes)...\n');
  const result = await engine.execute(MOCK_DAG, { user_id: 'TS-001', raw_text: 'test' }, {});

  const allNodes = MOCK_DAG.nodes.map(n => n.id);
  const allCompleted = allNodes.filter(n => events.completed.includes(n));

  check('Execution completed', result.status === 'COMPLETED' || result.status === 'PARTIAL_FAILURE',
    `status: ${result.status}`);
  check(`All 6 nodes completed (${allCompleted.length}/6)`,
    allCompleted.length === allNodes.length,
    allCompleted.join(', '));
  check('No failures', events.failed.length === 0,
    events.failed.length > 0 ? events.failed.map(f => `${f.nodeId}: ${JSON.stringify(f.error).substring(0, 60)}`).join('; ') : 'clean');

  // Check metrics
  if (result.metrics) {
    check('Duration under 10s', (result.metrics.totalDurationMs || 0) < 10000,
      `${result.metrics.totalDurationMs}ms`);
  }

  return result;
}

// ====================================================================
// PHASE 4: SERVICE-DEPENDENT PATH (Memgraph)
// ====================================================================

async function phase4_serviceDependent(mcpRegistry) {
  section('Phase 4: Service-Dependent Path (Memgraph)');

  // Quick Memgraph connectivity check
  let memgraphAvailable = false;
  try {
    const memgraph = require('../src/services/memgraph.service');
    const result = await memgraph.executeQuery('RETURN 1 AS ok');
    memgraphAvailable = result.records && result.records.length > 0;
  } catch {
    memgraphAvailable = false;
  }

  if (!memgraphAvailable) {
    skip('Memgraph not available', 'skipping service-dependent tests');
    skip('graph.query_profile test');
    skip('workflow.validate test');
    skip('Full service path DAG');
    return null;
  }

  console.log('  Memgraph available, running service tests...\n');

  const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');

  // Service-dependent DAG: QUERY_PROFILE → VALIDATE → NOTIFY → WAIT → END
  const SERVICE_DAG = {
    id: 'META-E2E-SERVICE-PATH',
    nodes: [
      {
        id: 'S01_START',
        executorType: 'workflow.start',
        parameters: { inputs: [{ name: 'user_id', type: 'string', required: true }] },
        ports: { input: ['default'], output: ['default'] },
      },
      {
        id: 'S02_PROFILE',
        executorType: 'graph.query_profile',
        parameters: {
          user_id: 'TS-004',
          include_manager: true,
          include_history: false,
        },
        ports: { input: ['default'], output: ['default'] },
      },
      {
        id: 'S03_VALIDATE',
        executorType: 'workflow.validate',
        parameters: {
          user_id: 'TS-004',
          action: 'submit_sr',
          resource: { category: 'IT', cost: 800, duty_station: 'New York' },
        },
        ports: { input: ['default'], output: ['default'] },
      },
      {
        id: 'S04_NOTIFY',
        executorType: 'notification.send',
        parameters: {
          recipients: ['TS-004'],
          subject: 'E2E Service Path Test',
          body: 'Request validated and processing.',
          channel: 'ineed_activity',
          priority: 'normal',
        },
        ports: { input: ['default'], output: ['default'] },
      },
      {
        id: 'S05_WAIT',
        executorType: 'workflow.wait_input',
        parameters: {
          expected_inputs: ['confirmed'],
          recipients: ['TS-004'],
          timeout_hours: 1,
          timeout_action: 'auto_approve',
          prompt: 'Please confirm.',
        },
        ports: { input: ['default'], output: ['default'] },
      },
      {
        id: 'S06_END',
        executorType: 'workflow.end',
        parameters: { outputs: ['status'] },
        ports: { input: ['default'], output: ['default'] },
      },
    ],
    edges: [
      { id: 'SE1', sourceNodeId: 'S01_START', targetNodeId: 'S02_PROFILE' },
      { id: 'SE2', sourceNodeId: 'S02_PROFILE', targetNodeId: 'S03_VALIDATE' },
      { id: 'SE3', sourceNodeId: 'S03_VALIDATE', targetNodeId: 'S04_NOTIFY' },
      { id: 'SE4', sourceNodeId: 'S04_NOTIFY', targetNodeId: 'S05_WAIT' },
      { id: 'SE5', sourceNodeId: 'S05_WAIT', targetNodeId: 'S06_END' },
    ],
    entryNodeId: 'S01_START',
    exitNodeIds: ['S06_END'],
  };

  const engine = new RuntimeEngine(mcpRegistry, {
    enableValidation: false,
    nodeTimeoutMs: 15000,
    graphTimeoutMs: 60000,
  });

  const events = { completed: [], failed: [], waiting: null };
  engine.on('node:completed', (ev) => {
    events.completed.push(ev.nodeId);
    console.log(`    [completed] ${ev.nodeId}`);
  });
  engine.on('node:failed', (ev) => {
    events.failed.push({ nodeId: ev.nodeId, error: ev.error });
    console.log(`    [failed] ${ev.nodeId}: ${JSON.stringify(ev.error).substring(0, 120)}`);
  });
  engine.on('execution:waiting', (ev) => {
    events.waiting = ev;
    console.log(`    [WAITING] at ${ev.nodeId}`);
  });

  console.log('  Executing service DAG (6 nodes)...\n');
  const result = await engine.execute(SERVICE_DAG, { user_id: 'TS-004' }, {});

  // Should pause at WAIT
  const preWaitNodes = ['S01_START', 'S02_PROFILE', 'S03_VALIDATE', 'S04_NOTIFY'];
  const preWaitCompleted = preWaitNodes.filter(n => events.completed.includes(n));
  const paused = result.status === 'WAITING_FOR_INPUT' || result.status === 'WAITING';

  check('Execution paused at WAIT', paused, `status: ${result.status}`);
  check(`Pre-wait nodes (${preWaitCompleted.length}/${preWaitNodes.length})`,
    preWaitCompleted.length === preWaitNodes.length,
    preWaitCompleted.join(', '));

  const preWaitFails = events.failed.filter(f => preWaitNodes.includes(f.nodeId));
  check('No pre-wait failures', preWaitFails.length === 0,
    preWaitFails.length > 0
      ? preWaitFails.map(f => `${f.nodeId}: ${JSON.stringify(f.error).substring(0, 60)}`).join('; ')
      : 'clean');

  // Resume
  if (paused) {
    subsection('Resume with confirmation');
    try {
      let resumeResult = await engine.resumeExecution(result.executionId, {
        nodeId: 'S05_WAIT',
        output: { confirmed: true },
      });
      if (resumeResult.status === 'RUNNING') {
        await new Promise(r => setTimeout(r, 2000));
      }
      const resumed = ['COMPLETED', 'SUCCESS', 'RUNNING'].includes(resumeResult.status);
      check('Resume succeeded', resumed, `status: ${resumeResult.status}`);
    } catch (err) {
      check('Resume succeeded', false, err.message);
    }

    const allCompleted = SERVICE_DAG.nodes.map(n => n.id).filter(n => events.completed.includes(n));
    check(`All 6 nodes completed (${allCompleted.length}/6)`,
      allCompleted.length === SERVICE_DAG.nodes.length,
      allCompleted.join(', '));
  }

  return result;
}

// ====================================================================
// PHASE 5: FULL META-GRAPH STRUCTURE TEST
// ====================================================================

function phase5_metaGraphConversion(graphLoader) {
  section('Phase 5: META-GRAPH DAG Conversion');

  const metaGraphDef = graphLoader.getGraph('INEED-G0-META-INTAKE-V1');
  check('META-GRAPH loaded', !!metaGraphDef);
  if (!metaGraphDef) return;

  // Convert to AOPEG DAG format (same as test-ineed-e2e.js)
  const startNode = metaGraphDef.nodes.find(n => n.type === 'start');
  const endNodes = metaGraphDef.nodes.filter(n => n.type === 'end');

  const aopegDag = {
    id: metaGraphDef.graph_id,
    nodes: metaGraphDef.nodes.map(n => ({
      id: n.id,
      executorType: n.data.tool,
      parameters: n.data.config || {},
      metadata: { label: n.data.label, type: n.type },
    })),
    edges: metaGraphDef.edges.map(e => ({
      id: e.id,
      sourceNodeId: e.source,
      targetNodeId: e.target,
      label: e.label || undefined,
    })),
    entryNodeId: startNode?.id,
    exitNodeIds: endNodes.map(n => n.id),
  };

  check('DAG has entryNodeId', !!aopegDag.entryNodeId, aopegDag.entryNodeId);
  check('DAG has exitNodeIds', aopegDag.exitNodeIds.length > 0, aopegDag.exitNodeIds.join(', '));
  check('16 nodes in DAG', aopegDag.nodes.length === 16, `${aopegDag.nodes.length}`);
  check('17 edges in DAG', aopegDag.edges.length === 17, `${aopegDag.edges.length}`);

  // Verify all executor types in DAG are registered
  subsection('Executor type coverage');
  const toolsUsed = new Set(aopegDag.nodes.map(n => n.executorType));
  console.log(`  Tools used by G0: ${[...toolsUsed].join(', ')}`);
  // (Registry check already done in Phase 2, just report here)

  // Verify condition nodes have labeled outgoing edges
  subsection('Condition branching analysis');
  const conditionNodeIds = metaGraphDef.nodes
    .filter(n => n.type === 'condition')
    .map(n => n.id);

  for (const condId of conditionNodeIds) {
    const outEdges = metaGraphDef.edges.filter(e => e.source === condId);
    const labels = outEdges.map(e => e.label || '(none)');
    check(`${condId} has labeled branches`, outEdges.length >= 2 && outEdges.every(e => !!e.label),
      `${outEdges.length} edges: ${labels.join(', ')}`);
  }

  // Check wait_input nodes
  subsection('Wait-input node analysis');
  const waitNodes = metaGraphDef.nodes.filter(n => n.type === 'wait_input');
  for (const wn of waitNodes) {
    const config = wn.data.config || {};
    check(`${wn.id} has expected_inputs`, !!config.expected_inputs,
      JSON.stringify(config.expected_inputs || []).substring(0, 80));
    check(`${wn.id} has timeout`, !!config.timeout_hours, `${config.timeout_hours}h`);
  }

  // Verify all 4 business graphs can be converted
  subsection('Business graph DAG conversion');
  const bizGraphIds = [
    'INEED-G1-IT-HARDWARE-V1',
    'INEED-G2-HR-ACCESS-V1',
    'INEED-G3-FACILITIES-WORKSPACE-V1',
  ];
  for (const gid of bizGraphIds) {
    const gDef = graphLoader.getGraph(gid);
    if (!gDef) { check(`${gid} convertible`, false, 'not found'); continue; }
    const gStart = gDef.nodes.find(n => n.type === 'start');
    const gEnds = gDef.nodes.filter(n => n.type === 'end');
    check(`${gid} convertible`, !!gStart && gEnds.length > 0,
      `start=${gStart?.id}, ends=${gEnds.map(n => n.id).join(',')}`);
  }

  // Summary: what's needed for full META-GRAPH execution
  subsection('Blockers for full META-GRAPH execution');
  console.log('  1. Conditional branching in TopologicalScheduler (labeled edges)');
  console.log('  2. Template expansion in node parameters ({{input.user_id}})');
  console.log('  3. Cross-node output references (G0_N03.confidence)');
  console.log('  These are tracked for Priority 8 implementation.');
}

// ====================================================================
// MAIN
// ====================================================================

async function main() {
  console.log('\u2554' + '\u2550'.repeat(62) + '\u2557');
  console.log('\u2551  META-GRAPH E2E Test Runner                                    \u2551');
  console.log('\u2551  Tests graph definitions, executor registry, and runtime paths  \u2551');
  console.log('\u255a' + '\u2550'.repeat(62) + '\u255d');

  const args = process.argv.slice(2);
  const specificPhase = args.find(a => a.startsWith('--phase'))
    ? parseInt(args[args.indexOf('--phase') + 1], 10)
    : null;
  const skipMemgraph = args.includes('--skip-memgraph');

  // ──────────────────────────────────────────────────────────
  // Setup
  // ──────────────────────────────────────────────────────────
  section('Setup: Initialize AOPEG & Load Graphs');

  const { initializeAOPEG, pluginRegistry } = require('../src/core/aopeg/index');
  const { AOPEGAdapter } = require('../src/runtime/integration');
  const { GraphLoaderService } = require('../src/services/graph-definitions/graph-loader.service');

  await initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });
  const adapter = new AOPEGAdapter(pluginRegistry);
  const mcpRegistry = adapter.createMcpCompatibleRegistry();

  const stats = pluginRegistry.getStats();
  check('AOPEG initialized', stats.executorCount >= 27, `${stats.executorCount} executors, ${stats.pluginCount} plugins`);

  const graphLoader = new GraphLoaderService(null, null);
  check('GraphLoaderService created', graphLoader.listGraphs().length >= 4,
    `${graphLoader.listGraphs().length} graphs`);

  // ──────────────────────────────────────────────────────────
  // Run phases
  // ──────────────────────────────────────────────────────────
  if (!specificPhase || specificPhase === 1) {
    phase1_graphStructure(graphLoader);
  }

  if (!specificPhase || specificPhase === 2) {
    phase2_executorRegistry(mcpRegistry, pluginRegistry);
  }

  if (!specificPhase || specificPhase === 3) {
    await phase3_mockHappyPath(mcpRegistry);
  }

  if (!specificPhase || specificPhase === 4) {
    if (skipMemgraph) {
      section('Phase 4: SKIPPED (--skip-memgraph)');
      skip('Service-dependent path skipped by flag');
    } else {
      await phase4_serviceDependent(mcpRegistry);
    }
  }

  if (!specificPhase || specificPhase === 5) {
    phase5_metaGraphConversion(graphLoader);
  }

  // ──────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────
  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary() {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  META-GRAPH E2E RESULTS`);
  console.log(`  \u2705 ${passed} passed  \u274c ${failed} failed  \u23ed ${skipped} skipped`);
  if (failed === 0) {
    console.log('  All tests passed!');
  } else {
    console.log(`  ${failed} test(s) need attention.`);
  }
  console.log(`${'='.repeat(64)}\n`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  process.exit(2);
});
