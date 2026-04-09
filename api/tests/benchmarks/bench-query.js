/**
 * Query Engine Benchmarks
 *
 * Measures performance of:
 *   - Query expansion (synonym/UN term detection)
 *   - Result fusion (RRF, linear, max, borda)
 *   - Reranking (heuristic mode, no cross-encoder)
 *   - Full query pipeline: expand → fuse → rerank
 *   - Different query complexities and result set sizes
 */

const { BenchmarkRunner } = require('./benchmark-runner');
const { QueryExpansionService } = require('../../src/services/retrieval/query-expansion.service');
const { resultFusion, rrfFusion, linearFusion, bordaFusion, deduplicateResults } = require('../../src/services/retrieval/result-fusion');
const { RerankerService } = require('../../src/services/retrieval/reranker.service');

// ── Test queries ────────────────────────────────────────────────────────────
const QUERIES = {
  simple: 'Umoja system',
  medium: 'How does UNICEF coordinate with UNESCO on education programs?',
  complex: 'What are the dependencies between Unite Docs, Inspira, and Umoja for the peacekeeping reform initiative under A/RES/74/100?',
  technical: 'PostgreSQL database migration from Umoja ERP to cloud infrastructure',
  un_heavy: 'UNDP UNICEF UNESCO UNFPA collaboration framework for SDG implementation',
};

// ── Generate mock search results ────────────────────────────────────────────
function generateResults(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `result_${i}`,
    content: `This is result ${i} about UN systems and peacekeeping operations. Score factor: ${count - i}.`,
    score: (count - i) / count,
    source: i % 3 === 0 ? 'vector' : i % 3 === 1 ? 'graph' : 'keyword',
    metadata: { index: i, layer: i % 5 === 0 ? 'recent' : 'archive' }
  }));
}

function generateRankedLists(listCount, resultsPerList) {
  return Array.from({ length: listCount }, (_, i) => ({
    results: generateResults(resultsPerList),
    weight: 1 - (i * 0.1)
  }));
}

async function run() {
  const runner = new BenchmarkRunner({ iterations: 100, warmup: 10 });

  // ── Query Expansion ──────────────────────────────────────────────────────
  runner.category('Query Expansion');

  const expander = new QueryExpansionService({ llmService: null });

  await runner.benchmark('Expand simple query', async () => {
    await expander.expand(QUERIES.simple);
  });

  await runner.benchmark('Expand medium query', async () => {
    await expander.expand(QUERIES.medium);
  });

  await runner.benchmark('Expand complex query', async () => {
    await expander.expand(QUERIES.complex);
  });

  await runner.benchmark('Expand UN-heavy query', async () => {
    await expander.expand(QUERIES.un_heavy);
  });

  await runner.benchmark('Expand technical query', async () => {
    await expander.expand(QUERIES.technical);
  });

  await runner.benchmark('Extract terms only', () => {
    expander.extractTerms(QUERIES.complex);
  });

  await runner.benchmark('Find synonyms', () => {
    const terms = expander.extractTerms(QUERIES.complex);
    expander.findSynonyms(terms);
  });

  await runner.benchmark('Detect UN entities', () => {
    expander.detectUNEntities(QUERIES.un_heavy);
  });

  // ── Result Fusion ────────────────────────────────────────────────────────
  runner.category('Result Fusion: RRF');

  const lists2x10 = generateRankedLists(2, 10);
  const lists3x50 = generateRankedLists(3, 50);
  const lists3x100 = generateRankedLists(3, 100);
  const lists5x200 = generateRankedLists(5, 200);

  await runner.benchmark('RRF: 2 lists × 10 results', () => {
    rrfFusion(lists2x10);
  });

  await runner.benchmark('RRF: 3 lists × 50 results', () => {
    rrfFusion(lists3x50);
  });

  await runner.benchmark('RRF: 3 lists × 100 results', () => {
    rrfFusion(lists3x100);
  });

  await runner.benchmark('RRF: 5 lists × 200 results', () => {
    rrfFusion(lists5x200);
  }, { iterations: 50 });

  runner.category('Result Fusion: Other Methods');

  await runner.benchmark('Linear: 3 lists × 50 results', () => {
    linearFusion(lists3x50);
  });

  await runner.benchmark('Borda: 3 lists × 50 results', () => {
    bordaFusion(lists3x50);
  });

  await runner.benchmark('Full resultFusion (RRF default)', () => {
    resultFusion(lists3x50);
  });

  await runner.benchmark('Full resultFusion (linear)', () => {
    resultFusion(lists3x50, { method: 'linear' });
  });

  runner.category('Deduplication');

  const dupeResults = [
    ...generateResults(50),
    ...generateResults(50) // duplicates
  ];

  await runner.benchmark('Deduplicate 100 results (50 dupes)', () => {
    deduplicateResults(dupeResults, 'id');
  });

  const largeDupeResults = [
    ...generateResults(500),
    ...generateResults(200)
  ];

  await runner.benchmark('Deduplicate 700 results (200 dupes)', () => {
    deduplicateResults(largeDupeResults, 'id');
  });

  // ── Reranking ────────────────────────────────────────────────────────────
  runner.category('Reranking (Heuristic)');

  const reranker = new RerankerService({ useCrossEncoder: false });

  const results10 = generateResults(10);
  const results50 = generateResults(50);
  const results200 = generateResults(200);

  await runner.benchmark('Rerank 10 results', async () => {
    await reranker.rerank(QUERIES.medium, results10);
  });

  await runner.benchmark('Rerank 50 results', async () => {
    await reranker.rerank(QUERIES.medium, results50);
  });

  await runner.benchmark('Rerank 200 results', async () => {
    await reranker.rerank(QUERIES.medium, results200, { topK: 20 });
  }, { iterations: 50 });

  // ── Full Pipeline: expand → fuse → rerank ────────────────────────────────
  runner.category('Full Query Pipeline');

  await runner.benchmark('Pipeline: simple query, 2×10', async () => {
    await expander.expand(QUERIES.simple);
    const fused = rrfFusion(lists2x10);
    await reranker.rerank(QUERIES.simple, fused, { topK: 5 });
  });

  await runner.benchmark('Pipeline: medium query, 3×50', async () => {
    await expander.expand(QUERIES.medium);
    const fused = rrfFusion(lists3x50);
    await reranker.rerank(QUERIES.medium, fused, { topK: 10 });
  });

  await runner.benchmark('Pipeline: complex query, 3×100', async () => {
    await expander.expand(QUERIES.complex);
    const fused = rrfFusion(lists3x100);
    await reranker.rerank(QUERIES.complex, fused, { topK: 10 });
  });

  await runner.benchmark('Pipeline: complex query, 5×200', async () => {
    await expander.expand(QUERIES.complex);
    const fused = rrfFusion(lists5x200);
    await reranker.rerank(QUERIES.complex, fused, { topK: 20 });
  }, { iterations: 20 });

  // ── Output ───────────────────────────────────────────────────────────────
  runner.printSummary();
  return runner;
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { run };
