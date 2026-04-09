#!/usr/bin/env node
/**
 * Seed CODEX-PROCESS-001: GXE AI Assistant Graph Building Algorithm
 *
 * Creates CodexRule node (category PROCESS) and links to:
 *   - META-GRAPH CatalogEntry
 *   - ProcessGraph documentation node
 *   - AgentProfile (GXE AI Assistant)
 *
 * Usage: node api/scripts/seed-codex-process-001.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const CODEX_ENTRY = {
  id: 'CODEX-PROCESS-001',
  title: 'GXE AI Assistant Graph Building Algorithm',
  category: 'PROCESS',
  namespace: 'META',
  version: '1.0.0',
  status: 'ACTIVE',
  scope: ['bootstrap', 'meta', 'process', 'assistant'],
  priority: 'P1',
  summary: [
    'The GXE AI Assistant builds graphs through a 15-step algorithm:',
    '1. Session + Context initialization (Redis TTL 7200s, 7 KnowledgeSections)',
    '2. ToolFilter reduces tools by ~57% based on intent classification',
    '3. Catalog search determines reuse strategy (DIRECT_REUSE/CLONE_MODIFY/CREATE_NEW)',
    '4. Anthropic agentic loop (max 10 iterations) with %%ACTION%% blocks',
    '5. GraphValidator (6 checks) + auto-fix',
    '6. SSE streaming to frontend, user applies actions via ActionCard',
    'Key files: anthropic-agent.service.js, GraphActionParser.js, graph-validator.js, catalog-reuse.service.js',
  ].join('\n'),
  contentPath: 'docs/codex/processes/PROCESS-001-assistant-graph-building.md',
  linkedGraphId: 'META-GRAPH-ASSISTANT-BUILDING-V1',
  tags: [
    'assistant', 'graph-building', 'algorithm', 'process',
    'anthropic', 'agentic-loop', 'tool-filter', 'catalog-reuse',
    'validation', 'sse', 'meta-graph',
  ],
};

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Seed: CODEX-PROCESS-001 — Graph Building Algorithm        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const memgraphService = require('../src/services/memgraph.service');

  // Retry connection
  let connected = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      if (!memgraphService.driver) {
        console.log(`[${attempt}/5] Waiting for Memgraph driver...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      const session = memgraphService.driver.session();
      await session.run('RETURN 1');
      await session.close();
      connected = true;
      console.log('[OK] Memgraph connected');
      break;
    } catch (err) {
      console.warn(`[${attempt}/5] Memgraph not ready: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!connected) {
    console.error('[FAIL] Cannot connect to Memgraph. Exiting.');
    process.exit(1);
  }

  const session = memgraphService.driver.session();

  try {
    // 1. Create or update CodexRule node (codexId is the unique constraint)
    console.log('\n[1/4] Creating CodexRule node...');
    await session.run(`
      MERGE (cr:CodexRule {codexId: $codexId})
      SET cr.title = $title,
          cr.category = $category,
          cr.namespace = $namespace,
          cr.version = $version,
          cr.status = $status,
          cr.scope = $scope,
          cr.priority = $priority,
          cr.summary = $summary,
          cr.contentPath = $contentPath,
          cr.linkedGraphId = $linkedGraphId,
          cr.tags = $tags,
          cr.nodeType = 'CodexRule',
          cr.ruleKind = 'DESCRIPTIVE',
          cr.modality = 'SHOULD',
          cr.deonticState = 'ACTIVE',
          cr.createdAt = datetime(),
          cr.createdBy = 'architecture-session'
    `, {
      codexId: CODEX_ENTRY.id,
      title: CODEX_ENTRY.title,
      category: CODEX_ENTRY.category,
      namespace: CODEX_ENTRY.namespace,
      version: CODEX_ENTRY.version,
      status: CODEX_ENTRY.status,
      scope: CODEX_ENTRY.scope,
      priority: CODEX_ENTRY.priority,
      summary: CODEX_ENTRY.summary,
      contentPath: CODEX_ENTRY.contentPath,
      linkedGraphId: CODEX_ENTRY.linkedGraphId,
      tags: CODEX_ENTRY.tags,
    });
    console.log('  [OK] CodexRule created:', CODEX_ENTRY.id);

    // 2. Link to META-GRAPH CatalogEntry
    console.log('\n[2/4] Linking to CatalogEntry...');
    const linkCatalog = await session.run(`
      MATCH (cr:CodexRule {codexId: $codexId})
      MATCH (cat:CatalogEntry) WHERE cat.name CONTAINS 'Graph Building Process'
      MERGE (cr)-[r:DOCUMENTS]->(cat)
      ON CREATE SET r.createdAt = datetime()
      RETURN cat.id AS graphId, cat.name AS graphName
    `, { codexId: CODEX_ENTRY.id });

    if (linkCatalog.records.length > 0) {
      console.log('  [OK] Linked to CatalogEntry:', linkCatalog.records[0].get('graphName'));
    } else {
      console.warn('  [!] CatalogEntry not found — run seed-meta-assistant-graph-building.js first');
    }

    // 3. Link to ProcessGraph + AgentProfile
    console.log('\n[3/4] Linking to ProcessGraph and AgentProfile...');

    const linkPG = await session.run(`
      MATCH (cr:CodexRule {codexId: $codexId})
      MATCH (pg:ProcessGraph {id: 'META-GRAPH-ASSISTANT-BUILDING-V1'})
      MERGE (cr)-[r:DOCUMENTS]->(pg)
      ON CREATE SET r.createdAt = datetime()
      RETURN pg.id AS pgId
    `, { codexId: CODEX_ENTRY.id });
    console.log('  ProcessGraph:', linkPG.records.length > 0 ? 'linked' : 'NOT FOUND');

    const linkAP = await session.run(`
      MATCH (cr:CodexRule {codexId: $codexId})
      MATCH (ap:AgentProfile {name: 'GXE AI Assistant'})
      MERGE (cr)-[r:DOCUMENTS_AGENT]->(ap)
      ON CREATE SET r.createdAt = datetime()
      RETURN ap.name AS apName
    `, { codexId: CODEX_ENTRY.id });
    console.log('  AgentProfile:', linkAP.records.length > 0 ? 'linked' : 'NOT FOUND');

    // 4. Verify
    console.log('\n[4/4] Verification...');
    const verify = await session.run(`
      MATCH (cr:CodexRule {codexId: $codexId})
      OPTIONAL MATCH (cr)-[:DOCUMENTS]->(cat:CatalogEntry)
      OPTIONAL MATCH (cr)-[:DOCUMENTS]->(pg:ProcessGraph)
      OPTIONAL MATCH (cr)-[:DOCUMENTS_AGENT]->(ap:AgentProfile)
      RETURN cr.codexId AS id, cr.title AS title, cr.category AS category,
             cr.namespace AS ns, cr.status AS status,
             cat.name AS catalogEntry,
             pg.id AS processGraph,
             ap.name AS agentProfile
    `, { codexId: CODEX_ENTRY.id });

    const rec = verify.records[0];
    console.log('');
    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log(`│ ID:           ${rec.get('id')}`);
    console.log(`│ Title:        ${rec.get('title')}`);
    console.log(`│ Category:     ${rec.get('category')}`);
    console.log(`│ Namespace:    ${rec.get('ns')}`);
    console.log(`│ Status:       ${rec.get('status')}`);
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log(`│ → CatalogEntry:  ${rec.get('catalogEntry') || 'NOT LINKED'}`);
    console.log(`│ → ProcessGraph:  ${rec.get('processGraph') || 'NOT LINKED'}`);
    console.log(`│ → AgentProfile:  ${rec.get('agentProfile') || 'NOT LINKED'}`);
    console.log('└─────────────────────────────────────────────────────────┘');

    console.log('\n[DONE] CODEX-PROCESS-001 seeded successfully.');

  } catch (err) {
    console.error('[FAIL]', err.message);
    process.exit(1);
  } finally {
    await session.close();
    try { await memgraphService.driver.close(); } catch (_) {}
  }
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
