/**
 * Routing Decision Graph Generator
 *
 * Generates GXE graphs for queue routing and approval routing.
 *
 * @module services/workspace/extraction/flowdesk/generators/routing-graph
 */

'use strict';

const { GxeGraphBuilder, EDGE_TYPES } = require('../gxe-builder');

/**
 * Generate queue routing decision graph
 * @param {Array} routingRules - DraftBusinessRule from routing extractor
 * @returns {Object} GXE graph
 */
function generateQueueRoutingGraph(routingRules) {
  const queueRules = routingRules.filter(r => r.content?.action?.target === 'request.assignedQueue');

  const cases = queueRules.map(r => ({
    value: r.content?.scope?.prefix || r.name,
    label: `${r.content?.scope?.prefix} → ${r.content?.action?.value}`,
    assignments: [
      { target: 'request.assignedQueue', value: r.content?.action?.value },
      { target: 'request.routingMethod', value: 'DOMAIN_PREFIX' }
    ]
  }));

  return GxeGraphBuilder.createDecisionTableGraph(
    'flowdesk.route.queue',
    { switchOn: 'request.domainPrefix', cases, actions: {} },
    {
      namespace: 'FLOWDESK',
      description: 'Queue routing — maps service domain prefix to support queue',
      inputs: [{ name: 'request.domainPrefix', type: 'string', required: true }],
      defaultAssignments: [
        { target: 'request.assignedQueue', value: 'general-support' },
        { target: 'request.routingMethod', value: 'DEFAULT' }
      ],
      metadata: { generatedFrom: 'routing-rules', ruleCount: queueRules.length }
    }
  );
}

/**
 * Generate approval routing graph
 * @param {Array} routingRules - DraftBusinessRule from routing extractor
 * @returns {Object} GXE graph
 */
function generateApprovalRoutingGraph(routingRules) {
  const approvalRules = routingRules.filter(r => r.content?.ruleType === 'AUTHORIZATION');

  const b = new GxeGraphBuilder({
    namespace: 'FLOWDESK',
    metadata: { generatedFrom: 'approval-routing-rules', ruleCount: approvalRules.length }
  });

  const start = b.addStartNode('Check Approval', {
    inputs: [{ name: 'request.serviceCode', type: 'string', required: true }]
  });

  // Build list of service codes requiring approval
  const approvalCodes = approvalRules.map(r => r.content?.scope?.serviceCode).filter(Boolean);

  const checkNode = b.addConditionNode(
    'Approval Required?',
    `[${approvalCodes.map(c => `'${c}'`).join(',')}].includes(request.serviceCode)`
  );
  b.connect(start.id, checkNode.id);

  // Approval needed path
  const approvalAction = b.addActionNode('Request Approval', 'flowdesk.request_approval', {
    approverRole: 'MANAGER',
    notificationTemplate: 'approval-request'
  });
  b.connect(checkNode.id, approvalAction.id, 'true', EDGE_TYPES.TRUE);

  // No approval path
  const skipApproval = b.addSetValueNode('Skip Approval', [
    { target: 'request.approvalStatus', value: 'NOT_REQUIRED' },
    { target: 'request.autoApproved', value: true }
  ]);
  b.connect(checkNode.id, skipApproval.id, 'false', EDGE_TYPES.FALSE);

  const end = b.addEndNode('Routing Complete');
  b.connect(approvalAction.id, end.id);
  b.connect(skipApproval.id, end.id);

  b.autoLayout();
  return b.build('flowdesk.route.approval', 'Approval routing — checks if service requires manager approval');
}

/**
 * Generate scope-based routing graph (mission → regional → global)
 */
function generateScopeRoutingGraph() {
  const b = new GxeGraphBuilder({
    namespace: 'FLOWDESK',
    metadata: { generatedFrom: 'scope-routing-rules' }
  });

  const start = b.addStartNode('Route by Scope', {
    inputs: [
      { name: 'request.serviceCode', type: 'string', required: true },
      { name: 'user.dutyStation', type: 'string', required: true },
      { name: 'user.region', type: 'string' }
    ]
  });

  // Check mission-level handler
  const missionCheck = b.addActionNode('Find Mission Handler', 'flowdesk.find_handler', { scope: 'MISSION' });
  b.connect(start.id, missionCheck.id);

  const hasMission = b.addConditionNode('Mission Handler Found?', 'missionHandler != null');
  b.connect(missionCheck.id, hasMission.id);

  const useMission = b.addSetValueNode('Use Mission Handler', [
    { target: 'request.handler', expression: 'missionHandler' },
    { target: 'request.routingScope', value: 'MISSION' }
  ]);
  b.connect(hasMission.id, useMission.id, 'true', EDGE_TYPES.TRUE);

  // Check regional handler
  const regionalCheck = b.addActionNode('Find Regional Handler', 'flowdesk.find_handler', { scope: 'REGIONAL' });
  b.connect(hasMission.id, regionalCheck.id, 'false', EDGE_TYPES.FALSE);

  const hasRegional = b.addConditionNode('Regional Handler Found?', 'regionalHandler != null');
  b.connect(regionalCheck.id, hasRegional.id);

  const useRegional = b.addSetValueNode('Use Regional Handler', [
    { target: 'request.handler', expression: 'regionalHandler' },
    { target: 'request.routingScope', value: 'REGIONAL' }
  ]);
  b.connect(hasRegional.id, useRegional.id, 'true', EDGE_TYPES.TRUE);

  // Global fallback
  const useGlobal = b.addSetValueNode('Use Global Handler', [
    { target: 'request.handler', value: 'HQ_GLOBAL_SUPPORT' },
    { target: 'request.routingScope', value: 'GLOBAL' }
  ]);
  b.connect(hasRegional.id, useGlobal.id, 'false', EDGE_TYPES.FALSE);

  const end = b.addEndNode('Handler Assigned');
  b.connect(useMission.id, end.id);
  b.connect(useRegional.id, end.id);
  b.connect(useGlobal.id, end.id);

  b.autoLayout();
  return b.build('flowdesk.route.scope', 'Scope-based routing — mission → regional → global fallback');
}

module.exports = { generateQueueRoutingGraph, generateApprovalRoutingGraph, generateScopeRoutingGraph };
