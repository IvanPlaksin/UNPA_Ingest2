const { BaseTool } = require('../primitives/BaseTool.js');

class NeighborsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.neighbors',
      name: 'Get Node Neighbors',
      version: '1.0.0',
      level: 2,
      category: 'graph',
      description: 'Get neighbors of a node in the graph',
      inputSchema: {
        type: 'object',
        required: ['nodeId'],
        properties: {
          nodeId: { type: 'string', description: 'Node ID' },
          direction: {
            type: 'string',
            enum: ['outgoing', 'incoming', 'both'],
            default: 'both',
            description: 'Relationship direction'
          },
          relationshipTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by relationship types'
          },
          depth: { type: 'integer', default: 1, description: 'Traversal depth (1-3)' },
          limit: { type: 'integer', default: 100, description: 'Maximum neighbors to return' },
          includeRelationships: { type: 'boolean', default: true, description: 'Include relationship data' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          neighbors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                node: { type: 'object' },
                relationship: { type: 'object' },
                depth: { type: 'integer' }
              }
            }
          },
          count: { type: 'integer' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 10000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context, server) {
    const {
      nodeId,
      direction = 'both',
      relationshipTypes,
      depth = 1,
      limit = 100,
      includeRelationships = true
    } = args;

    // Clamp depth to reasonable range
    const safeDepth = Math.min(Math.max(depth, 1), 3);

    // Build relationship pattern
    let relPattern = '';
    if (relationshipTypes && relationshipTypes.length > 0) {
      relPattern = `:${relationshipTypes.join('|')}`;
    }

    // Direction pattern
    let matchPattern;
    switch (direction) {
      case 'outgoing':
        matchPattern = `(n)-[r${relPattern}*1..${safeDepth}]->(neighbor)`;
        break;
      case 'incoming':
        matchPattern = `(n)<-[r${relPattern}*1..${safeDepth}]-(neighbor)`;
        break;
      default:
        matchPattern = `(n)-[r${relPattern}*1..${safeDepth}]-(neighbor)`;
    }

    const cypher = `
      MATCH (n {_id: $nodeId})
      MATCH ${matchPattern}
      WHERE neighbor <> n
      WITH DISTINCT neighbor, r, length(r) as depth
      RETURN neighbor, r, depth
      ORDER BY depth
      LIMIT $limit
    `;

    const params = { nodeId, limit };

    // Execute query
    const queryTool = server?.registry?.getTool('graph.query');
    if (queryTool) {
      const result = await queryTool.execute({ cypher, params, readOnly: true }, context, server);
      const neighbors = (result.data?.records || []).map(record => ({
        node: this.extractNode(record.neighbor),
        ...(includeRelationships && { relationship: this.extractRelationship(record.r) }),
        depth: record.depth || 1
      }));

      return this.success({ neighbors, count: neighbors.length });
    }

    return this.success({ neighbors: [], count: 0 });
  }

  extractNode(node) {
    if (!node) return null;
    return {
      id: node._id || node.id,
      labels: node.labels || [],
      properties: node.properties || node
    };
  }

  extractRelationship(rel) {
    if (!rel) return null;
    if (Array.isArray(rel)) {
      return rel.map(r => this.extractRelationship(r));
    }
    return {
      type: rel.type,
      properties: rel.properties || {}
    };
  }
}

module.exports = { NeighborsTool };
