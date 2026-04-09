#!/usr/bin/env node
/**
 * Integration Check Script
 *
 * Sequential verification of all iNeed components:
 *   1. Service connectivity (Memgraph, Redis, Qdrant)
 *   2. Test data presence (profiles, graphs)
 *   3. AOPEG runtime initialization (plugins, tools)
 *   4. Graph loading via GraphLoaderService
 *   5. Minimal execution test (SET_VARIABLE → END)
 *   6. wait_input test (WAIT_INPUT → verify paused → resume)
 *
 * Usage:
 *   node api/scripts/integration-check.js
 *   node api/scripts/integration-check.js --fix    (attempt auto-fix)
 *   node api/scripts/integration-check.js --skip-exec (skip steps 5-6)
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));

// ====================================================================
// UTILITIES
// ====================================================================

const PASS = '\u2705';
const FAIL = '\u274C';
const WARN = '\u26A0\uFE0F';
const SKIP = '\u23ED\uFE0F';

let totalPass = 0;
let totalFail = 0;
let totalWarn = 0;
const issues = [];

function check(label, ok, detail = '') {
  if (ok) {
    totalPass++;
    console.log(`  ${PASS} ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    totalFail++;
    issues.push(label);
    console.log(`  ${FAIL} ${label}${detail ? ' — ' + detail : ''}`);
  }
  return ok;
}

function warn(label, detail = '') {
  totalWarn++;
  console.log(`  ${WARN} ${label}${detail ? ' — ' + detail : ''}`);
}

function skip(label, detail = '') {
  console.log(`  ${SKIP} ${label}${detail ? ' — ' + detail : ''}`);
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

// ====================================================================
// STEP 1: SERVICE CONNECTIVITY
// ====================================================================

async function checkMemgraph() {
  section('1. Service Connectivity');

  // --- Memgraph ---
  try {
    const MemgraphService = require('../src/services/memgraph.service');
    const memgraph = typeof MemgraphService === 'function'
      ? new MemgraphService()
      : (MemgraphService.default || MemgraphService);

    // Handle singleton pattern
    const svc = memgraph.executeQuery ? memgraph : new (memgraph.constructor || MemgraphService)();

    await svc.verifyConnectivity();
    check('Memgraph connectivity', true);

    // Quick query test
    const result = await svc.executeQuery('RETURN 1 AS n', {});
    const val = result.records?.[0]?.get?.('n') ?? result.records?.[0]?._fields?.[0];
    check('Memgraph query works', val === 1 || val === '1', `returned: ${val}`);

    return svc;
  } catch (err) {
    check('Memgraph connectivity', false, err.message);
    return null;
  }
}

async function checkRedis() {
  try {
    const redis = require('../src/services/redis.service');
    // Redis auto-initializes on require, give it a moment
    await new Promise(r => setTimeout(r, 1000));

    const testKey = '__integration_check_' + Date.now();
    const setOk = await redis.set(testKey, { ok: true }, 10);
    if (setOk) {
      const val = await redis.get(testKey);
      await redis.del(testKey);
      check('Redis connectivity', val?.ok === true);
    } else {
      check('Redis connectivity', false, 'set returned false');
    }
    return redis;
  } catch (err) {
    check('Redis connectivity', false, err.message);
    return null;
  }
}

async function checkQdrant() {
  try {
    const QdrantService = require('../src/services/qdrant.service');
    const qdrant = typeof QdrantService === 'function'
      ? new QdrantService()
      : (QdrantService.default || QdrantService);

    const svc = qdrant.client ? qdrant : new (qdrant.constructor || QdrantService)();

    const collections = await svc.client.getCollections();
    check('Qdrant connectivity', true, `${collections.collections.length} collections`);
    return svc;
  } catch (err) {
    check('Qdrant connectivity', false, err.message);
    return null;
  }
}

// ====================================================================
// STEP 2: TEST DATA PRESENCE
// ====================================================================

async function checkTestData(memgraph) {
  section('2. Test Data Presence');

  if (!memgraph) {
    skip('Test data checks', 'Memgraph not available');
    return;
  }

  // UNStaffProfile
  try {
    const r = await memgraph.executeQuery(
      'MATCH (p:UNStaffProfile) RETURN count(p) AS cnt', {}, null, { timeout: 5000 }
    );
    const cnt = r.records?.[0]?.get?.('cnt') ?? r.records?.[0]?._fields?.[0] ?? 0;
    check('UNStaffProfile count >= 4', Number(cnt) >= 4, `found: ${cnt}`);
  } catch (err) {
    check('UNStaffProfile count', false, err.message);
  }

  // BusinessProcessGraph
  try {
    const r = await memgraph.executeQuery(
      'MATCH (g:BusinessProcessGraph) RETURN count(g) AS cnt', {}, null, { timeout: 5000 }
    );
    const cnt = r.records?.[0]?.get?.('cnt') ?? r.records?.[0]?._fields?.[0] ?? 0;
    check('BusinessProcessGraph count >= 3', Number(cnt) >= 3, `found: ${cnt}`);
  } catch (err) {
    check('BusinessProcessGraph count', false, err.message);
  }

  // Groups (SupportGroup label in seed data)
  try {
    const r = await memgraph.executeQuery(
      'MATCH (g:SupportGroup) RETURN count(g) AS cnt', {}, null, { timeout: 5000 }
    );
    const cnt = r.records?.[0]?.get?.('cnt') ?? r.records?.[0]?._fields?.[0] ?? 0;
    check('SupportGroup count >= 5', Number(cnt) >= 5, `found: ${cnt}`);
  } catch (err) {
    check('SupportGroup count', false, err.message);
  }

  // Equipment inventory (Equipment label in seed data)
  try {
    const r = await memgraph.executeQuery(
      'MATCH (e:Equipment) RETURN count(e) AS cnt', {}, null, { timeout: 5000 }
    );
    const cnt = r.records?.[0]?.get?.('cnt') ?? r.records?.[0]?._fields?.[0] ?? 0;
    check('Equipment count >= 5', Number(cnt) >= 5, `found: ${cnt}`);
  } catch (err) {
    check('Equipment count', false, err.message);
  }

  // Workspace
  try {
    const r = await memgraph.executeQuery(
      'MATCH (w:Workspace) RETURN count(w) AS cnt', {}, null, { timeout: 5000 }
    );
    const cnt = r.records?.[0]?.get?.('cnt') ?? r.records?.[0]?._fields?.[0] ?? 0;
    check('Workspace count >= 5', Number(cnt) >= 5, `found: ${cnt}`);
  } catch (err) {
    check('Workspace count', false, err.message);
  }

  // KG Seed data: CORE and YOUNEED
  try {
    const r = await memgraph.executeQuery(
      'MATCH (c:CoreComponent) RETURN count(c) AS cnt', {}, null, { timeout: 5000 }
    );
    const cnt = r.records?.[0]?.get?.('cnt') ?? r.records?.[0]?._fields?.[0] ?? 0;
    check('CoreComponent (KG seed) >= 15', Number(cnt) >= 15, `found: ${cnt}`);
  } catch (err) {
    check('CoreComponent (KG seed)', false, err.message);
  }

  try {
    const r = await memgraph.executeQuery(
      'MATCH (g:YNBusinessGraph) RETURN count(g) AS cnt', {}, null, { timeout: 5000 }
    );
    const cnt = r.records?.[0]?.get?.('cnt') ?? r.records?.[0]?._fields?.[0] ?? 0;
    check('YNBusinessGraph (KG seed) >= 4', Number(cnt) >= 4, `found: ${cnt}`);
  } catch (err) {
    check('YNBusinessGraph (KG seed)', false, err.message);
  }
}

// ====================================================================
// STEP 3: AOPEG RUNTIME INITIALIZATION
// ====================================================================

async function checkAOPEG() {
  section('3. AOPEG Runtime Initialization');

  try {
    const aopeg = require('../src/core/aopeg/index');
    const { initializeAOPEG, pluginRegistry, isAOPEGInitialized } = aopeg;

    if (!isAOPEGInitialized()) {
      await initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true, loadToolPlugins: false });
    }
    check('AOPEG initialized', isAOPEGInitialized());

    // Check plugin stats
    const stats = pluginRegistry.getStats();
    const execCount = stats.executorCount || stats.executors || 0;
    check('Executors registered >= 5', execCount >= 5, `found: ${execCount}`);

    // Check specific workflow tools
    const workflowTools = [
      'workflow.wait_input',
      'workflow.set_variable',
      'workflow.validate',
      'workflow.spawn_graph',
      'notification.send',
    ];
    for (const tool of workflowTools) {
      const has = pluginRegistry.hasExecutor(tool);
      check(`Tool: ${tool}`, has);
    }

    return { pluginRegistry, aopeg };
  } catch (err) {
    check('AOPEG initialization', false, err.message);
    return null;
  }
}

// ====================================================================
// STEP 4: GRAPH LOADER
// ====================================================================

async function checkGraphLoader(memgraph) {
  section('4. Graph Loader');

  try {
    const { GraphLoaderService } = require('../src/services/graph-definitions/graph-loader.service');

    const loader = new GraphLoaderService(null, memgraph);
    const graphs = loader.listGraphs();
    check('GraphLoaderService instantiated', true);
    check('Graph definitions loaded', graphs.length >= 4, `found: ${graphs.length}`);

    for (const g of graphs) {
      const def = loader.getGraph(g.graphId);
      const hasNodes = def && def.nodes.length > 0;
      const hasEdges = def && def.edges.length > 0;
      check(`${g.graphId} (${g.nodes}n/${g.edges}e)`, hasNodes && hasEdges);
    }

    // Test DAG retrieval
    const dag = loader.getDAG('INEED-G1-IT-HARDWARE-V1');
    check('getDAG returns nodes+edges', !!(dag?.nodes?.length && dag?.edges?.length));

    // Test category search
    const itGraphs = loader.findByCategory('IT');
    check('findByCategory("IT") works', itGraphs.length >= 1, `found: ${itGraphs.length}`);

    return loader;
  } catch (err) {
    check('GraphLoaderService', false, err.message);
    return null;
  }
}

// ====================================================================
// STEP 5: MINIMAL EXECUTION TEST
// ====================================================================

async function checkMinimalExecution(aopegResult) {
  section('5. Minimal Execution Test');

  if (!aopegResult) {
    skip('Minimal execution', 'AOPEG not available');
    return null;
  }

  try {
    const { AOPEGAdapter } = require('../src/runtime/integration/AOPEGAdapter');
    const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');

    const adapter = new AOPEGAdapter(aopegResult.pluginRegistry);
    const mcpRegistry = adapter.createMcpCompatibleRegistry();
    check('AOPEGAdapter created', true);
    check('MCP registry created', !!mcpRegistry?.callTool);

    const tools = mcpRegistry.listTools();
    check('MCP registry has tools', tools.length > 0, `${tools.length} tools`);

    // Minimal DAG: single set_variable node
    const minDag = {
      nodes: [
        {
          id: 'N1',
          executorType: 'workflow.set_variable',
          parameters: {
            name: 'test_result',
            value: 'integration_check_ok'
          },
          ports: { input: ['default'], output: ['default'] }
        }
      ],
      edges: [],
      entryNodeId: 'N1',
      exitNodeIds: ['N1']
    };

    const engine = new RuntimeEngine(mcpRegistry, {
      enableValidation: false,
      nodeTimeoutMs: 10000,
      graphTimeoutMs: 30000,
    });

    // Listen for events
    engine.on('node:completed', (ev) => console.log(`    [event] node:completed ${ev.nodeId}`));
    engine.on('node:failed', (ev) => console.log(`    [event] node:failed ${ev.nodeId}: ${ev.error?.message || ev.error}`));
    engine.on('execution:stateChange', (ev) => console.log(`    [event] state: ${ev.from} -> ${ev.to}`));

    const result = await engine.execute(minDag, {}, {});
    const ok = result.status === 'COMPLETED' || result.status === 'SUCCESS';
    check('Minimal execution completed', ok, `status: ${result.status}`);

    if (!ok) {
      console.log(`    Result: ${JSON.stringify(result, null, 2).substring(0, 500)}`);
    }

    return { engine: RuntimeEngine, adapter, mcpRegistry };
  } catch (err) {
    check('Minimal execution', false, err.message);
    console.log(`    Stack: ${err.stack?.split('\n').slice(0, 3).join('\n    ')}`);
    return null;
  }
}

// ====================================================================
// STEP 6: WAIT_INPUT TEST
// ====================================================================

async function checkWaitInput(execResult) {
  section('6. Wait_Input Test');

  if (!execResult) {
    skip('wait_input test', 'Execution not available');
    return;
  }

  try {
    const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');
    const mcpRegistry = execResult.mcpRegistry;

    // DAG with a wait_input node
    const waitDag = {
      nodes: [
        {
          id: 'SET1',
          executorType: 'workflow.set_variable',
          parameters: {
            name: 'request_id',
            value: 'INT-CHECK-001'
          },
          ports: { input: ['default'], output: ['default'] }
        },
        {
          id: 'WAIT1',
          executorType: 'workflow.wait_input',
          parameters: {
            expected_inputs: ['manager_decision'],
            recipients: ['manager@test.un.org'],
            timeout_hours: 1,
            timeout_action: 'cancel',
            prompt_message: 'Integration check: approve or reject?'
          },
          ports: { input: ['default'], output: ['default'] }
        },
        {
          id: 'END1',
          executorType: 'workflow.set_variable',
          parameters: {
            name: 'final_status',
            value: 'completed_after_wait'
          },
          ports: { input: ['default'], output: ['default'] }
        }
      ],
      edges: [
        { id: 'E1', sourceNodeId: 'SET1', targetNodeId: 'WAIT1' },
        { id: 'E2', sourceNodeId: 'WAIT1', targetNodeId: 'END1' }
      ],
      entryNodeId: 'SET1',
      exitNodeIds: ['END1']
    };

    const engine = new RuntimeEngine(mcpRegistry, {
      enableValidation: false,
      nodeTimeoutMs: 10000,
      graphTimeoutMs: 30000,
    });

    // Listen for events
    engine.on('node:completed', (ev) => console.log(`    [wait-event] node:completed ${ev.nodeId}`));
    engine.on('node:failed', (ev) => console.log(`    [wait-event] node:failed ${ev.nodeId}: ${JSON.stringify(ev.error).substring(0, 100)}`));
    engine.on('execution:stateChange', (ev) => console.log(`    [wait-event] state: ${ev.from} -> ${ev.to}`));
    engine.on('execution:waiting', (ev) => console.log(`    [wait-event] WAITING at ${ev.nodeId}`));

    // Execute — should pause at WAIT1
    const result = await engine.execute(waitDag, {}, {});
    const paused = result.status === 'WAITING_FOR_INPUT' || result.status === 'WAITING';
    check('Execution paused at wait_input', paused, `status: ${result.status}`);

    if (!paused) {
      console.log(`    Result: ${JSON.stringify(result, null, 2).substring(0, 400)}`);
    }

    if (paused) {
      // Try to resume
      try {
        const executionId = result.executionId;
        let resumeResult = await engine.resumeExecution(executionId, {
          nodeId: 'WAIT1',
          output: {
            manager_decision: 'approved',
            approved_by: 'integration-check',
            approved_at: new Date().toISOString()
          }
        });
        // Resume may return RUNNING if remaining nodes are still executing
        // Wait briefly for completion
        if (resumeResult.status === 'RUNNING') {
          await new Promise(r => setTimeout(r, 2000));
          // Check engine state after waiting
          resumeResult = engine.getExecutionState?.(executionId) || resumeResult;
        }
        const resumed = ['COMPLETED', 'SUCCESS', 'RUNNING'].includes(resumeResult.status);
        check('Resume after wait_input', resumed, `status: ${resumeResult.status}`);
      } catch (err) {
        check('Resume after wait_input', false, err.message);
      }
    } else {
      warn('Cannot test resume — execution did not pause');
      if (result.error) {
        console.log(`    Error: ${JSON.stringify(result.error).substring(0, 200)}`);
      }
    }
  } catch (err) {
    check('wait_input test', false, err.message);
    console.log(`    Stack: ${err.stack?.split('\n').slice(0, 3).join('\n    ')}`);
  }
}

// ====================================================================
// MAIN
// ====================================================================

async function main() {
  const args = process.argv.slice(2);
  const skipExec = args.includes('--skip-exec');

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          iNeed Integration Check                       ║');
  console.log('║          ' + new Date().toISOString() + '          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Step 1: Service connectivity
  const memgraph = await checkMemgraph();
  const redis = await checkRedis();
  const qdrant = await checkQdrant();

  // Step 2: Test data
  await checkTestData(memgraph);

  // Step 3: AOPEG
  const aopegResult = await checkAOPEG();

  // Step 4: Graph Loader
  const loader = await checkGraphLoader(memgraph);

  // Step 5-6: Execution tests
  let execResult = null;
  if (!skipExec) {
    execResult = await checkMinimalExecution(aopegResult);
    await checkWaitInput(execResult);
  } else {
    section('5-6. Execution Tests (SKIPPED)');
    skip('Execution tests skipped via --skip-exec');
  }

  // ====================================================================
  // SUMMARY
  // ====================================================================

  console.log('\n' + '═'.repeat(60));
  console.log(`  RESULTS: ${PASS} ${totalPass} passed  ${FAIL} ${totalFail} failed  ${WARN} ${totalWarn} warnings`);

  if (issues.length > 0) {
    console.log('\n  Failed checks:');
    for (const issue of issues) {
      console.log(`    - ${issue}`);
    }
  }

  console.log('═'.repeat(60));

  // Close connections
  try {
    if (memgraph?.driver) await memgraph.driver.close();
  } catch (_) {}
  try {
    const redis = require('../src/services/redis.service');
    if (redis.quit) await redis.quit();
  } catch (_) {}

  if (totalFail > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(2);
});
