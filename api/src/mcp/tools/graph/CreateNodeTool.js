const { BaseTool } = require('../primitives/BaseTool.js');
const { v4: uuidv4 } = require('uuid');

class CreateNodeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.create_node',
      name: 'Create Graph Node',
      version: '1.0.0',
      level: 2,
      category: 'graph',
      description: 'Create a node in the graph database',
      inputSchema: {
        type: 'object',
        required: ['labels', 'properties'],
        properties: {
          labels: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } }
            ],
            description: 'Node label(s)'
          },
          properties: { type: 'object', description: 'Node properties' },
          id: { type: 'string', description: 'Custom node ID (auto-generated if not provided)' },
          merge: { type: 'boolean', default: false, description: 'Use MERGE instead of CREATE' },
          mergeKey: { type: 'string', description: 'Property to use as merge key' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
          properties: { type: 'object' }
        }
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE', 'EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 20 }
    };
  }

  async execute(args, context, server) {
    const { labels, properties, id, merge = false, mergeKey } = args;

    const labelArray = Array.isArray(labels) ? labels : [labels];
    const nodeId = id || uuidv4();
    const nodeProps = { ...properties, _id: nodeId };

    // Build Cypher query
    const labelStr = labelArray.map(l => `:${l}`).join('');
    let cypher;
    let params = { props: nodeProps };

    if (merge && mergeKey) {
      cypher = `MERGE (n${labelStr} {${mergeKey}: $mergeValue})
                ON CREATE SET n = $props
                ON MATCH SET n += $props
                RETURN n`;
      params.mergeValue = nodeProps[mergeKey];
    } else if (merge) {
      cypher = `MERGE (n${labelStr} {_id: $nodeId})
                ON CREATE SET n = $props
                RETURN n`;
      params.nodeId = nodeId;
    } else {
      cypher = `CREATE (n${labelStr} $props) RETURN n`;
    }

    // Execute using graph.query tool
    const queryTool = server?.registry?.getTool('graph.query');
    if (queryTool) {
      const result = await queryTool.execute({ cypher, params, readOnly: false }, context, server);
      if (result.data?.records?.length > 0) {
        const node = result.data.records[0].n || result.data.records[0];
        return this.success({
          id: nodeId,
          labels: labelArray,
          properties: node.properties || nodeProps
        });
      }
    }

    // Fallback: return intended node without executing
    return this.success({
      id: nodeId,
      labels: labelArray,
      properties: nodeProps,
      _pending: true
    });
  }
}

module.exports = { CreateNodeTool };
