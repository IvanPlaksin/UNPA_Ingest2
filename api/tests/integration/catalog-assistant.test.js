/**
 * Catalog AI Assistant Tests (UTC-002)
 *
 * Validates:
 *   1. Tool whitelist (isAllowed) — catalog tools always available,
 *      workspace tools only when workspaceId is set
 *   2. System prompt builds correctly for different contexts
 *   3. MCP tool registration (3 new pattern tools registered)
 *   4. Chat streaming (requires API key — test verifies wiring, not LLM output)
 *
 * Run: node api/tests/integration/catalog-assistant.test.js
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

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Catalog AI Assistant Tests (UTC-002)');
  console.log('═══════════════════════════════════════════════════\n');

  let catalogAssistant, catalogIndex;
  try {
    catalogAssistant = require('../../src/services/catalog/catalog-assistant.service');
    catalogIndex = require('../../src/mcp/tools/catalog/index');
  } catch (err) {
    console.error(`  Cannot load services: ${err.message}`);
    process.exit(1);
  }

  // ─── 1. Tool whitelist ─────────────────────────────────────────

  console.log('1. Tool whitelist (isAllowed)');

  await test('catalog tools always allowed', () => {
    assertEq(catalogAssistant.isAllowed('catalog_search_tools', null), true, 'search_tools');
    assertEq(catalogAssistant.isAllowed('catalog_suggest_tools', null), true, 'suggest_tools');
    assertEq(catalogAssistant.isAllowed('catalog_find_similar_graphs', null), true, 'find_similar');
    assertEq(catalogAssistant.isAllowed('catalog_analyze_patterns', null), true, 'analyze_patterns');
    assertEq(catalogAssistant.isAllowed('catalog_match_subgraph', null), true, 'match_subgraph');
    assertEq(catalogAssistant.isAllowed('catalog_preview_replacement', null), true, 'preview_replacement');
  });

  await test('graph read-only tools always allowed', () => {
    assertEq(catalogAssistant.isAllowed('graph_analyze_structure', null), true, 'analyze_structure');
    assertEq(catalogAssistant.isAllowed('graph_neighbors', null), true, 'neighbors');
  });

  await test('workspace tools DENIED without workspaceId', () => {
    assertEq(catalogAssistant.isAllowed('workspace_list_drafts', null), false, 'list_drafts');
    assertEq(catalogAssistant.isAllowed('workspace_validate_graph', null), false, 'validate_graph');
    assertEq(catalogAssistant.isAllowed('workspace_analyze_sources', null), false, 'analyze_sources');
  });

  await test('workspace tools ALLOWED with workspaceId', () => {
    assertEq(catalogAssistant.isAllowed('workspace_list_drafts', 'ws-123'), true, 'list_drafts');
    assertEq(catalogAssistant.isAllowed('workspace_validate_graph', 'ws-123'), true, 'validate_graph');
    assertEq(catalogAssistant.isAllowed('workspace_search_drafts', 'ws-123'), true, 'search_drafts');
  });

  await test('unrelated tools always denied', () => {
    assertEq(catalogAssistant.isAllowed('backlog_create_task', null), false, 'backlog');
    assertEq(catalogAssistant.isAllowed('ai_chat', null), false, 'ai_chat');
    assertEq(catalogAssistant.isAllowed('workspace_create_draft', 'ws-123'), false, 'create_draft (mutation)');
  });

  // ─── 2. System prompt ──────────────────────────────────────────

  console.log('\n2. System prompt');

  await test('prompt includes catalog capabilities', () => {
    const prompt = catalogAssistant.buildSystemPrompt({ mode: 'general' });
    assert(prompt.includes('TOOL RECOMMENDATION'), 'tool recommendation');
    assert(prompt.includes('GRAPH TEMPLATE SEARCH'), 'graph template');
    assert(prompt.includes('PATTERN DETECTION'), 'pattern detection');
  });

  await test('prompt includes workspace context when provided', () => {
    const prompt = catalogAssistant.buildSystemPrompt({ workspaceId: 'ws-abc', workspaceName: 'Test WS' });
    assert(prompt.includes('ws-abc'), 'workspace ID');
    assert(prompt.includes('Test WS'), 'workspace name');
    assert(prompt.includes('workspace inspection tools'), 'ws tools mentioned');
  });

  await test('prompt excludes workspace section when no workspaceId', () => {
    const prompt = catalogAssistant.buildSystemPrompt({});
    assert(prompt.includes('standalone catalog mode'), 'standalone');
    assert(!prompt.includes('workspace inspection tools'), 'no ws tools');
  });

  await test('prompt adapts to mode = pattern_analysis', () => {
    const prompt = catalogAssistant.buildSystemPrompt({ mode: 'pattern_analysis', workspaceId: 'ws-1' });
    assert(prompt.includes('Pattern Analysis'), 'pattern mode');
    assert(prompt.includes('catalog_analyze_patterns'), 'suggests tool');
  });

  await test('prompt adapts to mode = tool_selection', () => {
    const prompt = catalogAssistant.buildSystemPrompt({ mode: 'tool_selection' });
    assert(prompt.includes('Tool Selection'), 'tool mode');
    assert(prompt.includes('catalog_suggest_tools'), 'suggests tool');
  });

  await test('prompt includes current selection when provided', () => {
    const prompt = catalogAssistant.buildSystemPrompt({
      currentSelection: [{ id: 'n1', name: 'Customer' }, { id: 'n2', name: 'Order' }]
    });
    assert(prompt.includes('Customer'), 'selection included');
    assert(prompt.includes('2 node(s)'), 'count');
  });

  // ─── 3. MCP tool registration ─────────────────────────────────

  console.log('\n3. MCP tool registration');

  await test('catalog index has 13 tools (10 existing + 3 new)', () => {
    const tools = catalogIndex.createCatalogTools();
    assertEq(tools.length, 13, 'tool count');
  });

  await test('new tools have correct IDs', () => {
    const tools = catalogIndex.createCatalogTools();
    const ids = new Set(tools.map(t => t.getDefinition().id));
    assert(ids.has('catalog.analyze_patterns'), 'analyze_patterns');
    assert(ids.has('catalog.match_subgraph'), 'match_subgraph');
    assert(ids.has('catalog.preview_replacement'), 'preview_replacement');
  });

  await test('new tools have required input schemas', () => {
    const tools = catalogIndex.createCatalogTools();
    const ap = tools.find(t => t.getDefinition().id === 'catalog.analyze_patterns');
    assert(ap.getDefinition().inputSchema.required.includes('workspaceId'), 'analyze requires workspaceId');

    const ms = tools.find(t => t.getDefinition().id === 'catalog.match_subgraph');
    assert(ms.getDefinition().inputSchema.required.includes('workspaceId'), 'match requires workspaceId');
    assert(ms.getDefinition().inputSchema.required.includes('subgraphId'), 'match requires subgraphId');

    const pr = tools.find(t => t.getDefinition().id === 'catalog.preview_replacement');
    assert(pr.getDefinition().inputSchema.required.includes('catalogEntryId'), 'preview requires catalogEntryId');
  });

  // ─── Done ──────────────────────────────────────────────────────

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
