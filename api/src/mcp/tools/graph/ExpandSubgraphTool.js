const { BaseTool } = require('../primitives/BaseTool.js');
const memgraphService = require('../../../services/memgraph.service');

class ExpandSubgraphTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.expand_subgraph',
      name: 'Expand Subgraph',
      version: '1.0.0',
      level: 2,
      category: 'graph',
      description: 'Drill-down into a SubGraph: return internal nodes, edges, and boundary ports',
      inputSchema: {
        type: 'object',
        required: ['subgraphId'],
        properties: {
          subgraphId: { type: 'string', description: 'SubGraph node ID' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          nodes: { type: 'array' },
          edges: { type: 'array' },
          ports: { type: 'array' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 10000, maxMemoryMb: 50 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['subgraphId']);
    const { subgraphId } = args;
    const session = memgraphService.driver.session();

    try {
      const nodesRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})-[:CONTAINS_MEMBER]->(m)
        RETURN m
      `, { id: subgraphId });

      const nodes = nodesRes.records.map(r => r.get('m').properties);
      const nodeIds = nodes.map(n => n.id);
      const ns = nodes[0]?.namespace || '';

      const edgesRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND b.id IN $ids AND a.namespace = $ns AND b.namespace = $ns
          AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
        RETURN a.id AS source, b.id AS target, type(r) AS type
      `, { ids: nodeIds, ns });

      const edges = edgesRes.records.map(r => ({
        source: r.get('source'), target: r.get('target'), type: r.get('type'),
      }));

      const portRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})-[:PORT_OF]->(p:SubGraphPort)
        RETURN p
      `, { id: subgraphId });
      const ports = portRes.records.map(r => r.get('p').properties);

      return this.success({ subgraphId, nodes, edges, ports });
    } finally {
      await session.close();
    }
  }
}

module.exports = { ExpandSubgraphTool };
