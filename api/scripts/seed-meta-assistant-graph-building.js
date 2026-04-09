#!/usr/bin/env node
/**
 * Seed META-GRAPH: GXE AI Assistant Graph Building Process
 *
 * Creates an executable graph representing the algorithm by which the GXE AI
 * Assistant builds AOPEG graphs. Stored in Memgraph under namespace "META".
 *
 * Also links ProcessStep nodes to existing KnowledgeSections for documentation.
 *
 * Usage: node api/scripts/seed-meta-assistant-graph-building.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { META_GRAPH_ASSISTANT_BUILDING } = require('../src/services/graph-definitions/meta-assistant-graph-building.js');

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: Write to Memgraph + link KnowledgeSections
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Seed: META-GRAPH — GXE AI Assistant Graph Building        ║');
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

  const { graphCatalogService } = require('../src/services/graphCatalog.service');

  // Check if graph already exists
  const existing = await graphCatalogService.listGraphs({
    namespace: 'META',
    search: 'GXE AI Assistant',
  });

  const graphData = {
    name: META_GRAPH_ASSISTANT_BUILDING.name,
    namespace: META_GRAPH_ASSISTANT_BUILDING.namespace || 'META',
    type: 'process-documentation',
    description: META_GRAPH_ASSISTANT_BUILDING.description,
    version: META_GRAPH_ASSISTANT_BUILDING.version,
    tags: ['meta', 'process', 'assistant', 'graph-building', 'executable', 'documentation'],
    isPublic: true,
    nodes: META_GRAPH_ASSISTANT_BUILDING.nodes,
    edges: META_GRAPH_ASSISTANT_BUILDING.edges,
  };

  let graphId;

  if (existing.data && existing.data.length > 0) {
    const existingGraph = existing.data.find(g =>
      g.name === META_GRAPH_ASSISTANT_BUILDING.name ||
      g.name?.includes('Graph Building Process')
    );
    if (existingGraph) {
      console.log(`[UPDATE] Graph already exists (id: ${existingGraph.id}), updating...`);
      const updated = await graphCatalogService.updateGraph(existingGraph.id, {
        nodes: graphData.nodes,
        edges: graphData.edges,
        description: graphData.description,
        version: graphData.version,
        tags: graphData.tags,
      });
      graphId = updated.id || existingGraph.id;
      console.log(`[OK] Graph updated: ${updated.name} (${graphId})`);
      printSummary(updated);
    }
  }

  if (!graphId) {
    console.log('[CREATE] Writing new graph to Memgraph...');
    const created = await graphCatalogService.createGraph(graphData);
    graphId = created.id;
    console.log(`[OK] Graph created: ${created.name} (${graphId})`);
    printSummary(created);
  }

  // ── Link to KnowledgeSections ────────────────────────────────────────
  console.log('\n[LINK] Linking ProcessSteps to KnowledgeSections...');
  await linkToKnowledgeSections(memgraphService, graphId);

  // ── Create ProcessGraph documentation node ───────────────────────────
  console.log('\n[DOC] Creating ProcessGraph documentation node...');
  await createProcessDocumentation(memgraphService, graphId);

  await cleanup(memgraphService);
  console.log('\n[DONE] META-GRAPH seeded successfully.');
}

/**
 * Link the META-GRAPH to existing KnowledgeSections that document the AI assistant.
 * Creates DOCUMENTED_BY relationships.
 */
async function linkToKnowledgeSections(memgraphService, graphId) {
  const session = memgraphService.driver.session();
  try {
    // Map graph steps to KnowledgeSections by relevance
    const links = [
      { step: 'M-N03', sectionTitle: 'GXE Assistant Mandate', reason: 'System prompt includes mandate' },
      { step: 'M-N05', sectionTitle: 'Action Block Format (MANDATORY)', reason: 'LLM uses action format from this section' },
      { step: 'M-N05', sectionTitle: 'Executor Taxonomy (42 executors, 7 domains)', reason: 'Available tools from taxonomy' },
      { step: 'M-N06', sectionTitle: 'Action Block Format (MANDATORY)', reason: 'Parser implements format from this section' },
      { step: 'M-N09', sectionTitle: 'Graph Validation Rules', reason: 'Validator checks from this section' },
      { step: 'M-N03', sectionTitle: 'Graph Design Patterns', reason: 'Context includes design patterns' },
      { step: 'M-N06', sectionTitle: 'Decision Rationale & Error Learning (MANDATORY)', reason: 'Parser extracts rationale and lessons' },
      { step: 'M-N05', sectionTitle: 'Graph Execution & Verification (EXECUTE_GRAPH)', reason: 'Agent can execute graphs' },
    ];

    let linked = 0;
    for (const link of links) {
      try {
        const result = await session.run(`
          MATCH (ks:KnowledgeSection {title: $title})
          MERGE (ps:ProcessStep {id: $stepId, graphId: $graphId})
          ON CREATE SET ps.createdAt = datetime()
          MERGE (ps)-[r:DOCUMENTED_BY]->(ks)
          ON CREATE SET r.reason = $reason, r.createdAt = datetime()
          RETURN ps.id AS step, ks.title AS section
        `, { stepId: link.step, graphId, title: link.sectionTitle, reason: link.reason });

        if (result.records.length > 0) {
          console.log(`  [+] ${link.step} → ${link.sectionTitle}`);
          linked++;
        }
      } catch (err) {
        console.warn(`  [!] Failed to link ${link.step}: ${err.message}`);
      }
    }
    console.log(`  [OK] ${linked}/${links.length} links created`);
  } finally {
    await session.close();
  }
}

/**
 * Create a ProcessGraph documentation node that describes the entire process
 * and links to the CatalogEntry.
 */
async function createProcessDocumentation(memgraphService, graphId) {
  const session = memgraphService.driver.session();
  try {
    const meta = META_GRAPH_ASSISTANT_BUILDING.metadata;
    await session.run(`
      MERGE (pg:ProcessGraph {id: 'META-GRAPH-ASSISTANT-BUILDING-V1'})
      ON CREATE SET
        pg.name = $name,
        pg.description = $description,
        pg.namespace = 'META',
        pg.version = '1.0.0',
        pg.nodeCount = $nodeCount,
        pg.edgeCount = $edgeCount,
        pg.graphType = 'process-documentation',
        pg.isExecutable = true,
        pg.createdAt = datetime(),
        pg.createdBy = $createdBy,
        pg.chatId = $chatId,
        pg.relatedFiles = $relatedFiles
      ON MATCH SET
        pg.updatedAt = datetime(),
        pg.nodeCount = $nodeCount,
        pg.edgeCount = $edgeCount
    `, {
      name: META_GRAPH_ASSISTANT_BUILDING.name,
      description: META_GRAPH_ASSISTANT_BUILDING.description,
      nodeCount: META_GRAPH_ASSISTANT_BUILDING.nodes.length,
      edgeCount: META_GRAPH_ASSISTANT_BUILDING.edges.length,
      createdBy: meta.createdBy,
      chatId: meta.chatId,
      relatedFiles: JSON.stringify(meta.relatedFiles),
    });

    // Link ProcessGraph to CatalogEntry
    await session.run(`
      MATCH (pg:ProcessGraph {id: 'META-GRAPH-ASSISTANT-BUILDING-V1'})
      MATCH (ce:CatalogEntry) WHERE ce.name CONTAINS 'Graph Building Process' OR ce.id = $graphId
      MERGE (pg)-[:REPRESENTS]->(ce)
    `, { graphId });

    // Link ProcessGraph to AgentProfile
    await session.run(`
      MATCH (pg:ProcessGraph {id: 'META-GRAPH-ASSISTANT-BUILDING-V1'})
      MATCH (ap:AgentProfile {name: 'GXE AI Assistant'})
      MERGE (pg)-[:DOCUMENTS_PROCESS_OF]->(ap)
    `);

    console.log('  [OK] ProcessGraph node created and linked');
  } catch (err) {
    console.warn(`  [!] ProcessGraph creation: ${err.message}`);
  } finally {
    await session.close();
  }
}

function printSummary(graph) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : JSON.parse(graph.nodes || '[]');
  const edges = Array.isArray(graph.edges) ? graph.edges : JSON.parse(graph.edges || '[]');

  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log(`│ Name:      ${graph.name}`);
  console.log(`│ Namespace: ${graph.namespace || 'META'}`);
  console.log(`│ Type:      ${graph.type || 'process-documentation'}`);
  console.log(`│ Nodes:     ${nodes.length}`);
  console.log(`│ Edges:     ${edges.length}`);
  console.log(`│ ID:        ${graph.id}`);
  console.log(`│ Version:   ${graph.version || '1.0.0'}`);
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log('│ Process Steps:');

  const nodeTypes = { start: 0, action: 0, ai_node: 0, condition: 0, end: 0 };
  for (const node of nodes) {
    const label = node.data?.label || node.id;
    const tool = node.data?.tool || '—';
    const type = node.type || '—';
    nodeTypes[type] = (nodeTypes[type] || 0) + 1;
    console.log(`│   ${node.id.padEnd(10)} [${type.padEnd(9)}] ${label.padEnd(30)} → ${tool}`);
  }

  const backEdges = edges.filter(e => {
    const srcIdx = nodes.findIndex(n => n.id === e.source);
    const tgtIdx = nodes.findIndex(n => n.id === e.target);
    return tgtIdx < srcIdx; // back-edge if target appears before source
  });

  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│ Types:     start=${nodeTypes.start} action=${nodeTypes.action} ai=${nodeTypes.ai_node} condition=${nodeTypes.condition} end=${nodeTypes.end}`);
  console.log(`│ Edges:     ${edges.length} total, ${backEdges.length} back-edge(s) (agentic loop)`);
  console.log(`│ Back-edges: ${backEdges.map(e => `${e.source}→${e.target}`).join(', ') || 'none'}`);
  console.log('└─────────────────────────────────────────────────────────┘');
}

async function cleanup(memgraphService) {
  try {
    if (memgraphService.driver) {
      await memgraphService.driver.close();
    }
  } catch (_) { /* ignore */ }
}

main().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
