'use strict';

/**
 * TASK-FLOWDESK-010: Migrate FlowDesk graphs from JSON files to Memgraph via GraphCatalog.
 *
 * Creates: CatalogEntry + GraphDefinition + GraphVersion for each graph.
 * Also creates GraphCategory nodes and USES_GRAPH edges.
 *
 * Usage: node api/src/services/flowdesk/migrate-graphs.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../..', '.env') });

const fs = require('fs');
const path = require('path');
const { graphCatalogService: catalogService } = require('../graphCatalog.service');
const neo4j = require('neo4j-driver');
const { MEMGRAPH_CONFIG } = require('./import-config');

const GRAPHS_DIR = path.join(__dirname, 'graphs');

async function getSession() {
  const driver = neo4j.driver(
    MEMGRAPH_CONFIG.uri,
    neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password),
    { disableLosslessIntegers: true }
  );
  return { driver, session: driver.session() };
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Migrate FlowDesk Graphs to Memgraph             ║');
  console.log('╚══════════════════════════════════════════════════╝');

  const { driver, session } = await getSession();

  try {
    // ── Step 1: Create GraphCategory nodes ──
    console.log('\n── Step 1: Create GraphCategory nodes ──');
    const categories = [
      { id: 'dialog', name: 'Dialog Graphs', description: 'Conversation flow graphs for multi-turn user interactions', namespace: 'FLOWDESK' },
      { id: 'process', name: 'Process Graphs', description: 'Business workflow graphs for service request execution', namespace: 'FLOWDESK' },
      { id: 'routing', name: 'Routing Graphs', description: 'Service classification and handler routing graphs', namespace: 'FLOWDESK' },
      { id: 'extraction', name: 'Extraction Graphs', description: 'Data extraction and transformation graphs', namespace: 'CORE' },
      { id: 'integration', name: 'Integration Graphs', description: 'External system integration graphs', namespace: 'CORE' },
    ];

    for (const cat of categories) {
      await session.run(`
        MERGE (c:GraphCategory {id: $id})
        SET c.name = $name, c.description = $description, c.namespace = $namespace,
            c.created_at = datetime()
      `, cat);
      console.log(`  Created: ${cat.id} (${cat.name})`);
    }

    // ── Step 2: Migrate intake-dialog graph ──
    console.log('\n── Step 2: Migrate intake-dialog graph ──');
    const intakeDialog = JSON.parse(
      fs.readFileSync(path.join(GRAPHS_DIR, 'intake-dialog.graph.json'), 'utf-8')
    );

    // Check if already exists
    const existing1 = await catalogService.listGraphs({ namespace: 'FLOWDESK', search: 'Intake Dialog' });
    if (existing1.data?.length > 0) {
      console.log(`  SKIP: intake-dialog already exists (entryId: ${existing1.data[0].entryId})`);
    } else {
      const result1 = await catalogService.createGraph({
        name: 'Intake Dialog',
        namespace: 'FLOWDESK',
        type: 'dialog',
        description: intakeDialog.description || 'Main intake conversation flow for service requests',
        tags: ['flowdesk', 'intake', 'dialog', 'multilingual'],
        nodes: intakeDialog.nodes.map((n, i) => ({
          id: n.id,
          type: n.type === 'start' ? 'start' : n.type === 'end' ? 'end' : (n.type || 'dialog_node'),
          position: { x: 100 + (i % 4) * 220, y: 50 + Math.floor(i / 4) * 150 },
          data: {
            label: n.id,
            executor: n.executor,
            tool: n.executor, // GXE uses data.tool
            prompt: n.prompt || null,
            transitions: n.transitions,
            config: n.config || {},
          },
        })),
        edges: intakeDialog.edges.map((e, i) => ({
          id: `e-${i}`,
          source: e.from,
          target: e.to,
          label: e.condition || '',
          data: { condition: e.condition || null },
        })),
        createdBy: 'migration',
      });
      console.log(`  Created: ${result1.entryId} (${result1.name})`);

      // Add category edge
      await session.run(`
        MATCH (g:CatalogEntry {entryId: $eid})
        MATCH (c:GraphCategory {id: 'dialog'})
        MERGE (g)-[:HAS_CATEGORY]->(c)
      `, { eid: result1.entryId });
      console.log(`  Linked to category: dialog`);
    }

    // ── Step 3: Migrate it-hw-lap process graph ──
    console.log('\n── Step 3: Migrate it-hw-lap process graph ──');
    const laptopProcess = JSON.parse(
      fs.readFileSync(path.join(GRAPHS_DIR, 'it-hw-lap.graph.json'), 'utf-8')
    );

    const existing2 = await catalogService.listGraphs({ namespace: 'FLOWDESK', search: 'Laptop Request' });
    if (existing2.data?.length > 0) {
      console.log(`  SKIP: it-hw-lap already exists (entryId: ${existing2.data[0].entryId})`);
    } else {
      const result2 = await catalogService.createGraph({
        name: 'Laptop Request Workflow',
        namespace: 'FLOWDESK',
        type: 'business',
        description: 'Business process for IT hardware laptop requests. SLA: 72h, approval required.',
        tags: ['flowdesk', 'process', 'it-hardware', 'approval-required', 'IT-HW-LAP'],
        nodes: laptopProcess.nodes.map((n, i) => ({
          id: n.id,
          type: n.type === 'start' ? 'start' : n.type === 'end' ? 'end' : (n.type || 'executor'),
          position: { x: 100 + (i % 3) * 250, y: 50 + Math.floor(i / 3) * 140 },
          data: {
            label: n.id,
            executor: n.executor,
            tool: n.executor, // GXE uses data.tool
            config: n.config || {},
          },
        })),
        edges: laptopProcess.edges.map((e, i) => ({
          id: `e-${i}`,
          source: e.from,
          target: e.to,
          label: e.condition || '',
          data: { condition: e.condition || null },
        })),
        createdBy: 'migration',
      });
      console.log(`  Created: ${result2.entryId} (${result2.name})`);

      // Add category edge
      await session.run(`
        MATCH (g:CatalogEntry {entryId: $eid})
        MATCH (c:GraphCategory {id: 'process'})
        MERGE (g)-[:HAS_CATEGORY]->(c)
      `, { eid: result2.entryId });

      // Link to ServiceCatalogItem
      await session.run(`
        MATCH (g:CatalogEntry {entryId: $eid})
        MATCH (s:ServiceCatalogItem {code: 'IT-HW-LAP'})
        MERGE (s)-[:USES_GRAPH]->(g)
      `, { eid: result2.entryId });
      console.log(`  Linked to category: process`);
      console.log(`  Linked to ServiceCatalogItem: IT-HW-LAP`);
    }

    // ── Step 4: Verify ──
    console.log('\n── Step 4: Verification ──');

    const cats = await session.run('MATCH (c:GraphCategory) RETURN c.id AS id, c.name AS name');
    console.log(`  GraphCategories: ${cats.records.length}`);
    cats.records.forEach(r => console.log(`    ${r.get('id')}: ${r.get('name')}`));

    const fdGraphs = await session.run(`
      MATCH (g:CatalogEntry {namespace: 'FLOWDESK'})
      RETURN g.entryId AS id, g.name AS name, g.type AS type, g.currentVersion AS ver
    `);
    console.log(`\n  FLOWDESK graphs: ${fdGraphs.records.length}`);
    fdGraphs.records.forEach(r => console.log(`    [${r.get('type')}] ${r.get('name')} (v${r.get('ver')}, id: ${r.get('id')})`));

    const link = await session.run(`
      MATCH (s:ServiceCatalogItem {code: 'IT-HW-LAP'})-[:USES_GRAPH]->(g:CatalogEntry)
      RETURN s.code AS svc, g.name AS graph
    `);
    if (link.records.length > 0) {
      console.log(`\n  USES_GRAPH: ${link.records[0].get('svc')} → ${link.records[0].get('graph')}`);
    }

  } finally {
    await session.close();
    await driver.close();
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
