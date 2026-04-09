const { BaseTool } = require('../primitives/BaseTool.js');
const { ReuseStrategyResolver } = require('../../../services/graph/reuse-strategy-resolver.js');

class AnalyzeReuseTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.analyze_reuse',
      name: 'Analyze Reuse Strategy',
      version: '1.0.0',
      level: 2,
      category: 'catalog',
      description: 'Analyze a node that needs a sub-graph and recommend a reuse strategy (DIRECT_REUSE, CLONE_MODIFY, ABSTRACT_INHERIT, or CREATE_NEW) based on catalog search.',
      inputSchema: {
        type: 'object',
        required: ['nodeId', 'nodeLabel'],
        properties: {
          nodeId:           { type: 'string', description: 'ID of the node needing a sub-graph' },
          nodeLabel:        { type: 'string', description: 'Node label/title' },
          nodeDescription:  { type: 'string', description: 'What this node should do' },
          expectedToolIds:  { type: 'array', items: { type: 'string' }, description: 'Expected MCP tool IDs in the sub-graph' },
          parentGraphId:    { type: 'string', description: 'Parent graph catalog ID for context' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          strategy:              { type: 'string', enum: ['DIRECT_REUSE', 'CLONE_MODIFY', 'ABSTRACT_INHERIT', 'CREATE_NEW'] },
          confidence:            { type: 'number' },
          reasoning:             { type: 'string' },
          sourceGraph:           { type: 'object' },
          suggestedModifications:{ type: 'array' },
          alternatives:          { type: 'array' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 20 }
    };
  }

  async execute(args) {
    this.validateArgs(args, ['nodeId', 'nodeLabel']);

    const resolver = new ReuseStrategyResolver();
    const proposal = await resolver.analyze({
      nodeId: args.nodeId,
      nodeLabel: args.nodeLabel,
      nodeDescription: args.nodeDescription || '',
      expectedToolIds: args.expectedToolIds || [],
      parentGraphId: args.parentGraphId || null
    });

    return this.success(proposal);
  }
}

module.exports = { AnalyzeReuseTool };
