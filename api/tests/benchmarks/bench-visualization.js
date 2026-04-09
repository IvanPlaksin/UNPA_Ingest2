/**
 * Visualization & Export Benchmarks
 *
 * Measures performance of:
 *   - Export to all 6 formats (Cypher, GraphML, JSON-LD, GEXF, CSV, JSON)
 *   - Report generation (summary, type, relationship, comparison, timeline)
 *   - Dashboard metrics aggregation
 *   - Different graph sizes
 */

const { BenchmarkRunner, generateGraph } = require('./benchmark-runner');
const { GraphExportService } = require('../../src/services/visualization/export.service');
const { ReportService } = require('../../src/services/visualization/report.service');
const { DashboardService } = require('../../src/services/visualization/dashboard.service');

async function run() {
  const runner = new BenchmarkRunner({ iterations: 50, warmup: 5 });

  // Prepare graphs of different sizes
  const graph100 = generateGraph(100);
  const graph1K = generateGraph(1000);
  const graph5K = generateGraph(5000);

  // ── Export: small graph ──────────────────────────────────────────────────
  runner.category('Export: 100 Nodes');

  const exp100 = new GraphExportService({ graphCache: graph100 });

  await runner.benchmark('Export Cypher (100 nodes)', () => { exp100.export('cypher'); });
  await runner.benchmark('Export GraphML (100 nodes)', () => { exp100.export('graphml'); });
  await runner.benchmark('Export JSON-LD (100 nodes)', () => { exp100.export('jsonld'); });
  await runner.benchmark('Export GEXF (100 nodes)', () => { exp100.export('gexf'); });
  await runner.benchmark('Export CSV (100 nodes)', () => { exp100.export('csv'); });
  await runner.benchmark('Export JSON (100 nodes)', () => { exp100.export('json'); });

  // ── Export: medium graph ─────────────────────────────────────────────────
  runner.category('Export: 1K Nodes');

  const exp1K = new GraphExportService({ graphCache: graph1K });

  await runner.benchmark('Export Cypher (1K nodes)', () => { exp1K.export('cypher'); });
  await runner.benchmark('Export GraphML (1K nodes)', () => { exp1K.export('graphml'); });
  await runner.benchmark('Export JSON-LD (1K nodes)', () => { exp1K.export('jsonld'); });
  await runner.benchmark('Export GEXF (1K nodes)', () => { exp1K.export('gexf'); });
  await runner.benchmark('Export CSV (1K nodes)', () => { exp1K.export('csv'); });
  await runner.benchmark('Export JSON (1K nodes)', () => { exp1K.export('json'); });

  // ── Export: large graph ──────────────────────────────────────────────────
  runner.category('Export: 5K Nodes');

  const exp5K = new GraphExportService({ graphCache: graph5K });

  await runner.benchmark('Export Cypher (5K nodes)', () => { exp5K.export('cypher'); }, { iterations: 10 });
  await runner.benchmark('Export GraphML (5K nodes)', () => { exp5K.export('graphml'); }, { iterations: 10 });
  await runner.benchmark('Export JSON-LD (5K nodes)', () => { exp5K.export('jsonld'); }, { iterations: 10 });
  await runner.benchmark('Export GEXF (5K nodes)', () => { exp5K.export('gexf'); }, { iterations: 10 });
  await runner.benchmark('Export CSV (5K nodes)', () => { exp5K.export('csv'); }, { iterations: 10 });
  await runner.benchmark('Export JSON (5K nodes)', () => { exp5K.export('json'); }, { iterations: 10 });

  // ── Export with filters ──────────────────────────────────────────────────
  runner.category('Export: Filtered');

  await runner.benchmark('Export JSON filtered by type (1K)', () => {
    exp1K.export('json', { nodeTypes: ['System'] });
  });

  await runner.benchmark('Export Cypher filtered by type (1K)', () => {
    exp1K.export('cypher', { nodeTypes: ['Organization', 'Document'] });
  });

  await runner.benchmark('Export JSON with limit=50 (1K)', () => {
    exp1K.export('json', { limit: 50 });
  });

  // ── Report generation ────────────────────────────────────────────────────
  runner.category('Reports: 100 Nodes');

  const report100 = new ReportService({ graphCache: graph100, dashboardService: null });

  await runner.benchmark('Summary report (100 nodes)', () => { report100.generateSummaryReport(); });
  await runner.benchmark('Type report (100 nodes)', () => { report100.generateTypeReport('System'); });
  await runner.benchmark('Relationship report (100 nodes)', () => { report100.generateRelationshipReport(); });
  await runner.benchmark('Entity report (100 nodes)', () => { report100.generateEntityReport('n0'); });
  await runner.benchmark('Comparison report (100 nodes)', () => { report100.generateComparisonReport(['n0', 'n1']); });

  // ── Reports: medium graph ────────────────────────────────────────────────
  runner.category('Reports: 1K Nodes');

  const report1K = new ReportService({ graphCache: graph1K, dashboardService: null });

  await runner.benchmark('Summary report (1K nodes)', () => { report1K.generateSummaryReport(); });
  await runner.benchmark('Type report (1K nodes)', () => { report1K.generateTypeReport('System'); });
  await runner.benchmark('Relationship report (1K nodes)', () => { report1K.generateRelationshipReport(); });
  await runner.benchmark('Entity report (1K nodes)', () => { report1K.generateEntityReport('n0'); });
  await runner.benchmark('Comparison report (1K nodes)', () => { report1K.generateComparisonReport(['n0', 'n1']); });

  // ── Report formatting ────────────────────────────────────────────────────
  runner.category('Report Formatting');

  await runner.benchmark('Summary as Markdown (1K)', () => {
    report1K.generateSummaryReport({ format: 'markdown' });
  });

  await runner.benchmark('Summary as HTML (1K)', () => {
    report1K.generateSummaryReport({ format: 'html' });
  });

  await runner.benchmark('Relationship as Markdown (1K)', () => {
    report1K.generateRelationshipReport({ format: 'markdown' });
  });

  await runner.benchmark('Relationship as HTML (1K)', () => {
    report1K.generateRelationshipReport({ format: 'html' });
  });

  // ── Dashboard metrics ────────────────────────────────────────────────────
  runner.category('Dashboard Metrics');

  const dash100 = new DashboardService({
    graphCache: graph100,
    queryEngine: null, extractor: null, patternLibrary: null,
    jobQueue: null, ingestionPipeline: null, sourceManager: null
  });

  const dash1K = new DashboardService({
    graphCache: graph1K,
    queryEngine: null, extractor: null, patternLibrary: null,
    jobQueue: null, ingestionPipeline: null, sourceManager: null
  });

  // Add some activity for timeline benchmarks
  for (let i = 0; i < 50; i++) {
    dash1K.logActivity('query', `Activity ${i}`);
    dash1K.recordMetric('queries', { count: i, avgTime: Math.random() * 100 });
  }

  await runner.benchmark('getOverview (100 nodes)', () => { dash100.getOverview(); });
  await runner.benchmark('getOverview (1K nodes)', () => { dash1K.getOverview(); });
  await runner.benchmark('getGraphMetrics (100 nodes)', () => { dash100.getGraphMetrics(); });
  await runner.benchmark('getGraphMetrics (1K nodes)', () => { dash1K.getGraphMetrics(); });
  await runner.benchmark('getRecentActivity (50 entries)', () => { dash1K.getRecentActivity(); });
  await runner.benchmark('getSystemStatus', () => { dash1K.getSystemStatus(); });

  // ── Timeline report with dashboard ───────────────────────────────────────
  runner.category('Timeline Report');

  const reportWithDash = new ReportService({ graphCache: graph1K, dashboardService: dash1K });

  await runner.benchmark('Timeline report (50 activities)', () => {
    reportWithDash.generateTimelineReport();
  });

  await runner.benchmark('Timeline as Markdown', () => {
    reportWithDash.generateTimelineReport({ format: 'markdown' });
  });

  // ── Output ───────────────────────────────────────────────────────────────
  runner.printSummary();
  return runner;
}

if (require.main === module) {
  run().catch(console.error);
}

module.exports = { run };
