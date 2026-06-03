/**
 * BuildTriangleExecutor — ingestion.build_triangle
 *
 * Creates Knowledge Triangle edges based on the document's epistemic layer:
 *   L0-L2 → GOVERNS edges from document to linked processes
 *   L3    → OPERATIONALIZES edges from document to linked processes
 *   L4    → REVEALS_GAP_IN edges + Gap nodes
 *
 * Parameters:
 *   documentId    string  — Document node ID
 *   processIds    array   — Explicit list of process IDs to link (optional)
 *   epistemicLayer string — Override layer (optional, defaults to document.epistemicLayer)
 */

import { BaseExecutor } from '../../plugin-base';

class BuildTriangleExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type        = 'ingestion.build_triangle';
    this.displayName = 'Build Knowledge Triangle';
    this.description = 'Creates GOVERNS / OPERATIONALIZES / REVEALS_GAP_IN edges based on document epistemic layer';
    this.domain      = 'ingestion';

    this.parameterSchema = {
      type: 'object',
      properties: {
        documentId:    { type: 'string',  description: 'Document node ID' },
        processIds:    { type: 'array',   items: { type: 'string' }, description: 'Process IDs to link' },
        epistemicLayer:{ type: 'string',  description: 'Layer override (L0-L5)' }
      }
    };
  }

  async execute(parameters: any, _context: any) {
    const documentId    = this.getRequiredParam(parameters, 'documentId');
    const processIds    = this.getParam(parameters, 'processIds', []) as string[];
    const layerOverride = this.getParam(parameters, 'epistemicLayer', null) as string | null;

    const { documentExtractionService } = require('../../../../../services/knowledge/document-extraction.service');
    const { knowledgeTriangleService }  = require('../../../../../services/knowledge/knowledge-triangle.service');
    const mg = require('../../../../../services/memgraph.service');

    // Load document layer
    const rows = await mg.runQuery(
      `MATCH (d:Document {id: $id}) RETURN d.epistemicLayer as layer`,
      { id: documentId }
    );
    const layer = layerOverride || rows[0]?.layer;
    if (!layer) return this.success({ documentId, edgesCreated: 0, reason: 'no epistemic layer' });

    const edgesCreated = { governs: 0, operationalizes: 0, revealsGapIn: 0 };
    let processesLinked = 0;

    for (const procId of processIds.slice(0, 50)) {
      try {
        if (['L0', 'L1', 'L2'].includes(layer)) {
          await knowledgeTriangleService.createGovernsEdge(documentId, procId);
          edgesCreated.governs++;
        } else if (layer === 'L3') {
          await knowledgeTriangleService.createOperationalizesEdge(documentId, procId);
          edgesCreated.operationalizes++;
        } else if (layer === 'L4') {
          await knowledgeTriangleService.createRevealsGapEdge(documentId, procId, {
            gapType: 'COMPLIANCE', severity: 'MEDIUM',
            title: `Empirical gap from document ${documentId}`
          });
          edgesCreated.revealsGapIn++;
        }
        processesLinked++;
      } catch { /* skip individual errors */ }
    }

    return this.success({ documentId, layer, processesLinked, edgesCreated });
  }
}

module.exports = { BuildTriangleExecutor };
