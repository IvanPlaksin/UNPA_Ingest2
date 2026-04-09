/**
 * Tests for Answer Generator (Task 6.3)
 */

const assert = require('assert');

const testResults = { passed: 0, failed: 0, failures: [] };

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(() => {
        console.log(`  \u2713 ${name}`);
        testResults.passed++;
      }).catch(err => {
        console.log(`  \u2717 ${name}: ${err.message}`);
        testResults.failed++;
        testResults.failures.push(name);
      });
    }
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
// Mock data builders
// ═══════════════════════════════════════════════════════════════

const {
  AnswerGenerator, createAnswerGenerator, answerGenerator,
  QueryResult, QueryIntent, ParsedQuery,
  QueryParser, QueryPlanner, QueryExecutor, createQueryExecutor
} = require('../../src/services/query');

function mockResult(overrides = {}) {
  return new QueryResult({
    queryId: 'test',
    success: true,
    data: [{ id: 'umoja', name: 'UMOJA', type: 'System', found: true, attributes: { description: 'ERP system', status: 'active' } }],
    ...overrides
  });
}

function mockQuery(overrides = {}) {
  return new ParsedQuery({
    originalText: 'What is UMOJA?',
    intent: QueryIntent.FACTUAL,
    entities: [{ name: 'UMOJA', type: 'System' }],
    confidence: 0.9,
    ...overrides
  });
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

function testBasics() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Basics');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  test('Instantiation', () => {
    const gen = new AnswerGenerator();
    assertTrue(gen !== null);
    assertEqual(gen.options.defaultFormat, 'detailed');
    assertEqual(gen.options.maxCitations, 5);
  });

  test('Custom options', () => {
    const gen = createAnswerGenerator({ defaultFormat: 'brief', maxCitations: 3 });
    assertEqual(gen.options.defaultFormat, 'brief');
    assertEqual(gen.options.maxCitations, 3);
  });

  test('Singleton instance', () => {
    assertTrue(answerGenerator !== null);
    assertTrue(answerGenerator instanceof AnswerGenerator);
  });
}

function testFactualAnswers() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing FACTUAL Answers');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const gen = new AnswerGenerator();

  test('Factual answer with entity found', () => {
    const result = mockResult();
    const query = mockQuery();
    const answer = gen.generate(result, query);
    assertTrue(typeof answer.answer === 'string');
    assertTrue(answer.answer.includes('UMOJA'), `Should mention UMOJA: ${answer.answer}`);
    assertTrue(answer.answer.includes('System'), `Should mention type: ${answer.answer}`);
    assertTrue(answer.confidence > 0);
  });

  test('Factual answer includes attributes', () => {
    const result = mockResult();
    const query = mockQuery();
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes('description') || answer.answer.includes('status') || answer.answer.includes('ERP'),
      `Should include attributes: ${answer.answer}`);
  });

  test('Factual answer with entity not found', () => {
    const result = mockResult({ data: [] });
    const query = mockQuery({ originalText: 'What is XYZ?' });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes("couldn't find"), `Should indicate not found: ${answer.answer}`);
  });

  test('Factual answer citations', () => {
    const result = mockResult();
    const query = mockQuery();
    const answer = gen.generate(result, query);
    assertTrue(answer.citations.length > 0, 'Should have citations');
    assertEqual(answer.citations[0].name, 'UMOJA');
  });
}

function testRelationalAnswers() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing RELATIONAL Answers');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const gen = new AnswerGenerator();

  test('Relational answer with relations', () => {
    const result = mockResult({
      data: [
        { id: 'john', name: 'John', type: 'Person', found: true },
        { id: 'bug1', name: 'Bug #1', type: 'WorkItem', role: 'target', connectedNode: { name: 'Bug #1' }, type: 'ASSIGNED_TO' }
      ]
    });
    const query = mockQuery({ intent: QueryIntent.RELATIONAL, originalText: 'Who created Bug #1?' });
    const answer = gen.generate(result, query);
    assertTrue(typeof answer.answer === 'string');
    assertTrue(answer.answer.includes('John'), `Should mention John: ${answer.answer}`);
  });

  test('Relational answer no relations', () => {
    const result = mockResult({ data: [] });
    const query = mockQuery({ intent: QueryIntent.RELATIONAL, originalText: 'Who created Bug #999?' });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes("couldn't find"), `Should indicate not found: ${answer.answer}`);
  });
}

function testPathAnswers() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing PATH Answers');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const gen = new AnswerGenerator();

  test('Path answer with path found', () => {
    const result = mockResult({
      paths: [{
        found: true,
        path: [{ id: 'a', name: 'UMOJA' }, { id: 'b', name: 'Middleware' }, { id: 'c', name: 'ERP' }],
        length: 2
      }]
    });
    const query = mockQuery({
      intent: QueryIntent.PATH,
      entities: [{ name: 'UMOJA' }, { name: 'ERP' }]
    });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes('connected'), `Should describe connection: ${answer.answer}`);
    assertTrue(answer.answer.includes('\u2192') || answer.answer.includes('step'), `Should show path: ${answer.answer}`);
  });

  test('Path answer with no path', () => {
    const result = mockResult({ paths: [] });
    const query = mockQuery({
      intent: QueryIntent.PATH,
      entities: [{ name: 'A' }, { name: 'B' }]
    });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes("couldn't find"), `Should indicate no path: ${answer.answer}`);
  });

  test('Path answer with multiple paths', () => {
    const result = mockResult({
      paths: [
        { found: true, path: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] },
        { found: true, path: [{ name: 'A' }, { name: 'D' }, { name: 'C' }] }
      ]
    });
    const query = mockQuery({
      intent: QueryIntent.PATH,
      entities: [{ name: 'A' }, { name: 'C' }]
    });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes('2 path'), `Should mention multiple paths: ${answer.answer}`);
  });
}

function testAggregationAnswers() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing AGGREGATION Answers');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const gen = new AnswerGenerator();

  test('Count answer', () => {
    const result = mockResult({ aggregations: { count: 5 } });
    const query = mockQuery({ intent: QueryIntent.AGGREGATION, originalText: 'How many systems?' });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes('5'), `Should include count: ${answer.answer}`);
    assertTrue(answer.answer.includes('system'), `Should include type: ${answer.answer}`);
  });

  test('List answer', () => {
    const result = mockResult({
      data: [
        { id: '1', name: 'System A', type: 'System' },
        { id: '2', name: 'System B', type: 'System' },
        { id: '3', name: 'System C', type: 'System' }
      ]
    });
    const query = mockQuery({ intent: QueryIntent.AGGREGATION, originalText: 'List all systems' });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes('Found') || answer.answer.includes('3'), `Should list items: ${answer.answer}`);
  });

  test('Grouped answer', () => {
    const result = mockResult({
      aggregations: {
        groups: { System: [{ id: '1' }, { id: '2' }], Person: [{ id: '3' }] },
        counts: { System: 2, Person: 1 }
      }
    });
    const query = mockQuery({ intent: QueryIntent.AGGREGATION, originalText: 'Show all items' });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes('Grouped') || answer.answer.includes('System'), `Should show groups: ${answer.answer}`);
  });
}

function testComparisonAnswers() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing COMPARISON Answers');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const gen = new AnswerGenerator();

  test('Comparison with two entities', () => {
    const result = mockResult({
      data: [
        { id: 'a', name: 'UMOJA', type: 'System', found: true, attributes: { version: '2.0' } },
        { id: 'b', name: 'Inspira', type: 'System', found: true, attributes: { version: '3.1' } }
      ]
    });
    const query = mockQuery({ intent: QueryIntent.COMPARISON, entities: [{ name: 'UMOJA' }, { name: 'Inspira' }] });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes('Comparison'), `Should indicate comparison: ${answer.answer}`);
    assertTrue(answer.answer.includes('UMOJA') && answer.answer.includes('Inspira'));
  });

  test('Comparison with insufficient data', () => {
    const result = mockResult({ data: [{ id: 'a', name: 'UMOJA', type: 'System' }] });
    const query = mockQuery({ intent: QueryIntent.COMPARISON });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes("couldn't find enough"), `Should indicate missing data: ${answer.answer}`);
  });
}

function testTemporalAnswers() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing TEMPORAL Answers');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const gen = new AnswerGenerator();

  test('Temporal answer with items', () => {
    const result = mockResult({
      data: [
        { id: '1', name: 'Bug Fix', type: 'WorkItem', createdAt: '2025-03-01' },
        { id: '2', name: 'Feature', type: 'WorkItem', createdAt: '2025-03-02' }
      ]
    });
    const query = mockQuery({ intent: QueryIntent.TEMPORAL, temporal: { keyword: 'last week' } });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes('2 item'), `Should mention item count: ${answer.answer}`);
    assertTrue(answer.answer.includes('last week'), `Should mention timeframe: ${answer.answer}`);
  });

  test('Temporal answer no items', () => {
    const result = mockResult({ data: [] });
    const query = mockQuery({ intent: QueryIntent.TEMPORAL, temporal: { keyword: 'today' } });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes('No changes'), `Should indicate no changes: ${answer.answer}`);
  });
}

function testComplexAnswers() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing COMPLEX Answers');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const gen = new AnswerGenerator();

  test('Complex answer with data', () => {
    const result = mockResult({
      data: [
        { id: '1', name: 'UMOJA', type: 'System' },
        { id: '2', name: 'John', type: 'Person' }
      ],
      paths: [{ found: true, path: [{ name: 'A' }, { name: 'B' }] }]
    });
    const query = mockQuery({ intent: QueryIntent.COMPLEX });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes('Found'), `Should summarize findings: ${answer.answer}`);
  });

  test('Complex answer with no data', () => {
    const result = mockResult({ data: [], paths: [] });
    const query = mockQuery({ intent: QueryIntent.COMPLEX });
    const answer = gen.generate(result, query);
    assertTrue(answer.answer.includes("couldn't find"), `Should indicate no results: ${answer.answer}`);
  });
}

function testFormats() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Formats');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const gen = new AnswerGenerator();
  const result = mockResult();
  const query = mockQuery();

  test('Brief format', () => {
    const answer = gen.generateBrief(result, query);
    assertTrue(typeof answer.answer === 'string');
    assertTrue(answer.answer.length <= 151, `Brief should be short: ${answer.answer.length} chars`);
    assertEqual(answer.metadata.format, 'brief');
  });

  test('Detailed format', () => {
    const answer = gen.generateDetailed(result, query);
    assertTrue(typeof answer.answer === 'string');
    assertEqual(answer.metadata.format, 'detailed');
  });

  test('Structured format', () => {
    const answer = gen.generateStructured(result, query);
    assertTrue(typeof answer.answer === 'object', 'Structured should return object');
    assertTrue(answer.answer.summary !== undefined, 'Should have summary');
    assertTrue(answer.answer.details !== undefined, 'Should have details');
    assertTrue(answer.answer.data !== undefined, 'Should have data');
    assertTrue(answer.answer.data.entities !== undefined, 'Should have entities');
    assertEqual(answer.metadata.format, 'structured');
  });
}

function testConfidenceAndCitations() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Confidence & Citations');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  const gen = new AnswerGenerator();

  test('Confidence with found data', () => {
    const result = mockResult();
    const query = mockQuery();
    const answer = gen.generate(result, query);
    assertTrue(answer.confidence >= 0.7, `Should have high confidence for found data: ${answer.confidence}`);
  });

  test('Confidence with no data', () => {
    const result = mockResult({ data: [], success: true });
    const query = mockQuery();
    const answer = gen.generate(result, query);
    assertTrue(answer.confidence <= 0.7, `Should have lower confidence for no data: ${answer.confidence}`);
  });

  test('Confidence with failed result', () => {
    const result = new QueryResult({ success: false });
    const query = mockQuery();
    const answer = gen.generate(result, query);
    assertEqual(answer.confidence, 0, 'Failed result should have 0 confidence');
  });

  test('Citations from data', () => {
    const result = mockResult({
      data: [
        { id: 'a', name: 'A', type: 'System', found: true },
        { id: 'b', name: 'B', type: 'Person' }
      ]
    });
    const query = mockQuery();
    const answer = gen.generate(result, query);
    assertTrue(answer.citations.length === 2, `Should have 2 citations, got ${answer.citations.length}`);
    assertEqual(answer.citations[0].relevance, 'primary');
  });

  test('Citations capped by maxCitations', () => {
    const gen2 = createAnswerGenerator({ maxCitations: 2 });
    const result = mockResult({
      data: [
        { id: '1', name: 'A', type: 'X' },
        { id: '2', name: 'B', type: 'X' },
        { id: '3', name: 'C', type: 'X' },
        { id: '4', name: 'D', type: 'X' }
      ]
    });
    const query = mockQuery();
    const answer = gen2.generate(result, query);
    assertTrue(answer.citations.length <= 2, `Should cap at 2 citations, got ${answer.citations.length}`);
  });
}

function testErrorHandling() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('Testing Error Handling & Statistics');
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  test('Statistics tracking', () => {
    const gen = new AnswerGenerator();
    gen.generate(mockResult(), mockQuery());
    gen.generate(mockResult(), mockQuery({ intent: QueryIntent.RELATIONAL }));
    const stats = gen.getStats();
    assertEqual(stats.totalGenerated, 2);
    assertTrue(Object.keys(stats.byIntent).length >= 1);
    assertTrue(Object.keys(stats.byFormat).length >= 1);
  });

  test('Module exports', () => {
    const mod = require('../../src/services/query');
    assertTrue(mod.AnswerGenerator !== undefined);
    assertTrue(mod.createAnswerGenerator !== undefined);
    assertTrue(mod.answerGenerator !== undefined);
  });
}

// ═══════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551           Answer Generator Tests (Task 6.3)                  \u2551');
  console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');

  try {
    testBasics();
    testFactualAnswers();
    testRelationalAnswers();
    testPathAnswers();
    testAggregationAnswers();
    testComparisonAnswers();
    testTemporalAnswers();
    testComplexAnswers();
    testFormats();
    testConfidenceAndCitations();
    testErrorHandling();

    console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log(`Results: ${testResults.passed} passed, ${testResults.failed} failed`);
    console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

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
