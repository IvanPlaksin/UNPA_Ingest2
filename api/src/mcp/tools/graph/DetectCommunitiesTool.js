const { BaseTool } = require('../primitives/BaseTool.js');
const { SubgraphSegmentationService } = require('../../../services/graph/subgraph-segmentation.service');

class DetectCommunitiesTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.detect_communities',
      name: 'Detect Communities',
      version: '1.0.0',
      level: 2,
      category: 'graph',
      description: 'Find community clusters in a graph namespace using Label Propagation, ontology layers, and semantic clustering',
      inputSchema: {
        type: 'object',
        required: ['namespace'],
        properties: {
          namespace: { type: 'string', description: 'Graph namespace (e.g., GXE)' },
          strategies: { type: 'array', items: { type: 'string', enum: ['community', 'ontology', 'semantic'] }, description: 'Detection strategies' },
          useLlm: { type: 'boolean', default: true, description: 'Use LLM for coherence evaluation and naming' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          candidates: { type: 'array' },
          bestCandidate: { type: 'object' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 100 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['namespace']);
    const svc = new SubgraphSegmentationService();
    const result = await svc.analyze(args.namespace, {
      strategies: args.strategies || ['community', 'ontology'],
      useLlm: args.useLlm !== false,
    });
    return this.success({
      candidates: result.candidates,
      bestCandidate: result.bestCandidate,
    });
  }
}

module.exports = { DetectCommunitiesTool };
