#!/usr/bin/env node
/**
 * Conditional Branching + Template Resolution Test
 *
 * Verifies Priority 8 features:
 *   Test 1 — True/False conditional branching (only matching branch executes)
 *   Test 2 — Template resolution ({{input.x}} and {{nodeId.field}})
 *   Test 3 — Cross-node reference in condition (condition reads previous node output)
 *   Test 4 — Untaken branch descendants are SKIPPED recursively
 *   Test 5 — ExecutionContext stores all node outputs
 *
 * Usage:
 *   node api/scripts/test-conditional.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.chdir(path.join(__dirname, '..'));

process.env.MOCK_LLM = '1';

// ====================================================================
// HELPERS
// ====================================================================

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
  return condition;
}

function section(title) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(64)}`);
}

// ====================================================================
// SETUP: Load plugins + registry
// ====================================================================

async function setup() {
  const { initializeAOPEG, pluginRegistry } = require('../src/core/aopeg/index');
  const { AOPEGAdapter } = require('../src/runtime/integration');

  await initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });
  const adapter = new AOPEGAdapter(pluginRegistry);
  const registry = adapter.createMcpCompatibleRegistry();

  const stats = pluginRegistry.getStats();
  console.log(`  Plugins: ${stats.pluginCount}, Executors: ${stats.executorCount}`);

  return { registry, pluginRegistry };
}

// ====================================================================
// DAG BUILDERS
// ====================================================================

/**
 * Test 1 DAG: Simple conditional branching
 *
 *   START → SET_X(x=10) → CONDITION(x > 5) →[true]→ SET_TRUE → END
 *                                            →[false]→ SET_FALSE → END2
 *
 * Expected: SET_TRUE executes, SET_FALSE is SKIPPED
 */
function buildTrueFalseDag() {
  return {
    nodes: [
      { id: 'N01', executorType: 'workflow.start', parameters: {} },
      { id: 'N02', executorType: 'workflow.set_variable', parameters: { name: 'x', value: 10 } },
      { id: 'N03', executorType: 'workflow.condition', parameters: { expression: 'x > 5' } },
      { id: 'N04', executorType: 'workflow.set_variable', parameters: { name: 'result_true', value: 'yes' } },
      { id: 'N05', executorType: 'workflow.set_variable', parameters: { name: 'result_false', value: 'no' } },
      { id: 'N06', executorType: 'workflow.end', parameters: {} },
      { id: 'N07', executorType: 'workflow.end', parameters: {} },
    ],
    edges: [
      { sourceNodeId: 'N01', targetNodeId: 'N02' },
      { sourceNodeId: 'N02', targetNodeId: 'N03' },
      { sourceNodeId: 'N03', targetNodeId: 'N04', label: 'true' },
      { sourceNodeId: 'N03', targetNodeId: 'N05', label: 'false' },
      { sourceNodeId: 'N04', targetNodeId: 'N06' },
      { sourceNodeId: 'N05', targetNodeId: 'N07' },
    ]
  };
}

/**
 * Test 2 DAG: Template resolution
 *
 *   START → AI_GENERATE(prompt="Hello {{input.user}}") → END
 *
 * Expected: Template resolves to "Hello Alice" before execution
 */
function buildTemplateDag() {
  return {
    nodes: [
      { id: 'T01', executorType: 'workflow.start', parameters: {} },
      { id: 'T02', executorType: 'ai.generate', parameters: { system_prompt: 'You are a greeter', user_prompt: 'Hello {{input.user}}', mock_response: 'Greeting processed for {{input.user}}' } },
      { id: 'T03', executorType: 'workflow.end', parameters: {} },
    ],
    edges: [
      { sourceNodeId: 'T01', targetNodeId: 'T02' },
      { sourceNodeId: 'T02', targetNodeId: 'T03' },
    ]
  };
}

/**
 * Test 3 DAG: Cross-node reference in condition
 *
 *   START → SET_SCORE(name=score, value=85) → CONDITION(score >= 70) →[true]→ SET_PASS → END
 *                                                                    →[false]→ SET_FAIL → END2
 *
 * Expected: SET_SCORE output stored in ExecutionContext, condition accesses via getExpressionContext()
 */
function buildCrossNodeDag() {
  return {
    nodes: [
      { id: 'C01', executorType: 'workflow.start', parameters: {} },
      { id: 'C02', executorType: 'workflow.set_variable', parameters: { name: 'score', value: 85 } },
      { id: 'C03', executorType: 'workflow.condition', parameters: { expression: 'score >= 70' } },
      { id: 'C04', executorType: 'workflow.set_variable', parameters: { name: 'status', value: 'passed' } },
      { id: 'C05', executorType: 'workflow.set_variable', parameters: { name: 'status', value: 'failed' } },
      { id: 'C06', executorType: 'workflow.end', parameters: {} },
      { id: 'C07', executorType: 'workflow.end', parameters: {} },
    ],
    edges: [
      { sourceNodeId: 'C01', targetNodeId: 'C02' },
      { sourceNodeId: 'C02', targetNodeId: 'C03' },
      { sourceNodeId: 'C03', targetNodeId: 'C04', label: 'true' },
      { sourceNodeId: 'C03', targetNodeId: 'C05', label: 'false' },
      { sourceNodeId: 'C04', targetNodeId: 'C06' },
      { sourceNodeId: 'C05', targetNodeId: 'C07' },
    ]
  };
}

/**
 * Test 4 DAG: Recursive skip of untaken branch descendants
 *
 *   START → COND(false) →[true]→ A → B → END1
 *                        →[false]→ C → END2
 *
 * Expected: A, B, END1 are all SKIPPED; C, END2 execute
 */
function buildRecursiveSkipDag() {
  return {
    nodes: [
      { id: 'R01', executorType: 'workflow.start', parameters: {} },
      { id: 'R02', executorType: 'workflow.condition', parameters: { expression: 'false' } },
      { id: 'R03', executorType: 'workflow.set_variable', parameters: { name: 'a', value: 1 } },
      { id: 'R04', executorType: 'workflow.set_variable', parameters: { name: 'b', value: 2 } },
      { id: 'R05', executorType: 'workflow.end', parameters: {} },
      { id: 'R06', executorType: 'workflow.set_variable', parameters: { name: 'c', value: 3 } },
      { id: 'R07', executorType: 'workflow.end', parameters: {} },
    ],
    edges: [
      { sourceNodeId: 'R01', targetNodeId: 'R02' },
      { sourceNodeId: 'R02', targetNodeId: 'R03', label: 'true' },
      { sourceNodeId: 'R02', targetNodeId: 'R06', label: 'false' },
      { sourceNodeId: 'R03', targetNodeId: 'R04' },
      { sourceNodeId: 'R04', targetNodeId: 'R05' },
      { sourceNodeId: 'R06', targetNodeId: 'R07' },
    ]
  };
}

// ====================================================================
// TEST 1: True/False Conditional Branching
// ====================================================================

async function test1_trueFalseBranching(registry) {
  section('Test 1: True/False Conditional Branching');
  const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');

  const engine = new RuntimeEngine(registry, {
    enableValidation: false,
    nodeTimeoutMs: 10000,
  });

  const dag = buildTrueFalseDag();
  console.log(`  DAG: 7 nodes, 6 edges (condition with true/false branches)`);

  const nodeStates = {};
  engine.on('node:stateChange', ({ nodeId, to }) => {
    nodeStates[nodeId] = to;
  });

  const result = await engine.execute(dag, {});


  check('Execution completed', result.status === 'COMPLETED' || result.status === 'SUCCEEDED',
    `status=${result.status}`);

  const nr = result.nodeResults || {};

  check('N04 (true branch) SUCCEEDED', nr['N04']?.status === 'SUCCEEDED', `status=${nr['N04']?.status}`);
  check('N05 (false branch) SKIPPED', nr['N05']?.status === 'SKIPPED', `status=${nr['N05']?.status}`);
  check('N06 (true end) SUCCEEDED', nr['N06']?.status === 'SUCCEEDED', `status=${nr['N06']?.status}`);
  check('N07 (false end) SKIPPED', nr['N07']?.status === 'SKIPPED', `status=${nr['N07']?.status}`);

  return result;
}

// ====================================================================
// TEST 2: Template Resolution
// ====================================================================

async function test2_templateResolution(registry) {
  section('Test 2: Template Resolution');
  const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');

  const engine = new RuntimeEngine(registry, {
    enableValidation: false,
    nodeTimeoutMs: 10000,
  });

  const dag = buildTemplateDag();
  console.log(`  DAG: 3 nodes (START → AI_GENERATE with template → END)`);

  const result = await engine.execute(dag, { user: 'Alice' });


  check('Execution completed', result.status === 'COMPLETED' || result.status === 'SUCCEEDED',
    `status=${result.status}`);

  const nr = result.nodeResults || {};
  const t02Output = nr['T02']?.output;
  check('T02 (ai.generate) produced output', !!t02Output, `output=${JSON.stringify(t02Output)?.substring(0, 100)}`);

  // The mock_response should have been returned
  if (t02Output) {
    const hasResponse = t02Output.text || t02Output.generated_text || t02Output.response || t02Output.mock_response;
    check('AI generate returned mock response', !!hasResponse, `response present`);
  }

  return result;
}

// ====================================================================
// TEST 3: Cross-Node Reference in Condition
// ====================================================================

async function test3_crossNodeReference(registry) {
  section('Test 3: Cross-Node Reference in Condition');
  const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');

  const engine = new RuntimeEngine(registry, {
    enableValidation: false,
    nodeTimeoutMs: 10000,
  });

  const dag = buildCrossNodeDag();
  console.log(`  DAG: 7 nodes (SET_SCORE=85 → CONDITION(score>=70) with branches)`);

  const result = await engine.execute(dag, {});


  check('Execution completed', result.status === 'COMPLETED' || result.status === 'SUCCEEDED',
    `status=${result.status}`);

  const nr = result.nodeResults || {};

  check('C04 (pass branch) SUCCEEDED', nr['C04']?.status === 'SUCCEEDED', `status=${nr['C04']?.status}`);
  check('C05 (fail branch) SKIPPED', nr['C05']?.status === 'SKIPPED', `status=${nr['C05']?.status}`);

  return result;
}

// ====================================================================
// TEST 4: Recursive Skip of Untaken Branch
// ====================================================================

async function test4_recursiveSkip(registry) {
  section('Test 4: Recursive Skip of Untaken Branch');
  const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');

  const engine = new RuntimeEngine(registry, {
    enableValidation: false,
    nodeTimeoutMs: 10000,
  });

  const dag = buildRecursiveSkipDag();
  console.log(`  DAG: 7 nodes (COND=false → true branch: A→B→END1, false branch: C→END2)`);

  const result = await engine.execute(dag, {});


  check('Execution completed', result.status === 'COMPLETED' || result.status === 'SUCCEEDED',
    `status=${result.status}`);

  const nr = result.nodeResults || {};

  // True branch should be fully SKIPPED (condition returns false)
  check('R03 (A, true branch) SKIPPED', nr['R03']?.status === 'SKIPPED', `status=${nr['R03']?.status}`);
  check('R04 (B, true branch) SKIPPED', nr['R04']?.status === 'SKIPPED', `status=${nr['R04']?.status}`);
  check('R05 (END1, true branch) SKIPPED', nr['R05']?.status === 'SKIPPED', `status=${nr['R05']?.status}`);

  // False branch should execute
  check('R06 (C, false branch) SUCCEEDED', nr['R06']?.status === 'SUCCEEDED', `status=${nr['R06']?.status}`);
  check('R07 (END2, false branch) SUCCEEDED', nr['R07']?.status === 'SUCCEEDED', `status=${nr['R07']?.status}`);

  return result;
}

// ====================================================================
// TEST 5: ExecutionContext stores all outputs
// ====================================================================

async function test5_executionContext(registry) {
  section('Test 5: ExecutionContext Accumulation');

  const { ExecutionContext } = require('../src/runtime/execution/ExecutionContext');
  const { TemplateResolver } = require('../src/runtime/execution/TemplateResolver');

  // Unit test: ExecutionContext
  const ctx = new ExecutionContext({ user: 'Bob' });
  ctx.setNodeOutput('G0-N01', { text: 'hello' });
  ctx.setNodeOutput('G0-N02', { profile: { name: 'Alice' } });
  ctx.setVariable('lang', 'en');

  check('getNodeOutput by original ID', ctx.getNodeOutput('G0-N01')?.text === 'hello');
  check('getNodeOutput by normalized ID', ctx.getNodeOutput('G0_N01')?.text === 'hello');

  const exprCtx = ctx.getExpressionContext();
  check('Expression context has input', exprCtx.input?.user === 'Bob');
  check('Expression context has G0_N01', exprCtx.G0_N01?.text === 'hello');
  check('Expression context has variable', exprCtx.lang === 'en');

  const tmplCtx = ctx.getTemplateContext();
  check('Template context has nodeOutputs', tmplCtx.nodeOutputs['G0-N01']?.text === 'hello');
  check('Template context has variables', tmplCtx.variables.lang === 'en');

  // Unit test: TemplateResolver
  const resolver = new TemplateResolver();

  const r1 = resolver.resolve('Hello {{input.user}}', tmplCtx);
  check('Resolve input template', r1 === 'Hello Bob', `got "${r1}"`);

  const r2 = resolver.resolve('{{G0-N02.profile.name}}', tmplCtx);
  check('Resolve cross-node deep path', r2 === 'Alice', `got "${r2}"`);

  const r3 = resolver.resolve({ prompt: '{{G0-N01.text}} world', count: 42 }, tmplCtx);
  check('Resolve object with mixed template', r3.prompt === 'hello world', `got "${r3.prompt}"`);
  check('Non-template primitives pass through', r3.count === 42);

  const r4 = resolver.resolve('{{$uuid}}', tmplCtx);
  check('Built-in $uuid resolves', typeof r4 === 'string' && r4.length === 36, `got "${r4}"`);

  const r5 = resolver.resolve('{{unknown.path}}', tmplCtx);
  check('Unresolvable kept as-is', r5 === '{{unknown.path}}', `got "${r5}"`);
}

// ====================================================================
// MAIN
// ====================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Conditional Branching + Template Resolution Test Suite       ║');
  console.log('║  Priority 8 Verification                                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const { registry } = await setup();
  const executorCount = registry.listTools().length;
  console.log(`\n  Registry: ${executorCount} executors loaded`);

  try {
    await test5_executionContext(registry);  // Unit tests first
    await test1_trueFalseBranching(registry);
    await test2_templateResolution(registry);
    await test3_crossNodeReference(registry);
    await test4_recursiveSkip(registry);
  } catch (err) {
    console.error(`\n  FATAL: ${err.message}`);
    console.error(err.stack);
    failed++;
  }

  // ── Summary ──────────────────────────────────────────────
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  console.log(`${'='.repeat(64)}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(2); });
