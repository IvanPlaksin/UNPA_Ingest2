const { BaseTool } = require('../primitives/BaseTool.js');

class FindPathTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.find_path',
      name: 'Find Graph Path',
      version: '1.0.0',
      level: 2,
      category: 'graph',
      description: 'Find shortest path between two nodes in the graph',
      inputSchema: {
        type: 'object',
        required: ['from', 'to'],
        properties: {
          from: { type: 'string', description: 'Source node ID or match pattern' },
          to: { type: 'string', description: 'Target node ID or match pattern' },
          relationshipTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Limit to specific relationship types'
          },
          maxDepth: { type: 'integer', default: 10, description: 'Maximum path length' },
          algorithm: {
            type: 'string',
            enum: ['shortestPath', 'allShortestPaths', 'dijkstra'],
            default: 'shortestPath',
            description: 'Path finding algorithm'
          },
          direction: {
            type: 'string',
            enum: ['outgoing', 'incoming', 'both'],
            default: 'both',
            description: 'Relationship direction'
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nodes: { type: 'array' },
                relationships: { type: 'array' },
                length: { type: 'integer' }
              }
            }
          },
          found: { type: 'boolean' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 100 }
    };
  }

  async execute(args, context, server) {
    const {
      from,
      to,
      relationshipTypes,
      maxDepth = 10,
      algorithm = 'shortestPath',
      direction = 'both'
    } = args;

    // Build relationship pattern
    let relPattern = '';
    if (relationshipTypes && relationshipTypes.length > 0) {
      relPattern = `:${relationshipTypes.join('|')}`;
    }

    // Direction pattern
    let dirPattern;
    switch (direction) {
      case 'outgoing': dirPattern = `-[r${relPattern}*1..${maxDepth}]->`; break;
      case 'incoming': dirPattern = `<-[r${relPattern}*1..${maxDepth}]-`; break;
      default: dirPattern = `-[r${relPattern}*1..${maxDepth}]-`; break;
    }

    // Build Cypher based on algorithm
    let cypher;
    const params = { fromId: from, toId: to };

    switch (algorithm) {
      case 'allShortestPaths':
        cypher = `
          MATCH (start {_id: $fromId}), (end {_id: $toId}),
                p = allShortestPaths((start)${dirPattern}(end))
          RETURN p
          LIMIT 10
        `;
        break;
      case 'dijkstra':
        cypher = `
          MATCH (start {_id: $fromId}), (end {_id: $toId})
          CALL gds.shortestPath.dijkstra.stream({
            nodeQuery: 'MATCH (n) RETURN id(n) AS id',
            relationshipQuery: 'MATCH (n)-[r]->(m) RETURN id(n) AS source, id(m) AS target, coalesce(r.weight, 1.0) AS weight',
            startNode: start,
            endNode: end
          }) YIELD nodeId, cost
          RETURN gds.util.asNode(nodeId) AS node, cost
        `;
        break;
      default: // shortestPath
        cypher = `
          MATCH (start {_id: $fromId}), (end {_id: $toId}),
                p = shortestPath((start)${dirPattern}(end))
          RETURN p
        `;
    }

    // Execute query
    const queryTool = server?.registry?.getTool('graph.query');
    if (queryTool) {
      try {
        const result = await queryTool.execute({ cypher, params, readOnly: true }, context, server);
        const paths = this.parsePaths(result.data?.records || []);
        return this.success({ paths, found: paths.length > 0 });
      } catch (error) {
        // If GDS not available, fall back to basic shortestPath
        if (algorithm === 'dijkstra') {
          const fallbackCypher = `
            MATCH (start {_id: $fromId}), (end {_id: $toId}),
                  p = shortestPath((start)${dirPattern}(end))
            RETURN p
          `;
          const result = await queryTool.execute({ cypher: fallbackCypher, params, readOnly: true }, context, server);
          const paths = this.parsePaths(result.data?.records || []);
          return this.success({ paths, found: paths.length > 0, fallback: true });
        }
        throw error;
      }
    }

    return this.success({ paths: [], found: false });
  }

  parsePaths(records) {
    return records.map(record => {
      const path = record.p || record;
      if (path && path.segments) {
        return {
          nodes: path.nodes || [],
          relationships: path.relationships || [],
          length: path.length || (path.segments?.length || 0)
        };
      }
      return { nodes: [path], relationships: [], length: 0 };
    });
  }
}

module.exports = { FindPathTool };
