/**
 * Knowledge Triangle Enrich Executor
 *
 * Post-extraction hook that enriches KnowledgeNodes with:
 *   1. KQS score calculation (kqs_score property)
 *   2. Triangle completeness update for the process
 *   3. Gap detection trigger for L4 empirical documents
 *
 * Typically added after graph.create_node or entity.create in extraction pipelines.
 *
 * Parameters:
 *   nodeId     — ID of the KnowledgeNode just created/updated (required)
 *   processId  — ID of the Process/Entity this node relates to (optional, defaults to nodeId)
 *   detectGaps — boolean, run gap detection on the process (default: true)
 */

'use strict';

const { BaseExecutor } = require('../../plugin-base');

class KnowledgeTriangleEnrichExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type        = 'knowledge.triangle_enrich';
    this.displayName = 'Knowledge Triangle Enrich';
    this.description = 'Calculates KQS score and updates Knowledge Triangle completeness after extraction';
    this.domain      = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        nodeId:     { type: 'string', description: 'KnowledgeNode ID to enrich' },
        processId:  { type: 'string', description: 'Process node ID for triangle queries (defaults to nodeId)' },
        detectGaps: { type: 'boolean', description: 'Run gap detection after enrichment (default: true)' }
      }
    };
  }

  async execute(parameters, _context) {
    const nodeId    = this.getRequiredParam(parameters, 'nodeId');
    const processId = this.getParam(parameters, 'processId', nodeId);
    const detectGaps = this.getParam(parameters, 'detectGaps', true);

    const result = { nodeId, processId, kqs: null, completeness: null, gapDetection: null };

    try {
      const { kqsService } = require('../../../../services/knowledge/kqs.service');
      const kqsResult = await kqsService.calculateKQSById(nodeId, { persist: true });
      result.kqs = kqsResult.kqs;
    } catch (e) {
      result.kqsError = e.message;
    }

    try {
      const { knowledgeTriangleService } = require('../../../../services/knowledge/knowledge-triangle.service');
      const completeness = await knowledgeTriangleService.getTriangleCompleteness(processId);
      result.completeness = completeness.completeness;
      result.missingVertices = completeness.missingVertices;

      // Store completeness on the process node
      const mg = require('../../../../services/memgraph.service');
      await mg.runQuery(
        `MATCH (n:KnowledgeNode {id: $id})
         SET n.triangle_completeness = $comp, n.triangle_updated_at = $now`,
        { id: processId, comp: completeness.completeness, now: new Date().toISOString() }
      );
    } catch (e) {
      result.completenessError = e.message;
    }

    if (detectGaps) {
      try {
        const { gapDetectionService } = require('../../../../services/knowledge/gap-detection.service');
        const staleCount = await gapDetectionService.findStaleGaps({ daysOld: 90 });
        result.gapDetection = { staleGapsFound: staleCount.length };
      } catch (e) {
        result.gapDetectionError = e.message;
      }
    }

    return this.success(result);
  }
}

module.exports = { KnowledgeTriangleEnrichExecutor };
