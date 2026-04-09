/**
 * FlowDesk GXE Graph Generators
 *
 * Generates executable GXE graphs from extracted FlowDesk knowledge.
 */

'use strict';

const { generateSLADecisionGraph, generateSLAEscalationGraph } = require('./sla-graph.generator');
const { generateClassificationPipelineGraph } = require('./classification-graph.generator');
const { generateQueueRoutingGraph, generateApprovalRoutingGraph, generateScopeRoutingGraph } = require('./routing-graph.generator');
const { enhanceIntakeDialog, generateServiceIntakeDialog } = require('./dialog-graph.generator');

/**
 * Generate all FlowDesk GXE graphs from extracted drafts
 * @param {Object} extractedData - Output from runFlowDeskExtraction
 * @param {Array} extractedData.slaRules - SLA business rules
 * @param {Array} extractedData.classificationRules - Classification rules
 * @param {Array} extractedData.routingRules - Routing rules
 * @param {Array} extractedData.services - Service catalog entities
 * @returns {Object[]} Array of generated GXE graphs
 */
function generateAllFlowDeskGraphs({ slaRules = [], classificationRules = [], routingRules = [], services = [] }) {
  const graphs = [];
  const log = [];

  try {
    if (slaRules.length > 0) {
      graphs.push(generateSLADecisionGraph(slaRules));
      log.push('Generated: flowdesk.sla.decision');

      graphs.push(generateSLAEscalationGraph());
      log.push('Generated: flowdesk.sla.escalation');
    }

    if (classificationRules.length > 0 || services.length > 0) {
      graphs.push(generateClassificationPipelineGraph(classificationRules, services));
      log.push('Generated: flowdesk.classify.pipeline');
    }

    if (routingRules.length > 0) {
      graphs.push(generateQueueRoutingGraph(routingRules));
      log.push('Generated: flowdesk.route.queue');

      graphs.push(generateApprovalRoutingGraph(routingRules));
      log.push('Generated: flowdesk.route.approval');
    }

    graphs.push(generateScopeRoutingGraph());
    log.push('Generated: flowdesk.route.scope');

  } catch (err) {
    log.push(`Error: ${err.message}`);
  }

  console.log(`[FlowDeskGenerators] Generated ${graphs.length} GXE graphs`);

  return { graphs, log };
}

module.exports = {
  generateAllFlowDeskGraphs,
  generateSLADecisionGraph,
  generateSLAEscalationGraph,
  generateClassificationPipelineGraph,
  generateQueueRoutingGraph,
  generateApprovalRoutingGraph,
  generateScopeRoutingGraph,
  enhanceIntakeDialog,
  generateServiceIntakeDialog
};
