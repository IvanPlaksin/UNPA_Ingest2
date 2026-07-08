/**
 * Unit test — TASK-P2-003: Agent reflection loop (external validation signal).
 *
 * Drives _agentLoop with a stubbed _callLLM (always STOP, no tool calls) and a stubbed
 * verifier, asserting the reflection control-flow: pass→return, fail→reflect→retry,
 * degrade→rollback, budget→best-attempt, disabled→normal STOP.
 *
 * No real LLM. Run: node api/tests/unit/agent-reflection-loop.test.js
 */

'use strict';

const assert = require('assert');
const { GraphBuilderAgent } = require('../../src/services/ai/graph-builder-agent.service');
const { GraphState } = require('../../src/services/ai/tool-executor');

function makeAgent(configOverrides = {}) {
  const agent = new GraphBuilderAgent({ executorRegistry: null });
  agent.config = { ...agent.config, maxToolIterations: 10, maxReflections: 3, targetGrade: 'B', reflectionEnabled: true, ...configOverrides };
  // No real LLM: always STOP (no tool calls).
  agent._callLLM = async () => ({ content: 'done', tool_calls: [] });
  return agent;
}

function stubVerifier(agent, sequence) {
  let i = 0;
  agent._getVerifier = () => ({
    verify: async () => {
      const v = sequence[Math.min(i, sequence.length - 1)];
      i++;
      return { pass: v.grade !== 'F' && v.pass !== false, grade: v.grade, issues: v.issues || [], levels: {} };
    },
  });
}

function makeSession() {
  return { id: 't', messages: [{ role: 'system', content: 'sys' }], graphState: new GraphState({ nodes: [{ id: 'n1' }], edges: [] }) };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}

(async () => {
  console.log('TASK-P2-003 — Agent reflection loop\n');

  await test('verify passes (grade B) on first STOP → returns immediately, no reflection prompt', async () => {
    const agent = makeAgent();
    stubVerifier(agent, [{ grade: 'B', pass: true }]);
    const session = makeSession();
    const res = await agent._agentLoop(session);
    assert.strictEqual(res.grade, 'B');
    assert.ok(!session.messages.some(m => /Validation Failed/.test(m.content || '')), 'no reflection prompt expected');
  });

  await test('verify fails then passes → reflection prompt injected, then success (grade A)', async () => {
    const agent = makeAgent();
    stubVerifier(agent, [{ grade: 'F', pass: false, issues: [{ code: 'PHANTOM_EXECUTOR', severity: 'error', message: 'bad', suggestion: 'fix' }] }, { grade: 'A', pass: true }]);
    const session = makeSession();
    const res = await agent._agentLoop(session);
    assert.strictEqual(res.grade, 'A');
    assert.ok(session.messages.some(m => /Graph Validation Failed/.test(m.content || '')), 'reflection prompt must be injected on failure');
  });

  await test('verify fails 3x → max reflections → returns best attempt (partial)', async () => {
    const agent = makeAgent();
    stubVerifier(agent, [{ grade: 'F', pass: false, issues: [{ code: 'X', severity: 'error', message: 'e', suggestion: 's' }] }]);
    const session = makeSession();
    const res = await agent._agentLoop(session);
    assert.strictEqual(res.partial, true);
    assert.strictEqual(res.reason, 'max_reflections');
  });

  await test('degradation → rollback prompt injected', async () => {
    const agent = makeAgent();
    // best B(4), then F(1): 1 < 4-1 → rollback
    stubVerifier(agent, [
      { grade: 'B', pass: false, issues: [{ code: 'W', severity: 'warning', message: 'w' }] }, // pass:false so it keeps going (below target? B meets target — force fail)
      { grade: 'F', pass: false, issues: [{ code: 'E', severity: 'error', message: 'e', suggestion: 's' }] },
      { grade: 'A', pass: true },
    ]);
    const session = makeSession();
    // Force first B to not be terminal by setting targetGrade A
    agent.config.targetGrade = 'A';
    await agent._agentLoop(session);
    assert.ok(session.messages.some(m => /restored the previous best/.test(m.content || '')), 'rollback prompt expected on degradation');
  });

  await test('reflectionEnabled=false → returns on first STOP without verifying', async () => {
    const agent = makeAgent({ reflectionEnabled: false });
    let verifyCalled = false;
    agent._getVerifier = () => ({ verify: async () => { verifyCalled = true; return { pass: false, grade: 'F', issues: [] }; } });
    const session = makeSession();
    const res = await agent._agentLoop(session);
    assert.strictEqual(res.reflectionDisabled, true);
    assert.strictEqual(verifyCalled, false, 'verifier must not run when reflection disabled');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
