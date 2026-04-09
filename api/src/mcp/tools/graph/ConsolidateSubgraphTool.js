const { BaseTool } = require('../primitives/BaseTool.js');
const { SubGraphExtractor } = require('../../../services/graph/subgraph-extractor');
const { BoundaryResolver } = require('../../../services/graph/boundary-resolver');
const { SubgraphAdapter } = require('../../../services/immutable-graph/integration/subgraph-adapter');
const memgraphService = require('../../../services/memgraph.service');

class ConsolidateSubgraphTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.consolidate_subgraph',
      name: 'Consolidate Subgraph',
      version: '1.0.0',
      level: 3,
      category: 'graph',
      description: 'Extract a cluster into a SubGraph, resolve boundary ports, and consolidate (with checkpoint for rollback)',
      inputSchema: {
        type: 'object',
        required: ['namespace', 'nodeIds', 'name'],
        properties: {
          namespace: { type: 'string', description: 'Graph namespace' },
          nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to consolidate' },
          name: { type: 'string', description: 'Name for the SubGraph' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          subgraphId: { type: 'string' },
          checkpointId: { type: 'string' },
          status: { type: 'string' },
          statistics: { type: 'object' },
        },
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE', 'DELETE'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 100 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['namespace', 'nodeIds', 'name']);
    const { namespace, nodeIds, name } = args;

    // 1. Extract
    const extractor = new SubGraphExtractor();
    const extraction = await extractor.extract({ namespace, clusterNodeIds: nodeIds, name });
    const sgId = extraction.subgraph.id;

    // 2. Boundary
    const resolver = new BoundaryResolver();
    const boundary = await resolver.resolve({ subgraphId: sgId, namespace, clusterNodeIds: nodeIds });

    // 3. Consolidate with checkpoint
    const adapter = new SubgraphAdapter();
    const tx = await adapter.beginConsolidation(sgId, namespace, nodeIds);
    const result = await adapter.commitConsolidation(tx);

    return this.success({
      subgraphId: sgId,
      checkpointId: tx.checkpointId,
      status: 'consolidated',
      ports: boundary.ports.length,
      statistics: {
        nodesArchived: result.archivedNodes,
        internalEdgesRemoved: result.removedEdges,
        boundaryEdgesRewired: result.rewiredEdges,
      },
    });
  }
}

module.exports = { ConsolidateSubgraphTool };
