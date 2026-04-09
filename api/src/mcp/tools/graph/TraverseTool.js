const { BaseTool } = require('../primitives/BaseTool.js');

class TraverseTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.traverse',
      name: 'Traverse Graph',
      version: '1.0.0',
      level: 2,
      category: 'graph',
      description: 'Traverse graph with BFS or DFS from a starting node',
      inputSchema: {
        type: 'object',
        required: ['startNode'],
        properties: {
          startNode: { type: 'string', description: 'Starting node ID' },
          strategy: {
            type: 'string',
            enum: ['bfs', 'dfs'],
            default: 'bfs',
            description: 'Traversal strategy'
          },
          maxDepth: { type: 'integer', default: 3, description: 'Maximum traversal depth' },
          maxNodes: { type: 'integer', default: 100, description: 'Maximum nodes to visit' },
          direction: {
            type: 'string',
            enum: ['outgoing', 'incoming', 'both'],
            default: 'outgoing',
            description: 'Traversal direction'
          },
          relationshipTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by relationship types'
          },
          nodeFilter: {
            type: 'object',
            description: 'Filter nodes by properties'
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          nodes: { type: 'array' },
          edges: { type: 'array' },
          levels: { type: 'object' },
          stats: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 200 }
    };
  }

  async execute(args, context, server) {
    const {
      startNode,
      strategy = 'bfs',
      maxDepth = 3,
      maxNodes = 100,
      direction = 'outgoing',
      relationshipTypes,
      nodeFilter
    } = args;

    // Build relationship filter
    let relFilter = '';
    if (relationshipTypes && relationshipTypes.length > 0) {
      relFilter = `:${relationshipTypes.join('|')}`;
    }

    // Direction pattern
    let dirPattern;
    switch (direction) {
      case 'outgoing': dirPattern = `-[r${relFilter}]->`; break;
      case 'incoming': dirPattern = `<-[r${relFilter}]-`; break;
      default: dirPattern = `-[r${relFilter}]-`; break;
    }

    // Use variable-length pattern for BFS-like query
    const cypher = `
      MATCH path = (start {_id: $startNode})${dirPattern.replace('->', `*0..${maxDepth}->`).replace('<-', `<-*0..${maxDepth}-`)}(node)
      WITH node, min(length(path)) as depth, collect(distinct path) as paths
      RETURN node, depth
      ORDER BY depth
      LIMIT $maxNodes
    `;

    const params = { startNode, maxNodes };

    const queryTool = server?.registry?.getTool('graph.query');
    if (queryTool) {
      try {
        const result = await queryTool.execute({ cypher, params, readOnly: true }, context, server);
        const records = result.data?.records || [];

        const nodes = [];
        const levels = {};

        for (const record of records) {
          const node = this.extractNode(record.node);
          const depth = record.depth || 0;

          if (nodeFilter && !this.matchesFilter(node, nodeFilter)) {
            continue;
          }

          nodes.push({ ...node, depth });

          if (!levels[depth]) {
            levels[depth] = [];
          }
          levels[depth].push(node.id);
        }

        return this.success({
          nodes,
          edges: [], // Would need separate query for edges
          levels,
          stats: {
            totalNodes: nodes.length,
            maxDepthReached: Math.max(...Object.keys(levels).map(Number)),
            strategy
          }
        });
      } catch (error) {
        // Fallback to simpler query
        const simpleCypher = `
          MATCH (start {_id: $startNode})
          OPTIONAL MATCH (start)${dirPattern}(n1)
          OPTIONAL MATCH (n1)${dirPattern}(n2)
          RETURN start, collect(distinct n1) as level1, collect(distinct n2) as level2
          LIMIT 1
        `;
        const result = await queryTool.execute({ cypher: simpleCypher, params, readOnly: true }, context, server);
        return this.parseSimpleResult(result.data?.records || [], startNode);
      }
    }

    return this.success({ nodes: [], edges: [], levels: {}, stats: { totalNodes: 0 } });
  }

  extractNode(node) {
    if (!node) return null;
    return {
      id: node._id || node.id,
      labels: node.labels || [],
      properties: node.properties || node
    };
  }

  matchesFilter(node, filter) {
    for (const [key, value] of Object.entries(filter)) {
      if (node.properties?.[key] !== value) {
        return false;
      }
    }
    return true;
  }

  parseSimpleResult(records, startNode) {
    if (!records.length) {
      return { nodes: [], edges: [], levels: {}, stats: { totalNodes: 0 } };
    }

    const record = records[0];
    const nodes = [];
    const levels = { 0: [startNode] };

    if (record.start) {
      nodes.push({ ...this.extractNode(record.start), depth: 0 });
    }

    if (record.level1) {
      levels[1] = [];
      for (const n of record.level1) {
        if (n) {
          const node = this.extractNode(n);
          nodes.push({ ...node, depth: 1 });
          levels[1].push(node.id);
        }
      }
    }

    if (record.level2) {
      levels[2] = [];
      for (const n of record.level2) {
        if (n) {
          const node = this.extractNode(n);
          nodes.push({ ...node, depth: 2 });
          levels[2].push(node.id);
        }
      }
    }

    return {
      nodes,
      edges: [],
      levels,
      stats: { totalNodes: nodes.length, maxDepthReached: 2 }
    };
  }
}

module.exports = { TraverseTool };
