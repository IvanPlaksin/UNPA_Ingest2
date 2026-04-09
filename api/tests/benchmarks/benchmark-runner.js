/**
 * Benchmark Runner Utility
 *
 * Features:
 *   - benchmark(name, fn, options) with iterations + warmup
 *   - Statistics: min, max, avg, median, p95, p99, stdDev
 *   - Memory usage tracking (before/after)
 *   - Category grouping
 *   - Console + JSON formatted output
 *   - Baseline threshold warnings
 *
 * @module tests/benchmarks/benchmark-runner
 */

class BenchmarkRunner {
  constructor(options = {}) {
    this.defaultIterations = options.iterations || 100;
    this.defaultWarmup = options.warmup || 10;
    this.results = [];
    this.currentCategory = 'General';
    this.baselines = options.baselines || {};
    this.verbose = options.verbose !== false;
  }

  category(name) {
    this.currentCategory = name;
    if (this.verbose) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`  ${name}`);
      console.log('─'.repeat(60));
    }
  }

  async benchmark(name, fn, options = {}) {
    const iterations = options.iterations || this.defaultIterations;
    const warmup = options.warmup || this.defaultWarmup;
    const isAsync = options.async !== false && fn.constructor.name === 'AsyncFunction';

    // Warmup
    for (let i = 0; i < warmup; i++) {
      if (isAsync) await fn(); else fn();
    }

    // Force GC if available
    if (global.gc) global.gc();

    const memBefore = process.memoryUsage();
    const times = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      if (isAsync) await fn(); else fn();
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1e6); // ms
    }

    const memAfter = process.memoryUsage();

    const stats = this._computeStats(times);
    const memDelta = {
      heapUsed: memAfter.heapUsed - memBefore.heapUsed,
      rss: memAfter.rss - memBefore.rss
    };

    const result = {
      name,
      category: this.currentCategory,
      iterations,
      warmup,
      stats,
      memory: {
        heapDelta: this._formatBytes(memDelta.heapUsed),
        rssDelta: this._formatBytes(memDelta.rss),
        heapDeltaBytes: memDelta.heapUsed,
        rssDeltaBytes: memDelta.rss
      },
      timestamp: new Date().toISOString()
    };

    // Check baseline
    const baselineKey = `${this.currentCategory}::${name}`;
    const baseline = this.baselines[baselineKey];
    if (baseline) {
      result.baseline = baseline;
      result.withinBaseline = stats.median <= baseline;
      if (!result.withinBaseline && this.verbose) {
        console.log(`  ⚠️  ${name}: median ${stats.median.toFixed(3)}ms exceeds baseline ${baseline}ms`);
      }
    }

    this.results.push(result);

    if (this.verbose) {
      const opsPerSec = stats.avg > 0 ? Math.round(1000 / stats.avg) : '∞';
      console.log(
        `  ${result.withinBaseline === false ? '⚠️' : '✅'} ${name}` +
        `  avg=${stats.avg.toFixed(3)}ms  med=${stats.median.toFixed(3)}ms` +
        `  p95=${stats.p95.toFixed(3)}ms  p99=${stats.p99.toFixed(3)}ms` +
        `  (${opsPerSec} ops/s, ${iterations} iters)`
      );
    }

    return result;
  }

  _computeStats(times) {
    const sorted = [...times].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    const median = n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];

    const variance = sorted.reduce((s, t) => s + (t - avg) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    return {
      min: sorted[0],
      max: sorted[n - 1],
      avg,
      median,
      p95: sorted[Math.floor(n * 0.95)],
      p99: sorted[Math.floor(n * 0.99)],
      stdDev,
      total: sum
    };
  }

  getSummary() {
    const categories = {};
    for (const result of this.results) {
      if (!categories[result.category]) categories[result.category] = [];
      categories[result.category].push(result);
    }
    return {
      totalBenchmarks: this.results.length,
      categories,
      timestamp: new Date().toISOString(),
      warnings: this.results.filter(r => r.withinBaseline === false).length
    };
  }

  toJSON() {
    return JSON.stringify(this.getSummary(), null, 2);
  }

  printSummary() {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  BENCHMARK SUMMARY');
    console.log('═'.repeat(60));

    const summary = this.getSummary();

    for (const [cat, benchmarks] of Object.entries(summary.categories)) {
      console.log(`\n  ${cat}:`);
      for (const b of benchmarks) {
        const flag = b.withinBaseline === false ? '⚠️' : '  ';
        console.log(
          `  ${flag} ${b.name.padEnd(45)}` +
          `avg=${b.stats.avg.toFixed(3).padStart(8)}ms  ` +
          `med=${b.stats.median.toFixed(3).padStart(8)}ms  ` +
          `mem=${b.memory.heapDelta}`
        );
      }
    }

    console.log(`\n  Total: ${summary.totalBenchmarks} benchmarks`);
    if (summary.warnings > 0) {
      console.log(`  ⚠️ ${summary.warnings} benchmarks exceeded baseline`);
    }
    console.log('═'.repeat(60));
  }

  _formatBytes(bytes) {
    const abs = Math.abs(bytes);
    const sign = bytes < 0 ? '-' : '+';
    if (abs < 1024) return `${sign}${abs} B`;
    if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
    return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// ── Helpers: generate test data at various scales ──────────────────────────

function generateText(sizeKB) {
  const paragraph = 'The United Nations Department of Peace Operations (UNDPO) has launched a comprehensive reform initiative. UNICEF and UNESCO collaborate on education programs in conflict zones. The Secretary-General submitted recommendations to the General Assembly. Key systems include Umoja (ERP), Inspira (HR), Unite Docs, and iNeed. Work item #12345 tracks the migration. Contact john.doe@un.org for details. Version 3.2.1 deployed to /opt/unpa/reports. A/RES/74/100 outlines findings.\n\n';
  const targetBytes = sizeKB * 1024;
  let text = '';
  while (Buffer.byteLength(text) < targetBytes) {
    text += paragraph;
  }
  return text.slice(0, targetBytes);
}

function generateGraph(nodeCount, edgeMultiplier = 2) {
  const nodes = new Map();
  const edges = new Map();
  const types = ['System', 'Organization', 'Document', 'Person', 'API', 'Database'];

  for (let i = 0; i < nodeCount; i++) {
    nodes.set(`n${i}`, {
      name: `Node_${i}`,
      type: types[i % types.length],
      attributes: { index: i, version: `${(i % 5) + 1}.0` }
    });
  }

  const edgeCount = Math.min(nodeCount * edgeMultiplier, nodeCount * (nodeCount - 1) / 2);
  const edgeTypes = ['USES', 'DEPENDS_ON', 'CONTAINS', 'MANAGES', 'REFERENCES', 'AUTHORED_BY'];
  for (let i = 0; i < edgeCount; i++) {
    const src = `n${i % nodeCount}`;
    const tgt = `n${(i * 7 + 3) % nodeCount}`;
    if (src !== tgt) {
      edges.set(`e${i}`, {
        source: src,
        target: tgt,
        type: edgeTypes[i % edgeTypes.length]
      });
    }
  }

  return { nodes, edges, adjacency: new Map() };
}

module.exports = { BenchmarkRunner, generateText, generateGraph };
