const { BaseTool } = require('../primitives/BaseTool.js');
const { v4: uuidv4 } = require('uuid');

class CreateEdgeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.create_edge',
      name: 'Create Graph Edge',
      version: '1.0.0',
      level: 2,
      category: 'graph',
      description: 'Create a relationship/edge between nodes in the graph database',
      inputSchema: {
        type: 'object',
        required: ['from', 'to', 'type'],
        properties: {
          from: { type: 'string', description: 'Source node ID' },
          to: { type: 'string', description: 'Target node ID' },
          type: { type: 'string', description: 'Relationship type' },
          properties: { type: 'object', description: 'Relationship properties' },
          merge: { type: 'boolean', default: false, description: 'Use MERGE instead of CREATE' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          type: { type: 'string' },
          properties: { type: 'object' }
        }
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE', 'EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 20 }
    };
  }

  async execute(args, context, server) {
    const { from, to, type, properties = {}, merge = false } = args;

    const edgeId = uuidv4();
    const edgeProps = { ...properties, _id: edgeId };

    // Build Cypher query
    const operation = merge ? 'MERGE' : 'CREATE';
    const cypher = `
      MATCH (a {_id: $fromId}), (b {_id: $toId})
      ${operation} (a)-[r:${type}]->(b)
      SET r = $props
      RETURN r, a._id as fromId, b._id as toId
    `;

    const params = {
      fromId: from,
      toId: to,
      props: edgeProps
    };

    // Execute using graph.query tool
    const queryTool = server?.registry?.getTool('graph.query');
    if (queryTool) {
      const result = await queryTool.execute({ cypher, params, readOnly: false }, context, server);
      if (result.data?.records?.length > 0) {
        return this.success({
          id: edgeId,
          from,
          to,
          type,
          properties: edgeProps
        });
      }
    }

    // Fallback: return intended edge without executing
    return this.success({
      id: edgeId,
      from,
      to,
      type,
      properties: edgeProps,
      _pending: true
    });
  }
}

module.exports = { CreateEdgeTool };
