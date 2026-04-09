/**
 * Extract SubGraph Executor — creates a SubGraph from cluster nodes with boundary ports
 */

const { BaseExecutor } = require('../../plugin-base');

class ExtractSubgraphExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'subgraph.extract_subgraph';
    this.displayName = 'Extract SubGraph';
    this.description = 'Extract cluster nodes into a SubGraph with boundary ports';
    this.domain = 'subgraph';

    this.parameterSchema = {
      type: 'object',
      properties: {
        namespace: { type: 'string' },
        nodeIds: { type: 'array', items: { type: 'string' } },
        name: { type: 'string' },
      },
      required: ['namespace', 'nodeIds'],
    };
  }

  async execute(parameters, context) {
    const startTime = Date.now();

    try {
      const namespace = this.getRequiredParam(parameters, 'namespace');
      const nodeIds = this.getRequiredParam(parameters, 'nodeIds');
      const name = this.getParam(parameters, 'name', 'Unnamed SubGraph');

      if (!nodeIds.length) {
        return this.error('INVALID_INPUT', 'nodeIds array cannot be empty', true);
      }

      const upstreamNodeIds = context.input?.bestCandidate?.nodeIds;
      const finalNodeIds = nodeIds.length ? nodeIds : upstreamNodeIds;

      if (!finalNodeIds?.length) {
        return this.error('NO_NODES', 'No node IDs provided or found in upstream output', true);
      }

      const { SubGraphExtractor } = require('../../../../../services/graph/subgraph-extractor');
      const { BoundaryResolver } = require('../../../../../services/graph/boundary-resolver');

      const extractor = new SubGraphExtractor();
      const boundaryResolver = new BoundaryResolver();

      const extraction = await extractor.extract({
        namespace, clusterNodeIds: finalNodeIds, name, metadata: parameters.metadata,
      });

      const boundary = await boundaryResolver.resolve({
        subgraphId: extraction.subgraph.id, namespace, clusterNodeIds: finalNodeIds,
      });

      return this.success(
        {
          subgraphId: extraction.subgraph.id, name: extraction.subgraph.name,
          namespace, subNamespace: extraction.subgraph.subNamespace,
          nodeCount: extraction.subgraph.nodeCount, internalEdgeCount: extraction.subgraph.internalEdgeCount,
          boundaryInterface: { ports: boundary.ports, totalBoundaryEdges: boundary.boundaryEdgeCount },
          status: 'extracted',
        },
        { duration: Date.now() - startTime, portCount: boundary.ports.length }, 0.9,
      );
    } catch (error) {
      return this.error('EXTRACT_ERROR', `SubGraph extraction failed: ${error.message}`, true);
    }
  }
}

module.exports = { ExtractSubgraphExecutor };
