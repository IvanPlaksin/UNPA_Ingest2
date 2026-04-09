/**
 * Run All Benchmarks
 *
 * Usage:
 *   node tests/benchmarks/run-all.js                     # Run all
 *   node tests/benchmarks/run-all.js extraction           # Run extraction only
 *   node tests/benchmarks/run-all.js query                # Run query only
 *   node tests/benchmarks/run-all.js graph                # Run graph only
 *   node tests/benchmarks/run-all.js visualization        # Run visualization only
 *   node tests/benchmarks/run-all.js --json               # Output JSON to stdout
 */

const fs = require('fs');
const path = require('path');

const SUITES = {
  extraction: { module: './bench-extraction', name: 'Extraction Pipeline' },
  query: { module: './bench-query', name: 'Query Engine' },
  graph: { module: './bench-graph-operations', name: 'Graph Operations' },
  visualization: { module: './bench-visualization', name: 'Visualization & Export' }
};

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const suiteFilter = args.filter(a => !a.startsWith('--'));

  const suitesToRun = suiteFilter.length > 0
    ? Object.entries(SUITES).filter(([key]) => suiteFilter.includes(key))
    : Object.entries(SUITES);

  if (suitesToRun.length === 0) {
    console.error('Unknown suite. Available:', Object.keys(SUITES).join(', '));
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           UNPA_Ingest Performance Benchmarks                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Suites: ${suitesToRun.map(([k]) => k).join(', ')}\n`);

  const allResults = {};
  let totalBenchmarks = 0;
  let totalWarnings = 0;

  for (const [key, suite] of suitesToRun) {
    console.log(`\n${'▀'.repeat(60)}`);
    console.log(`  SUITE: ${suite.name}`);
    console.log('▀'.repeat(60));

    try {
      const { run } = require(suite.module);
      const runner = await run();
      const summary = runner.getSummary();
      allResults[key] = summary;
      totalBenchmarks += summary.totalBenchmarks;
      totalWarnings += summary.warnings;
    } catch (err) {
      console.error(`\n  ❌ Suite "${key}" failed:`, err.message);
      allResults[key] = { error: err.message };
    }
  }

  // Final summary
  console.log(`\n${'▀'.repeat(60)}`);
  console.log('  OVERALL RESULTS');
  console.log('▀'.repeat(60));
  console.log(`  Total benchmarks: ${totalBenchmarks}`);
  console.log(`  Baseline warnings: ${totalWarnings}`);
  console.log(`  Finished: ${new Date().toISOString()}`);

  // JSON output
  if (jsonOutput) {
    const output = {
      timestamp: new Date().toISOString(),
      totalBenchmarks,
      totalWarnings,
      suites: allResults
    };
    console.log('\n--- JSON OUTPUT ---');
    console.log(JSON.stringify(output, null, 2));
  }

  // Save to file
  const outputPath = path.join(__dirname, 'benchmark-results.json');
  const output = {
    timestamp: new Date().toISOString(),
    totalBenchmarks,
    totalWarnings,
    suites: allResults
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n  Results saved to: ${outputPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
