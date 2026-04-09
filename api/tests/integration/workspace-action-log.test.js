/**
 * WorkSpace Action Log + Tool Whitelist Tests (WS2-002)
 *
 * Validates:
 *   - tool whitelist isToolAllowed() correctness
 *   - action mapping (mapToolToActionType)
 *   - logAction() persists to Memgraph and links to session/message
 *   - getActions() returns paginated, ordered timeline
 *   - HAS_ACTION + TRIGGERED_BY edges are created
 *
 * Run: node api/tests/integration/workspace-action-log.test.js
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
function assert(c, m) { if (!c) throw new Error(`Assertion failed: ${m}`); }
function assertEq(a, b, l) { if (a !== b) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertNotNull(v, l) { if (v === null || v === undefined) throw new Error(`${l}: expected non-null`); }

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  WorkSpace Action Log + Tool Filter Tests (WS2-002)');
  console.log('═══════════════════════════════════════════════════\n');

  let ws, agent, actionLog, toolFilter, mg;
  try {
    ws = require('../../src/services/workspace/workspace.service');
    agent = require('../../src/services/workspace/workspace-agent.service');
    actionLog = require('../../src/services/workspace/action-log.service');
    toolFilter = require('../../src/services/workspace/agent-tool-filter');
    mg = require('../../src/services/memgraph.service');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  // ─── 1. PURE FUNCTIONS (no DB) ──────────────────────────────────

  console.log('1. Tool whitelist (isToolAllowed)');

  await test('allows workspace_create_draft', () => {
    assertEq(toolFilter.isToolAllowed('workspace_create_draft'), true, 'allowed');
  });

  await test('allows kb_search (read-only)', () => {
    assertEq(toolFilter.isToolAllowed('kb_search'), true, 'allowed');
  });

  await test('allows kb_get_node (read-only)', () => {
    assertEq(toolFilter.isToolAllowed('kb_get_node'), true, 'allowed');
  });

  await test('denies kb_create_node (write)', () => {
    assertEq(toolFilter.isToolAllowed('kb_create_node'), false, 'denied');
  });

  await test('denies graph_create_node (global graph mutation)', () => {
    assertEq(toolFilter.isToolAllowed('graph_create_node'), false, 'denied');
  });

  await test('denies arbitrary tools (backlog_create_task)', () => {
    assertEq(toolFilter.isToolAllowed('backlog_create_task'), false, 'denied');
  });

  await test('allows graph_neighbors (read-only)', () => {
    assertEq(toolFilter.isToolAllowed('graph_neighbors'), true, 'allowed');
  });

  await test('filterAllowedTools filters list', () => {
    const tools = [
      { name: 'workspace_create_draft' },
      { name: 'kb_search' },
      { name: 'backlog_create_task' },
      { name: 'graph_create_node' }
    ];
    const filtered = toolFilter.filterAllowedTools(tools);
    assertEq(filtered.length, 2, 'two allowed');
    assert(filtered.find(t => t.name === 'workspace_create_draft'), 'workspace ok');
    assert(filtered.find(t => t.name === 'kb_search'), 'kb_search ok');
  });

  console.log('\n2. Action type mapping');

  await test('workspace_create_draft → CREATE_NODE', () => {
    assertEq(actionLog.mapToolToActionType('workspace_create_draft'), 'CREATE_NODE', 'mapped');
  });

  await test('workspace_update_draft → MODIFY_NODE', () => {
    assertEq(actionLog.mapToolToActionType('workspace_update_draft'), 'MODIFY_NODE', 'mapped');
  });

  await test('workspace_delete_draft → DELETE_NODE', () => {
    assertEq(actionLog.mapToolToActionType('workspace_delete_draft'), 'DELETE_NODE', 'mapped');
  });

  await test('workspace_create_edge → CREATE_EDGE', () => {
    assertEq(actionLog.mapToolToActionType('workspace_create_edge'), 'CREATE_EDGE', 'mapped');
  });

  await test('kb_search → LINK_KB', () => {
    assertEq(actionLog.mapToolToActionType('kb_search'), 'LINK_KB', 'mapped');
  });

  await test('workspace_kb_get_node → LINK_KB', () => {
    assertEq(actionLog.mapToolToActionType('workspace_kb_get_node'), 'LINK_KB', 'mapped');
  });

  await test('unknown tool → OTHER', () => {
    assertEq(actionLog.mapToolToActionType('foo_bar_baz'), 'OTHER', 'mapped');
  });

  await test('extractAffectedIds picks common keys', () => {
    const ids = actionLog.extractAffectedIds({
      draftId: 'd1',
      nodeIds: ['n1', 'n2'],
      noise: 'whatever'
    });
    assertEq(ids.length, 3, 'three ids');
    assert(ids.includes('d1'), 'd1');
    assert(ids.includes('n1'), 'n1');
  });

  // ─── 2. PERSISTENCE (Memgraph) ──────────────────────────────────

  console.log('\n3. Persistence + integration with session');

  const TEST_USER = 'test-action-log-user';
  let workspace = null;
  let session = null;
  let userMsg = null;

  await test('create test workspace', async () => {
    workspace = await ws.create({
      name: 'Action Log Test WS',
      description: 'WS2-002',
      domain: 'IT',
      tags: ['test'],
      createdBy: TEST_USER
    });
    assertNotNull(workspace.id, 'workspace.id');
  });

  await test('open agent session', async () => {
    session = await agent.getOrCreateSession(workspace.id);
    assertNotNull(session.id, 'session.id');
  });

  await test('add a user message (for TRIGGERED_BY)', async () => {
    userMsg = await agent.addMessage(workspace.id, 'user', 'Create entity Customer');
    assertNotNull(userMsg.id, 'userMsg.id');
  });

  await test('logAction creates AgentAction node', async () => {
    const action = await actionLog.logAction({
      workspaceId: workspace.id,
      sessionId: session.id,
      toolName: 'workspace_create_draft',
      toolInput: { type: 'Entity', name: 'Customer', sourceId: 's1' },
      messageId: userMsg.id,
      snapshotAfter: { id: 'd-new-1', name: 'Customer' }
    });
    assertNotNull(action.id, 'action.id');
    assertEq(action.type, 'CREATE_NODE', 'auto-mapped type');
    assertEq(action.reversible, true, 'CREATE_NODE is reversible');
    assert(action.description.startsWith('workspace_create_draft'), 'description');
  });

  await test('logAction with modify (MODIFY_NODE) sets snapshots', async () => {
    const action = await actionLog.logAction({
      workspaceId: workspace.id,
      sessionId: session.id,
      toolName: 'workspace_update_draft',
      toolInput: { draftId: 'd-new-1', name: 'CustomerV2' },
      snapshotBefore: { id: 'd-new-1', name: 'Customer' },
      snapshotAfter: { id: 'd-new-1', name: 'CustomerV2' }
    });
    assertEq(action.type, 'MODIFY_NODE', 'mapped');
    assertNotNull(action.snapshotBefore, 'snapshotBefore present');
    assertNotNull(action.snapshotAfter, 'snapshotAfter present');
    assertEq(action.snapshotBefore.name, 'Customer', 'before parsed');
    assertEq(action.snapshotAfter.name, 'CustomerV2', 'after parsed');
  });

  await test('logAction with kb_search (LINK_KB, not reversible)', async () => {
    const action = await actionLog.logAction({
      workspaceId: workspace.id,
      sessionId: session.id,
      toolName: 'kb_search',
      toolInput: { query: 'customer' }
    });
    assertEq(action.type, 'LINK_KB', 'mapped');
    assertEq(action.reversible, false, 'not reversible');
  });

  await test('getActions returns timeline ordered by ts DESC', async () => {
    const result = await agent.getActions(workspace.id, { limit: 50 });
    assert(result.items.length >= 3, `at least 3 actions (got ${result.items.length})`);
    // Newest first
    const tsList = result.items.map(a => a.ts);
    for (let i = 1; i < tsList.length; i++) {
      assert(tsList[i - 1] >= tsList[i], `order at index ${i}`);
    }
  });

  await test('getActions filters by type', async () => {
    const result = await agent.getActions(workspace.id, { type: 'CREATE_NODE' });
    assert(result.items.length >= 1, 'at least one CREATE_NODE');
    assert(result.items.every(a => a.type === 'CREATE_NODE'), 'all CREATE_NODE');
  });

  await test('getActions pagination (limit=1)', async () => {
    const page1 = await agent.getActions(workspace.id, { limit: 1, offset: 0 });
    const page2 = await agent.getActions(workspace.id, { limit: 1, offset: 1 });
    assertEq(page1.items.length, 1, 'page 1 size');
    assertEq(page2.items.length, 1, 'page 2 size');
    assert(page1.items[0].id !== page2.items[0].id, 'different items');
  });

  await test('HAS_ACTION edge from session to action exists', async () => {
    const result = await mg.runQuery(
      `MATCH (s:WorkSpaceAgentSession {id: $sid})-[:HAS_ACTION]->(a:AgentAction)
       RETURN count(a) as cnt`,
      { sid: session.id }
    );
    const cnt = result[0]?.cnt;
    const cntNum = typeof cnt === 'object' && cnt.toNumber ? cnt.toNumber() : cnt;
    assert(cntNum >= 3, `at least 3 HAS_ACTION edges (got ${cntNum})`);
  });

  await test('TRIGGERED_BY edge from action to message exists', async () => {
    const result = await mg.runQuery(
      `MATCH (a:AgentAction)-[:TRIGGERED_BY]->(m:WorkSpaceChatMessage {id: $mid})
       RETURN count(a) as cnt`,
      { mid: userMsg.id }
    );
    const cnt = result[0]?.cnt;
    const cntNum = typeof cnt === 'object' && cnt.toNumber ? cnt.toNumber() : cnt;
    assert(cntNum >= 1, `at least 1 TRIGGERED_BY edge (got ${cntNum})`);
  });

  await test('getActionById returns the action', async () => {
    const all = await agent.getActions(workspace.id, { limit: 1 });
    const id = all.items[0].id;
    const fetched = await actionLog.getActionById(id);
    assertNotNull(fetched, 'fetched');
    assertEq(fetched.id, id, 'id match');
  });

  console.log('\n4. Cleanup');

  await test('clean up test data from Memgraph', async () => {
    await mg.runQuery(
      `MATCH (w:WorkSpace {id: $id})
       OPTIONAL MATCH (w)-[:HAS_AGENT_SESSION]->(s)
       OPTIONAL MATCH (s)-[:HAS_MESSAGE]->(m)
       OPTIONAL MATCH (s)-[:HAS_ACTION]->(a)
       DETACH DELETE w, s, m, a`,
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
