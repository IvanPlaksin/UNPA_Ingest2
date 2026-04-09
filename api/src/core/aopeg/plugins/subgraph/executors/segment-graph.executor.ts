/**
 * Segment Graph Executor — analyzes a graph namespace and returns cluster candidates
 */

import { BaseExecutor, ExecutionContext, NodeExecutionResult } from '../../plugin-base';

export class SegmentGraphExecutor extends BaseExecutor {
  readonly type = 'subgraph.segment_graph';
  readonly displayName = 'Segment Graph';
  readonly description = 'Analyze a graph namespace to find coherent cluster candidates for subgraph extraction';
  readonly domain = 'subgraph';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Graph namespace to analyze (e.g. GXE)' },
      strategies: {
        type: 'array', items: { type: 'string' },
        default: ['community', 'ontology'],
        description: 'Segmentation strategies: community, semantic, ontology',
      },
      useLlm: { type: 'boolean', default: false, description: 'Use LLM for coherence evaluation' },
      minCoherence: { type: 'number', default: 0.3, description: 'Minimum coherence score threshold' },
    },
    required: ['namespace'],
  };

  async execute(parameters: Record<string, unknown>, context: ExecutionContext): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const namespace = this.getRequiredParam<string>(parameters, 'namespace');
      const strategies = this.getParam(parameters, 'strategies', ['community', 'ontology']);
      const useLlm = this.getParam(parameters, 'useLlm', false);
      const minCoherence = this.getParam(parameters, 'minCoherence', 0.3);

      const { SubgraphSegmentationService } = require('../../../../services/graph/subgraph-segmentation.service');
      const segSvc = new SubgraphSegmentationService();

      const result = await segSvc.analyze(namespace, { strategies, useLlm, minCoherence });

      const candidates = result.candidates.map((c: any) => ({
        strategy: c.strategy,
        name: c.suggestedName,
        nodeIds: c.nodes,
        nodeCount: c.nodeCount,
        coherenceScore: c.coherenceScore,
      }));

      return this.success(
        {
          candidates,
          bestCandidate: result.bestCandidate ? {
            name: result.bestCandidate.suggestedName,
            nodeIds: result.bestCandidate.nodes,
            nodeCount: result.bestCandidate.nodeCount,
            coherenceScore: result.bestCandidate.coherenceScore,
            strategy: result.bestCandidate.strategy,
          } : null,
          structural: result.structural,
        },
        { namespace, candidateCount: candidates.length, duration: Date.now() - startTime },
        candidates.length > 0 ? 0.8 : 0.3,
      );
    } catch (error: any) {
      return this.error('SEGMENT_ERROR', `Segmentation failed: ${error.message}`, true);
    }
  }
}
