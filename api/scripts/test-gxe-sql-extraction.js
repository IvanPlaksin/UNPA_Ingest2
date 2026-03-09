#!/usr/bin/env node
/**
 * E2E Test: GXE-based SQL Extraction Pipeline
 *
 * Executes each SQL extraction executor individually in pipeline order,
 * validating outputs at each step. This tests the executors end-to-end
 * against a real SQL Server database.
 *
 * Usage:
 *   node scripts/test-gxe-sql-extraction.js [--verbose] [--port=1435]
 */
require('dotenv').config();
const path = require('path');

const CONFIG = {
  server: 'localhost',
  port: parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1] || '1435'),
  database: 'FlowDesc',
  user: 'sa',
  password: 'SqlExpress2022#Dev',
};
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${label}`);
  }
}

async function main() {
  console.log('\n========================================');
  console.log('  GXE SQL EXTRACTION — E2E TEST');
  console.log('========================================\n');

  // 1. Load plugin + register executors
  console.log('Phase 0: Plugin Registration');
  const { SqlExtractionPlugin } = require(
    path.join(__dirname, '..', 'src', 'core', 'aopeg', 'plugins', 'sql-extraction', 'sql-extraction.plugin')
  );
  const plugin = new SqlExtractionPlugin();
  await plugin.initialize();
  plugin.register();
  check('8 executors registered', plugin.executors.length === 8);

  // Create shared context (simulates GraphWalker context)
  const sharedState = new Map();
  const context = { sharedState, variables: {}, metadata: {} };

  // ── Phase 1: sql.connect ──
  console.log('\nPhase 1: SQL Connect');
  const connectExec = plugin.executors.find(e => e.type === 'sql.connect');
  const connectResult = await connectExec.execute({
    server: CONFIG.server,
    database: CONFIG.database,
    user: CONFIG.user,
    password: CONFIG.password,
    port: CONFIG.port,
  }, context);

  check('Connection successful', connectResult.success === true);
  check('connectionId returned', !!connectResult.output?.connectionId);
  const connectionId = connectResult.output?.connectionId;
  if (VERBOSE) console.log(`    connectionId: ${connectionId}`);

  if (!connectionId) {
    console.error('\nFATAL: Cannot connect to SQL Server. Aborting.');
    process.exit(1);
  }

  // ── Phase 2: sql.schema_scan ──
  console.log('\nPhase 2: Schema Scan');
  const scanExec = plugin.executors.find(e => e.type === 'sql.schema_scan');
  const scanResult = await scanExec.execute({
    connectionId,
    schemas: ['dbo'],
    includeViews: false,
  }, context);

  check('Schema scan successful', scanResult.success === true);
  check('Tables found', scanResult.output?.tableCount > 0);
  check('Columns found', scanResult.output?.columnCount > 0);
  check('FKs found', scanResult.output?.fkCount > 0);
  if (VERBOSE) {
    console.log(`    Tables: ${scanResult.output?.tableCount}`);
    console.log(`    Columns: ${scanResult.output?.columnCount}`);
    console.log(`    FKs: ${scanResult.output?.fkCount}`);
  }

  const databaseMap = scanResult.output?.databaseMap;

  // ── Phase 3: sql.query (sample data) ──
  console.log('\nPhase 3: SQL Query (sample)');
  const queryExec = plugin.executors.find(e => e.type === 'sql.query');
  const queryResult = await queryExec.execute({
    connectionId,
    query: 'SELECT TOP 5 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME',
  }, context);

  check('Query executed', queryResult.success === true);
  check('Rows returned', queryResult.output?.rowCount > 0);
  if (VERBOSE) {
    console.log(`    Rows: ${queryResult.output?.rowCount}`);
    console.log(`    First: ${queryResult.output?.rows?.[0]?.TABLE_NAME}`);
  }

  // ── Phase 4: sql.procedure_list ──
  console.log('\nPhase 4: Procedure List');
  const procListExec = plugin.executors.find(e => e.type === 'sql.procedure_list');
  const procResult = await procListExec.execute({
    connectionId,
    schemas: ['dbo'],
    includeTriggers: true,
  }, context);

  check('Procedure list successful', procResult.success === true);
  check('Procedures found', procResult.output?.procedureCount > 0);
  if (VERBOSE) {
    console.log(`    Procedures: ${procResult.output?.procedureCount}`);
    console.log(`    Triggers: ${procResult.output?.triggerCount}`);
    for (const p of (procResult.output?.procedures || []).slice(0, 3)) {
      console.log(`      ${p.type}: ${p.schema}.${p.name} (${p.sql?.length || 0} chars)`);
    }
  }

  const procedures = procResult.output?.procedures || [];

  // ── Phase 5: sql.ast_parse (first procedure) ──
  console.log('\nPhase 5: AST Parse');
  let astResult = null;
  if (procedures.length > 0) {
    const firstProc = procedures[0];
    const astExec = plugin.executors.find(e => e.type === 'sql.ast_parse');
    astResult = await astExec.execute({
      sql: firstProc.sql,
      procedureName: firstProc.name,
      procedureSchema: firstProc.schema,
    }, context);

    check('AST parse executed', astResult.success === true);
    check('Parameters extracted', astResult.output?.parameters?.length >= 0);
    if (VERBOSE) {
      console.log(`    Procedure: ${firstProc.name}`);
      console.log(`    Parse success: ${astResult.output?.parseSuccess}`);
      console.log(`    Parameters: ${astResult.output?.parameters?.length}`);
    }
  } else {
    console.log('  [SKIP] No procedures to parse');
  }

  // ── Phase 6: sql.gxe_translate ──
  console.log('\nPhase 6: GXE Translate');
  let translateResult = null;
  if (procedures.length > 0) {
    const firstProc = procedures[0];
    const translateExec = plugin.executors.find(e => e.type === 'sql.gxe_translate');
    translateResult = await translateExec.execute({
      ast: astResult?.output?.parseSuccess ? astResult.output.ast : null,
      sql: firstProc.sql,
      procedureName: firstProc.name,
      procedureSchema: firstProc.schema,
    }, context);

    check('GXE translate executed', translateResult.success === true);
    check('GXE nodes generated', translateResult.output?.nodeCount >= 0);
    check('Referenced tables extracted', Array.isArray(translateResult.output?.referencedTables));
    if (VERBOSE) {
      console.log(`    Nodes: ${translateResult.output?.nodeCount}`);
      console.log(`    Edges: ${translateResult.output?.edgeCount}`);
      console.log(`    Confidence: ${translateResult.output?.confidence}`);
      console.log(`    Tables: ${JSON.stringify(translateResult.output?.referencedTables)}`);
    }
  } else {
    console.log('  [SKIP] No procedures to translate');
  }

  // ── Phase 7: sql.domain_persist (D1 structural) ──
  console.log('\nPhase 7: Domain Persist (D1)');
  const persistExec = plugin.executors.find(e => e.type === 'sql.domain_persist');
  const d1Result = await persistExec.execute({
    domain: 'STRUCTURAL',
    action: 'createEntitiesFromMap',
    data: databaseMap,
    sessionId: 'gxe-test-session',
    sourceDatabase: CONFIG.database,
  }, context);

  check('D1 persist executed', d1Result.success === true);
  if (VERBOSE && d1Result.output) {
    console.log(`    Created: ${d1Result.output.created}, Failed: ${d1Result.output.failed}`);
  }

  // ── Phase 7b: D1 FK edges ──
  console.log('\nPhase 7b: Domain Persist (D1 FKs)');
  const fkResult = await persistExec.execute({
    domain: 'STRUCTURAL',
    action: 'createForeignKeys',
    data: { edges: databaseMap?.foreignKeys || [] },
    sessionId: 'gxe-test-session',
  }, context);
  check('FK persist executed', fkResult.success === true);

  // ── Phase 8: sql.cross_domain_link ──
  console.log('\nPhase 8: Cross-Domain Link (sample)');
  const linkExec = plugin.executors.find(e => e.type === 'sql.cross_domain_link');

  // Get a structural entity and behavioral graph to link
  const memgraph = require(path.join(__dirname, '..', 'src', 'services', 'memgraph.service'));
  const entities = await memgraph.runQuery(
    'MATCH (e:StructuralEntity) RETURN e.id as id, e.tableName as name LIMIT 1'
  );
  const graphs = await memgraph.runQuery(
    "MATCH (g:DomainGraph {domain: 'BEHAVIORAL'}) RETURN g.id as id, g.procedureName as name LIMIT 1"
  );

  if (entities.length > 0 && graphs.length > 0) {
    const linkResult = await linkExec.execute({
      sourceId: graphs[0].id,
      targetId: entities[0].id,
      edgeType: 'OPERATES_ON',
      sourceDomain: 'BEHAVIORAL',
      targetDomain: 'STRUCTURAL',
    }, context);
    check('Cross-domain link executed', linkResult.success === true);
    if (VERBOSE) {
      console.log(`    ${graphs[0].name} → ${entities[0].name}: created=${linkResult.output?.created}`);
    }
  } else {
    console.log('  [SKIP] No entities/graphs to link');
  }

  // ── Verification: Domain counts ──
  console.log('\nVerification: Domain Counts');
  const d1Count = await memgraph.runQuery('MATCH (e:StructuralEntity) RETURN count(e) as c');
  const d2Count = await memgraph.runQuery("MATCH (g:DomainGraph {domain: 'BEHAVIORAL'}) RETURN count(g) as c");
  const d3Count = await memgraph.runQuery('MATCH (r:SemanticRule) RETURN count(r) as c');
  const crossCount = await memgraph.runQuery('MATCH ()-[e:CROSS_DOMAIN]->() RETURN count(e) as c');

  const d1c = d1Count[0]?.c || 0;
  const d2c = d2Count[0]?.c || 0;
  const d3c = d3Count[0]?.c || 0;
  const xc = crossCount[0]?.c || 0;

  check('D1 entities > 0', d1c > 0);
  check('D2 graphs > 0', d2c > 0);
  check('D3 rules > 0', d3c > 0);
  check('Cross-domain edges > 0', xc > 0);

  console.log(`\n  D1 STRUCTURAL:  ${d1c} entities`);
  console.log(`  D2 BEHAVIORAL:  ${d2c} graphs`);
  console.log(`  D3 SEMANTIC:    ${d3c} rules`);
  console.log(`  CROSS-DOMAIN:   ${xc} edges`);

  // ── Cleanup: close SQL connection ──
  const pool = sharedState.get(`sql:pool:${connectionId}`);
  if (pool) await pool.close().catch(() => {});

  // ── Summary ──
  console.log('\n========================================');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`  ${failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
