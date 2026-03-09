#!/usr/bin/env node
/**
 * Run Migration 000: Cleanup pre-multidomain extraction data
 * Usage: node api/scripts/run-migration-000.js [--dry-run]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const { MemgraphService } = require('../src/services/memgraph.service');
  const mg = new MemgraphService();

  try {
    await mg.connect();
    console.log('[Migration 000] Connected to Memgraph');

    // Pre-check: count existing nodes
    const checks = [
      { label: 'IngestionSession', query: 'MATCH (n:IngestionSession) RETURN count(n) as cnt' },
      { label: 'KnowledgeGraph (sql-extraction)', query: "MATCH (n:KnowledgeGraph) WHERE n.namespace = 'sql-extraction' OR n.source = 'sql-extraction' RETURN count(n) as cnt" },
      { label: 'CatalogEntry (sql-extraction)', query: "MATCH (n:CatalogEntry) WHERE n.namespace = 'sql-extraction' RETURN count(n) as cnt" },
      { label: 'BusinessEntity (orphaned)', query: 'MATCH (n:BusinessEntity) WHERE NOT (n)--() RETURN count(n) as cnt' },
      { label: 'TableProfile', query: 'MATCH (n:TableProfile) RETURN count(n) as cnt' },
      { label: 'PromptRecord', query: 'MATCH (n:PromptRecord) RETURN count(n) as cnt' },
    ];

    console.log('\n--- PRE-MIGRATION STATE ---');
    for (const check of checks) {
      try {
        const result = await mg.runQuery(check.query);
        const cnt = result?.[0]?.cnt ?? 0;
        const count = typeof cnt === 'object' && cnt.toNumber ? cnt.toNumber() : cnt;
        console.log(`  ${check.label}: ${count}`);
      } catch (e) {
        console.log(`  ${check.label}: (query failed: ${e.message})`);
      }
    }

    if (DRY_RUN) {
      console.log('\n[DRY RUN] No changes made. Remove --dry-run to execute.');
      process.exit(0);
    }

    // Execute migration queries one by one
    const queries = [
      {
        name: 'Remove KnowledgeGraph (sql-extraction)',
        cypher: `MATCH (g:KnowledgeGraph) WHERE g.namespace = 'sql-extraction' OR g.source = 'sql-extraction' DETACH DELETE g`,
      },
      {
        name: 'Remove IngestionSession chains',
        cypher: `MATCH (s:IngestionSession) DETACH DELETE s`,
      },
      {
        name: 'Remove IngestionPhase nodes',
        cypher: `MATCH (p:IngestionPhase) DETACH DELETE p`,
      },
      {
        name: 'Remove AgentStep nodes',
        cypher: `MATCH (st:AgentStep) DETACH DELETE st`,
      },
      {
        name: 'Remove PromptRecord nodes',
        cypher: `MATCH (pr:PromptRecord) DETACH DELETE pr`,
      },
      {
        name: 'Remove AgentDecision nodes',
        cypher: `MATCH (ad:AgentDecision) DETACH DELETE ad`,
      },
      {
        name: 'Remove TableProfile nodes',
        cypher: `MATCH (tp:TableProfile) DETACH DELETE tp`,
      },
      {
        name: 'Remove ExtractionMetric nodes',
        cypher: `MATCH (em:ExtractionMetric) DETACH DELETE em`,
      },
      {
        name: 'Remove DiscoveredAnomaly nodes',
        cypher: `MATCH (da:DiscoveredAnomaly) DETACH DELETE da`,
      },
      {
        name: 'Remove StrategyVersion nodes',
        cypher: `MATCH (sv:StrategyVersion) DETACH DELETE sv`,
      },
      {
        name: 'Remove orphaned BusinessEntity nodes',
        cypher: `MATCH (n:BusinessEntity) WHERE NOT (n)--() DELETE n`,
      },
      {
        name: 'Remove orphaned BusinessRelationship nodes',
        cypher: `MATCH (n:BusinessRelationship) WHERE NOT (n)--() DELETE n`,
      },
      {
        name: 'Remove orphaned BusinessRule nodes',
        cypher: `MATCH (n:BusinessRule) WHERE NOT (n)--() DELETE n`,
      },
      {
        name: 'Remove orphaned Calculation nodes',
        cypher: `MATCH (n:Calculation) WHERE NOT (n)--() DELETE n`,
      },
      {
        name: 'Remove orphaned StoredProcedureKG nodes',
        cypher: `MATCH (n:StoredProcedureKG) WHERE NOT (n)--() DELETE n`,
      },
      {
        name: 'Remove orphaned Enumeration/EnumValue nodes',
        cypher: `MATCH (n) WHERE (n:Enumeration OR n:EnumValue) AND NOT (n)--() DELETE n`,
      },
      {
        name: 'Remove orphaned LifecycleState nodes',
        cypher: `MATCH (n:LifecycleState) WHERE NOT (n)--() DELETE n`,
      },
      {
        name: 'Remove orphaned DatabaseTable nodes',
        cypher: `MATCH (n:DatabaseTable) WHERE NOT (n)--() DELETE n`,
      },
      {
        name: 'Remove orphaned EntityAttribute nodes',
        cypher: `MATCH (n:EntityAttribute) WHERE NOT (n)--() DELETE n`,
      },
      {
        name: 'Remove CatalogEntry (sql-extraction)',
        cypher: `MATCH (c:CatalogEntry) WHERE c.namespace = 'sql-extraction' DETACH DELETE c`,
      },
    ];

    console.log('\n--- EXECUTING MIGRATION ---');
    for (const q of queries) {
      try {
        await mg.runQuery(q.cypher);
        console.log(`  [OK] ${q.name}`);
      } catch (e) {
        console.log(`  [WARN] ${q.name}: ${e.message}`);
      }
    }

    // Post-check
    console.log('\n--- POST-MIGRATION STATE ---');
    for (const check of checks) {
      try {
        const result = await mg.runQuery(check.query);
        const cnt = result?.[0]?.cnt ?? 0;
        const count = typeof cnt === 'object' && cnt.toNumber ? cnt.toNumber() : cnt;
        console.log(`  ${check.label}: ${count}`);
      } catch (e) {
        console.log(`  ${check.label}: (query failed: ${e.message})`);
      }
    }

    console.log('\n[Migration 000] Complete.');
  } catch (err) {
    console.error('[Migration 000] FATAL:', err.message);
    process.exit(1);
  } finally {
    try { await mg.disconnect(); } catch (_) {}
    process.exit(0);
  }
}

main();
