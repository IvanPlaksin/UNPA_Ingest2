/**
 * Segment Graph Executor — analyzes a graph namespace and returns cluster candidates
 */

const { BaseExecutor } = require('../../plugin-base');

class SegmentGraphExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'subgraph.segment_graph';
    this.displayName = 'Segment Graph';
    this.description = 'Analyze a graph namespace to find coherent cluster candidates for subgraph extraction';
    this.domain = 'subgraph';

    this.parameterSchema = {
      type: 'object',
      properties: {
        namespace: { type: 'string' },
        strategies: { type: 'array', items: { type: 'string' }, default: ['community', 'ontology'] },
        useLlm: { type: 'boolean', default: false },
        minCoherence: { type: 'number', default: 0.3 },
      },
      required: ['namespace'],
    };
  }

  async execute(parameters, context) {
    const startTime = Date.now();

    try {
      const namespace = this.getRequiredParam(parameters, 'namespace');
      const strategies = this.getParam(parameters, 'strategies', ['community', 'ontology']);
      const useLlm = this.getParam(parameters, 'useLlm', false);
      const minCoherence = this.getParam(parameters, 'minCoherence', 0.3);

      const { SubgraphSegmentationService } = require('../../../../../services/graph/subgraph-segmentation.service');
      const segSvc = new SubgraphSegmentationService();

      const result = await segSvc.analyze(namespace, { strategies, useLlm, minCoherence });

      const candidates = result.candidates.map(c => ({
        strategy: c.strategy, name: c.suggestedName, nodeIds: c.nodes,
        nodeCount: c.nodeCount, coherenceScore: c.coherenceScore,
      }));

      return this.success(
        {
          candidates,
          bestCandidate: result.bestCandidate ? {
            name: result.bestCandidate.suggestedName, nodeIds: result.bestCandidate.nodes,
            nodeCount: result.bestCandidate.nodeCount, coherenceScore: result.bestCandidate.coherenceScore,
            strategy: result.bestCandidate.strategy,
          } : null,
          structural: result.structural,
        },
        { namespace, candidateCount: candidates.length, duration: Date.now() - startTime },
        candidates.length > 0 ? 0.8 : 0.3,
      );
    } catch (error) {
      return this.error('SEGMENT_ERROR', `Segmentation failed: ${error.message}`, true);
    }
  }
}

module.exports = { SegmentGraphExecutor };
