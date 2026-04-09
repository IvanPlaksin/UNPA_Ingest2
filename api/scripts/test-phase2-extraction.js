/**
 * Test Phase 2: SubGraph Extraction Pipeline
 *
 * 1. Run segmentation to find best candidate cluster
 * 2. Extract cluster into SubGraph
 * 3. Resolve boundary ports
 * 4. Consolidate (archive mode)
 * 5. Verify final state
 * 6. Unconsolidate to restore original state
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { SubgraphSegmentationService } = require('../src/services/graph/subgraph-segmentation.service');
const { SubGraphExtractor } = require('../src/services/graph/subgraph-extractor');
const { BoundaryResolver } = require('../src/services/graph/boundary-resolver');
const { GraphConsolidator } = require('../src/services/graph/graph-consolidator');
const memgraphService = require('../src/services/memgraph.service');

const NAMESPACE = 'GXE';

async function main() {
  console.log('=== Phase 2: SubGraph Extraction Test ===\n');

  // Wait for Memgraph connection
  await new Promise(r => setTimeout(r, 1000));

  const segSvc = new SubgraphSegmentationService();
  const extractor = new SubGraphExtractor();
  const boundaryResolver = new BoundaryResolver();
  const consolidator = new GraphConsolidator();

  // ── Step 1: Segmentation ──────────────────────────────
  console.log('--- Step 1: Segmentation ---');
  const seg = await segSvc.analyze(NAMESPACE, {
    strategies: ['community', 'ontology'],
    useLlm: false,
  });

  console.log(`  Candidates: ${seg.candidates.length}`);
  if (!seg.bestCandidate) {
    console.error('  No candidates found. Exiting.');
    process.exit(1);
  }

  const candidate = seg.bestCandidate;
  console.log(`  Best: "${candidate.suggestedName}" — ${candidate.nodeCount} nodes, score=${candidate.coherenceScore}`);
  console.log(`  Strategy: ${candidate.strategy}`);
  console.log(`  Node IDs: [${candidate.nodes.join(', ')}]`);
  console.log();

  // ── Step 2: Extract ───────────────────────────────────
  console.log('--- Step 2: Extract SubGraph ---');
  const extraction = await extractor.extract({
    namespace: NAMESPACE,
    clusterNodeIds: candidate.nodes,
    name: candidate.suggestedName || 'Test SubGraph',
    metadata: {
      strategy: candidate.strategy,
      coherenceScore: candidate.coherenceScore,
    },
  });

  const sgId = extraction.subgraph.id;
  console.log(`  SubGraph ID: ${sgId}`);
  console.log(`  SubNamespace: ${extraction.subgraph.subNamespace}`);
  console.log(`  Nodes: ${extraction.subgraph.nodeCount}, Internal edges: ${extraction.subgraph.internalEdgeCount}`);
  console.log();

  // ── Step 3: Boundary Resolution ───────────────────────
  console.log('--- Step 3: Boundary Resolution ---');
  const boundary = await boundaryResolver.resolve({
    subgraphId: sgId,
    namespace: NAMESPACE,
    clusterNodeIds: candidate.nodes,
  });

  console.log(`  Boundary edges: ${boundary.boundaryEdgeCount}`);
  console.log(`  Ports created: ${boundary.ports.length}`);
  for (const p of boundary.ports) {
    console.log(`    ${p.id}: ${p.direction} via ${p.externalEdgeType} — internal=${p.internalNodeId} ↔ external=${p.externalNodeId}`);
  }
  console.log();

  // ── Step 4: Consolidation ─────────────────────────────
  console.log('--- Step 4: Consolidation (archive mode) ---');
  const consol = await consolidator.consolidate({
    subgraphId: sgId,
    namespace: NAMESPACE,
    clusterNodeIds: candidate.nodes,
    archive: true,
  });

  console.log(`  Status: ${consol.status}`);
  console.log(`  Removed internal edges: ${consol.removedEdges}`);
  console.log(`  Rewired boundary edges: ${consol.rewiredEdges} (out=${consol.rewiredOut}, in=${consol.rewiredIn})`);
  console.log(`  Archived nodes: ${consol.archivedNodes}`);
  console.log();

  // ── Step 5: Verify state ──────────────────────────────
  console.log('--- Step 5: Verify Final State ---');
  const session = memgraphService.driver.session();
  try {
    // SubGraph node
    const sgRes = await session.run(`
      MATCH (sg:SubGraph {id: $sgId})
      RETURN sg.status AS status, sg.nodeCount AS nodeCount,
             sg.rewiredEdgeCount AS rewired
    `, { sgId });
    const sgNode = sgRes.records[0];
    console.log(`  SubGraph status: ${sgNode?.get('status')}`);
    console.log(`  SubGraph nodeCount: ${sgNode?.get('nodeCount')}`);

    // Ports
    const portRes = await session.run(`
      MATCH (sg:SubGraph {id: $sgId})-[:PORT_OF]->(p:SubGraphPort)
      RETURN count(p) AS portCount
    `, { sgId });
    console.log(`  Ports linked: ${portRes.records[0]?.get('portCount')}`);

    // SUBGRAPH_LINK edges
    const linkRes = await session.run(`
      MATCH (sg:SubGraph {id: $sgId})-[r:SUBGRAPH_LINK]-()
      RETURN count(r) AS linkCount
    `, { sgId });
    console.log(`  SUBGRAPH_LINK edges: ${linkRes.records[0]?.get('linkCount')}`);

    // Archived nodes
    const archRes = await session.run(`
      MATCH (n {subgraphId: $sgId, namespace: $ns})
      WHERE n.status = 'archived'
      RETURN count(n) AS archived
    `, { sgId, ns: NAMESPACE });
    console.log(`  Archived member nodes: ${archRes.records[0]?.get('archived')}`);
    console.log();

    // ── Step 6: Unconsolidate (restore) ───────────────────
    console.log('--- Step 6: Unconsolidate (restore original state) ---');
    const restored = await consolidator.unconsolidate({
      subgraphId: sgId,
      namespace: NAMESPACE,
    });
    console.log(`  Restored nodes: ${restored.restored}`);
    console.log(`  Warning: ${restored.warning}`);
    console.log();

    // Verify restoration
    const postRestore = await session.run(`
      MATCH (n {subgraphId: $sgId, namespace: $ns})
      WHERE n.status = 'archived'
      RETURN count(n) AS stillArchived
    `, { sgId, ns: NAMESPACE });
    console.log(`  Still archived after restore: ${postRestore.records[0]?.get('stillArchived')}`);

    // Clean up SubGraph + ports for re-test
    console.log('\n--- Cleanup: Removing SubGraph, Ports, and metadata ---');
    await session.run(`
      MATCH (sg:SubGraph {id: $sgId})-[:PORT_OF]->(p:SubGraphPort)
      DETACH DELETE p
    `, { sgId });
    await session.run(`
      MATCH (sg:SubGraph {id: $sgId})
      DETACH DELETE sg
    `, { sgId });
    await session.run(`
      MATCH (n {subgraphId: $sgId})
      REMOVE n.subgraphId, n.subNamespace
    `, { sgId });
    console.log('  Cleanup done.');

  } finally {
    await session.close();
  }

  console.log('\n=== Phase 2 Test Complete ===');
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
