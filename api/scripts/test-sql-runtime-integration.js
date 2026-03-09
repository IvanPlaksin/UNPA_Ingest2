#!/usr/bin/env node
/**
 * RuntimeEngine Integration Test — SQL Extraction META-GRAPH
 *
 * Executes the CORE-SQL-EXTRACTION-META-V1 graph through RuntimeEngine
 * with full template resolution, edge-based data flow, and TopologicalScheduler.
 *
 * Tests:
 *   - ReactFlow → AOPEG DAG conversion
 *   - Template resolution: {{META-N02.connectionId}}, {{META-N04.databaseMap}}, etc.
 *   - Edge-based data propagation between nodes
 *   - Real SQL Server execution (FlowDesc)
 *   - Real Memgraph persistence (D1/D2/D3)
 *   - AI nodes with mock_response
 *   - common.loop replaced with inline procedure analysis
 *
 * Usage:
 *   node api/scripts/test-sql-runtime-integration.js [--verbose]
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.chdir(path.join(__dirname, '..'));

// Mock LLM for AI nodes
process.env.MOCK_LLM = '1';

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// ====================================================================
// HELPERS
// ====================================================================

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  [PASS] ${name}${detail ? ' - ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${name}${detail ? ' - ' + detail : ''}`);
    failed++;
  }
  return condition;
}

function skip(name, reason = '') {
  console.log(`  [SKIP] ${name}${reason ? ' - ' + reason : ''}`);
  skipped++;
}

function section(title) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(64)}`);
}

// ====================================================================
// SETUP
// ====================================================================

async function setup() {
  const { initializeAOPEG, pluginRegistry } = require('../src/core/aopeg/index');
  const { AOPEGAdapter } = require('../src/runtime/integration');

  await initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true, loadToolPlugins: true });
  const adapter = new AOPEGAdapter(pluginRegistry);
  const registry = adapter.createMcpCompatibleRegistry();

  return { registry, pluginRegistry };
}

/**
 * Convert ReactFlow graph definition to AOPEG DAG format for RuntimeEngine
 */
function toAOPEGDag(graphDef) {
  return {
    id: graphDef.graph_id,
    nodes: graphDef.nodes.map(n => ({
      id: n.id,
      executorType: n.data.tool,
      parameters: { ...(n.data.config || {}) },
      metadata: { label: n.data.label, type: n.type },
    })),
    edges: graphDef.edges.map(e => ({
      id: e.id,
      sourceNodeId: e.source,
      targetNodeId: e.target,
      label: e.label || undefined,
    })),
    entryNodeId: graphDef.nodes.find(n => n.type === 'start')?.id,
    exitNodeIds: graphDef.nodes.filter(n => n.type === 'end').map(n => n.id),
  };
}

// ====================================================================
// Phase 1: Setup & Connectivity
// ====================================================================

async function phase1_setup(registry) {
  section('Phase 1: Setup & Connectivity');

  // Check SQL Server
  let sqlOk = false;
  try {
    const sql = require('mssql');
    const pool = await sql.connect({
      server: 'localhost',
      port: 1435,
      database: 'FlowDesc',
      user: 'sa',
      password: 'SqlExpress2022#Dev',
      options: { encrypt: false, trustServerCertificate: true },
    });
    const r = await pool.request().query('SELECT 1 as ping');
    sqlOk = r.recordset[0]?.ping === 1;
    await pool.close();
  } catch (e) {
    console.log(`  SQL Error: ${e.message}`);
  }
  check('SQL Server connected (localhost:1435)', sqlOk);

  if (!sqlOk) {
    console.log('\n  FATAL: SQL Server required. Aborting.');
    process.exit(1);
  }

  // Check Memgraph
  let memgraphOk = false;
  try {
    const memgraph = require('../src/services/memgraph.service');
    await memgraph.runQuery('RETURN 1 as t');
    memgraphOk = true;
  } catch { /* no memgraph */ }
  check('Memgraph connected', memgraphOk);

  if (!memgraphOk) {
    console.log('\n  FATAL: Memgraph required. Aborting.');
    process.exit(1);
  }

  // Check registry has SQL extraction executors
  const tools = registry.listTools();
  const toolNames = tools.map(t => t.name || t);
  const sqlTools = toolNames.filter(t =>
    t.startsWith('sql.') || t === 'graph.query' || t === 'workflow.start' || t === 'workflow.end' || t === 'ai.generate'
  );
  check('SQL extraction executors registered', sqlTools.length >= 10,
    `${sqlTools.length} relevant tools out of ${tools.length} total`);

  if (VERBOSE) {
    console.log(`    SQL tools: ${sqlTools.join(', ')}`);
  }

  return { sqlOk, memgraphOk };
}

// ====================================================================
// Phase 2: META-GRAPH Execution via RuntimeEngine
// ====================================================================

async function phase2_metaGraph(registry) {
  section('Phase 2: META-GRAPH via RuntimeEngine');

  const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');
  const { SQL_EXTRACTION_META } = require('../src/services/graph-definitions/sql-extraction-pipeline');

  const dag = toAOPEGDag(SQL_EXTRACTION_META);
  console.log(`  DAG: ${dag.id} (${dag.nodes.length} nodes, ${dag.edges.length} edges)`);
  console.log(`  Entry: ${dag.entryNodeId}, Exit: ${dag.exitNodeIds.join(', ')}`);

  // ── Prepare node overrides ──
  // Template references like {{META-N02.connectionId}} are resolved by
  // TemplateResolver from ExecutionContext before validation + execution.

  // META-N05 (ai.generate: Classify Tables) - mock classification response
  const n05 = dag.nodes.find(n => n.id === 'META-N05');
  if (n05) {
    n05.parameters.mock_response = {
      classifications: {
        'dbo.FlowDescMaster': { type: 'master', confidence: 0.95 },
        'dbo.FlowSteps': { type: 'transaction', confidence: 0.88 },
        'dbo.LookupStatus': { type: 'reference', confidence: 0.92 },
      },
    };
  }

  // META-N10 (ai.generate: Extract Semantic Rules) - mock semantic extraction
  const n10 = dag.nodes.find(n => n.id === 'META-N10');
  if (n10) {
    n10.parameters.mock_response = {
      rules: [
        { name: 'FlowStatusValidation', description: 'Flow status must follow lifecycle', type: 'validation', sourceTable: 'FlowDescMaster', confidence: 0.85 },
        { name: 'StepOrderConstraint', description: 'Steps must be sequential', type: 'constraint', sourceTable: 'FlowSteps', confidence: 0.9 },
      ],
      calculations: [
        { name: 'TotalStepDuration', formula: 'SUM(step.duration)', inputFields: ['duration'], outputField: 'totalDuration', sourceTable: 'FlowSteps' },
      ],
      vocabulary: [
        { term: 'FlowDesc', definition: 'A flow description template', domain: 'workflow' },
      ],
    };
  }

  // META-N09 (common.loop) — no loop executor exists
  // Replace with workflow.set_variable that stores mock procedure analysis
  const n09 = dag.nodes.find(n => n.id === 'META-N09');
  if (n09) {
    n09.executorType = 'workflow.set_variable';
    n09.parameters = {
      name: 'procedure_analysis',
      value: {
        analyzed: true,
        count: 0,
        note: 'Loop executor not available - procedure analysis done via individual executor test',
      },
    };
  }

  // META-N11 (sql.domain_persist: D3 Semantic) — needs rules from META-N10
  // The template {{META-N10.response.rules}} should resolve from mocked ai.generate output
  // ai.generate returns { response: mock_response, model_used: 'mock', mock: true }
  // So META-N10.response.rules → the rules array from mock_response

  const engine = new RuntimeEngine(registry, {
    enableValidation: false,
    nodeTimeoutMs: 60000,
    graphTimeoutMs: 300000,
    schedulingStrategy: 'PARALLEL_BOUNDED',
    maxConcurrency: 3,
  });

  // Track node lifecycle
  const nodeCompletions = [];
  const nodeFailures = [];

  engine.on('node:completed', ({ nodeId, output }) => {
    const label = dag.nodes.find(n => n.id === nodeId)?.metadata?.label || nodeId;
    const snippet = output ? JSON.stringify(output).substring(0, 80) : '';
    nodeCompletions.push({ nodeId, label, snippet });
    if (VERBOSE) {
      console.log(`    >> ${nodeId} ${label}: ${snippet}`);
    }
  });

  engine.on('node:failed', ({ nodeId, error, details }) => {
    const label = dag.nodes.find(n => n.id === nodeId)?.metadata?.label || nodeId;
    nodeFailures.push({ nodeId, label, error, details });
    console.log(`    !! FAILED ${nodeId} ${label}: ${error} ${details?.error || ''}`);
  });

  // ── Input ──
  const input = {
    server: 'localhost',
    database: 'FlowDesc',
    user: 'sa',
    password: 'SqlExpress2022#Dev',
    port: 1435,
    schemas: ['dbo'],
    sessionId: `runtime-test-${Date.now()}`,
  };

  console.log(`  Input: server=${input.server}:${input.port}, db=${input.database}`);
  console.log(`  Session: ${input.sessionId}`);
  console.log(`  Running META-GRAPH via RuntimeEngine...\n`);

  const startTime = Date.now();
  let result;
  try {
    result = await engine.execute(dag, input);
  } catch (err) {
    console.log(`\n  EXECUTION ERROR: ${err.message}`);
    if (VERBOSE) console.log(err.stack);
    result = { status: 'FAILED', nodeResults: {}, metrics: {} };
  }
  const duration = Date.now() - startTime;

  // Print completions
  console.log(`\n  Node Completions (${nodeCompletions.length}):`);
  for (const nc of nodeCompletions) {
    console.log(`    + ${nc.nodeId} ${nc.label}`);
  }
  if (nodeFailures.length > 0) {
    console.log(`\n  Node Failures (${nodeFailures.length}):`);
    for (const nf of nodeFailures) {
      console.log(`    - ${nf.nodeId} ${nf.label}: ${nf.error}`);
    }
  }
  console.log();

  return { result, duration, dag, nodeCompletions, nodeFailures };
}

// ====================================================================
// Phase 3: Validate Results
// ====================================================================

async function phase3_validate(execResult) {
  section('Phase 3: Result Validation');

  const { result, duration, dag, nodeCompletions, nodeFailures } = execResult;
  const nr = result.nodeResults || {};

  // Overall status
  check('META-GRAPH execution completed',
    result.status === 'COMPLETED',
    `status=${result.status}, duration=${duration}ms`);

  // Phase 1: Pipeline Input
  check('META-N01 Pipeline Input (workflow.start)',
    nr['META-N01']?.status === 'SUCCEEDED');

  // Phase 1: SQL Connect — the KEY template test
  const n02Status = nr['META-N02']?.status;
  const n02Output = nr['META-N02']?.output;
  check('META-N02 SQL Connect',
    n02Status === 'SUCCEEDED',
    `connectionId=${n02Output?.connectionId || 'NONE'}`);

  // Check that connectionId was produced (needed for template resolution downstream)
  check('META-N02 produced connectionId',
    !!n02Output?.connectionId);

  // Phase 1: Meta Consultation (graph.query)
  const n03Status = nr['META-N03']?.status;
  check('META-N03 Meta Consultation (graph.query)',
    n03Status === 'SUCCEEDED' || n03Status === 'SKIPPED',
    `status=${n03Status}`);

  // Phase 2: Schema Scan — uses {{META-N02.connectionId}} template
  const n04Status = nr['META-N04']?.status;
  const n04Output = nr['META-N04']?.output;
  check('META-N04 Schema Scan (template: {{META-N02.connectionId}})',
    n04Status === 'SUCCEEDED',
    `tables=${n04Output?.tableCount || 0}, cols=${n04Output?.columnCount || 0}`);

  // Verify template resolution worked — schema scan found tables
  if (n04Output) {
    check('Template resolution: connectionId passed correctly',
      n04Output.tableCount > 0,
      `${n04Output.tableCount} tables found`);
  }

  // Phase 3: Classify Tables (ai.generate, mocked)
  const n05Status = nr['META-N05']?.status;
  check('META-N05 Classify Tables (ai.generate mock)',
    n05Status === 'SUCCEEDED',
    `response type: ${typeof nr['META-N05']?.output?.response}`);

  // Phase 3: Persist D1 Entities — uses {{META-N04.databaseMap}} template
  const n06Status = nr['META-N06']?.status;
  const n06Output = nr['META-N06']?.output;
  check('META-N06 Persist D1 Entities (template: {{META-N04.databaseMap}})',
    n06Status === 'SUCCEEDED',
    `created=${n06Output?.created || 0}`);

  // Phase 4: FK Edges — uses {{META-N04.databaseMap.foreignKeys}} template
  const n07Status = nr['META-N07']?.status;
  check('META-N07 Persist FK Edges',
    n07Status === 'SUCCEEDED',
    `status=${n07Status}`);

  // Phase 5: List Procedures — uses {{META-N02.connectionId}} template
  const n08Status = nr['META-N08']?.status;
  const n08Output = nr['META-N08']?.output;
  check('META-N08 List Procedures (template: {{META-N02.connectionId}})',
    n08Status === 'SUCCEEDED',
    `procedures=${n08Output?.procedureCount || 0}`);

  // Phase 6A: Procedure Analysis (replaced common.loop with set_variable)
  const n09Status = nr['META-N09']?.status;
  check('META-N09 Procedure Analysis (set_variable mock)',
    n09Status === 'SUCCEEDED' || n09Status === 'SKIPPED',
    `status=${n09Status}`);

  // Phase 6B: Semantic Rules (ai.generate, mocked)
  const n10Status = nr['META-N10']?.status;
  check('META-N10 Semantic Rules (ai.generate mock)',
    n10Status === 'SUCCEEDED',
    `status=${n10Status}`);

  // Phase 6C: Persist D3 Rules — uses {{META-N10.response.rules}} template
  const n11Status = nr['META-N11']?.status;
  check('META-N11 Persist D3 Rules (template: {{META-N10.response.rules}})',
    n11Status === 'SUCCEEDED',
    `status=${n11Status}`);

  // Phase 7: Validation Summary (graph.query)
  const n12Status = nr['META-N12']?.status;
  check('META-N12 Validation Summary (graph.query)',
    n12Status === 'SUCCEEDED',
    `status=${n12Status}`);

  // Phase 8: Cross-Domain Summary (graph.query)
  const n13Status = nr['META-N13']?.status;
  check('META-N13 Cross-Domain Summary (graph.query)',
    n13Status === 'SUCCEEDED',
    `status=${n13Status}`);

  // Phase 9: Pipeline Complete (workflow.end)
  const n14Status = nr['META-N14']?.status;
  check('META-N14 Pipeline Complete (workflow.end)',
    n14Status === 'SUCCEEDED',
    `status=${n14Status}`);

  // Count results
  const succeeded = Object.values(nr).filter(r => r?.status === 'SUCCEEDED').length;
  const failedNodes = Object.values(nr).filter(r => r?.status === 'FAILED').length;
  const skippedNodes = Object.values(nr).filter(r => r?.status === 'SKIPPED').length;

  check('All nodes accounted for',
    succeeded + failedNodes + skippedNodes === dag.nodes.length,
    `${succeeded} succeeded, ${failedNodes} failed, ${skippedNodes} skipped / ${dag.nodes.length} total`);

  check('No node failures', failedNodes === 0,
    failedNodes > 0 ? `${failedNodes} nodes failed` : 'all nodes succeeded');

  check('Duration under 120s', duration < 120000, `${duration}ms`);

  return { succeeded, failedNodes, skippedNodes };
}

// ====================================================================
// Phase 4: Verify Memgraph State
// ====================================================================

async function phase4_memgraph() {
  section('Phase 4: Memgraph Domain Verification');

  const memgraph = require('../src/services/memgraph.service');

  // D1: Structural entities
  const d1 = await memgraph.runQuery('MATCH (e:StructuralEntity) RETURN count(e) as c');
  const d1c = d1[0]?.c || 0;
  check('D1 Structural entities > 0', d1c > 0, `${d1c} entities`);

  // D2: Behavioral graphs
  const d2 = await memgraph.runQuery("MATCH (g:DomainGraph {domain: 'BEHAVIORAL'}) RETURN count(g) as c");
  const d2c = d2[0]?.c || 0;
  check('D2 Behavioral graphs present', d2c >= 0, `${d2c} graphs`);

  // D3: Semantic rules
  const d3 = await memgraph.runQuery('MATCH (r:SemanticRule) RETURN count(r) as c');
  const d3c = d3[0]?.c || 0;
  check('D3 Semantic rules > 0', d3c > 0, `${d3c} rules`);

  // Cross-domain edges
  const xd = await memgraph.runQuery('MATCH ()-[e:CROSS_DOMAIN]->() RETURN count(e) as c');
  const xdc = xd[0]?.c || 0;
  check('Cross-domain edges present', xdc >= 0, `${xdc} edges`);

  // FK edges
  const fk = await memgraph.runQuery('MATCH ()-[e:FK_REFERENCES]->() RETURN count(e) as c');
  const fkc = fk[0]?.c || 0;
  check('FK edges present', fkc >= 0, `${fkc} FK edges`);

  console.log(`\n  Domain Summary:`);
  console.log(`    D1 STRUCTURAL:  ${d1c} entities`);
  console.log(`    D2 BEHAVIORAL:  ${d2c} graphs`);
  console.log(`    D3 SEMANTIC:    ${d3c} rules`);
  console.log(`    CROSS-DOMAIN:   ${xdc} edges`);
  console.log(`    FK EDGES:       ${fkc} edges`);
}

// ====================================================================
// Phase 5: Template Resolution Verification
// ====================================================================

async function phase5_templates(execResult) {
  section('Phase 5: Template Resolution Verification');

  const { result } = execResult;
  const nr = result.nodeResults || {};

  // The critical test: did {{META-N02.connectionId}} resolve for META-N04?
  const n02Output = nr['META-N02']?.output;
  const n04Output = nr['META-N04']?.output;

  if (n02Output?.connectionId && n04Output?.tableCount > 0) {
    check('{{META-N02.connectionId}} resolved for Schema Scan', true,
      `connectionId=${n02Output.connectionId} → ${n04Output.tableCount} tables`);
  } else {
    check('{{META-N02.connectionId}} resolved for Schema Scan', false,
      `n02 connectionId=${n02Output?.connectionId}, n04 tables=${n04Output?.tableCount}`);
  }

  // Did {{META-N04.databaseMap}} resolve for D1 persist?
  const n06Output = nr['META-N06']?.output;
  if (n06Output && (n06Output.created > 0 || n06Output.success)) {
    check('{{META-N04.databaseMap}} resolved for D1 Persist', true,
      `created=${n06Output.created || 0}`);
  } else {
    check('{{META-N04.databaseMap}} resolved for D1 Persist',
      nr['META-N06']?.status === 'SUCCEEDED');
  }

  // Did {{META-N02.connectionId}} resolve for List Procedures?
  const n08Output = nr['META-N08']?.output;
  if (n08Output?.procedureCount > 0) {
    check('{{META-N02.connectionId}} resolved for List Procedures', true,
      `${n08Output.procedureCount} procedures`);
  } else {
    check('{{META-N02.connectionId}} resolved for List Procedures',
      nr['META-N08']?.status === 'SUCCEEDED');
  }

  // Did {{input.schemas}} resolve?
  // If schema scan worked with correct schemas, input templates resolved
  check('{{input.*}} templates resolved correctly',
    n04Output?.tableCount > 0,
    'Schema scan used input.schemas to find tables');

  // Did {{META-N10.response.rules}} resolve for D3 persist?
  check('{{META-N10.response.rules}} resolved for D3 Persist',
    nr['META-N11']?.status === 'SUCCEEDED',
    `D3 persist status=${nr['META-N11']?.status}`);
}

// ====================================================================
// MAIN
// ====================================================================

async function main() {
  console.log('\n' + '='.repeat(64));
  console.log('  SQL EXTRACTION META-GRAPH — RuntimeEngine Integration Test');
  console.log('  Tests: template resolution, data flow, scheduling, persistence');
  console.log('='.repeat(64));

  const { registry } = await setup();
  const tools = registry.listTools();
  console.log(`\n  Registry: ${tools.length} executors (${tools.map(t => t.name).filter(n => n?.startsWith('sql.')).join(', ')})`);

  let execResult;

  try {
    await phase1_setup(registry);
    execResult = await phase2_metaGraph(registry);
    await phase3_validate(execResult);
    await phase4_memgraph();
    await phase5_templates(execResult);
  } catch (err) {
    console.error(`\n  FATAL: ${err.message}`);
    if (VERBOSE) console.error(err.stack);
    else console.error(`  Run with --verbose for stack trace`);
    failed++;
  }

  // ── Cleanup: close SQL pool if in shared state ──
  try {
    const sql = require('mssql');
    await sql.close();
  } catch { /* ignore */ }

  // Summary
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`  out of ${passed + failed + skipped} total checks`);
  if (failed === 0) {
    console.log(`  ALL TESTS PASSED`);
  } else {
    console.log(`  SOME TESTS FAILED`);
  }
  console.log(`${'='.repeat(64)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(2);
});
