/**
 * Extract SubGraph Executor — creates a SubGraph from cluster nodes with boundary ports
 */

import { BaseExecutor, ExecutionContext, NodeExecutionResult } from '../../plugin-base';

export class ExtractSubgraphExecutor extends BaseExecutor {
  readonly type = 'subgraph.extract_subgraph';
  readonly displayName = 'Extract SubGraph';
  readonly description = 'Extract cluster nodes into a SubGraph with boundary ports';
  readonly domain = 'subgraph';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Graph namespace' },
      nodeIds: { type: 'array', items: { type: 'string' }, description: 'Cluster node IDs to extract' },
      name: { type: 'string', description: 'Name for the subgraph' },
    },
    required: ['namespace', 'nodeIds'],
  };

  async execute(parameters: Record<string, unknown>, context: ExecutionContext): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const namespace = this.getRequiredParam<string>(parameters, 'namespace');
      const nodeIds = this.getRequiredParam<string[]>(parameters, 'nodeIds');
      const name = this.getParam<string>(parameters, 'name', 'Unnamed SubGraph');

      if (!nodeIds.length) {
        return this.error('INVALID_INPUT', 'nodeIds array cannot be empty', true);
      }

      // Can also receive nodeIds from upstream segmentation output
      const upstreamNodeIds = (context.input as any)?.bestCandidate?.nodeIds;
      const finalNodeIds = nodeIds.length ? nodeIds : upstreamNodeIds;

      if (!finalNodeIds?.length) {
        return this.error('NO_NODES', 'No node IDs provided or found in upstream output', true);
      }

      const { SubGraphExtractor } = require('../../../../services/graph/subgraph-extractor');
      const { BoundaryResolver } = require('../../../../services/graph/boundary-resolver');

      const extractor = new SubGraphExtractor();
      const boundaryResolver = new BoundaryResolver();

      const extraction = await extractor.extract({
        namespace,
        clusterNodeIds: finalNodeIds,
        name,
        metadata: parameters.metadata as any,
      });

      const boundary = await boundaryResolver.resolve({
        subgraphId: extraction.subgraph.id,
        namespace,
        clusterNodeIds: finalNodeIds,
      });

      return this.success(
        {
          subgraphId: extraction.subgraph.id,
          name: extraction.subgraph.name,
          namespace,
          subNamespace: extraction.subgraph.subNamespace,
          nodeCount: extraction.subgraph.nodeCount,
          internalEdgeCount: extraction.subgraph.internalEdgeCount,
          boundaryInterface: {
            ports: boundary.ports,
            totalBoundaryEdges: boundary.boundaryEdgeCount,
          },
          status: 'extracted',
        },
        { duration: Date.now() - startTime, portCount: boundary.ports.length },
        0.9,
      );
    } catch (error: any) {
      return this.error('EXTRACT_ERROR', `SubGraph extraction failed: ${error.message}`, true);
    }
  }
}
