/**
 * CC-030: E2E Test — ExecutionRecord creation via RuntimeEngine
 *
 * Creates a minimal 2-node DAG with a mock tool registry,
 * executes it through RuntimeEngine, and verifies that
 * ExecutionRecord was persisted in META namespace.
 *
 * Usage: node api/scripts/test-execution-record.js
 */

'use strict';

const neo4j = require('neo4j-driver');

const BOLT_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USERNAME || 'memgraph';
const NEO4J_PASS = process.env.NEO4J_PASSWORD || 'secret_password_123';

// ───────────────────────────────────────────────────────────────────
// Minimal memgraph adapter (just enough for ExecutionRecorder)
// ───────────────────────────────────────────────────────────────────

function createMemgraphAdapter(driver) {
  return {
    driver,
    async executeQuery(cypher, params = {}) {
      const session = driver.session();
      try {
        const result = await session.run(cypher, params);
        return result;
      } finally {
        await session.close();
      }
    }
  };
}

// ───────────────────────────────────────────────────────────────────
// Mock MCP Registry with a simple echo tool
// ───────────────────────────────────────────────────────────────────

function createMockRegistry() {
  const echoTool = {
    name: 'echo',
    description: 'Echo input back',
    inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
    getDefinition: () => ({
      inputSchema: { type: 'object', properties: { message: { type: 'string' } } },
      outputSchema: { type: 'object', properties: { result: { type: 'string' } } }
    }),
    execute: async (input) => ({ result: `echo: ${input.message || 'hello'}` })
  };

  return {
    getTool: (id) => (id === 'echo' ? echoTool : null),
    listTools: () => [echoTool],
    memgraph: null // will be set later
  };
}

// ───────────────────────────────────────────────────────────────────
// Minimal 2-node DAG
// ───────────────────────────────────────────────────────────────────

const testDag = {
  id: 'cc030-test-dag',
  name: 'CC-030 E2E Test DAG',
  catalogEntryId: '',
  nodes: [
    {
      id: 'start',
      executorType: 'echo',
      parameters: { message: 'CC-030 test start' },
      inputs: [],
      outputs: [{ id: 'out' }]
    },
    {
      id: 'end',
      executorType: 'echo',
      parameters: { message: 'CC-030 test end' },
      inputs: [{ id: 'in' }],
      outputs: []
    }
  ],
  edges: [
    { sourceNodeId: 'start', sourcePortId: 'out', targetNodeId: 'end', targetPortId: 'in' }
  ]
};

// ───────────────────────────────────────────────────────────────────
// Main test
// ───────────────────────────────────────────────────────────────────

async function main() {
  const checks = [];
  const check = (name, pass) => {
    checks.push({ name, pass });
    console.log(`  ${pass ? '✅' : '❌'} ${name}`);
  };

  console.log('=== CC-030: E2E Test ExecutionRecord ===\n');

  // 1. Connect to Memgraph
  console.log('Step 1: Connecting to Memgraph...');
  const driver = neo4j.driver(BOLT_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const memgraph = createMemgraphAdapter(driver);

  // Quick connectivity check
  const session = driver.session();
  try {
    await session.run('RETURN 1');
    console.log('  Connected.\n');
  } catch (e) {
    console.error('  ERROR: Cannot connect to Memgraph:', e.message);
    process.exit(1);
  } finally {
    await session.close();
  }

  // 2. Count ExecutionRecords before
  console.log('Step 2: Counting ExecutionRecords before execution...');
  const beforeResult = await memgraph.executeQuery('MATCH (e:ExecutionRecord) RETURN count(e) as c');
  const beforeCount = beforeResult.records[0].get('c').low !== undefined
    ? beforeResult.records[0].get('c').low
    : beforeResult.records[0].get('c');
  console.log(`  Before: ${beforeCount}\n`);

  // 3. Execute DAG via RuntimeEngine
  console.log('Step 3: Executing DAG via RuntimeEngine...');
  const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');
  const registry = createMockRegistry();
  registry.memgraph = memgraph;

  const engine = new RuntimeEngine(registry, {
    memgraph,
    enableValidation: false,
    recordExecutions: true,
    recordNodeDetails: true,
    executedBy: 'cc030-test'
  });

  let execResult;
  try {
    execResult = await engine.execute(testDag, { test: true });
    console.log(`  Status: ${execResult.status}`);
    console.log(`  Duration: ${execResult.metrics?.totalDurationMs}ms`);
    if (execResult.error) {
      console.log(`  Error: ${JSON.stringify(execResult.error).slice(0, 200)}`);
    }
    console.log('');
  } catch (err) {
    console.log(`  Execution threw: ${err.message}`);
    console.log('  (This may still create an ExecutionRecord)\n');
  }

  // 4. Wait a moment for fire-and-forget write
  await new Promise(r => setTimeout(r, 1500));

  // 5. Count ExecutionRecords after
  console.log('Step 4: Counting ExecutionRecords after execution...');
  const afterResult = await memgraph.executeQuery('MATCH (e:ExecutionRecord) RETURN count(e) as c');
  const afterCount = afterResult.records[0].get('c').low !== undefined
    ? afterResult.records[0].get('c').low
    : afterResult.records[0].get('c');
  console.log(`  After: ${afterCount}`);
  const newRecords = afterCount - beforeCount;
  console.log(`  New records: ${newRecords}\n`);
  check('ExecutionRecord created', newRecords > 0);

  // 6. Fetch our test ExecutionRecord (by graphId)
  console.log('Step 5: Inspecting test ExecutionRecord...');
  const latestRes = await memgraph.executeQuery(
    'MATCH (e:ExecutionRecord) WHERE e.graphId = "cc030-test-dag" RETURN e ORDER BY e.createdAt DESC LIMIT 1'
  );

  if (latestRes.records.length > 0) {
    const rec = latestRes.records[0].get('e').properties;
    console.log(`  executionId: ${rec.executionId}`);
    console.log(`  graphId:     ${rec.graphId}`);
    console.log(`  status:      ${rec.status}`);
    console.log(`  namespace:   ${rec.namespace}`);
    console.log(`  executedBy:  ${rec.executedBy}`);
    console.log(`  durationMs:  ${rec.durationMs}`);
    console.log(`  createdAt:   ${rec.createdAt}`);
    console.log('');

    check('namespace = META', rec.namespace === 'META');
    check('graphId = cc030-test-dag', rec.graphId === 'cc030-test-dag');
    check('executedBy = cc030-test', rec.executedBy === 'cc030-test');
    check('status is valid', ['COMPLETED', 'FAILED', 'TIMED_OUT', 'PARTIAL_FAILURE'].includes(rec.status));

    // 7. Check EXECUTED_NODE relationships
    console.log('\nStep 6: Checking ExecutionNodeRecord...');
    const execId = rec.executionId || '';
    const nodeRes = await memgraph.executeQuery(
      'MATCH (e:ExecutionRecord {executionId: $executionId})-[:EXECUTED_NODE]->(n:ExecutionNodeRecord) RETURN n',
      { executionId: execId }
    );
    console.log(`  ExecutionNodeRecords: ${nodeRes.records.length}`);
    check('ExecutionNodeRecords exist', nodeRes.records.length > 0);

    if (nodeRes.records.length > 0) {
      const nr = nodeRes.records[0].get('n').properties;
      console.log(`  First: nodeId=${nr.nodeId}, status=${nr.status}, durationMs=${nr.durationMs}`);
      check('NodeRecord has namespace META', nr.namespace === 'META');
    }
  } else {
    console.log('  No ExecutionRecord found!');
    check('ExecutionRecord found', false);
  }

  // ─── Summary ───
  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  console.log(`\n=== CC-030 Summary: ${passed}/${total} checks passed ===`);

  if (passed === total) {
    console.log('✅ ALL PASSED — ExecutionRecorder works end-to-end');
  } else {
    console.log('⚠️  Some checks failed — review output above');
  }

  await driver.close();
  process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
