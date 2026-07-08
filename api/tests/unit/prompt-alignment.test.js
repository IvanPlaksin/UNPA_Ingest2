/**
 * Unit test — TASK-P1-004: Prompt alignment.
 *
 * Verifies (no LLM) that the graph-builder system prompt is registry-driven and that
 * the codex governance tools referenced by the prompt now exist in the toolset.
 *
 * Run: node api/tests/unit/prompt-alignment.test.js
 */

'use strict';

const assert = require('assert');
const { buildSystemPrompt, buildDomainSummary } = require('../../src/services/ai/prompts/graph-builder-system.prompt');
const { getToolDefinitions } = require('../../src/services/ai/graph-builder-tools');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.error(`  ✗ ${name}\n    ${err.message}`); }
}

const fakeCatalog = [
  { type: 'workflow.start', domain: 'common', description: 'start' },
  { type: 'common.transform', domain: 'common', description: 'transform' },
  { type: 'workflow.condition', domain: 'common', description: 'cond' },
  { type: 'sql.query', domain: 'sql-extraction', description: 'sql' },
];

console.log('TASK-P1-004 — Prompt alignment\n');

test('buildDomainSummary lists only real domains from catalog', () => {
  const s = buildDomainSummary(fakeCatalog);
  assert.ok(s.includes('**common**'), 'must list common domain');
  assert.ok(s.includes('**sql-extraction**'), 'must list sql-extraction domain');
  assert.ok(/live registry — 4 executors/.test(s), 'must report executor count from catalog');
});

test('buildDomainSummary degrades gracefully with empty catalog', () => {
  const s = buildDomainSummary([]);
  assert.ok(/live executor registry/i.test(s), 'must point at the live registry when empty');
});

test('system prompt no longer contains the hardcoded phantom categories/domains', () => {
  const prompt = buildSystemPrompt({ executorCatalog: fakeCatalog });
  // Exact hardcoded lines that drifted from the runtime must be gone:
  assert.ok(!prompt.includes('**gateway** - Parallel split/join'), 'hardcoded gateway category must be removed');
  assert.ok(!prompt.includes('**control** - Flow control (loop, break, continue)'), 'hardcoded control category must be removed');
  assert.ok(!prompt.includes('**aggregator** - Combines multiple inputs'), 'hardcoded aggregator category must be removed');
  assert.ok(!prompt.includes('**integration** - External system connectors'), 'hardcoded integration domain must be removed');
});

test('system prompt now contains the dynamic domain summary', () => {
  const prompt = buildSystemPrompt({ executorCatalog: fakeCatalog });
  assert.ok(prompt.includes('Available Domains (live registry'), 'dynamic domain summary must be present');
  assert.ok(prompt.includes('Do NOT invent categories or executor types'), 'explicit no-phantom guidance must be present');
});

test('RAG best-practice carries a verify-against-registry caveat', () => {
  const prompt = buildSystemPrompt({ executorCatalog: fakeCatalog });
  assert.ok(/Verify every step against \*\*AVAILABLE EXECUTORS\*\*/.test(prompt), 'RAG caveat must be present');
});

test('codex_search_rules and codex_get_blackcodex exist in toolset', () => {
  const names = getToolDefinitions().map(t => t.function.name);
  assert.ok(names.includes('codex_search_rules'), 'codex_search_rules must be a registered tool');
  assert.ok(names.includes('codex_get_blackcodex'), 'codex_get_blackcodex must be a registered tool');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
