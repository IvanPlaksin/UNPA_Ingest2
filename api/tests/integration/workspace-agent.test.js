/**
 * WorkSpace Agent Integration Tests (WS2-001)
 *
 * Validates persistent chat session storage and basic CRUD.
 * NOTE: chat() flow is mocked — we do not call the real Anthropic API here,
 * we verify the storage layer (session, messages, history loading).
 *
 * Run: node api/tests/integration/workspace-agent.test.js
 */

'use strict';

let passed = 0;
let failed = 0;
const errors = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    errors.push({ name, error: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}
function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertNotNull(v, label) {
  if (v === null || v === undefined) throw new Error(`${label}: expected non-null`);
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  WorkSpace Agent Service Tests (WS2-001)');
  console.log('═══════════════════════════════════════════════════\n');

  let ws, agent, mg;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    agent = require('../../src/services/workspace/workspace-agent.service');
    mg = require('../../src/services/memgraph.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  const TEST_USER = 'test-agent-user';
  let workspace = null;
  let session = null;

  console.log('1. Session lifecycle');

  await test('create workspace for agent test', async () => {
    workspace = await ws.create({
      name: 'Agent Test Workspace',
      description: 'WS2-001 integration test',
      domain: 'IT',
      tags: ['test', 'agent'],
      createdBy: TEST_USER
    });
    assertNotNull(workspace.id, 'workspace.id');
  });

  await test('getOrCreateSession creates a new session', async () => {
    session = await agent.getOrCreateSession(workspace.id);
    assertNotNull(session.id, 'session.id');
    assertEq(session.workspaceId, workspace.id, 'session.workspaceId');
    assert(Array.isArray(session.messages), 'session.messages is array');
    assertEq(session.messages.length, 0, 'no messages initially');
  });

  await test('getOrCreateSession is idempotent (returns same session)', async () => {
    const second = await agent.getOrCreateSession(workspace.id);
    assertEq(second.id, session.id, 'same session id');
  });

  await test('getSession returns existing session', async () => {
    const fetched = await agent.getSession(workspace.id);
    assertNotNull(fetched, 'fetched session');
    assertEq(fetched.id, session.id, 'same id');
  });

  await test('getSession returns null for unknown workspace', async () => {
    const result = await agent.getSession('00000000-0000-0000-0000-000000000000');
    assertEq(result, null, 'null for unknown workspace');
  });

  console.log('\n2. Message persistence');

  await test('addMessage stores user message', async () => {
    const msg = await agent.addMessage(workspace.id, 'user', 'Hello, agent!');
    assertNotNull(msg.id, 'msg.id');
    assertEq(msg.role, 'user', 'role');
    assertEq(msg.content, 'Hello, agent!', 'content');
  });

  await test('addMessage stores assistant message with metadata', async () => {
    const msg = await agent.addMessage(workspace.id, 'assistant', 'Hi! How can I help?', {
      toolCalls: [{ name: 'workspace_kb_search', input: { q: 'test' } }]
    });
    assertNotNull(msg.id, 'msg.id');
    assertEq(msg.role, 'assistant', 'role');
  });

  await test('addMessage rejects invalid role', async () => {
    let threw = false;
    try {
      await agent.addMessage(workspace.id, 'system', 'invalid');
    } catch (e) {
      threw = e.message.includes('Invalid role');
    }
    assert(threw, 'should reject system role');
  });

  await test('getOrCreateSession reloads messages in order', async () => {
    const reloaded = await agent.getOrCreateSession(workspace.id);
    assert(reloaded.messages.length >= 2, `at least 2 messages (got ${reloaded.messages.length})`);
    assertEq(reloaded.messages[0].role, 'user', 'first is user');
    assertEq(reloaded.messages[0].content, 'Hello, agent!', 'first content');
    assertEq(reloaded.messages[1].role, 'assistant', 'second is assistant');
    assert(
      Array.isArray(reloaded.messages[1].meta?.toolCalls),
      'assistant meta has toolCalls'
    );
  });

  console.log('\n3. clearHistory');

  await test('clearHistory removes messages but keeps session', async () => {
    const result = await agent.clearHistory(workspace.id);
    assert(result.cleared >= 2, `cleared at least 2 (got ${result.cleared})`);

    const reloaded = await agent.getSession(workspace.id);
    assertNotNull(reloaded, 'session still exists');
    assertEq(reloaded.id, session.id, 'same session id');
    assertEq(reloaded.messages.length, 0, 'no messages after clear');
  });

  await test('clearHistory on missing workspace returns 0', async () => {
    const result = await agent.clearHistory('00000000-0000-0000-0000-000000000000');
    assertEq(result.cleared, 0, 'cleared 0');
  });

  console.log('\n4. Cleanup');

  await test('archive test workspace', async () => {
    await ws.archive(workspace.id);
    const w = await ws.get(workspace.id);
    assertEq(w.status, 'ARCHIVED', 'archived');
  });

  await test('clean up test workspace + session from Memgraph', async () => {
    await mg.runQuery(
      `MATCH (w:WorkSpace {id: $id})
       OPTIONAL MATCH (w)-[:HAS_AGENT_SESSION]->(s)-[:HAS_MESSAGE]->(m)
       DETACH DELETE w, s, m`,
      { id: workspace.id }
    );
  });

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('Errors:');
    for (const e of errors) console.log(`  - ${e.name}: ${e.error}`);
    process.exit(1);
  }
  process.exit(0);
}

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
