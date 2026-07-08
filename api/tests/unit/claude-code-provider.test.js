/**
 * Unit test — TASK-Р1-PROVIDER Step 2: Claude Code CLI provider.
 *
 * No live CLI spawn — tests extractJSON logic, binary resolver export, and that
 * StructuredOutputService routes provider='claude-code' to _generateWithClaudeCode
 * and defaults to 'claude-code'.
 *
 * Run: node api/tests/unit/claude-code-provider.test.js
 */

'use strict';

const assert = require('assert');
const { extractJSON, invokeClaudeCode } = require('../../src/services/ai/providers/claude-code.provider');
const { findClaudeBinary } = require('../../src/services/agents/claude-code-reanalyze.service');
const { createStructuredOutputService, structuredOutput } = require('../../src/services/ai/structured-output');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}

(async () => {
  console.log('TASK-Р1-PROVIDER Step 2 — Claude Code provider\n');

  await test('extractJSON: direct JSON', () => {
    assert.deepStrictEqual(extractJSON('{"a":1}'), { a: 1 });
  });

  await test('extractJSON: fenced ```json block', () => {
    assert.deepStrictEqual(extractJSON('here:\n```json\n{"b":2}\n```\ndone'), { b: 2 });
  });

  await test('extractJSON: embedded object in prose', () => {
    assert.deepStrictEqual(extractJSON('The result is {"c":3} as requested.'), { c: 3 });
  });

  await test('extractJSON: array fallback', () => {
    assert.deepStrictEqual(extractJSON('output: [1,2,3]'), [1, 2, 3]);
  });

  await test('extractJSON: unparseable → null', () => {
    assert.strictEqual(extractJSON('no json here'), null);
    assert.strictEqual(extractJSON(''), null);
    assert.strictEqual(extractJSON(null), null);
  });

  await test('invokeClaudeCode and findClaudeBinary are exported functions', () => {
    assert.strictEqual(typeof invokeClaudeCode, 'function');
    assert.strictEqual(typeof findClaudeBinary, 'function');
  });

  await test('StructuredOutputService default provider is claude-code', () => {
    const svc = createStructuredOutputService();
    assert.strictEqual(svc.options.defaultProvider, 'claude-code');
  });

  await test("generate() routes provider='claude-code' to _generateWithClaudeCode", async () => {
    const svc = createStructuredOutputService();
    let called = null;
    svc._generateWithClaudeCode = async (prompt, schema, options) => {
      called = { prompt, schema, options };
      return { success: true, data: { routed: true } };
    };
    const res = await svc.generate('PROMPT', 'TaskPlan', { provider: 'claude-code' });
    assert.ok(called, '_generateWithClaudeCode must be invoked');
    assert.strictEqual(called.prompt, 'PROMPT');
    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(res.data, { routed: true });
  });

  await test('singleton structuredOutput exposes _generateWithClaudeCode', () => {
    assert.strictEqual(typeof structuredOutput._generateWithClaudeCode, 'function');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
