/**
 * CalculateKQSExecutor — ingestion.calculate_kqs
 *
 * Calculates KQS scores for:
 *   - The document/source node itself
 *   - A batch of extracted entity node IDs
 *
 * Parameters:
 *   documentId   string   — Source document node ID
 *   entityIds    array    — Extracted entity IDs to score (max 100)
 *   persist      boolean  — Store kqs_score on nodes (default: true)
 */

import { BaseExecutor } from '../../plugin-base';

class CalculateKQSExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type        = 'ingestion.calculate_kqs';
    this.displayName = 'Calculate KQS Scores';
    this.description = 'Calculates Knowledge Quality Scores for document and all extracted entities';
    this.domain      = 'ingestion';

    this.parameterSchema = {
      type: 'object',
      properties: {
        documentId: { type: 'string',  description: 'Source document node ID' },
        entityIds:  { type: 'array',   items: { type: 'string' }, description: 'Entity node IDs (max 100)' },
        persist:    { type: 'boolean', description: 'Persist kqs_score to Memgraph (default: true)' }
      }
    };
  }

  async execute(parameters: any, _context: any) {
    const documentId = this.getRequiredParam(parameters, 'documentId');
    const entityIds  = (this.getParam(parameters, 'entityIds', []) as string[]).slice(0, 100);
    const persist    = this.getParam(parameters, 'persist', true) as boolean;

    const { kqsService } = require('../../../../../services/knowledge/kqs.service');

    const result: any = { documentId, documentsScored: 0, entitiesScored: 0, errors: [] };

    // Score document node itself
    try {
      const docScore = await kqsService.calculateKQSById(documentId, { persist });
      result.documentKqs = docScore.kqs;
      result.documentsScored = 1;
    } catch (e: any) {
      result.errors.push({ id: documentId, error: e.message });
    }

    // Score extracted entities
    if (entityIds.length > 0) {
      const batchResult = await kqsService.calculateKQSBatch(entityIds, { persist });
      result.entitiesScored = batchResult.succeeded;
      result.batchErrors    = batchResult.failed;
    }

    return this.success(result);
  }
}

module.exports = { CalculateKQSExecutor };
