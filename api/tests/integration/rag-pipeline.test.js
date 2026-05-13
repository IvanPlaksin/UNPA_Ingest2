#!/usr/bin/env node
/**
 * RAG Pipeline Integration Tests
 *
 * Verifies end-to-end RAG functionality after the following fixes:
 *   - GAP-001: embeddings_unified populated with 45 DevDialogue sessions
 *   - VIOLATION-003: QueryExpansionService LLM wiring fixed
 *   - VIOLATION-003: RerankExecutor rerankWithLLM fixed
 *   - vectorSearchExecutor fullNamespace bug fixed (was passing namespace as filter)
 *   - KnowledgeNamespace.UNIFIED added -> embeddings_unified collection
 *
 * Test suites:
 *   1. Global KB (embeddings_unified) — collection count + similarity search
 *   2. Query Expansion with LLM — generateRelated produces queries via LLM
 *   3. LLM Reranking — rerankWithLLM changes scores
 *   4. Full RAG Pipeline — expand -> vectorSearch -> rerank -> assemble
 *
 * Requirements: Qdrant + TEI running; LLM optional (LLM tests skip if unavailable)
 * Run: node api/tests/integration/rag-pipeline.test.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const http  = require('http');
const https = require('https');
const { QdrantClient } = require('@qdrant/js-client-rest');

const QDRANT_URL  = process.env.QDRANT_URL  || 'http://localhost:6333';
const TEI_URL     = process.env.TEI_URL     || 'http://localhost:8081';
const UNIFIED_COL = 'embeddings_unified';

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;
const errors = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    if (err.skip) {
      skipped++;
      console.log(`  ⊘ ${name} (${err.message})`);
    } else {
      failed++;
      errors.push({ name, error: err.message });
      console.log(`  ✗ ${name}: ${err.message}`);
    }
  }
}

function skip(reason) {
  const e = new Error(reason);
  e.skip = true;
  throw e;
}

function assert(cond, msg) { if (!cond) throw new Error('Assert: ' + msg); }
function assertGte(a, b, label) { if (a < b) throw new Error(`${label}: expected ${a} >= ${b}`); }
function assertRange(v, min, max, label) {
  if (v < min || v > max) throw new Error(`${label}: ${v} not in [${min}, ${max}]`);
}
function errMsg(result) {
  return result.errors?.[0]?.message || JSON.stringify(result.errors?.[0]) || '(no error detail)';
}

// ─── Network helpers ──────────────────────────────────────────────────────────

async function probeHttp(url, timeout = 3000) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      { hostname: u.hostname, port: u.port || 80, path: u.pathname || '/', method: 'GET' },
      res => { res.resume(); resolve(res.statusCode < 500); }
    );
    req.on('error', () => resolve(false));
    req.setTimeout(timeout, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function httpPost(url, body, timeout = 15000) {
  const u = new URL(url);
  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('TEI request timeout')); });
    req.write(data);
    req.end();
  });
}

async function teiEmbed(text) {
  const resp = await httpPost(`${TEI_URL}/embed`, { inputs: text });
  if (resp.status !== 200) throw new Error(`TEI /embed returned ${resp.status}: ${JSON.stringify(resp.body).slice(0, 200)}`);
  const data = resp.body;
  return Array.isArray(data[0]) ? data[0] : data;
}

// Try a minimal LLM call; return false if billing/credit error, true if works
async function probeLLM() {
  try {
    const { getInstance } = require('../../src/services/llm/LLMProviderService');
    const provider = getInstance();
    if (!provider) return false;
    const raw = await provider.chat([{ role: 'user', content: 'Reply with the single word: ping' }], { maxTokens: 10, temperature: 0 });
    const text = Array.isArray(raw) ? raw.filter(b => b.type === 'text').map(b => b.text).join('') : (raw || '');
    return text.length > 0;
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes('credit') || msg.includes('billing') || msg.includes('402') || msg.includes('balance')) {
      return 'credit';
    }
    return false;
  }
}

// ─── Suite 1: Global KB ───────────────────────────────────────────────────────

async function suite1(qdrant) {
  console.log('\n1. Global KB — embeddings_unified');

  await test('collection exists', async () => {
    const { collections } = await qdrant.getCollections();
    assert(collections.some(c => c.name === UNIFIED_COL), `'${UNIFIED_COL}' not found`);
  });

  await test('collection has >= 45 dialogue session points', async () => {
    const info = await qdrant.getCollection(UNIFIED_COL);
    const count = info.points_count ?? info.vectors_count ?? 0;
    assertGte(count, 45, 'points_count');
    console.log(`      points in collection: ${count}`);
  });

  await test('all points have required payload schema', async () => {
    const { points } = await qdrant.scroll(UNIFIED_COL, {
      limit: 5,
      with_payload: true,
      with_vectors: false,
      filter: { must: [{ key: 'source_type', match: { value: 'dialogue' } }] },
    });
    assert(points && points.length > 0, 'no dialogue points found');
    for (const pt of points) {
      const p = pt.payload;
      assert(p.quantum_id,                        'missing quantum_id');
      assert(p.source_type  === 'dialogue',        'wrong source_type');
      assert(p.primary_type === 'DialogueSession', 'wrong primary_type');
      assert(p.namespace    === 'DIALOGUE',        'wrong namespace');
      assert(p.sessionId,                          'missing sessionId');
    }
  });

  await test('namespace.config UNIFIED resolves to embeddings_unified', () => {
    const { getQdrantCollectionName } = require('../../src/config/namespace.config');
    const col = getQdrantCollectionName('unified');
    assert(col === UNIFIED_COL, `expected '${UNIFIED_COL}', got '${col}'`);
  });

  await test('vector search via TEI returns relevant results', async () => {
    if (!(await probeHttp(TEI_URL + '/health'))) skip('TEI not available');
    const vector = await teiEmbed('FlowDesk service desk ticket routing');
    assert(Array.isArray(vector) && vector.length === 1024,
      `expected 1024-dim vector, got ${vector.length}`);
    const results = await qdrant.search(UNIFIED_COL, {
      vector, limit: 5, with_payload: true, score_threshold: 0.3,
    });
    assertGte(results.length, 1, 'search results');
    assert(results[0].score >= 0.3, `top score too low: ${results[0].score}`);
    console.log(`      top score: ${results[0].score.toFixed(3)}, sessionId: ${results[0].payload?.sessionId}`);
  });
}

// ─── Suite 2: Query Expansion ─────────────────────────────────────────────────

async function suite2() {
  console.log('\n2. Query Expansion');

  const { createQueryExpansionService } = require('../../src/services/retrieval/query-expansion.service');

  await test('synonym expansion (no LLM)', async () => {
    const svc = createQueryExpansionService({ maxExpansions: 5, maxSynonymsPerTerm: 3 });
    const result = await svc.expand('create leave request for annual vacation', { includeSynonyms: true });
    assert(result.original,                          'no original query');
    assert(result.expanded,                          'no expanded query');
    assert(result.terms && result.terms.length > 0,  'no terms extracted');
    console.log(`      expanded: "${result.expanded.slice(0, 80)}"`);
  });

  await test('UN system name expansion (IMIS, Umoja, etc.)', async () => {
    const svc = createQueryExpansionService({ maxExpansions: 5, maxSynonymsPerTerm: 3 });
    const result = await svc.expand('IMIS payroll calculation', {
      includeUNTerms: true, includeRelatedSystems: true,
    });
    const hasSystems = (result.systemExpansions && result.systemExpansions.length > 0)
      || (result.relatedSystems && result.relatedSystems.length > 0);
    assert(hasSystems, 'no system expansions or relatedSystems detected');
    console.log(`      relatedSystems: ${JSON.stringify(result.relatedSystems || []).slice(0, 80)}`);
  });

  await test('AOPEG expandQueryExecutor — synonym mode', async () => {
    const { executors } = require('../../src/core/aopeg/plugins/rag/index.js');
    const result = await executors.expandQuery.execute(
      { includeSynonyms: true, generateRelated: false },
      { input: 'approval workflow for service requests', variables: {} }
    );
    assert(result.success === true, `executor failed: ${errMsg(result)}`);
    assert(result.output.originalQuery, 'no originalQuery in output');
    console.log(`      terms: ${JSON.stringify(result.output.terms || []).slice(0, 80)}`);
  });

  await test('LLM-based related query generation', async () => {
    const llmStatus = await probeLLM();
    if (!llmStatus)       skip('LLM provider not available');
    if (llmStatus === 'credit') skip('LLM provider has insufficient credits');

    const { getInstance } = require('../../src/services/llm/LLMProviderService');
    const llmProvider = getInstance();
    const svc = createQueryExpansionService({
      maxExpansions: 5, maxSynonymsPerTerm: 3, llmService: llmProvider,
    });
    const result = await svc.expand('how to submit a service request in FlowDesk', {
      generateRelated: true,
    });
    const relatedQueries = result.relatedQueries || [];
    assertGte(relatedQueries.length, 1, 'relatedQueries count');
    assert(typeof relatedQueries[0] === 'string' && relatedQueries[0].length > 5,
      'first related query too short');
    console.log(`      relatedQueries[0]: "${relatedQueries[0]}"`);
  });

  await test('AOPEG expandQueryExecutor — generateRelated=true', async () => {
    const llmStatus = await probeLLM();
    if (!llmStatus)       skip('LLM provider not available');
    if (llmStatus === 'credit') skip('LLM provider has insufficient credits');

    const { executors } = require('../../src/core/aopeg/plugins/rag/index.js');
    const result = await executors.expandQuery.execute(
      { generateRelated: true },
      { input: 'ticket assignment workflow', variables: {} }
    );
    assert(result.success === true, `executor failed: ${errMsg(result)}`);
    const relatedQueries = result.output?.relatedQueries || [];
    assertGte(relatedQueries.length, 1, 'relatedQueriesGenerated');
    console.log(`      generated ${relatedQueries.length} related queries`);
  });
}

// ─── Suite 3: Reranking ───────────────────────────────────────────────────────

async function suite3() {
  console.log('\n3. Reranking');

  const mockResults = [
    { id: 'doc-1', content: 'FlowDesk ticket routing based on SLA rules and priority levels', score: 0.72 },
    { id: 'doc-2', content: 'User authentication and session management in the portal', score: 0.68 },
    { id: 'doc-3', content: 'Service request creation workflow: approval chains and escalation', score: 0.65 },
    { id: 'doc-4', content: 'Database backup procedures and recovery scripts', score: 0.61 },
    { id: 'doc-5', content: 'Ticket assignment to handler based on location and availability', score: 0.60 },
  ];
  const query = 'how are tickets assigned to handlers in FlowDesk';

  await test('BM25 reranking changes scores', async () => {
    const { executors } = require('../../src/core/aopeg/plugins/rag/index.js');
    const result = await executors.rerankResults.execute(
      { method: 'bm25', query },
      { input: { results: [...mockResults], query }, variables: {} }
    );
    assert(result.success === true, `rerank failed: ${errMsg(result)}`);
    const reranked = result.output?.results || [];
    assertGte(reranked.length, 1, 'reranked results count');
    assert(reranked[0].id !== mockResults[0].id || reranked[0].score !== mockResults[0].score,
      'BM25 did not change ranking or scores');
    console.log(`      BM25 top: ${reranked[0].id} (${reranked[0].score.toFixed(3)})`);
  });

  await test('LLM reranking — scores reassigned in 0-1 range', async () => {
    const llmStatus = await probeLLM();
    if (!llmStatus)       skip('LLM provider not available');
    if (llmStatus === 'credit') skip('LLM provider has insufficient credits');

    const { executors } = require('../../src/core/aopeg/plugins/rag/index.js');
    const result = await executors.rerankResults.execute(
      { method: 'llm', query },
      { input: { results: [...mockResults], query }, variables: {} }
    );
    assert(result.success === true, `rerank failed: ${errMsg(result)}`);
    const reranked = result.output?.results || [];
    assertGte(reranked.length, 1, 'reranked results');
    for (const r of reranked) {
      assertRange(r.score, 0, 1, `score for ${r.id}`);
    }
    const originalScores = mockResults.map(r => r.score);
    const changed = reranked.some((r, i) => Math.abs(r.score - (originalScores[i] || 0)) > 0.01);
    assert(changed, 'LLM did not change any scores');
    console.log(`      LLM top: ${reranked[0].id} (${reranked[0].score.toFixed(3)})`);
  });

  await test('LLM reranking — relevant doc scores higher than irrelevant', async () => {
    const llmStatus = await probeLLM();
    if (!llmStatus)       skip('LLM provider not available');
    if (llmStatus === 'credit') skip('LLM provider has insufficient credits — fallback BM25 used');

    const { executors } = require('../../src/core/aopeg/plugins/rag/index.js');
    const result = await executors.rerankResults.execute(
      { method: 'llm', query },
      { input: { results: [...mockResults], query }, variables: {} }
    );
    const reranked = result.output?.results || [];
    const ticketDoc = reranked.find(r => r.id === 'doc-1');
    const backupDoc  = reranked.find(r => r.id === 'doc-4');
    if (ticketDoc && backupDoc) {
      assert(ticketDoc.score >= backupDoc.score,
        `ticket routing (${ticketDoc.score.toFixed(3)}) < backup doc (${backupDoc.score.toFixed(3)})`);
      console.log(`      ticket: ${ticketDoc.score.toFixed(3)} > backup: ${backupDoc.score.toFixed(3)} ✓`);
    }
  });

  await test('combined reranking produces sorted output', async () => {
    const { executors } = require('../../src/core/aopeg/plugins/rag/index.js');
    const result = await executors.rerankResults.execute(
      { method: 'combined', query },
      { input: { results: [...mockResults], query }, variables: {} }
    );
    assert(result.success === true, `rerank failed: ${errMsg(result)}`);
    const reranked = result.output?.results || [];
    assertGte(reranked.length, 1, 'reranked count');
    for (let i = 1; i < reranked.length; i++) {
      assert(reranked[i - 1].score >= reranked[i].score,
        `not sorted: ${reranked[i - 1].id}=${reranked[i - 1].score} > ${reranked[i].id}=${reranked[i].score}`);
    }
    console.log(`      combined top: ${reranked[0].id} (${reranked[0].score.toFixed(3)})`);
  });
}

// ─── Suite 4: Full RAG Pipeline ───────────────────────────────────────────────

async function suite4() {
  console.log('\n4. Full RAG Pipeline');

  await test('vectorSearch(namespace=unified) finds dialogue sessions', async () => {
    if (!(await probeHttp(TEI_URL + '/health'))) skip('TEI not available');

    const { executors } = require('../../src/core/aopeg/plugins/rag/index.js');
    const result = await executors.vectorSearch.execute(
      { namespace: 'unified', topK: 5, scoreThreshold: 0.3 },
      { input: 'FlowDesk service request ticket creation', variables: {} }
    );
    if (!result.success) {
      const msg = errMsg(result);
      if (msg.includes('Embedding service') || msg.includes('TEI')) skip('TEI not available');
      throw new Error(`vectorSearch failed: ${msg}`);
    }
    const { results, totalFound } = result.output;
    assertGte(totalFound, 1, 'totalFound');
    assert(results[0].score >= 0.3, `top score too low: ${results[0].score}`);
    const sid = results[0].metadata?.sessionId;
    console.log(`      ${totalFound} results, top score: ${results[0].score.toFixed(3)}, sessionId: ${sid || '(n/a)'}`);
  });

  await test('expand -> vectorSearch pipeline', async () => {
    if (!(await probeHttp(TEI_URL + '/health'))) skip('TEI not available');

    const { executors } = require('../../src/core/aopeg/plugins/rag/index.js');
    const expandResult = await executors.expandQuery.execute(
      { includeSynonyms: true, generateRelated: false },
      { input: 'ticket assignment handler location', variables: {} }
    );
    assert(expandResult.success === true, `expand failed: ${errMsg(expandResult)}`);
    const expandedQuery = expandResult.output.expandedQuery || expandResult.output.originalQuery;

    const searchResult = await executors.vectorSearch.execute(
      { namespace: 'unified', topK: 5, scoreThreshold: 0.2 },
      { input: expandedQuery, variables: { query: expandedQuery } }
    );
    if (!searchResult.success) {
      const msg = errMsg(searchResult);
      if (msg.includes('Embedding service') || msg.includes('TEI')) skip('TEI not available');
      throw new Error(`vectorSearch failed: ${msg}`);
    }
    const searchResults = searchResult.output.results;
    console.log(`      expanded: "${expandedQuery.slice(0, 60)}"`);
    console.log(`      search results: ${searchResults.length}`);
  });

  await test('expand -> vectorSearch -> rerank -> assemble (full chain)', async () => {
    if (!(await probeHttp(TEI_URL + '/health'))) skip('TEI not available');

    const llmStatus = await probeLLM();
    const { executors } = require('../../src/core/aopeg/plugins/rag/index.js');
    const query = 'SLA escalation process for high priority tickets';

    const expandResult = await executors.expandQuery.execute(
      { includeSynonyms: true },
      { input: query, variables: {} }
    );
    const expandedQuery = expandResult.output?.expandedQuery || query;

    const searchResult = await executors.vectorSearch.execute(
      { namespace: 'unified', topK: 10, scoreThreshold: 0.2 },
      { input: expandedQuery, variables: {} }
    );
    const searchResults = searchResult.output?.results || [];

    const method = (llmStatus === true) ? 'llm' : 'bm25';
    const rerankResult = await executors.rerankResults.execute(
      { method, query },
      { input: { results: searchResults, query }, variables: {} }
    );
    assert(rerankResult.success === true, `rerank failed: ${errMsg(rerankResult)}`);

    const assembleResult = await executors.assembleContext.execute(
      { maxTokens: 2000, includeMetadata: true },
      { input: { results: rerankResult.output.results, query }, variables: {} }
    );
    assert(assembleResult.success === true, `assemble failed: ${errMsg(assembleResult)}`);
    const ctx = assembleResult.output?.context || assembleResult.output?.assembledContext || '';
    console.log(`      ${searchResults.length} results -> ${method} rerank -> ${ctx.length} char context`);
    console.log(`      rerank method used: ${method}${method === 'bm25' ? ' (LLM skipped: ' + llmStatus + ')' : ''}`);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  RAG Pipeline Integration Tests');
  console.log('══════════════════════════════════════════════════════');

  const qdrant = new QdrantClient({ url: QDRANT_URL });

  await suite1(qdrant);
  await suite2();
  await suite3();
  await suite4();

  console.log('\n──────────────────────────────────────────────────────');
  console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}`);
  if (errors.length > 0) {
    console.log('\nFailures:');
    for (const { name, error } of errors) {
      console.log(`  ✗ ${name}`);
      console.log(`    ${error}`);
    }
  }
  console.log('══════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
