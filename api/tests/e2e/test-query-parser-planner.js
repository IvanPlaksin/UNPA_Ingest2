/**
 * Tests for Query Parser & Planner (Task 6.1)
 */

const assert = require('assert');

// Test utilities
const testResults = { passed: 0, failed: 0, failures: [] };

function test(name, fn) {
  try {
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
// TESTS
// ═══════════════════════════════════════════════════════════════

const {
  QueryIntent, QueryOperation, ParsedQuery, ExecutionPlan, QueryResult,
  QueryParser, createQueryParser, queryParser,
  QueryPlanner, createQueryPlanner, queryPlanner
} = require('../../src/services/query');

function testQueryTypes() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing Query Types');
  console.log('═══════════════════════════════════════════════════════════════');

  test('QueryIntent has all 7 types', () => {
    assertEqual(Object.keys(QueryIntent).length, 7, 'Should have 7 intent types');
    assertTrue(QueryIntent.FACTUAL === 'factual');
    assertTrue(QueryIntent.RELATIONAL === 'relational');
    assertTrue(QueryIntent.PATH === 'path');
    assertTrue(QueryIntent.AGGREGATION === 'aggregation');
    assertTrue(QueryIntent.COMPARISON === 'comparison');
    assertTrue(QueryIntent.TEMPORAL === 'temporal');
    assertTrue(QueryIntent.COMPLEX === 'complex');
  });

  test('QueryOperation has all operation types', () => {
    assertTrue(Object.keys(QueryOperation).length >= 11, 'Should have 11+ operations');
    assertTrue(QueryOperation.FIND_NODE === 'find_node');
    assertTrue(QueryOperation.FIND_PATH === 'find_path');
    assertTrue(QueryOperation.SUBGRAPH === 'subgraph');
  });

  test('ParsedQuery instantiation', () => {
    const q = new ParsedQuery({
      originalText: 'What is UMOJA?',
      intent: QueryIntent.FACTUAL,
      confidence: 0.9,
      entities: [{ name: 'UMOJA', type: 'System' }]
    });
    assertEqual(q.originalText, 'What is UMOJA?');
    assertEqual(q.intent, 'factual');
    assertEqual(q.entities.length, 1);
    assertTrue(q.id.startsWith('q_'));
    assertTrue(q.parsedAt !== null);
  });

  test('ParsedQuery toJSON', () => {
    const q = new ParsedQuery({ originalText: 'test', intent: QueryIntent.PATH });
    const json = q.toJSON();
    assertTrue(json.id !== undefined);
    assertEqual(json.intent, 'path');
    assertEqual(json.originalText, 'test');
  });

  test('ExecutionPlan addStep', () => {
    const plan = new ExecutionPlan({ queryId: 'q_1' });
    plan.addStep({
      operation: QueryOperation.FIND_NODE,
      params: { name: 'UMOJA' },
      outputKey: 'entity'
    });
    plan.addStep({
      operation: QueryOperation.GET_NEIGHBORS,
      params: { nodeRef: 'entity' },
      dependsOn: ['entity'],
      outputKey: 'neighbors'
    });
    assertEqual(plan.steps.length, 2);
    assertEqual(plan.steps[0].operation, 'find_node');
    assertEqual(plan.steps[1].dependsOn[0], 'entity');
  });

  test('ExecutionPlan toJSON', () => {
    const plan = new ExecutionPlan({ queryId: 'q_1' });
    plan.addStep({ operation: QueryOperation.FIND_NODE, params: { name: 'X' }, outputKey: 'e' });
    const json = plan.toJSON();
    assertEqual(json.steps.length, 1);
    assertTrue(json.id.startsWith('plan_'));
  });

  test('QueryResult structure', () => {
    const result = new QueryResult({
      queryId: 'q_1',
      data: [{ id: 'n1', name: 'UMOJA' }],
      answer: 'UMOJA is a system',
      citations: [{ nodeId: 'n1', text: 'UMOJA definition' }],
      executionTime: 42
    });
    assertTrue(result.success);
    assertEqual(result.data.length, 1);
    assertEqual(result.answer, 'UMOJA is a system');
    assertEqual(result.metadata.totalResults, 1);
    assertEqual(result.metadata.executionTime, 42);
  });
}

function testQueryParser() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing Query Parser');
  console.log('═══════════════════════════════════════════════════════════════');

  test('Parser instantiation', () => {
    const parser = new QueryParser();
    assertTrue(parser !== null);
    assertEqual(parser.options.defaultLimit, 10);
  });

  test('Custom options', () => {
    const parser = createQueryParser({ defaultLimit: 25 });
    assertEqual(parser.options.defaultLimit, 25);
  });

  // === Intent Detection ===

  test('Detect FACTUAL intent', () => {
    const parsed = queryParser.parse('What is UMOJA?');
    assertEqual(parsed.intent, QueryIntent.FACTUAL);
    assertTrue(parsed.confidence > 0.5);
  });

  test('Detect FACTUAL intent (describe)', () => {
    const parsed = queryParser.parse('Tell me about the payment system');
    assertEqual(parsed.intent, QueryIntent.FACTUAL);
  });

  test('Detect RELATIONAL intent', () => {
    const parsed = queryParser.parse('Who created Bug #123?');
    assertEqual(parsed.intent, QueryIntent.RELATIONAL);
  });

  test('Detect RELATIONAL intent (connections)', () => {
    const parsed = queryParser.parse('Show all relationships of UMOJA');
    assertEqual(parsed.intent, QueryIntent.RELATIONAL);
  });

  test('Detect PATH intent', () => {
    const parsed = queryParser.parse('Find path from UMOJA to ERP');
    assertEqual(parsed.intent, QueryIntent.PATH);
    assertTrue(parsed.entities.length >= 2);
  });

  test('Detect AGGREGATION intent', () => {
    const parsed = queryParser.parse('How many bugs are assigned to John?');
    assertEqual(parsed.intent, QueryIntent.AGGREGATION);
  });

  test('Detect AGGREGATION intent (list)', () => {
    const parsed = queryParser.parse('List all systems');
    assertEqual(parsed.intent, QueryIntent.AGGREGATION);
  });

  test('Detect COMPARISON intent', () => {
    const parsed = queryParser.parse('Compare UMOJA and ERP');
    assertEqual(parsed.intent, QueryIntent.COMPARISON);
  });

  test('Detect TEMPORAL intent', () => {
    const parsed = queryParser.parse('What changed last week?');
    assertEqual(parsed.intent, QueryIntent.TEMPORAL);
    assertTrue(parsed.temporal !== null);
    assertEqual(parsed.temporal.keyword, 'last week');
  });

  test('Detect COMPLEX intent (fallback)', () => {
    const parsed = queryParser.parse('Analyze relationships and performance metrics across all subsystems');
    assertEqual(parsed.intent, QueryIntent.COMPLEX);
  });

  // === Entity Extraction ===

  test('Extract quoted entities', () => {
    const parsed = queryParser.parse('What is "Payment Gateway"?');
    const names = parsed.entities.map(e => e.name);
    assertTrue(names.includes('Payment Gateway'), `Should extract quoted entity, got: ${names.join(', ')}`);
  });

  test('Extract work item entities', () => {
    const parsed = queryParser.parse('Who created Bug #456?');
    const workItems = parsed.entities.filter(e => e.type === 'WorkItem');
    assertTrue(workItems.length > 0, 'Should extract work item');
  });

  test('Extract system acronyms', () => {
    const parsed = queryParser.parse('What does UMOJA depend on?');
    const systems = parsed.entities.filter(e => e.type === 'System');
    assertTrue(systems.length > 0, `Should extract system acronym, got entities: ${JSON.stringify(parsed.entities)}`);
  });

  test('Extract person names', () => {
    const parsed = queryParser.parse('Show connections of John Smith');
    const persons = parsed.entities.filter(e => e.type === 'Person');
    assertTrue(persons.length > 0, `Should extract person name, got: ${JSON.stringify(parsed.entities)}`);
  });

  // === Relation Extraction ===

  test('Extract relation keywords', () => {
    const parsed = queryParser.parse('Who created Bug #123?');
    assertTrue(parsed.relations.length > 0, 'Should extract relation');
    assertEqual(parsed.relations[0].type, 'AUTHORED_BY');
  });

  test('Relation direction inference', () => {
    const parsed = queryParser.parse('What does UMOJA use?');
    const usesRel = parsed.relations.find(r => r.type === 'USES');
    assertTrue(usesRel !== undefined, 'Should find USES relation');
    assertEqual(usesRel.direction, 'outgoing');
  });

  // === Constraint Extraction ===

  test('Extract type constraint', () => {
    const parsed = queryParser.parse('Find items of type WorkItem');
    const typeConstraint = parsed.constraints.find(c => c.field === 'type');
    assertTrue(typeConstraint !== undefined, 'Should extract type constraint');
  });

  test('Extract status constraint', () => {
    const parsed = queryParser.parse('Show bugs where status is active');
    const statusConstraint = parsed.constraints.find(c => c.field === 'status');
    assertTrue(statusConstraint !== undefined, 'Should extract status constraint');
    assertEqual(statusConstraint.value, 'active');
  });

  // === Temporal Extraction ===

  test('Extract temporal (today)', () => {
    const parsed = queryParser.parse('What was created today?');
    assertTrue(parsed.temporal !== null);
    assertEqual(parsed.temporal.keyword, 'today');
    assertTrue(parsed.temporal.range.start !== null);
    assertTrue(parsed.temporal.range.end !== null);
  });

  test('Extract temporal (this month)', () => {
    const parsed = queryParser.parse('Show changes this month');
    assertTrue(parsed.temporal !== null);
    assertEqual(parsed.temporal.keyword, 'this month');
  });

  // === Limit Extraction ===

  test('Extract explicit limit', () => {
    const parsed = queryParser.parse('Show top 5 systems');
    assertEqual(parsed.limit, 5);
  });

  test('Default limit for "all"', () => {
    const parsed = queryParser.parse('List all bugs');
    assertEqual(parsed.limit, 100);
  });

  // === Batch Parse ===

  test('Batch parse', () => {
    const results = queryParser.parseBatch([
      'What is UMOJA?',
      'Who created Bug #1?',
      'List all systems'
    ]);
    assertEqual(results.length, 3);
    assertEqual(results[0].intent, QueryIntent.FACTUAL);
    assertEqual(results[1].intent, QueryIntent.RELATIONAL);
    assertEqual(results[2].intent, QueryIntent.AGGREGATION);
  });

  // === Statistics ===

  test('Parser statistics', () => {
    const stats = queryParser.getStats();
    assertTrue(stats.totalParsed > 0, 'Should track parsed count');
    assertTrue(Object.keys(stats.byIntent).length > 0, 'Should track by intent');
  });

  test('Singleton instance', () => {
    assertTrue(queryParser !== null);
    assertTrue(queryParser instanceof QueryParser);
  });
}

function testQueryPlanner() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing Query Planner');
  console.log('═══════════════════════════════════════════════════════════════');

  test('Planner instantiation', () => {
    const planner = new QueryPlanner();
    assertTrue(planner !== null);
    assertEqual(planner.options.maxPathLength, 5);
  });

  test('Custom options', () => {
    const planner = createQueryPlanner({ maxPathLength: 10 });
    assertEqual(planner.options.maxPathLength, 10);
  });

  // === Plan Generation by Intent ===

  test('Plan FACTUAL query', () => {
    const parsed = queryParser.parse('What is UMOJA?');
    const plan = queryPlanner.plan(parsed);
    assertTrue(plan.steps.length >= 2, `Should have >=2 steps, got ${plan.steps.length}`);

    const ops = plan.steps.map(s => s.operation);
    assertTrue(ops.includes(QueryOperation.FIND_NODE), 'Should include FIND_NODE');
    assertTrue(ops.includes(QueryOperation.GET_NODE_ATTRIBUTES), 'Should include GET_NODE_ATTRIBUTES');
    assertTrue(plan.estimatedCost > 0, 'Should have estimated cost');
  });

  test('Plan RELATIONAL query', () => {
    const parsed = queryParser.parse('Who created Bug #789?');
    const plan = queryPlanner.plan(parsed);
    assertTrue(plan.steps.length >= 2, `Should have >=2 steps, got ${plan.steps.length}`);

    const ops = plan.steps.map(s => s.operation);
    assertTrue(ops.includes(QueryOperation.FIND_NODE), 'Should include FIND_NODE');
    assertTrue(ops.includes(QueryOperation.FIND_RELATIONS), 'Should include FIND_RELATIONS');
  });

  test('Plan PATH query', () => {
    const parsed = queryParser.parse('Find path from UMOJA to ERP');
    const plan = queryPlanner.plan(parsed);
    assertTrue(plan.steps.length >= 3, `Should have >=3 steps, got ${plan.steps.length}`);

    const ops = plan.steps.map(s => s.operation);
    assertTrue(ops.includes(QueryOperation.FIND_PATH), 'Should include FIND_PATH');
    assertTrue(ops.includes(QueryOperation.FIND_ALL_PATHS), 'Should include FIND_ALL_PATHS');
    assertTrue(plan.estimatedCost >= 30, 'Path queries should be expensive');
  });

  test('Plan AGGREGATION query', () => {
    const parsed = queryParser.parse('How many bugs are assigned to John Smith?');
    const plan = queryPlanner.plan(parsed);
    assertTrue(plan.steps.length >= 2, `Should have >=2 steps, got ${plan.steps.length}`);

    const ops = plan.steps.map(s => s.operation);
    assertTrue(ops.includes(QueryOperation.COUNT), 'Should include COUNT');
    assertTrue(ops.includes(QueryOperation.LIST), 'Should include LIST');
  });

  test('Plan COMPARISON query', () => {
    const parsed = queryParser.parse('Compare UMOJA and ERP');
    const plan = queryPlanner.plan(parsed);
    assertTrue(plan.steps.length >= 4, `Should have >=4 steps, got ${plan.steps.length}`);

    const ops = plan.steps.map(s => s.operation);
    const findNodeCount = ops.filter(o => o === QueryOperation.FIND_NODE).length;
    assertTrue(findNodeCount >= 2, 'Should find both entities');
  });

  test('Plan TEMPORAL query', () => {
    const parsed = queryParser.parse('What changed last week?');
    const plan = queryPlanner.plan(parsed);
    assertTrue(plan.steps.length >= 1, `Should have >=1 step, got ${plan.steps.length}`);

    const ops = plan.steps.map(s => s.operation);
    assertTrue(ops.includes(QueryOperation.FIND_NODES), 'Should include FIND_NODES');
  });

  test('Plan COMPLEX query', () => {
    const parsed = queryParser.parse('Analyze everything about "System Alpha" and its subsystems');
    const plan = queryPlanner.plan(parsed);
    assertTrue(plan.steps.length >= 1, `Should have >=1 step, got ${plan.steps.length}`);

    const ops = plan.steps.map(s => s.operation);
    assertTrue(ops.includes(QueryOperation.SUBGRAPH), 'Should include SUBGRAPH');
  });

  // === Plan Dependencies ===

  test('Plan step dependencies', () => {
    const parsed = queryParser.parse('What is UMOJA?');
    const plan = queryPlanner.plan(parsed);

    // First step should have no dependencies
    assertEqual(plan.steps[0].dependsOn.length, 0, 'First step should have no dependencies');

    // Later steps should depend on entity
    const dependentSteps = plan.steps.filter(s => s.dependsOn.length > 0);
    assertTrue(dependentSteps.length > 0, 'Should have dependent steps');
  });

  test('Plan output keys', () => {
    const parsed = queryParser.parse('Find path from UMOJA to ERP');
    const plan = queryPlanner.plan(parsed);

    const outputKeys = plan.steps.map(s => s.outputKey);
    assertTrue(outputKeys.includes('source'), 'Should have source output key');
    assertTrue(outputKeys.includes('target'), 'Should have target output key');
    assertTrue(outputKeys.includes('path'), 'Should have path output key');
  });

  // === Cost Estimation ===

  test('Cost estimation varies by complexity', () => {
    const factual = queryPlanner.plan(queryParser.parse('What is UMOJA?'));
    const path = queryPlanner.plan(queryParser.parse('Find path from UMOJA to ERP'));

    assertTrue(path.estimatedCost > factual.estimatedCost,
      `Path (${path.estimatedCost}) should cost more than factual (${factual.estimatedCost})`);
  });

  // === Statistics ===

  test('Planner statistics', () => {
    const stats = queryPlanner.getStats();
    assertTrue(stats.totalPlans > 0, 'Should track plan count');
    assertTrue(Object.keys(stats.byIntent).length > 0, 'Should track by intent');
  });

  test('Singleton instance', () => {
    assertTrue(queryPlanner !== null);
    assertTrue(queryPlanner instanceof QueryPlanner);
  });
}

function testIntegration() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Testing Integration');
  console.log('═══════════════════════════════════════════════════════════════');

  test('Full parse → plan pipeline', () => {
    const queries = [
      'What is UMOJA?',
      'Who created Bug #123?',
      'Find path from UMOJA to ERP',
      'How many systems are there?',
      'Compare UMOJA and Inspira',
      'What changed last month?'
    ];

    for (const q of queries) {
      const parsed = queryParser.parse(q);
      const plan = queryPlanner.plan(parsed);

      assertTrue(parsed.intent !== undefined, `${q}: should have intent`);
      assertTrue(plan.steps.length > 0, `${q}: should have plan steps`);
      assertTrue(plan.estimatedCost > 0, `${q}: should have cost`);
      assertEqual(plan.queryId, parsed.id, `${q}: plan queryId should match parsed id`);
    }
  });

  test('Module exports correctly', () => {
    const mod = require('../../src/services/query');

    assertTrue(mod.QueryIntent !== undefined);
    assertTrue(mod.QueryOperation !== undefined);
    assertTrue(mod.ParsedQuery !== undefined);
    assertTrue(mod.ExecutionPlan !== undefined);
    assertTrue(mod.QueryResult !== undefined);
    assertTrue(mod.QueryParser !== undefined);
    assertTrue(mod.createQueryParser !== undefined);
    assertTrue(mod.queryParser !== undefined);
    assertTrue(mod.QueryPlanner !== undefined);
    assertTrue(mod.createQueryPlanner !== undefined);
    assertTrue(mod.queryPlanner !== undefined);
  });
}

// ═══════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           Query Parser & Planner Tests (Task 6.1)            ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  try {
    testQueryTypes();
    testQueryParser();
    testQueryPlanner();
    testIntegration();

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
