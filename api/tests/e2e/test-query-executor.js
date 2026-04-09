/**
 * Tests for Query Executor (Task 6.2)
 */

const assert = require('assert');

const testResults = { passed: 0, failed: 0, failures: [] };

function test(name, fn) {
  try {
    if (fn.constructor.name === 'AsyncFunction') {
      return fn().then(() => {
        console.log(`  \u2713 ${name}`);
        testResults.passed++;
      }).catch(err => {
        console.log(`  \u2717 ${name}: ${err.message}`);
        testResults.failed++;
        testResults.failures.push(name);
      });
    }
    fn();
    console.log(`  \u2713 ${name}`);
    testResults.passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}: ${err.message}`);
    testResults.failed++;
    testResults.failures.push(name);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, msg) {
  if (!value) throw new Error(msg || 'Expected truthy value');
}

// ═══════════════════════════════════════════════════════════════
// Mock Graph Service
// ═══════════════════════════════════════════════════════════════

function createMockGraphService() {
  const nodes = new Map();
  nodes.set('umoja', { name: 'UMOJA', type: 'System', attributes: { description: 'ERP system for UN', status: 'active' }, createdAt: '2025-01-15' });
  nodes.set('inspira', { name: 'Inspira', type: 'System', attributes: { description: 'HR management system' }, createdAt: '2025-02-01' });
  nodes.set('erp', { name: 'ERP', type: 'System', attributes: { description: 'Enterprise Resource Planning' }, createdAt: '2024-06-15' });
  nodes.set('john', { name: 'John Smith', type: 'Person', attributes: { role: 'Developer' }, createdAt: '2025-03-01' });
  nodes.set('jane', { name: 'Jane Doe', type: 'Person', attributes: { role: 'Manager' }, createdAt: '2025-03-15' });
  nodes.set('bug123', { name: 'Bug #123', type: 'WorkItem', attributes: { status: 'open', priority: 'high' }, createdAt: '2025-04-01' });
  nodes.set('bug456', { name: 'Bug #456', type: 'WorkItem', attributes: { status: 'closed', priority: 'low' }, createdAt: '2025-04-10' });
  nodes.set('team_a', { name: 'Team Alpha', type: 'Team', attributes: { size: 5 } });

  const edges = new Map();
  edges.set('e1', { source: 'umoja', target: 'erp', type: 'DEPENDS_ON' });
  edges.set('e2', { source: 'john', target: 'bug123', type: 'ASSIGNED_TO' });
  edges.set('e3', { source: 'john', target: 'umoja', type: 'AUTHORED_BY' });
  edges.set('e4', { source: 'jane', target: 'team_a', type: 'MANAGES' });
  edges.set('e5', { source: 'inspira', target: 'erp', type: 'USES' });
  edges.set('e6', { source: 'jane', target: 'bug456', type: 'ASSIGNED_TO' });
  edges.set('e7', { source: 'umoja', target: 'inspira', type: 'RELATED_TO' });
  edges.set('e8', { source: 'team_a', target: 'umoja', type: 'USES' });

  // Build adjacency
  const adjacency = new Map();
  for (const [, edge] of edges) {
    const s = edge.source;
    const t = edge.target;
    if (!adjacency.has(s)) adjacency.set(s, new Set());
    if (!adjacency.has(t)) adjacency.set(t, new Set());
    adjacency.get(s).add(t);
    adjacency.get(t).add(s);
  }

  return {
    graphCache: { nodes, edges, adjacency }
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

const {
  QueryExecutor, createQueryExecutor,
  QueryParser, QueryPlanner, ExecutionPlan, QueryOperation, QueryResult
} = require('../../src/services/query');

function testExecutorBasics() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing QueryExecutor Basics');
  console.log('═══════════════════════════════════════════════════════════════');

  test('Instantiation', () => {
    const executor = new QueryExecutor();
    assertTrue(executor !== null);
    assertEqual(executor.options.maxPathLength, 5);
    assertEqual(executor.options.maxResults, 100);
  });

  test('Custom options', () => {
    const executor = createQueryExecutor({ maxPathLength: 10, maxResults: 50 });
    assertEqual(executor.options.maxPathLength, 10);
    assertEqual(executor.options.maxResults, 50);
  });

  test('Set graph service', () => {
    const executor = new QueryExecutor();
    const mockGraph = createMockGraphService();
    executor.setGraphService(mockGraph);
    assertTrue(executor.graphService !== null);
  });

  test('Handle missing graph service gracefully', async () => {
    const executor = new QueryExecutor();
    const plan = new ExecutionPlan({ queryId: 'test' });
    plan.addStep({
      operation: QueryOperation.FIND_NODE,
      params: { name: 'UMOJA' },
      outputKey: 'entity'
    });
    const result = await executor.execute(plan);
    assertTrue(result instanceof QueryResult);
  });
}

async function testFindNode() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing FIND_NODE');
  console.log('═══════════════════════════════════════════════════════════════');

  const executor = createQueryExecutor({ graphService: createMockGraphService() });

  await test('Find node by exact name', async () => {
    const plan = new ExecutionPlan({ queryId: 'test1' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'UMOJA' }, outputKey: 'e' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    assertTrue(result.data.length > 0, `Should find UMOJA, got ${result.data.length} results`);
    assertEqual(result.data[0].name, 'UMOJA');
  });

  await test('Find node by partial name', async () => {
    const plan = new ExecutionPlan({ queryId: 'test2' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'John' }, outputKey: 'e' });
    const result = await executor.execute(plan);
    assertTrue(result.data.length > 0, 'Should find John Smith');
  });

  await test('Find node with type filter', async () => {
    const plan = new ExecutionPlan({ queryId: 'test3' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'UMOJA', type: 'System' }, outputKey: 'e' });
    const result = await executor.execute(plan);
    assertTrue(result.data.length > 0);
    assertEqual(result.data[0].type, 'System');
  });

  await test('Node not found', async () => {
    const plan = new ExecutionPlan({ queryId: 'test4' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'NonExistent' }, outputKey: 'e' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
  });
}

async function testFindNodes() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing FIND_NODES');
  console.log('═══════════════════════════════════════════════════════════════');

  const executor = createQueryExecutor({ graphService: createMockGraphService() });

  await test('Find nodes by type', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_fn1' });
    plan.addStep({ operation: QueryOperation.FIND_NODES, params: { type: 'System' }, outputKey: 'nodes' });
    const result = await executor.execute(plan);
    assertTrue(result.data.length >= 3, `Should find >=3 systems, got ${result.data.length}`);
  });

  await test('Find nodes with constraint', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_fn2' });
    plan.addStep({
      operation: QueryOperation.FIND_NODES,
      params: { type: 'Person' },
      outputKey: 'nodes'
    });
    const result = await executor.execute(plan);
    assertTrue(result.data.length >= 2, `Should find >=2 persons, got ${result.data.length}`);
  });

  await test('Find nodes with limit', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_fn3' });
    plan.addStep({ operation: QueryOperation.FIND_NODES, params: { limit: 2 }, outputKey: 'nodes' });
    const result = await executor.execute(plan);
    assertTrue(result.data.length <= 2, `Should limit to 2, got ${result.data.length}`);
  });
}

async function testGetAttributes() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing GET_NODE_ATTRIBUTES');
  console.log('═══════════════════════════════════════════════════════════════');

  const executor = createQueryExecutor({ graphService: createMockGraphService() });

  await test('Get attributes for found node', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_attr1' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'UMOJA' }, outputKey: 'entity' });
    plan.addStep({ operation: QueryOperation.GET_NODE_ATTRIBUTES, params: { nodeRef: 'entity' }, dependsOn: ['entity'], outputKey: 'attrs' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    // Check that attributes data was retrieved
    const attrsResult = result.data.find(d => d.attributes);
    assertTrue(attrsResult !== undefined, 'Should have attributes');
  });

  await test('Get attributes for missing node', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_attr2' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'NonExistent' }, outputKey: 'entity' });
    plan.addStep({ operation: QueryOperation.GET_NODE_ATTRIBUTES, params: { nodeRef: 'entity' }, dependsOn: ['entity'], outputKey: 'attrs' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
  });
}

async function testFindRelations() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing FIND_RELATIONS');
  console.log('═══════════════════════════════════════════════════════════════');

  const executor = createQueryExecutor({ graphService: createMockGraphService() });

  await test('Find relations for a node', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_rel1' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'John' }, outputKey: 'entity' });
    plan.addStep({ operation: QueryOperation.FIND_RELATIONS, params: { nodeRef: 'entity', direction: 'any' }, dependsOn: ['entity'], outputKey: 'rels' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    assertTrue(result.data.length > 0, 'John should have relations');
  });

  await test('Find relations with type filter', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_rel2' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'John' }, outputKey: 'entity' });
    plan.addStep({ operation: QueryOperation.FIND_RELATIONS, params: { nodeRef: 'entity', relationType: 'ASSIGNED_TO', direction: 'any' }, dependsOn: ['entity'], outputKey: 'rels' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
  });
}

async function testGetNeighbors() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing GET_NEIGHBORS');
  console.log('═══════════════════════════════════════════════════════════════');

  const executor = createQueryExecutor({ graphService: createMockGraphService() });

  await test('Get 1-hop neighbors', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_n1' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'UMOJA' }, outputKey: 'entity' });
    plan.addStep({ operation: QueryOperation.GET_NEIGHBORS, params: { nodeRef: 'entity', maxDepth: 1 }, dependsOn: ['entity'], outputKey: 'neighbors' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    assertTrue(result.data.length > 0, 'UMOJA should have neighbors');
  });

  await test('Get multi-hop neighbors', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_n2' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'UMOJA' }, outputKey: 'entity' });
    plan.addStep({ operation: QueryOperation.GET_NEIGHBORS, params: { nodeRef: 'entity', maxDepth: 2 }, dependsOn: ['entity'], outputKey: 'neighbors' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    // 2-hop should find more nodes than 1-hop
    assertTrue(result.data.length >= 2, `Should find >=2 nodes in 2 hops, got ${result.data.length}`);
  });
}

async function testPathFinding() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing FIND_PATH & FIND_ALL_PATHS');
  console.log('═══════════════════════════════════════════════════════════════');

  const executor = createQueryExecutor({ graphService: createMockGraphService() });

  await test('Find shortest path (BFS)', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_path1' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'UMOJA' }, outputKey: 'source' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'ERP' }, outputKey: 'target' });
    plan.addStep({ operation: QueryOperation.FIND_PATH, params: { sourceRef: 'source', targetRef: 'target', maxLength: 5 }, dependsOn: ['source', 'target'], outputKey: 'path' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    assertTrue(result.paths.length > 0, 'Should find path from UMOJA to ERP');
    assertTrue(result.paths[0].found, 'Path should be found');
    assertTrue(result.paths[0].length >= 1, 'Path should have length >= 1');
  });

  await test('Find all paths (DFS)', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_path2' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'John' }, outputKey: 'source' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'ERP' }, outputKey: 'target' });
    plan.addStep({ operation: QueryOperation.FIND_ALL_PATHS, params: { sourceRef: 'source', targetRef: 'target', maxLength: 5, maxPaths: 3 }, dependsOn: ['source', 'target'], outputKey: 'allPaths' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
  });

  await test('No path between disconnected nodes', async () => {
    // Create executor with isolated graph
    const isolatedGraph = createMockGraphService();
    isolatedGraph.graphCache.nodes.set('isolated', { name: 'Isolated', type: 'System' });
    const exec = createQueryExecutor({ graphService: isolatedGraph });

    const plan = new ExecutionPlan({ queryId: 'test_path3' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'UMOJA' }, outputKey: 'source' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'Isolated' }, outputKey: 'target' });
    plan.addStep({ operation: QueryOperation.FIND_PATH, params: { sourceRef: 'source', targetRef: 'target' }, dependsOn: ['source', 'target'], outputKey: 'path' });
    const result = await exec.execute(plan);
    assertTrue(result.success);
    // Path should not be found
    const pathResult = result.paths.find(p => p.found);
    assertTrue(!pathResult, 'Should not find path to isolated node');
  });
}

async function testAggregation() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing COUNT, LIST, GROUP_BY');
  console.log('═══════════════════════════════════════════════════════════════');

  const executor = createQueryExecutor({ graphService: createMockGraphService() });

  await test('Count nodes', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_count' });
    plan.addStep({ operation: QueryOperation.FIND_NODES, params: { type: 'System' }, outputKey: 'nodes' });
    plan.addStep({ operation: QueryOperation.COUNT, params: { nodesRef: 'nodes' }, dependsOn: ['nodes'], outputKey: 'count' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    assertTrue(result.aggregations.count >= 3, `Should count >=3 systems, got ${result.aggregations.count}`);
  });

  await test('List nodes with limit', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_list' });
    plan.addStep({ operation: QueryOperation.FIND_NODES, params: {}, outputKey: 'nodes' });
    plan.addStep({ operation: QueryOperation.LIST, params: { nodesRef: 'nodes', limit: 3 }, dependsOn: ['nodes'], outputKey: 'list' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
  });

  await test('Group by type', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_group' });
    plan.addStep({ operation: QueryOperation.FIND_NODES, params: {}, outputKey: 'nodes' });
    plan.addStep({ operation: QueryOperation.GROUP_BY, params: { nodesRef: 'nodes', field: 'type' }, dependsOn: ['nodes'], outputKey: 'groups' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    assertTrue(result.aggregations.groups !== undefined, 'Should have groups');
    assertTrue(result.aggregations.counts !== undefined, 'Should have counts');
  });
}

async function testSubgraph() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing TRAVERSE & SUBGRAPH');
  console.log('═══════════════════════════════════════════════════════════════');

  const executor = createQueryExecutor({ graphService: createMockGraphService() });

  await test('Traverse from node', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_traverse' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'UMOJA' }, outputKey: 'start' });
    plan.addStep({ operation: QueryOperation.TRAVERSE, params: { startRef: 'start', maxDepth: 2 }, dependsOn: ['start'], outputKey: 'traversed' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    assertTrue(result.data.length > 0, 'Should traverse to nodes');
  });

  await test('Extract subgraph', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_subgraph' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'UMOJA' }, outputKey: 'e0' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'John' }, outputKey: 'e1' });
    plan.addStep({ operation: QueryOperation.SUBGRAPH, params: { entitiesRef: ['e0', 'e1'], maxDepth: 1 }, dependsOn: ['e0', 'e1'], outputKey: 'sg' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    assertTrue(result.data.length >= 2, `Should include seed nodes + neighbors, got ${result.data.length}`);
  });
}

async function testStepOrdering() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing Step Ordering & Dependencies');
  console.log('═══════════════════════════════════════════════════════════════');

  const executor = createQueryExecutor({ graphService: createMockGraphService() });

  await test('Steps execute in dependency order', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_order' });
    // Add steps out of order
    plan.addStep({ operation: QueryOperation.GET_NEIGHBORS, params: { nodeRef: 'entity', maxDepth: 1 }, dependsOn: ['entity'], outputKey: 'neighbors' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'UMOJA' }, outputKey: 'entity' });
    const result = await executor.execute(plan);
    assertTrue(result.success);
    assertTrue(result.data.length > 0, 'Should execute in correct order despite add order');
  });

  await test('Unsatisfied dependencies handled', async () => {
    const plan = new ExecutionPlan({ queryId: 'test_deps' });
    plan.addStep({ operation: QueryOperation.GET_NODE_ATTRIBUTES, params: { nodeRef: 'missing_dep' }, dependsOn: ['missing_dep'], outputKey: 'attrs' });
    const result = await executor.execute(plan);
    // Should not crash
    assertTrue(result instanceof QueryResult);
  });
}

async function testFullPipeline() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing Full Pipeline (parse → plan → execute)');
  console.log('═══════════════════════════════════════════════════════════════');

  const parser = new QueryParser();
  const planner = new QueryPlanner();
  const executor = createQueryExecutor({ graphService: createMockGraphService() });

  await test('Factual query pipeline', async () => {
    const parsed = parser.parse('What is UMOJA?');
    const plan = planner.plan(parsed);
    const result = await executor.execute(plan);
    assertTrue(result.success);
    assertTrue(result.data.length > 0, 'Should find UMOJA data');
    assertTrue(result.citations.length > 0, 'Should have citations');
  });

  await test('Relational query pipeline', async () => {
    const parsed = parser.parse('Who created Bug #123?');
    const plan = planner.plan(parsed);
    const result = await executor.execute(plan);
    assertTrue(result.success);
  });

  await test('Path query pipeline', async () => {
    const parsed = parser.parse('Find path from UMOJA to ERP');
    const plan = planner.plan(parsed);
    const result = await executor.execute(plan);
    assertTrue(result.success);
  });

  await test('Aggregation query pipeline', async () => {
    const parsed = parser.parse('How many systems are there?');
    const plan = planner.plan(parsed);
    const result = await executor.execute(plan);
    assertTrue(result.success);
  });

  await test('Statistics tracking', async () => {
    const stats = executor.getStats();
    assertTrue(stats.totalExecutions > 0);
    assertTrue(stats.successfulExecutions > 0);
    assertTrue(stats.totalStepsExecuted > 0);
    assertTrue(stats.avgExecutionTime >= 0);
    assertTrue(stats.graphSize.nodes > 0);
  });

  await test('Module exports', () => {
    const mod = require('../../src/services/query');
    assertTrue(mod.QueryExecutor !== undefined);
    assertTrue(mod.createQueryExecutor !== undefined);
    assertTrue(mod.queryExecutor !== undefined);
  });
}

// ═══════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           Query Executor Tests (Task 6.2)                    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  try {
    testExecutorBasics();
    await testFindNode();
    await testFindNodes();
    await testGetAttributes();
    await testFindRelations();
    await testGetNeighbors();
    await testPathFinding();
    await testAggregation();
    await testSubgraph();
    await testStepOrdering();
    await testFullPipeline();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`Results: ${testResults.passed} passed, ${testResults.failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════');

    if (testResults.failures.length > 0) {
      console.log('\nFailed tests:');
      testResults.failures.forEach(f => console.log(`  - ${f}`));
    }

    process.exit(testResults.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

runAllTests();
