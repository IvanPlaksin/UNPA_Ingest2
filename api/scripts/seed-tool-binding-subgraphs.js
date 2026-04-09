#!/usr/bin/env node
/**
 * Seed Tool Binding Subgraphs
 * Creates DECOMPOSES sub-graphs linking each executor node in the
 * "Knowledge Graph Extraction Pipeline" to its tool detail from the
 * "AOPEG Executor Tool Registry".
 *
 * Each sub-graph contains:
 *   - The specific tool node (full metadata)
 *   - Its domain group node
 *   - Service dependency nodes (DEPENDS_ON)
 *   - Chaining neighbor nodes (CAN_CHAIN, 1 hop)
 *   - All connecting edges
 *
 * Idempotent: re-running updates existing sub-graphs.
 *
 * Usage: node api/scripts/seed-tool-binding-subgraphs.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Seed: Tool Binding Sub-Graphs (DECOMPOSES)                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // ── Connect to Memgraph ──
  const memgraphService = require('../src/services/memgraph.service');
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

  // ── Load Pipeline Graph ──
  console.log('\n[1/4] Loading pipeline graph...');
  const pipelineList = await graphCatalogService.listGraphs({
    namespace: 'core',
    search: 'Knowledge Graph Extraction Pipeline',
  });
  const pipelineEntry = pipelineList.data?.find(g => g.name === 'Knowledge Graph Extraction Pipeline');
  if (!pipelineEntry) {
    console.error('[FAIL] Pipeline graph not found. Run seed-extraction-pipeline-graph.js first.');
    process.exit(1);
  }
  const pipelineGraph = await graphCatalogService.getGraphById(pipelineEntry.id, true);
  const pipelineNodes = typeof pipelineGraph.nodes === 'string' ? JSON.parse(pipelineGraph.nodes) : pipelineGraph.nodes;
  const pipelineId = pipelineGraph.id;
  console.log(`  Pipeline: ${pipelineGraph.name} (${pipelineId})`);
  console.log(`  Nodes: ${pipelineNodes.length}`);

  // Get existing sub-graphs (for idempotent update)
  const existingSubGraphs = pipelineGraph.subGraphs || {};
  console.log(`  Existing sub-graphs: ${Object.keys(existingSubGraphs).length}`);

  // ── Load Tool Registry Graph ──
  console.log('\n[2/4] Loading tool registry graph...');
  const registryList = await graphCatalogService.listGraphs({
    namespace: 'core',
    search: 'AOPEG Executor Tool Registry',
  });
  const registryEntry = registryList.data?.find(g => g.name === 'AOPEG Executor Tool Registry');
  if (!registryEntry) {
    console.error('[FAIL] Tool Registry graph not found. Run seed-executor-registry-graph.js first.');
    process.exit(1);
  }
  const registryGraph = await graphCatalogService.getGraphById(registryEntry.id, false);
  const regNodes = typeof registryGraph.nodes === 'string' ? JSON.parse(registryGraph.nodes) : registryGraph.nodes;
  const regEdges = typeof registryGraph.edges === 'string' ? JSON.parse(registryGraph.edges) : registryGraph.edges;
  console.log(`  Registry: ${registryGraph.name} (${registryGraph.id})`);
  console.log(`  Nodes: ${regNodes.length}, Edges: ${regEdges.length}`);

  // Build lookup maps from registry
  const regNodeMap = new Map(regNodes.map(n => [n.id, n]));

  // ── Build Sub-Graphs ──
  console.log('\n[3/4] Building tool-binding sub-graphs...');

  // Get executor nodes (exclude container and tool-ref badges)
  const executorNodes = pipelineNodes.filter(
    n => n.type === 'graphNode' && n.data?.toolRef && !n.data?.isToolRef
  );
  console.log(`  Executor nodes to process: ${executorNodes.length}`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const execNode of executorNodes) {
    const toolRefId = execNode.data.toolRef;        // e.g. 'tool-ingestion-parse-document'
    const executorNodeId = execNode.id;              // e.g. 'input'
    const toolNode = regNodeMap.get(toolRefId);

    if (!toolNode) {
      console.warn(`  [SKIP] ${executorNodeId}: tool ${toolRefId} not found in registry`);
      skipped++;
      continue;
    }

    // Collect sub-graph nodes
    const subNodes = [toolNode];
    const subEdges = [];
    const includedNodeIds = new Set([toolRefId]);

    // Find domain group (PROVIDES edge pointing to this tool)
    const providesEdge = regEdges.find(e => e.target === toolRefId && e.label === 'PROVIDES');
    if (providesEdge) {
      const domainNode = regNodeMap.get(providesEdge.source);
      if (domainNode && !includedNodeIds.has(domainNode.id)) {
        subNodes.push(domainNode);
        includedNodeIds.add(domainNode.id);
        subEdges.push(providesEdge);
      }
    }

    // Find service dependencies (DEPENDS_ON edges from this tool)
    const depEdges = regEdges.filter(e => e.source === toolRefId && e.label === 'DEPENDS_ON');
    for (const depEdge of depEdges) {
      const svcNode = regNodeMap.get(depEdge.target);
      if (svcNode && !includedNodeIds.has(svcNode.id)) {
        subNodes.push(svcNode);
        includedNodeIds.add(svcNode.id);
      }
      subEdges.push(depEdge);
    }

    // Find CAN_CHAIN neighbors (1 hop, both directions)
    const outChains = regEdges.filter(e => e.source === toolRefId && e.label === 'CAN_CHAIN');
    const inChains = regEdges.filter(e => e.target === toolRefId && e.label === 'CAN_CHAIN');
    for (const chainEdge of [...outChains, ...inChains]) {
      const neighborId = chainEdge.source === toolRefId ? chainEdge.target : chainEdge.source;
      const neighborNode = regNodeMap.get(neighborId);
      if (neighborNode && !includedNodeIds.has(neighborNode.id)) {
        subNodes.push(neighborNode);
        includedNodeIds.add(neighborNode.id);
      }
      subEdges.push(chainEdge);
    }

    // Re-layout sub-graph nodes for clarity
    const layoutNodes = layoutSubGraph(subNodes, toolRefId);

    const subGraphData = {
      name: `Tool: ${toolNode.data?.label || toolRefId}`,
      namespace: 'core',
      type: 'tool',
      description: `Tool binding detail for ${execNode.data.executorType}. ` +
        `Shows tool metadata, service dependencies, and chaining patterns from the AOPEG Executor Tool Registry.`,
      version: '1.0.0',
      createdBy: 'system',
      tags: ['tool-binding', 'subgraph', execNode.data.executorType.split('.')[0]],
      isPublic: true,
      parentGraphId: pipelineId,
      parentNodeId: executorNodeId,
      nodes: layoutNodes,
      edges: subEdges,
    };

    // Check if sub-graph already exists for this node
    if (existingSubGraphs[executorNodeId]) {
      const existingId = existingSubGraphs[executorNodeId].id;
      await graphCatalogService.updateGraph(existingId, {
        nodes: layoutNodes,
        edges: subEdges,
        description: subGraphData.description,
        tags: subGraphData.tags,
      });
      console.log(`  [UPDATE] ${executorNodeId.padEnd(20)} → ${subGraphData.name} (${existingId})`);
      updated++;
    } else {
      const newGraph = await graphCatalogService.createGraph(subGraphData);
      console.log(`  [CREATE] ${executorNodeId.padEnd(20)} → ${subGraphData.name} (${newGraph.id})`);
      created++;
    }
  }

  // ── Summary ──
  console.log('\n[4/4] Summary');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log(`│ Pipeline:    ${pipelineGraph.name}`);
  console.log(`│ Pipeline ID: ${pipelineId}`);
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│ Created:  ${created} new sub-graphs`);
  console.log(`│ Updated:  ${updated} existing sub-graphs`);
  console.log(`│ Skipped:  ${skipped} (tool not found in registry)`);
  console.log(`│ Total:    ${created + updated + skipped}/${executorNodes.length} executor nodes processed`);
  console.log('└─────────────────────────────────────────────────────────┘');

  await cleanup();
}

/**
 * Layout sub-graph nodes in a readable pattern:
 *   - Center: the primary tool node
 *   - Left: domain group
 *   - Right: service dependencies (stacked vertically)
 *   - Below: CAN_CHAIN neighbors (spread horizontally)
 */
function layoutSubGraph(nodes, primaryToolId) {
  let x = 400, y = 200;
  return nodes.map(n => {
    const copy = JSON.parse(JSON.stringify(n));
    if (n.id === primaryToolId) {
      // Primary tool: center
      copy.position = { x: 400, y: 200 };
    } else if (n.type === 'domainGroup') {
      // Domain: left of center
      copy.position = { x: 100, y: 200 };
    } else if (n.type === 'serviceNode') {
      // Services: right column, stacked
      copy.position = { x: 700, y };
      y += 120;
    } else if (n.type === 'toolNode') {
      // CAN_CHAIN neighbors: bottom row
      x += 200;
      copy.position = { x, y: 450 };
    }
    return copy;
  });
}

async function cleanup() {
  try {
    const memgraphService = require('../src/services/memgraph.service');
    if (memgraphService.driver) {
      await memgraphService.driver.close();
    }
  } catch (_) { /* ignore */ }
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
