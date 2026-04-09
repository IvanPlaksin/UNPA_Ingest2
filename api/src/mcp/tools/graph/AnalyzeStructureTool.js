const { BaseTool } = require('../primitives/BaseTool.js');
const { GraphAnalyzer } = require('../../../services/graph/graph-analyzer');

class AnalyzeStructureTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.analyze_structure',
      name: 'Analyze Graph Structure',
      version: '1.0.0',
      level: 2,
      category: 'graph',
      description: 'Structural analysis of a graph namespace: node/edge counts, density, hub nodes, components, bridges',
      inputSchema: {
        type: 'object',
        required: ['namespace'],
        properties: {
          namespace: { type: 'string', description: 'Graph namespace (e.g., GXE)' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          nodeCount: { type: 'number' },
          edgeCount: { type: 'number' },
          density: { type: 'number' },
          hubNodes: { type: 'array' },
          connectedComponents: { type: 'object' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 10000, maxMemoryMb: 50 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['namespace']);
    const analyzer = new GraphAnalyzer();
    const result = await analyzer.analyze(args.namespace);
    return this.success(result);
  }
}

module.exports = { AnalyzeStructureTool };
