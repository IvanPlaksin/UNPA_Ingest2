/**
 * Consolidate SubGraph Executor — consolidates a subgraph with checkpoint-based rollback
 */

import { BaseExecutor, ExecutionContext, NodeExecutionResult } from '../../plugin-base';

export class ConsolidateSubgraphExecutor extends BaseExecutor {
  readonly type = 'subgraph.consolidate_subgraph';
  readonly displayName = 'Consolidate SubGraph';
  readonly description = 'Consolidate an extracted SubGraph: archive members, rewire boundary edges, create rollback checkpoint';
  readonly domain = 'subgraph';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      subgraphId: { type: 'string', description: 'SubGraph ID to consolidate' },
      namespace: { type: 'string', description: 'Graph namespace' },
    },
    required: ['subgraphId', 'namespace'],
  };

  async execute(parameters: Record<string, unknown>, context: ExecutionContext): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      let subgraphId = this.getParam<string>(parameters, 'subgraphId', '');
      let namespace = this.getParam<string>(parameters, 'namespace', '');

      // Can receive from upstream extract output
      const upstream = context.input as any;
      if (!subgraphId && upstream?.subgraphId) subgraphId = upstream.subgraphId;
      if (!namespace && upstream?.namespace) namespace = upstream.namespace;

      if (!subgraphId || !namespace) {
        return this.error('INVALID_INPUT', 'subgraphId and namespace required', true);
      }

      const memgraphService = require('../../../../services/memgraph.service');
      const { SubgraphAdapter } = require('../../../../services/immutable-graph/integration/subgraph-adapter');

      // Get member node IDs
      const session = memgraphService.driver.session();
      let memberIds: string[];
      try {
        const res = await session.run(`
          MATCH (sg:SubGraph {id: $sgId})-[:CONTAINS_MEMBER]->(m)
          WHERE m.namespace = $ns
          RETURN m.id AS id
        `, { sgId: subgraphId, ns: namespace });
        memberIds = res.records.map((r: any) => r.get('id'));
      } finally {
        await session.close();
      }

      if (memberIds.length === 0) {
        return this.error('NO_MEMBERS', `SubGraph ${subgraphId} has no members`, true);
      }

      const adapter = new SubgraphAdapter();
      const tx = await adapter.beginConsolidation(subgraphId, namespace, memberIds);
      const result = await adapter.commitConsolidation(tx);

      return this.success(
        {
          subgraphId,
          checkpointId: tx.checkpointId,
          transactionId: tx.transactionId,
          status: 'consolidated',
          statistics: {
            nodesArchived: result.archivedNodes,
            internalEdgesRemoved: result.removedEdges,
            boundaryEdgesRewired: result.rewiredEdges,
          },
          rollbackAvailable: true,
        },
        { duration: Date.now() - startTime },
        1.0,
      );
    } catch (error: any) {
      return this.error('CONSOLIDATE_ERROR', `Consolidation failed: ${error.message}`, true);
    }
  }
}
