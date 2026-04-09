/**
 * Classification Pipeline Graph Generator
 *
 * Generates executable GXE graph for L1→L2→L3 classification cascade.
 *
 * @module services/workspace/extraction/flowdesk/generators/classification-graph
 */

'use strict';

const { GxeGraphBuilder, EDGE_TYPES } = require('../gxe-builder');

/**
 * Generate classification pipeline graph
 * @param {Array} classificationRules - DraftBusinessRule from classification extractor
 * @param {Array} services - Service catalog entities
 * @returns {Object} GXE graph
 */
function generateClassificationPipelineGraph(classificationRules, services) {
  const b = new GxeGraphBuilder({
    namespace: 'FLOWDESK',
    metadata: { generatedFrom: 'classification-rules', serviceCount: services.length }
  });

  // Start
  const start = b.addStartNode('Classify Request', {
    inputs: [{ name: 'message', type: 'string', required: true }, { name: 'context', type: 'object' }]
  });

  // L1: Keywords
  const l1 = b.addActionNode('L1: Keyword Match', 'flowdesk.classify.keywords', {
    threshold: 0.95, keywordMap: buildKeywordMap(services)
  });
  b.connect(start.id, l1.id);

  const l1Check = b.addConditionNode('L1 High Confidence?', 'l1Result.confidence >= 0.95');
  b.connect(l1.id, l1Check.id);

  const l1Ok = b.addSetValueNode('L1 Result', [
    { target: 'classification.serviceId', expression: 'l1Result.serviceId' },
    { target: 'classification.confidence', expression: 'l1Result.confidence' },
    { target: 'classification.method', value: 'L1_KEYWORD' }
  ]);
  b.connect(l1Check.id, l1Ok.id, 'true', EDGE_TYPES.TRUE);

  // L2: Semantic
  const l2 = b.addActionNode('L2: Semantic Search', 'flowdesk.classify.semantic', {
    collection: 'flowdesk_services', topK: 5, thresholdHigh: 0.80, thresholdMedium: 0.55
  });
  b.connect(l1Check.id, l2.id, 'false', EDGE_TYPES.FALSE);

  const l2Check = b.addConditionNode('L2 High Confidence?', 'l2Result.confidence >= 0.80');
  b.connect(l2.id, l2Check.id);

  const l2Ok = b.addSetValueNode('L2 Result', [
    { target: 'classification.serviceId', expression: 'l2Result.serviceId' },
    { target: 'classification.confidence', expression: 'l2Result.confidence' },
    { target: 'classification.method', value: 'L2_SEMANTIC' },
    { target: 'classification.alternatives', expression: 'l2Result.alternatives' }
  ]);
  b.connect(l2Check.id, l2Ok.id, 'true', EDGE_TYPES.TRUE);

  // L3: LLM
  const l3 = b.addActionNode('L3: LLM Classification', 'flowdesk.classify.llm', {
    model: 'claude-sonnet', temperature: 0.1,
    serviceCatalog: services.map(s => ({ id: s.content?.serviceCode || s.content?.id, name: s.name, description: s.description })),
    includeL2Hints: true
  });
  b.connect(l2Check.id, l3.id, 'false', EDGE_TYPES.FALSE);

  const l3Check = b.addConditionNode('L3 Confident?', 'l3Result.confidence >= 0.50');
  b.connect(l3.id, l3Check.id);

  const l3Ok = b.addSetValueNode('L3 Result', [
    { target: 'classification.serviceId', expression: 'l3Result.serviceId' },
    { target: 'classification.confidence', expression: 'l3Result.confidence' },
    { target: 'classification.method', value: 'L3_LLM' },
    { target: 'classification.reasoning', expression: 'l3Result.reasoning' }
  ]);
  b.connect(l3Check.id, l3Ok.id, 'true', EDGE_TYPES.TRUE);

  // Fallback
  const fallback = b.addSetValueNode('Manual Required', [
    { target: 'classification.serviceId', value: null },
    { target: 'classification.confidence', value: 0 },
    { target: 'classification.method', value: 'MANUAL_REQUIRED' },
    { target: 'classification.candidates', expression: 'l2Result.alternatives || []' }
  ]);
  b.connect(l3Check.id, fallback.id, 'false', EDGE_TYPES.FALSE);

  // End
  const end = b.addEndNode('Classification Complete', { outputs: [{ name: 'classification', type: 'object' }] });
  b.connect(l1Ok.id, end.id);
  b.connect(l2Ok.id, end.id);
  b.connect(l3Ok.id, end.id);
  b.connect(fallback.id, end.id);

  b.autoLayout();
  return b.build('flowdesk.classify.pipeline', 'Classification pipeline — L1 keyword → L2 semantic → L3 LLM cascade');
}

function buildKeywordMap(services) {
  const map = {};
  for (const s of services) {
    const id = s.content?.serviceCode || s.content?.id || s.name;
    for (const kw of (s.content?.keywords || [])) {
      const lower = kw.toLowerCase();
      if (!map[lower]) map[lower] = [];
      map[lower].push(id);
    }
  }
  return map;
}

module.exports = { generateClassificationPipelineGraph };
