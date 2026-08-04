#!/usr/bin/env node
/**
 * Radix retrieval benchmark.
 *
 * Measures workspace-scoped retrieval against REAL Qdrant, Memgraph and TEI —
 * there is no mock path here on purpose. Latency and quality on synthetic data
 * told us nothing useful; every defect that mattered surfaced only against a
 * real workspace.
 *
 * Usage:
 *   node scripts/radix-benchmark.js --workspace <id>
 *   node scripts/radix-benchmark.js --workspace <id> --queries 50 --warmup 3 \
 *     --config '{"maxElements":10}' --output results/bench.json --verbose
 *
 * @module scripts/radix-benchmark
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  queries: 30,
  warmup: 3,
  config: {},
  output: null,
  verbose: false
};

/** Budget the R1 gate is measured against. */
const P95_BUDGET_MS = 500;
const EMPTY_RATE_LIMIT = 0.05;
const CORROBORATION_FLOOR = 0.30;

const USAGE = `
Radix retrieval benchmark

  --workspace <id>     Workspace to benchmark (required)
  --queries <n>        Measured queries (default ${DEFAULTS.queries})
  --warmup <n>         Warm-up queries, excluded from stats (default ${DEFAULTS.warmup})
  --config <json>      RetrievalConfig overrides, e.g. '{"maxElements":10}'
  --output <path>      Write the full JSON result here (default: stdout summary only)
  --verbose            Print every query as it runs
  --help               This message
`;

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => argv[i + 1];
    switch (flag) {
      case '--workspace': args.workspace = next(); i += 1; break;
      case '--queries': args.queries = parseInt(next(), 10); i += 1; break;
      case '--warmup': args.warmup = parseInt(next(), 10); i += 1; break;
      case '--config': args.config = JSON.parse(next()); i += 1; break;
      case '--output': args.output = next(); i += 1; break;
      case '--verbose': args.verbose = true; break;
      case '--help': args.help = true; break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

/**
 * Percentile by nearest-rank over a sorted copy.
 * @param {number[]} values
 * @param {number} p - 0..100
 * @returns {number}
 */
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

const mean = (v) => (v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length);
const round = (n) => Math.round(n * 100) / 100;

function summarize(values) {
  return {
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length ? Math.max(...values) : 0,
    min: values.length ? Math.min(...values) : 0,
    mean: round(mean(values))
  };
}

/**
 * Loads benchmark queries.
 *
 * Prefers a curated file — a fixed query set is what makes two runs comparable.
 * Falls back to draft names from the workspace so the script is usable on any
 * workspace without curation, at the cost of run-to-run comparability.
 *
 * @param {Object} memgraph
 * @param {string} workspaceId
 * @param {number} count
 * @returns {Promise<{queries: string[], source: string}>}
 */
async function loadQueries(memgraph, workspaceId, count) {
  const curatedPath = path.join(__dirname, 'benchmark-queries.json');
  if (fs.existsSync(curatedPath)) {
    const parsed = JSON.parse(fs.readFileSync(curatedPath, 'utf8'));
    if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      const queries = [];
      while (queries.length < count) {
        queries.push(...parsed.queries);
      }
      return { queries: queries.slice(0, count), source: 'benchmark-queries.json' };
    }
  }

  const rows = await memgraph.runQuery(
    `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d)
     WHERE d.name IS NOT NULL
     RETURN d.name AS name, d.description AS description`,
    { wsId: workspaceId }
  );

  if (!rows || rows.length === 0) {
    throw new Error(`Workspace ${workspaceId} has no drafts to build queries from`);
  }

  // Shuffle so a run does not just walk the graph's insertion order.
  const shuffled = [...rows].sort(() => Math.random() - 0.5);
  const queries = [];
  while (queries.length < count) {
    for (const row of shuffled) {
      if (queries.length >= count) break;
      const description = (row.description || '').slice(0, 60);
      queries.push(`${row.name} ${description}`.trim());
    }
  }

  return { queries: queries.slice(0, count), source: 'generated from draft names' };
}

/**
 * Corroboration is measured over STRUCTURED elements only.
 *
 * A source-text chunk comes from a single seed strategy and has no edges, so it
 * can never be corroborated by the graph. Counting chunks in the denominator
 * measures the draft/chunk ratio rather than retrieval quality, and would drive
 * the metric below its threshold purely by adding more source text.
 *
 * @returns {{elements: number, structured: number, corroborated: number,
 *   chunks: number, conflicts: number, failed: boolean}}
 */
function qualityOf(bundle) {
  const isChunk = (e) => Boolean((e.metadata || {}).isSourceChunk);
  const structured = bundle.elements.filter((e) => !isChunk(e));

  return {
    elements: bundle.elements.length,
    structured: structured.length,
    corroborated: structured.filter((e) => (e.strategies || []).length > 1).length,
    chunks: bundle.elements.filter(isChunk).length,
    conflicts: bundle.elements.filter((e) => (e.metadata || {}).conflict).length,
    failed: (bundle.stats.failedStrategies || []).length > 0
  };
}

function progressBar(done, total) {
  const width = 40;
  const filled = Math.round((done / total) * width);
  return `[${'█'.repeat(filled)}${' '.repeat(width - filled)}] ${done}/${total}`;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || !args.workspace) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const memgraphService = require('../src/services/memgraph.service');
  const qdrantService = require('../src/services/qdrant.service');
  const { createRadixRetriever } = require('../src/services/radix');

  const retriever = createRadixRetriever({ qdrantService, memgraphService });

  const { queries, source } = await loadQueries(
    memgraphService,
    args.workspace,
    args.queries + args.warmup + 1
  );

  process.stdout.write('\nRadix Benchmark\n===============\n');
  process.stdout.write(`Workspace: ${args.workspace}\n`);
  process.stdout.write(`Queries:   ${args.queries} (+ ${args.warmup} warmup)\n`);
  process.stdout.write(`Source:    ${source}\n`);
  process.stdout.write(`Config:    ${JSON.stringify(args.config)}\n\n`);

  const run = (query) => retriever.retrieve(args.workspace, query, args.config);

  // Cold start is measured on its own: it includes connection handshakes a live
  // request never pays, so folding it into P95 would slander the steady state —
  // and hiding it entirely would hide a real first-user experience.
  const coldStartBegan = Date.now();
  await run(queries[0]);
  const coldStart = Date.now() - coldStartBegan;
  process.stdout.write(`Cold start: ${coldStart}ms\n`);

  process.stdout.write('Warming up... ');
  for (let i = 0; i < args.warmup; i += 1) {
    await run(queries[1 + i]);
  }
  process.stdout.write(`done (${args.warmup} queries)\n\nRunning benchmark...\n`);

  const raw = [];
  for (let i = 0; i < args.queries; i += 1) {
    const query = queries[1 + args.warmup + i];
    const began = Date.now();
    const bundle = await run(query);
    const wallMs = Date.now() - began;
    const quality = qualityOf(bundle);

    raw.push({
      query,
      wallMs,
      totalMs: bundle.timing.totalMs,
      embeddingMs: bundle.timing.embeddingMs,
      vectorSeedMs: bundle.timing.byStrategy['vector-seed'] || 0,
      kHopMs: bundle.timing.byStrategy['k-hop-expansion'] || 0,
      fusionMs: bundle.timing.fusionMs,
      rerankMs: bundle.timing.rerankMs || 0,
      reranked: Boolean(bundle.reranked),
      assemblyMs: bundle.timing.assemblyMs,
      ...quality,
      // Candidates that survived fusion, BEFORE maxElements/tokenBudget trimming.
      // This is what a reranker would have to work with: if it sits at or below
      // maxElements there is nothing to reorder, and reranking cannot pay off
      // however much latency budget is available.
      poolSize: bundle.stats.afterFusion,
      failedStrategies: bundle.stats.failedStrategies,
      totalTokens: bundle.stats.totalTokens
    });

    if (args.verbose) {
      process.stdout.write(
        `  ${String(i + 1).padStart(3)}. ${wallMs}ms  ${quality.elements} el`
        + `  ${quality.corroborated} corr  "${query.slice(0, 50)}"\n`
      );
    } else {
      process.stdout.write(`\r${progressBar(i + 1, args.queries)}`);
    }
  }
  if (!args.verbose) process.stdout.write('\n');

  const totals = raw.map((r) => r.totalMs);
  const elements = raw.map((r) => r.elements);
  const totalElements = elements.reduce((a, b) => a + b, 0);
  const totalStructured = raw.reduce((a, r) => a + r.structured, 0);
  const totalCorroborated = raw.reduce((a, r) => a + r.corroborated, 0);
  const totalChunks = raw.reduce((a, r) => a + r.chunks, 0);

  const latency = {
    total: summarize(totals),
    embedding: { mean: round(mean(raw.map((r) => r.embeddingMs))) },
    vectorSeed: { mean: round(mean(raw.map((r) => r.vectorSeedMs))) },
    kHopExpansion: { mean: round(mean(raw.map((r) => r.kHopMs))) },
    fusion: { mean: round(mean(raw.map((r) => r.fusionMs))) },
    rerank: {
      mean: round(mean(raw.map((r) => r.rerankMs))),
      p95: percentile(raw.map((r) => r.rerankMs), 95),
      appliedRate: round(raw.filter((r) => r.reranked).length / raw.length)
    },
    assembly: { mean: round(mean(raw.map((r) => r.assemblyMs))) },
    coldStart
  };

  const pools = raw.map((r) => r.poolSize);

  const quality = {
    // What a reranker would have to reorder.
    candidatesBeforeTruncation: {
      mean: round(mean(pools)),
      min: Math.min(...pools),
      max: Math.max(...pools)
    },
    elementsPerQuery: {
      mean: round(mean(elements)),
      min: Math.min(...elements),
      max: Math.max(...elements)
    },
    // Share of STRUCTURED elements that two strategies independently surfaced —
    // the direct measure of whether hybrid retrieval beats vector alone.
    corroborationRate: totalStructured ? round(totalCorroborated / totalStructured) : 0,
    // Share of the answer that came from raw source text rather than drafts —
    // how much reach the chunk index actually adds.
    chunkContribution: totalElements ? round(totalChunks / totalElements) : 0,
    conflictsFound: raw.reduce((a, r) => a + r.conflicts, 0),
    failureRate: round(raw.filter((r) => r.failed).length / raw.length),
    emptyRate: round(raw.filter((r) => r.elements === 0).length / raw.length),
    meanTokens: round(mean(raw.map((r) => r.totalTokens)))
  };

  const verdict = {
    p95Under500ms: latency.total.p95 < P95_BUDGET_MS,
    noFailures: quality.failureRate === 0,
    emptyRateAcceptable: quality.emptyRate <= EMPTY_RATE_LIMIT,
    corroborationHealthy: quality.corroborationRate >= CORROBORATION_FLOOR
  };
  verdict.passed = Object.values(verdict).every(Boolean);

  const result = {
    meta: {
      workspaceId: args.workspace,
      timestamp: new Date().toISOString(),
      queryCount: args.queries,
      warmupCount: args.warmup,
      querySource: source,
      config: args.config
    },
    latency,
    quality,
    verdict,
    raw
  };

  const t = latency.total;
  process.stdout.write('\nLATENCY (ms)\n');
  process.stdout.write(
    `  Total:      p50=${t.p50}  p95=${t.p95}  p99=${t.p99}  max=${t.max}  mean=${t.mean}\n`
  );
  process.stdout.write(`  Embedding:  mean=${latency.embedding.mean}\n`);
  process.stdout.write(`  Vector:     mean=${latency.vectorSeed.mean}\n`);
  process.stdout.write(`  K-hop:      mean=${latency.kHopExpansion.mean}\n`);
  process.stdout.write(`  Fusion:     mean=${latency.fusion.mean}\n`);
  process.stdout.write(
    `  Rerank:     mean=${latency.rerank.mean}  p95=${latency.rerank.p95}`
    + `  applied=${Math.round(latency.rerank.appliedRate * 100)}%\n`
  );
  process.stdout.write(`  Assembly:   mean=${latency.assembly.mean}\n`);
  process.stdout.write(`  Cold start: ${coldStart}\n`);

  const pool = quality.candidatesBeforeTruncation;
  process.stdout.write('\nQUALITY\n');
  process.stdout.write(
    `  Candidate pool: mean=${pool.mean}  min=${pool.min}  max=${pool.max}`
    + `  (limit ${args.config.fusionPoolSize || 50}, shown ${args.config.maxElements || 15})\n`
  );
  process.stdout.write(
    `  Elements/query: mean=${quality.elementsPerQuery.mean}`
    + `  min=${quality.elementsPerQuery.min}  max=${quality.elementsPerQuery.max}\n`
  );
  process.stdout.write(
    `  Corroboration:  ${Math.round(quality.corroborationRate * 100)}% (of structured elements)\n`
  );
  process.stdout.write(`  From chunks:    ${Math.round(quality.chunkContribution * 100)}%\n`);
  process.stdout.write(`  Conflicts:      ${quality.conflictsFound}\n`);
  process.stdout.write(`  Failures:       ${Math.round(quality.failureRate * 100)}%\n`);
  process.stdout.write(`  Empty:          ${Math.round(quality.emptyRate * 100)}%\n`);
  process.stdout.write(`  Context tokens: mean=${quality.meanTokens}\n`);

  const mark = (ok) => (ok ? '[PASS]' : '[FAIL]');
  process.stdout.write('\nVERDICT\n');
  process.stdout.write(`  ${mark(verdict.p95Under500ms)} P95 (${t.p95}ms) < ${P95_BUDGET_MS}ms budget\n`);
  process.stdout.write(`  ${mark(verdict.noFailures)} Failure rate ${Math.round(quality.failureRate * 100)}%\n`);
  process.stdout.write(`  ${mark(verdict.emptyRateAcceptable)} Empty rate ${Math.round(quality.emptyRate * 100)}% <= ${EMPTY_RATE_LIMIT * 100}%\n`);
  process.stdout.write(`  ${mark(verdict.corroborationHealthy)} Corroboration ${Math.round(quality.corroborationRate * 100)}% >= ${CORROBORATION_FLOOR * 100}%\n`);
  process.stdout.write(`\n  ${verdict.passed ? 'PASSED' : 'FAILED'}\n\n`);

  if (args.output) {
    const outPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
    process.stdout.write(`Written to ${outPath}\n`);
  }

  // Non-zero exit on failure so CI can gate on this.
  process.exit(verdict.passed ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`\nBenchmark failed: ${error.message}\n${error.stack}\n`);
  process.exit(1);
});
