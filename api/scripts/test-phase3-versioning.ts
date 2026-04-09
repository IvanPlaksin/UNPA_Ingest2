/**
 * Test Phase 3: Consolidation with ImmutableGraph Versioning
 *
 * Tests the full cycle:
 *   1. Segmentation → find best cluster
 *   2. Extract SubGraph
 *   3. Resolve boundary ports
 *   4. beginConsolidation → checkpoint created
 *   5. commitConsolidation → edges removed, nodes archived
 *   6. Verify consolidated state
 *   7. rollbackFromCheckpoint → edges + nodes restored
 *   8. Verify fully restored state
 *   9. Cleanup
 */

import * as path from 'path';
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SubgraphSegmentationService } = require('../src/services/graph/subgraph-segmentation.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SubGraphExtractor } = require('../src/services/graph/subgraph-extractor');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BoundaryResolver } = require('../src/services/graph/boundary-resolver');

import { SubgraphAdapter } from '../src/services/immutable-graph/integration/subgraph-adapter';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const memgraphService = require('../src/services/memgraph.service');

const NAMESPACE = 'GXE';

async function countEdges(session: any, nodeIds: string[], ns: string): Promise<number> {
  const res = await session.run(`
    MATCH (a)-[r]->(b)
    WHERE a.id IN $ids AND b.id IN $ids
      AND a.namespace = $ns AND b.namespace = $ns
      AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
    RETURN count(r) AS cnt
  `, { ids: nodeIds, ns });
  const v = res.records[0]?.get('cnt');
  return typeof v === 'number' ? v : Number(v) || 0;
}

async function main() {
  console.log('=== Phase 3: Versioned Consolidation Test ===\n');

  await new Promise(r => setTimeout(r, 1000));

  const segSvc = new SubgraphSegmentationService();
  const extractor = new SubGraphExtractor();
  const boundaryResolver = new BoundaryResolver();
  const adapter = new SubgraphAdapter();

  // ── Step 1: Segmentation ──────────────────────────────
  console.log('--- Step 1: Segmentation ---');
  const seg = await segSvc.analyze(NAMESPACE, { strategies: ['community', 'ontology'], useLlm: false });

  if (!seg.bestCandidate) {
    console.error('No candidates found. Exiting.');
    process.exit(1);
  }

  const candidate = seg.bestCandidate;
  console.log(`  Best: "${candidate.suggestedName}" — ${candidate.nodeCount} nodes, score=${candidate.coherenceScore}`);
  console.log(`  Node IDs: [${candidate.nodes.slice(0, 5).join(', ')}${candidate.nodes.length > 5 ? '...' : ''}]`);

  // ── Step 2: Extract ───────────────────────────────────
  console.log('\n--- Step 2: Extract SubGraph ---');
  const extraction = await extractor.extract({
    namespace: NAMESPACE,
    clusterNodeIds: candidate.nodes,
    name: candidate.suggestedName || 'Test SubGraph',
    metadata: { strategy: candidate.strategy, coherenceScore: candidate.coherenceScore },
  });
  const sgId = extraction.subgraph.id;
  console.log(`  SubGraph: ${sgId}, nodes=${extraction.subgraph.nodeCount}, internal edges=${extraction.subgraph.internalEdgeCount}`);

  // ── Step 3: Boundary ──────────────────────────────────
  console.log('\n--- Step 3: Boundary Resolution ---');
  const boundary = await boundaryResolver.resolve({
    subgraphId: sgId,
    namespace: NAMESPACE,
    clusterNodeIds: candidate.nodes,
  });
  console.log(`  Ports: ${boundary.ports.length}, boundary edges: ${boundary.boundaryEdgeCount}`);

  // ── Record pre-consolidation edge count ────────────────
  const session = memgraphService.driver.session();
  const edgesBefore = await countEdges(session, candidate.nodes, NAMESPACE);
  console.log(`\n  Internal edges BEFORE consolidation: ${edgesBefore}`);

  // ── Step 4: Begin Consolidation ───────────────────────
  console.log('\n--- Step 4: Begin Consolidation (create checkpoint) ---');
  const tx = await adapter.beginConsolidation(sgId, NAMESPACE, candidate.nodes);
  console.log(`  Transaction: ${tx.transactionId}`);
  console.log(`  Checkpoint: ${tx.checkpointId}`);
  console.log(`  Snapshotted edges: ${tx.internalEdges.length}`);
  console.log(`  Status: ${tx.status}`);

  // Verify checkpoint exists in graph
  const cpCheck = await session.run(`
    MATCH (cp:ConsolidationCheckpoint {id: $cpId})
    RETURN cp.status AS status, cp.edgeCount AS edgeCount
  `, { cpId: tx.checkpointId });
  console.log(`  Checkpoint in graph: status=${cpCheck.records[0]?.get('status')}, edges=${cpCheck.records[0]?.get('edgeCount')}`);

  // ── Step 5: Commit Consolidation ──────────────────────
  console.log('\n--- Step 5: Commit Consolidation ---');
  const result = await adapter.commitConsolidation(tx);
  console.log(`  Removed internal edges: ${result.removedEdges}`);
  console.log(`  Rewired boundary edges: ${result.rewiredEdges} (out=${result.rewiredOut}, in=${result.rewiredIn})`);
  console.log(`  Archived nodes: ${result.archivedNodes}`);

  // ── Step 6: Verify consolidated state ─────────────────
  console.log('\n--- Step 6: Verify Consolidated State ---');
  const edgesAfterConsolidate = await countEdges(session, candidate.nodes, NAMESPACE);
  console.log(`  Internal edges AFTER consolidation: ${edgesAfterConsolidate} (expected 0)`);

  const archivedCount = await session.run(`
    MATCH (n {subgraphId: $sgId}) WHERE n.status = 'archived'
    RETURN count(n) AS cnt
  `, { sgId });
  console.log(`  Archived nodes: ${archivedCount.records[0]?.get('cnt')}`);

  const checkpointAfter = await session.run(`
    MATCH (cp:ConsolidationCheckpoint {id: $cpId})
    RETURN cp.status AS status
  `, { cpId: tx.checkpointId });
  console.log(`  Checkpoint status: ${checkpointAfter.records[0]?.get('status')} (expected COMMITTED)`);

  // ── Step 7: ROLLBACK from checkpoint ──────────────────
  console.log('\n--- Step 7: Rollback from Checkpoint ---');
  const rollback = await adapter.rollbackFromCheckpoint(tx.checkpointId);
  console.log(`  Restored edges: ${rollback.restoredEdges}`);
  console.log(`  Restored nodes: ${rollback.restoredNodes}`);

  // ── Step 8: Verify fully restored state ───────────────
  console.log('\n--- Step 8: Verify Restored State ---');
  const edgesAfterRollback = await countEdges(session, candidate.nodes, NAMESPACE);
  console.log(`  Internal edges AFTER rollback: ${edgesAfterRollback} (expected ${edgesBefore})`);

  const stillArchived = await session.run(`
    MATCH (n {subgraphId: $sgId}) WHERE n.status = 'archived'
    RETURN count(n) AS cnt
  `, { sgId });
  console.log(`  Still archived: ${stillArchived.records[0]?.get('cnt')} (expected 0)`);

  const checkpointFinal = await session.run(`
    MATCH (cp:ConsolidationCheckpoint {id: $cpId})
    RETURN cp.status AS status
  `, { cpId: tx.checkpointId });
  console.log(`  Checkpoint status: ${checkpointFinal.records[0]?.get('status')} (expected ROLLED_BACK)`);

  // ── Assert ─────────────────────────────────────────────
  const pass = edgesAfterRollback === edgesBefore && edgesAfterConsolidate === 0;
  console.log(`\n  *** FULL CYCLE ${pass ? 'PASSED' : 'FAILED'} ***`);

  // ── Step 9: Cleanup ───────────────────────────────────
  console.log('\n--- Step 9: Cleanup ---');
  await session.run(`MATCH (cp:ConsolidationCheckpoint {id: $cpId}) DETACH DELETE cp`, { cpId: tx.checkpointId });
  await session.run(`MATCH (sg:SubGraph {id: $sgId})-[:PORT_OF]->(p:SubGraphPort) DETACH DELETE p`, { sgId });
  await session.run(`MATCH (sg:SubGraph {id: $sgId}) DETACH DELETE sg`, { sgId });
  await session.run(`MATCH (n {subgraphId: $sgId}) REMOVE n.subgraphId, n.subNamespace`, { sgId });
  console.log('  Cleanup done.');

  await session.close();
  console.log('\n=== Phase 3 Test Complete ===');
  process.exit(pass ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
