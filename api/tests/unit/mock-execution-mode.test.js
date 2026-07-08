/**
 * Unit test — TASK-P2-001: MockExecutionMode in RuntimeEngine (Level 2.5 dry-run).
 *
 * Verifies that RuntimeEngine.execute(dag, input, { mode: 'mock' }):
 *   - does NOT call the real tool.execute() (side-effect free),
 *   - still runs template resolution → catches UNRESOLVED_TEMPLATE (data-flow defect),
 *   - synthesizes outputs from the tool's declared outputSchema so valid refs resolve.
 *
 * Run: node api/tests/unit/mock-execution-mode.test.js
 */

'use strict';

const assert = require('assert');
const { RuntimeEngine } = require('../../src/runtime/RuntimeEngine');

// Real execute must never run in mock mode — throw if it does.
function makeTool(outputSchema) {
  return {
    getDefinition: () => ({ inputSchema: {}, outputSchema: outputSchema || {} }),
    execute: async () => { throw new Error('REAL_EXECUTE_CALLED'); },
  };
}

function makeRegistry(tools) {
  return {
    getTool: (id) => tools[id] || null,
    listTools: () => Object.keys(tools).map(id => ({ id })),
  };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}

(async () => {
  console.log('TASK-P2-001 — MockExecutionMode\n');

  await test('mock run completes without calling real execute; valid template resolves', async () => {
    const tools = {
      producer: makeTool({ properties: { value: { type: 'string' } } }),
      consumer: makeTool({}),
    };
    const engine = new RuntimeEngine(makeRegistry(tools), { enableValidation: false });
    const dag = {
      nodes: [
        { id: 'n1', executorType: 'producer' },
        { id: 'n2', executorType: 'consumer', parameters: { ref: '{{n1.value}}' } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    };
    const res = await engine.execute(dag, {}, { mode: 'mock' });
    assert.strictEqual(res.status, 'COMPLETED', `expected COMPLETED, got ${res.status} (${JSON.stringify(res.nodeResults)})`);
    // real execute would have thrown REAL_EXECUTE_CALLED and failed the nodes
    assert.strictEqual(res.metrics.nodesFailed, 0, 'no node should fail in a valid mock run');
  });

  await test('mock run flags UNRESOLVED_TEMPLATE for a ref to an undeclared field', async () => {
    const tools = {
      producer: makeTool({ properties: { value: { type: 'string' } } }), // declares 'value', not 'missing'
      consumer: makeTool({}),
    };
    const engine = new RuntimeEngine(makeRegistry(tools), { enableValidation: false });
    const dag = {
      nodes: [
        { id: 'n1', executorType: 'producer' },
        { id: 'n2', executorType: 'consumer', parameters: { ref: '{{n1.missing}}' } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    };
    const res = await engine.execute(dag, {}, { mode: 'mock' });
    assert.strictEqual(res.status, 'FAILED', `expected FAILED, got ${res.status}`);
    assert.strictEqual(res.nodeResults.n2.error, 'UNRESOLVED_TEMPLATE',
      `expected UNRESOLVED_TEMPLATE on n2, got ${res.nodeResults.n2.error}`);
  });

  await test('normal (non-mock) run DOES call real execute (guard is off by default)', async () => {
    const tools = { producer: makeTool({ properties: { value: { type: 'string' } } }) };
    const engine = new RuntimeEngine(makeRegistry(tools), { enableValidation: false });
    const dag = { nodes: [{ id: 'n1', executorType: 'producer' }], edges: [] };
    const res = await engine.execute(dag, {}); // no mock
    // real execute throws → node fails; proves mock guard did not leak into normal path
    assert.strictEqual(res.status, 'FAILED');
    assert.strictEqual(res.nodeResults.n1.error, 'EXECUTION_ERROR');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
