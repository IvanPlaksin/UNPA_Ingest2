/**
 * Consolidate SubGraph Executor — consolidates a subgraph with checkpoint-based rollback
 */

const { BaseExecutor } = require('../../plugin-base');

class ConsolidateSubgraphExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'subgraph.consolidate_subgraph';
    this.displayName = 'Consolidate SubGraph';
    this.description = 'Consolidate an extracted SubGraph: archive members, rewire boundary edges, create rollback checkpoint';
    this.domain = 'subgraph';

    this.parameterSchema = {
      type: 'object',
      properties: {
        subgraphId: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['subgraphId', 'namespace'],
    };
  }

  async execute(parameters, context) {
    const startTime = Date.now();

    try {
      let subgraphId = this.getParam(parameters, 'subgraphId', '');
      let namespace = this.getParam(parameters, 'namespace', '');

      const upstream = context.input;
      if (!subgraphId && upstream?.subgraphId) subgraphId = upstream.subgraphId;
      if (!namespace && upstream?.namespace) namespace = upstream.namespace;

      if (!subgraphId || !namespace) {
        return this.error('INVALID_INPUT', 'subgraphId and namespace required', true);
      }

      const memgraphService = require('../../../../../services/memgraph.service');
      const { SubgraphAdapter } = require('../../../../../services/immutable-graph/integration/subgraph-adapter');

      const session = memgraphService.driver.session();
      let memberIds;
      try {
        const res = await session.run(
          'MATCH (sg:SubGraph {id: $sgId})-[:CONTAINS_MEMBER]->(m) WHERE m.namespace = $ns RETURN m.id AS id',
          { sgId: subgraphId, ns: namespace }
        );
        memberIds = res.records.map(r => r.get('id'));
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
          subgraphId, checkpointId: tx.checkpointId, transactionId: tx.transactionId,
          status: 'consolidated',
          statistics: {
            nodesArchived: result.archivedNodes, internalEdgesRemoved: result.removedEdges,
            boundaryEdgesRewired: result.rewiredEdges,
          },
          rollbackAvailable: true,
        },
        { duration: Date.now() - startTime }, 1.0,
      );
    } catch (error) {
      return this.error('CONSOLIDATE_ERROR', `Consolidation failed: ${error.message}`, true);
    }
  }
}

module.exports = { ConsolidateSubgraphExecutor };
