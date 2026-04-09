/**
 * SubGraphExecutorTool — Executes a subgraph DAG as a nested RuntimeEngine run.
 *
 * When a proxy node (kind: 'subgraph') is encountered during graph execution,
 * NodeRunner resolves toolId 'runtime.execute_subgraph' → this tool.
 *
 * Flow:
 *   1. Load subgraph DAG from Memgraph (members + internal edges + ports)
 *   2. Map upstream input to entry nodes via IN ports
 *   3. Execute subgraph with a nested RuntimeEngine
 *   4. Map exit node outputs back via OUT ports
 *   5. Return merged output for downstream propagation
 */

const { BaseTool } = require('../primitives/BaseTool.js');
const memgraphService = require('../../../services/memgraph.service');

const INFRA_TYPES = [
  'CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO',
  'CONNECTS_INTERNAL', 'SUBGRAPH_LINK',
];

const MAX_NESTING_DEPTH = 5;

class SubGraphExecutorTool extends BaseTool {
  getDefinition() {
    return {
      id: 'runtime.execute_subgraph',
      name: 'SubGraph Executor',
      version: '1.0.0',
      level: 3,
      category: 'graph',
      description: 'Executes a subgraph DAG as a nested RuntimeEngine run, mapping input/output via boundary ports',
      inputSchema: {
        type: 'object',
        required: ['subgraphId'],
        properties: {
          subgraphId: { type: 'string', description: 'SubGraph node ID to load and execute' },
        },
        additionalProperties: true,
      },
      outputSchema: {
        type: 'object',
        properties: {
          results: { description: 'Merged output from subgraph exit nodes' },
          status: { type: 'string' },
          metrics: { type: 'object' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 120000, maxMemoryMb: 256 },
    };
  }

  async execute(args, context, mcpRegistry) {
    const { subgraphId, ...upstreamData } = args;
    if (!subgraphId) this.error('MISSING_ARGUMENT', 'subgraphId is required');

    // Recursion guard
    const depth = (context?.nestingDepth || 0) + 1;
    if (depth > MAX_NESTING_DEPTH) {
      this.error('MAX_DEPTH', `Subgraph nesting depth ${depth} exceeds limit ${MAX_NESTING_DEPTH}`);
    }

    // 1. Load subgraph DAG
    const sgData = await this._loadSubgraph(subgraphId);
    if (!sgData || sgData.nodes.length === 0) {
      this.error('SUBGRAPH_EMPTY', `SubGraph ${subgraphId} has no member nodes`);
    }

    // 2. Map input to entry nodes via IN ports
    const inputData = this._mapInputToPorts(upstreamData, sgData.ports, context?.portData);

    // 3. Build DAG for nested engine
    const dag = {
      nodes: sgData.nodes.map(n => ({
        id: n.id,
        executorType: n.executorType || n.kind || n.type || 'executor',
        data: n,
        parameters: n.parameters || {},
      })),
      edges: sgData.edges.map(e => ({
        source: e.source,
        target: e.target,
      })),
    };

    // 4. Execute nested RuntimeEngine (lazy-require to avoid circular deps)
    const { RuntimeEngine } = require('../../../runtime/RuntimeEngine');
    const nestedEngine = new RuntimeEngine(mcpRegistry, {
      maxConcurrency: 5,
      graphTimeoutMs: 120000,
      enableValidation: true,
    });

    const result = await nestedEngine.execute(dag, inputData, {
      nestingDepth: depth,
    });

    if (result.status === 'FAILED') {
      this.error('SUBGRAPH_FAILED', `SubGraph ${subgraphId} execution failed: ${result.error || 'unknown'}`);
    }

    // 5. Map outputs from exit nodes via OUT ports
    const mappedOutput = this._mapOutputFromPorts(result.output, sgData.ports);

    return this.success({
      ...mappedOutput,
      _subgraphStatus: result.status,
      _subgraphMetrics: result.metrics,
    });
  }

  /**
   * Load subgraph nodes, internal edges, and boundary ports from Memgraph.
   * Reuses the same query pattern as ExpandSubgraphTool.
   */
  async _loadSubgraph(subgraphId) {
    const session = memgraphService.driver.session();
    try {
      // Members
      const nodesRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})-[:CONTAINS_MEMBER]->(m)
        RETURN m
      `, { id: subgraphId });

      if (nodesRes.records.length === 0) return null;

      const nodes = nodesRes.records.map(r => {
        const props = r.get('m').properties;
        return { ...props };
      });
      const nodeIds = nodes.map(n => n.id);
      const ns = nodes[0]?.namespace || '';

      // Internal edges only
      const edgesRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND b.id IN $ids
          AND a.namespace = $ns AND b.namespace = $ns
          AND NOT type(r) IN $infraTypes
        RETURN a.id AS source, b.id AS target, type(r) AS type
      `, { ids: nodeIds, ns, infraTypes: INFRA_TYPES });

      const edges = edgesRes.records.map(r => ({
        source: r.get('source'),
        target: r.get('target'),
        type: r.get('type'),
      }));

      // Boundary ports
      const portRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})-[:PORT_OF]->(p:SubGraphPort)
        RETURN p
      `, { id: subgraphId });
      const ports = portRes.records.map(r => r.get('p').properties);

      return { nodes, edges, ports };
    } finally {
      await session.close();
    }
  }

  /**
   * Map upstream input data to specific internal entry nodes via IN ports.
   *
   * portData (from NodeRunner context) is keyed by source node ID, allowing
   * us to match which external node's data goes to which internal entry node.
   */
  _mapInputToPorts(upstreamData, ports, portData) {
    const inPorts = (ports || []).filter(p => p.direction === 'IN' || p.direction === 'BIDI');
    if (inPorts.length === 0) return upstreamData;

    // If we have per-source portData, route each source's data to the correct entry node
    if (portData && typeof portData === 'object') {
      const mapped = {};
      for (const port of inPorts) {
        const sourceData = portData[port.externalNodeId];
        if (sourceData !== undefined) {
          mapped[port.internalNodeId] = sourceData;
        }
      }
      if (Object.keys(mapped).length > 0) return mapped;
    }

    // Fallback: broadcast upstream data to all entry nodes
    return upstreamData;
  }

  /**
   * Collect outputs from exit nodes and flatten into a single output object.
   * Uses OUT ports to identify which internal nodes produce exit data.
   */
  _mapOutputFromPorts(exitOutputs, ports) {
    if (!exitOutputs || typeof exitOutputs !== 'object') return exitOutputs || {};

    const outPorts = (ports || []).filter(p => p.direction === 'OUT' || p.direction === 'BIDI');
    if (outPorts.length === 0) {
      // No OUT ports — return all exit outputs merged
      const values = Object.values(exitOutputs);
      if (values.length === 1) return values[0];
      return Object.assign({}, ...values.filter(v => v && typeof v === 'object'));
    }

    // Collect outputs from exit nodes referenced by OUT ports
    const mapped = {};
    for (const port of outPorts) {
      const data = exitOutputs[port.internalNodeId];
      if (data !== undefined) {
        Object.assign(mapped, typeof data === 'object' && !Array.isArray(data) ? data : { [port.internalNodeId]: data });
      }
    }

    return Object.keys(mapped).length > 0 ? mapped : exitOutputs;
  }
}

module.exports = { SubGraphExecutorTool };
