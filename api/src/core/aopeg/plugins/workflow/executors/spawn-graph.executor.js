/**
 * Spawn Graph Executor — launches a child graph execution
 */

const { BaseExecutor } = require('../../plugin-base');
const { randomUUID } = require('node:crypto');

class SpawnGraphExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'workflow.spawn_graph';
    this.displayName = 'Spawn Graph';
    this.description = 'Launches a child graph execution from PatternLibrary or stored DAG';
    this.domain = 'workflow';

    this.parameterSchema = {
      type: 'object',
      properties: {
        graph_id: { type: 'string', description: 'Graph ID or task category' },
        dag: { type: 'object', description: 'Inline DAG definition' },
        params: { type: 'object', description: 'Input parameters for the child graph' },
        mode: { type: 'string', enum: ['sync', 'async'], default: 'async' },
        timeout_minutes: { type: 'number', default: 60 },
      },
      required: ['params'],
    };
  }

  async execute(parameters, context) {
    const startTime = Date.now();
    const graphId = this.getParam(parameters, 'graph_id', '');
    const inlineDag = this.getParam(parameters, 'dag', null);
    const params = this.getRequiredParam(parameters, 'params');
    const mode = this.getParam(parameters, 'mode', 'async');
    const timeoutMinutes = this.getParam(parameters, 'timeout_minutes', 60);

    if (!graphId && !inlineDag) {
      return this.error('INVALID_INPUT', 'Either graph_id or dag must be provided', true);
    }

    try {
      let dag = inlineDag;

      if (!dag && graphId) {
        dag = await this._loadDag(graphId);
        if (!dag) return this.error('GRAPH_NOT_FOUND', `Graph not found: ${graphId}`, true);
      }

      const { RuntimeEngine } = require('../../../../../runtime/RuntimeEngine');
      const childExecutionId = randomUUID();

      let mcpRegistry = context.mcpRegistry;
      if (!mcpRegistry) {
        const { AOPEGAdapter } = require('../../../../../runtime/integration/AOPEGAdapter');
        const { pluginRegistry } = require('../../../registry/plugin-registry');
        const adapter = new AOPEGAdapter(pluginRegistry);
        mcpRegistry = adapter.createMcpCompatibleRegistry();
      }

      const childEngine = new RuntimeEngine(mcpRegistry, {
        graphTimeoutMs: timeoutMinutes * 60 * 1000,
      });

      if (mode === 'async') {
        childEngine.execute(dag, params, { executionId: childExecutionId })
          .then(result => console.log(`[spawn_graph] Child ${childExecutionId} completed: ${result.status}`))
          .catch(err => console.error(`[spawn_graph] Child ${childExecutionId} failed: ${err.message}`));

        return this.success(
          { child_execution_id: childExecutionId, status: 'STARTED', mode: 'async', graph_id: graphId || 'inline' },
          { duration: Date.now() - startTime }, 0.9,
        );
      } else {
        const result = await childEngine.execute(dag, params, { executionId: childExecutionId });
        return this.success(
          {
            child_execution_id: childExecutionId,
            status: result.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
            mode: 'sync', graph_id: graphId || 'inline',
            result: result.output, metrics: result.metrics,
          },
          { duration: Date.now() - startTime },
          result.status === 'COMPLETED' ? 0.95 : 0.3,
        );
      }
    } catch (error) {
      return this.error('SPAWN_ERROR', `Failed to spawn graph: ${error.message}`, true);
    }
  }

  async _loadDag(graphId) {
    // 1. Try GraphLoaderService (in-memory graph definitions)
    try {
      const { GraphLoaderService } = require('../../../../../services/graph-definitions/graph-loader.service');
      const loader = new GraphLoaderService(null, null);
      const graphDef = loader.getGraph(graphId);
      if (graphDef) {
        // Convert ReactFlow format to AOPEG DAG format
        return this._convertToAOPEGDag(graphDef);
      }
    } catch { /* GraphLoaderService not available */ }

    // 2. Try PatternLibrary (runtime cache)
    try {
      const { PatternLibrary } = require('../../../../../runtime/learning/PatternLibrary');
      const library = new PatternLibrary();
      const dag = await library.getPattern(graphId);
      if (dag) return dag;
    } catch { /* PatternLibrary not available */ }

    // 3. Try Memgraph catalog (CatalogEntry → GraphDefinition)
    try {
      const memgraph = require('../../../../../services/memgraph.service');
      const result = await memgraph.runQuery(
        `MATCH (c:CatalogEntry {graphId: $graphId})-[:DEFINES]->(d:GraphDefinition)
         RETURN d.nodes as nodes, d.edges as edges`,
        { graphId }
      );
      if (result.length > 0 && result[0].nodes) {
        const nodes = typeof result[0].nodes === 'string' ? JSON.parse(result[0].nodes) : result[0].nodes;
        const edges = typeof result[0].edges === 'string' ? JSON.parse(result[0].edges) : result[0].edges;
        return { nodes, edges };
      }
    } catch { /* Memgraph not available */ }

    return null;
  }

  /**
   * Convert ReactFlow graph definition to AOPEG DAG format
   * @private
   */
  _convertToAOPEGDag(graphDef) {
    return {
      id: graphDef.graph_id,
      nodes: graphDef.nodes.map(n => ({
        id: n.id,
        executorType: n.data.tool,
        parameters: n.data.config || {},
        metadata: { label: n.data.label, type: n.type },
      })),
      edges: graphDef.edges.map(e => ({
        id: e.id,
        sourceNodeId: e.source,
        targetNodeId: e.target,
        label: e.label || undefined,
      })),
      entryNodeId: graphDef.nodes.find(n => n.type === 'start')?.id,
      exitNodeIds: graphDef.nodes.filter(n => n.type === 'end').map(n => n.id),
    };
  }
}

module.exports = { SpawnGraphExecutor };
