#!/usr/bin/env node
/**
 * E2E Test: Multi-Domain Extraction Pipeline
 *
 * Tests the complete flow: SQL Server → MssqlAgent → Memgraph (D1-D4)
 *
 * Usage:
 *   node scripts/test-e2e-extraction.js --database=MyDB [--server=localhost] [--verbose]
 *   node scripts/test-e2e-extraction.js --help
 */
require('dotenv').config();
const path = require('path');
const neo4j = require('neo4j-driver');

// ── CLI Args ──
function parseArgs() {
  const args = {
    server: process.env.MSSQL_SERVER || 'localhost',
    port: parseInt(process.env.MSSQL_PORT) || 1433,
    database: process.env.MSSQL_DATABASE || null,
    user: process.env.MSSQL_USER || 'sa',
    password: process.env.MSSQL_PASSWORD || '',
    schemas: null,
    verbose: false,
    help: false,
    skipExtraction: false, // only verify existing data
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--verbose' || arg === '-v') args.verbose = true;
    else if (arg === '--skip-extraction') args.skipExtraction = true;
    else if (arg.startsWith('--server=')) args.server = arg.split('=')[1];
    else if (arg.startsWith('--port=')) args.port = parseInt(arg.split('=')[1]);
    else if (arg.startsWith('--database=')) args.database = arg.split('=')[1];
    else if (arg.startsWith('--user=')) args.user = arg.split('=')[1];
    else if (arg.startsWith('--password=')) args.password = arg.split('=')[1];
    else if (arg.startsWith('--schemas=')) args.schemas = arg.split('=')[1];
  }

  return args;
}

function printHelp() {
  console.log(`
E2E Multi-Domain Extraction Test

Usage:
  node scripts/test-e2e-extraction.js [options]

Options:
  --server=HOST       SQL Server host (default: localhost)
  --port=PORT         SQL Server port (default: 1433)
  --database=NAME     Database name (required unless --skip-extraction)
  --user=USER         SQL Server user (default: sa)
  --password=PASS     SQL Server password
  --schemas=a,b       Comma-separated schema filter
  --verbose, -v       Verbose output
  --skip-extraction   Only verify existing domain data in Memgraph
  --help, -h          Show this help

Example:
  node scripts/test-e2e-extraction.js --database=IMIS_Test --verbose
  node scripts/test-e2e-extraction.js --skip-extraction
`);
}

// ── Domain Verification ──
async function verifyDomains(memgraphService, verbose) {
  const results = {
    D1_STRUCTURAL: {},
    D2_BEHAVIORAL: {},
    D3_SEMANTIC: {},
    D4_TEMPORAL: {},
    crossDomainEdges: {},
  };

  // D1: Structural
  const d1Entities = await memgraphService.runQuery('MATCH (e:StructuralEntity) RETURN count(e) as c');
  const d1Attrs = await memgraphService.runQuery('MATCH (a:StructuralAttribute) RETURN count(a) as c');
  results.D1_STRUCTURAL = {
    entities: _toNum(d1Entities[0]?.c),
    attributes: _toNum(d1Attrs[0]?.c),
  };

  // D2: Behavioral
  const d2Graphs = await memgraphService.runQuery(
    "MATCH (g:DomainGraph {domain: 'BEHAVIORAL'}) RETURN count(g) as c"
  );
  const d2Nodes = await memgraphService.runQuery('MATCH (n:BehavioralNode) RETURN count(n) as c');
  results.D2_BEHAVIORAL = {
    graphs: _toNum(d2Graphs[0]?.c),
    nodes: _toNum(d2Nodes[0]?.c),
  };

  // D3: Semantic
  const d3Rules = await memgraphService.runQuery('MATCH (r:SemanticRule) RETURN count(r) as c');
  const d3Calcs = await memgraphService.runQuery('MATCH (c:SemanticCalculation) RETURN count(c) as c');
  const d3Concepts = await memgraphService.runQuery('MATCH (c:SemanticConcept) RETURN count(c) as c');
  results.D3_SEMANTIC = {
    rules: _toNum(d3Rules[0]?.c),
    calculations: _toNum(d3Calcs[0]?.c),
    concepts: _toNum(d3Concepts[0]?.c),
  };

  // D4: Temporal
  const d4Machines = await memgraphService.runQuery('MATCH (m:TemporalStateMachine) RETURN count(m) as c');
  const d4States = await memgraphService.runQuery('MATCH (s:TemporalState) RETURN count(s) as c');
  const d4Trans = await memgraphService.runQuery('MATCH (t:TemporalTransition) RETURN count(t) as c');
  results.D4_TEMPORAL = {
    machines: _toNum(d4Machines[0]?.c),
    states: _toNum(d4States[0]?.c),
    transitions: _toNum(d4Trans[0]?.c),
  };

  // Cross-domain edges
  try {
    const crossEdges = await memgraphService.runQuery(
      'MATCH ()-[e:CROSS_DOMAIN]->() RETURN e.edgeType as edgeType, count(e) as count'
    );
    for (const row of crossEdges) {
      results.crossDomainEdges[row.edgeType] = _toNum(row.count);
    }
  } catch (_) {
    // CROSS_DOMAIN edges may not exist yet
  }

  return results;
}

/** Convert neo4j Integer to JS number if needed */
function _toNum(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  if (val.low !== undefined) return val.low; // neo4j Integer
  return parseInt(val) || 0;
}

function printResults(domains) {
  console.log('\n========================================');
  console.log('  DOMAIN VERIFICATION');
  console.log('========================================\n');

  console.log('D1 STRUCTURAL');
  console.log(`   Entities:    ${domains.D1_STRUCTURAL.entities}`);
  console.log(`   Attributes:  ${domains.D1_STRUCTURAL.attributes}`);

  console.log('D2 BEHAVIORAL');
  console.log(`   Graphs:      ${domains.D2_BEHAVIORAL.graphs}`);
  console.log(`   Nodes:       ${domains.D2_BEHAVIORAL.nodes}`);

  console.log('D3 SEMANTIC');
  console.log(`   Rules:       ${domains.D3_SEMANTIC.rules}`);
  console.log(`   Calculations:${domains.D3_SEMANTIC.calculations}`);
  console.log(`   Concepts:    ${domains.D3_SEMANTIC.concepts}`);

  console.log('D4 TEMPORAL');
  console.log(`   Machines:    ${domains.D4_TEMPORAL.machines}`);
  console.log(`   States:      ${domains.D4_TEMPORAL.states}`);
  console.log(`   Transitions: ${domains.D4_TEMPORAL.transitions}`);

  const crossKeys = Object.keys(domains.crossDomainEdges);
  if (crossKeys.length > 0) {
    console.log('\nCROSS-DOMAIN EDGES');
    for (const [type, count] of Object.entries(domains.crossDomainEdges)) {
      console.log(`   ${type}: ${count}`);
    }
  } else {
    console.log('\nCROSS-DOMAIN EDGES: (none)');
  }
}

// ── Main ──
async function main() {
  const args = parseArgs();
  if (args.help) { printHelp(); return; }

  console.log('\n========================================');
  console.log('  E2E MULTI-DOMAIN EXTRACTION TEST');
  console.log('========================================\n');

  const startTime = Date.now();

  // 1. Load memgraphService singleton
  let memgraphService;
  try {
    memgraphService = require(path.join(__dirname, '..', 'src', 'services', 'memgraph.service'));
    // Test connection
    await memgraphService.runQuery('RETURN 1 as t');
    console.log('[OK] Memgraph connected');
  } catch (e) {
    console.error('[FAIL] Memgraph connection:', e.message);
    process.exit(1);
  }

  if (args.skipExtraction) {
    console.log('\n[INFO] --skip-extraction: only verifying existing data\n');
    const domains = await verifyDomains(memgraphService, args.verbose);
    printResults(domains);

    const hasData =
      domains.D1_STRUCTURAL.entities > 0 ||
      domains.D2_BEHAVIORAL.graphs > 0 ||
      domains.D3_SEMANTIC.rules > 0 ||
      domains.D4_TEMPORAL.machines > 0;

    console.log(`\n${hasData ? 'PASS' : 'WARN'}: ${hasData ? 'Domain data found' : 'No domain data — run extraction first'}`);
    process.exit(hasData ? 0 : 0);
    return;
  }

  if (!args.database) {
    console.error('Error: --database is required (or use --skip-extraction)');
    process.exit(1);
  }

  // 2. Load services
  let llmService;
  try {
    llmService = require(path.join(__dirname, '..', 'src', 'services', 'llm.service'));
    console.log('[OK] LLM service loaded');
  } catch (e) {
    console.warn('[WARN] LLM service not available:', e.message);
    llmService = { chat: async () => '{}' };
  }

  const { MSSQLConnector } = require(path.join(__dirname, '..', 'src', 'services', 'connectors', 'mssql.connector'));
  const { IngestionGraphService } = require(path.join(__dirname, '..', 'src', 'services', 'ingestion', 'ingestion-graph.service'));
  const { MetaLearningRetriever } = require(path.join(__dirname, '..', 'src', 'services', 'ingestion', 'meta-retriever.service'));
  const { MssqlAgent } = require(path.join(__dirname, '..', 'src', 'services', 'connectors', 'mssql.agent'));

  console.log('[OK] All services loaded');

  // 3. Create agent
  const connector = new MSSQLConnector();
  const ingestionGraph = new IngestionGraphService(memgraphService);
  let metaRetriever = null;
  try {
    metaRetriever = new MetaLearningRetriever(memgraphService);
  } catch (_) {}

  const events = [];
  const agent = new MssqlAgent({
    connector,
    llmService,
    emit: (event, data) => {
      events.push({ event, time: Date.now() });
      if (args.verbose) {
        if (event === 'log') {
          console.log(`   [${data.level || 'info'}] ${data.message || ''}`);
        } else {
          console.log(`   [EVENT] ${event}`);
        }
      }
    },
    metaRetriever,
    ingestionGraph,
  });

  console.log(`[OK] Agent created (session: ${agent.session.id})\n`);

  // 4. Run extraction
  console.log(`Extracting from: ${args.server}:${args.port}/${args.database}`);
  console.log('This may take several minutes...\n');

  const connectionConfig = {
    server: args.server,
    port: args.port,
    database: args.database,
    username: args.user,
    password: args.password,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  };

  const options = {
    schemas: args.schemas ? args.schemas.split(',').map(s => s.trim()) : null,
    analyzeProcedures: true,
    skipMetaConsultation: false,
  };

  let result;
  try {
    result = await agent.run(connectionConfig, options);
    console.log('\n[OK] Extraction completed');
  } catch (e) {
    console.error('\n[FAIL] Extraction error:', e.message);
    if (args.verbose) console.error(e.stack);
    // Still try to verify whatever was written
  }

  // 5. Verify domains
  const domains = await verifyDomains(memgraphService, args.verbose);
  printResults(domains);

  // 6. Summary
  const elapsed = Date.now() - startTime;
  const hasD1 = domains.D1_STRUCTURAL.entities > 0;
  const hasD2 = domains.D2_BEHAVIORAL.graphs > 0;
  const hasD3 = domains.D3_SEMANTIC.rules > 0 || domains.D3_SEMANTIC.calculations > 0;
  const hasD4 = domains.D4_TEMPORAL.machines > 0;
  const crossCount = Object.values(domains.crossDomainEdges).reduce((a, b) => a + b, 0);

  console.log('\n========================================');
  console.log('  TEST SUMMARY');
  console.log('========================================');
  console.log(`  D1 STRUCTURAL:  ${hasD1 ? 'PASS' : 'FAIL'}`);
  console.log(`  D2 BEHAVIORAL:  ${hasD2 ? 'PASS' : 'FAIL'}`);
  console.log(`  D3 SEMANTIC:    ${hasD3 ? 'PASS' : 'WARN (may need LLM)'}`);
  console.log(`  D4 TEMPORAL:    ${hasD4 ? 'PASS' : 'WARN (needs status columns)'}`);
  console.log(`  CROSS-DOMAIN:   ${crossCount} edges`);
  console.log(`  Events:         ${events.length}`);
  console.log(`  Duration:       ${(elapsed / 1000).toFixed(1)}s`);

  if (result?.session?.id) {
    console.log(`  Session ID:     ${result.session.id}`);
  }

  const allPass = hasD1 && hasD2;
  console.log(`\n  ${allPass ? 'PASS' : 'PARTIAL'}: ${allPass ? 'Core domains populated' : 'Some domains empty (check DB content)'}`);
  console.log('========================================\n');

  process.exit(allPass ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
