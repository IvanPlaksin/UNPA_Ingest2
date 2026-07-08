/**
 * Unit test — TASK-P1-002: Constrained decoding wiring.
 *
 * Verifies (WITHOUT any live LLM call) that the constrained-decoding path
 * (StructuredOutputService) is correctly wired into the SDA pipeline:
 *   1. StructuredOutputService exposes generateStructured (the method SDA calls).
 *   2. generateStructured delegates to generate() with the same (prompt, schema, options).
 *   3. The SDA schemas (ProcessRepresentation / TaskPlan / IntentDescriptor) are registered.
 *   4. TaskPlanner._getLlmService() returns a service exposing generateStructured.
 *   5. createIntentClassifier() defaults to a structured-capable service.
 *
 * Run: node api/tests/unit/constrained-decoding-wiring.test.js
 */

'use strict';

const assert = require('assert');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n    ${err.message}`);
  }
}

console.log('TASK-P1-002 — Constrained decoding wiring\n');

// 1 + 2: alias exists and delegates to generate()
test('StructuredOutputService.generateStructured exists and delegates to generate()', () => {
  const { structuredOutput } = require('../../src/services/ai/structured-output');
  assert.strictEqual(typeof structuredOutput.generateStructured, 'function',
    'generateStructured must be a function');

  // Stub generate() to avoid any provider/network call
  let captured = null;
  const originalGenerate = structuredOutput.generate;
  structuredOutput.generate = async (prompt, schema, options) => {
    captured = { prompt, schema, options };
    return { success: true, data: { stubbed: true } };
  };

  return structuredOutput.generateStructured('PROMPT', 'TaskPlan', { temperature: 0.1 })
    .then((res) => {
      structuredOutput.generate = originalGenerate; // restore
      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.data, { stubbed: true });
      assert.strictEqual(captured.prompt, 'PROMPT');
      assert.strictEqual(captured.schema, 'TaskPlan');
      assert.strictEqual(captured.options.temperature, 0.1);
    })
    .catch((e) => { structuredOutput.generate = originalGenerate; throw e; });
});

// 3: SDA schemas registered
test('SDA schemas are registered (ProcessRepresentation, TaskPlan, IntentDescriptor)', () => {
  const { structuredOutput } = require('../../src/services/ai/structured-output');
  for (const name of ['ProcessRepresentation', 'TaskPlan', 'IntentDescriptor']) {
    assert.ok(structuredOutput.schemaRegistry.has(name),
      `schema '${name}' must be registered`);
  }
});

// 4: TaskPlanner uses a structured-capable service
test('TaskPlanner._getLlmService() exposes generateStructured', () => {
  const { createTaskPlanner } = require('../../src/services/graph/task-planner');
  const planner = createTaskPlanner();
  const svc = planner._getLlmService();
  assert.ok(svc, 'llm service must resolve');
  assert.strictEqual(typeof svc.generateStructured, 'function',
    'TaskPlanner LLM service must expose generateStructured');
});

// 5: IntentClassifier defaults to a structured-capable service
test('createIntentClassifier() defaults to a structured-capable service', () => {
  const { createIntentClassifier } = require('../../src/services/graph/intent-classifier');
  const clf = createIntentClassifier();
  assert.ok(clf.llmService, 'default llmService must be set');
  assert.strictEqual(typeof clf.llmService.generateStructured, 'function',
    'default llmService must expose generateStructured');
});

// Allow async test (#1) to settle before summarizing
setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}, 200);
