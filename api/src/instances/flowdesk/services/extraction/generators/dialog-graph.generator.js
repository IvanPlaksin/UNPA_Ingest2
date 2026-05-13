/**
 * Dialog Graph Enhancement Generator
 *
 * Enhances existing FlowDesk dialog graphs with:
 * 1. Subgraph references to generated decision graphs
 * 2. Service catalog metadata
 * 3. Dynamic routing based on classification
 *
 * @module services/workspace/extraction/flowdesk/generators/dialog-graph
 */

'use strict';

const { GxeGraphBuilder, EDGE_TYPES } = require('../gxe-builder.js');

/**
 * Enhance intake dialog with classification, routing, and SLA subgraphs
 */
function enhanceIntakeDialog(existingGraph, services, options = {}) {
  const b = new GxeGraphBuilder({
    namespace: 'FLOWDESK',
    metadata: { generatedFrom: 'intake-dialog-enhancement', originalGraph: existingGraph?.name || 'intake-dialog' }
  });

  const start = b.addStartNode('Receive Request', {
    inputs: [
      { name: 'userMessage', type: 'string', required: true },
      { name: 'userId', type: 'string', required: true },
      { name: 'sessionId', type: 'string', required: true }
    ]
  });

  // Classification subgraph
  const classify = b.addSubgraphNode('Classify Request', 'flowdesk.classify.pipeline',
    { message: 'userMessage' }, { classification: 'classification' });
  b.connect(start.id, classify.id);

  const classOk = b.addConditionNode('Classified?', 'classification.serviceId != null && classification.confidence >= 0.50');
  b.connect(classify.id, classOk.id);

  // Service details
  const loadSvc = b.addActionNode('Load Service', 'flowdesk.kb.getService', { serviceIdPath: 'classification.serviceId' });
  b.connect(classOk.id, loadSvc.id, 'true', EDGE_TYPES.TRUE);

  // Clarification loop
  const clarify = b.addActionNode('Ask Clarification', 'flowdesk.dialog.clarify', { candidatesPath: 'classification.candidates' });
  b.connect(classOk.id, clarify.id, 'false', EDGE_TYPES.FALSE);
  const waitClarify = b.addActionNode('Wait Clarification', 'workflow.waitForInput', { timeout: 300 });
  b.connect(clarify.id, waitClarify.id);
  b.connect(waitClarify.id, classify.id); // loop

  // Location check
  const needLoc = b.addConditionNode('Needs Location?', 'service.requiredFields.includes("location")');
  b.connect(loadSvc.id, needLoc.id);

  const askLoc = b.addActionNode('Ask Location', 'flowdesk.dialog.askLocation', {});
  b.connect(needLoc.id, askLoc.id, 'true', EDGE_TYPES.TRUE);
  const waitLoc = b.addActionNode('Wait Location', 'workflow.waitForInput', {});
  b.connect(askLoc.id, waitLoc.id);
  const resolveLoc = b.addActionNode('Resolve Location', 'flowdesk.kg.resolveLocation', {});
  b.connect(waitLoc.id, resolveLoc.id);

  const mergeLoc = b.addSetValueNode('Set Location', [{ target: 'request.location', expression: 'resolvedLocation || null' }]);
  b.connect(resolveLoc.id, mergeLoc.id);
  b.connect(needLoc.id, mergeLoc.id, 'false', EDGE_TYPES.FALSE);

  // SLA subgraph
  const sla = b.addSubgraphNode('Determine SLA', 'flowdesk.sla.decision',
    { 'ticket.priority': 'service.defaultPriority' }, { sla: 'sla' });
  b.connect(mergeLoc.id, sla.id);

  // Routing subgraph
  const route = b.addSubgraphNode('Route Request', 'flowdesk.route.queue',
    { 'request.domainPrefix': 'service.domainCode' }, { routing: 'routing' });
  b.connect(sla.id, route.id);

  // Approval subgraph
  const approval = b.addSubgraphNode('Check Approval', 'flowdesk.route.approval',
    { 'request.serviceCode': 'classification.serviceId' }, { approval: 'approval' });
  b.connect(route.id, approval.id);

  // Confirm
  const confirm = b.addActionNode('Confirm Request', 'flowdesk.dialog.confirm', {});
  b.connect(approval.id, confirm.id);
  const waitConfirm = b.addActionNode('Wait Confirmation', 'workflow.waitForInput', {});
  b.connect(confirm.id, waitConfirm.id);

  const confirmed = b.addConditionNode('Confirmed?', 'userInput.match(/yes|confirm|ok|proceed/i)');
  b.connect(waitConfirm.id, confirmed.id);

  const create = b.addActionNode('Create Service Request', 'flowdesk.createServiceRequest', {});
  b.connect(confirmed.id, create.id, 'true', EDGE_TYPES.TRUE);

  const cancel = b.addActionNode('Handle Cancel', 'flowdesk.dialog.handleCancel', {});
  b.connect(confirmed.id, cancel.id, 'false', EDGE_TYPES.FALSE);

  const endOk = b.addEndNode('Request Created');
  b.connect(create.id, endOk.id);
  const endCancel = b.addEndNode('Cancelled');
  b.connect(cancel.id, endCancel.id);

  b.autoLayout();
  return b.build('flowdesk.intake.enhanced', 'Enhanced intake dialog with KB-backed classification, routing, and SLA');
}

/**
 * Generate service-specific intake dialog
 */
function generateServiceIntakeDialog(service) {
  const serviceId = service.content?.serviceCode || service.content?.id || service.name;
  const requiredFields = service.content?.requiredFields || ['description'];

  const b = new GxeGraphBuilder({
    namespace: 'FLOWDESK',
    metadata: { serviceId, serviceName: service.name, generatedFrom: 'service-catalog' }
  });

  const start = b.addStartNode(`${service.name} Request`, {
    inputs: [{ name: 'userId', type: 'string', required: true }, { name: 'sessionId', type: 'string', required: true }]
  });

  const setSvc = b.addSetValueNode('Set Service', [
    { target: 'service.id', value: serviceId },
    { target: 'service.name', value: service.name },
    { target: 'service.domain', value: service.content?.domain },
    { target: 'service.priority', value: service.content?.defaultPriority || 'MEDIUM' }
  ]);
  b.connect(start.id, setSvc.id);

  let prev = setSvc;
  for (const field of requiredFields) {
    const ask = b.addActionNode(`Ask ${field}`, 'flowdesk.dialog.askField', { field });
    b.connect(prev.id, ask.id);
    const wait = b.addActionNode(`Wait ${field}`, 'workflow.waitForInput', {});
    b.connect(ask.id, wait.id);
    const set = b.addSetValueNode(`Set ${field}`, [{ target: `request.${field}`, expression: 'userInput' }]);
    b.connect(wait.id, set.id);
    prev = set;
  }

  const sla = b.addSubgraphNode('Get SLA', 'flowdesk.sla.decision',
    { 'ticket.priority': 'service.priority' }, { sla: 'sla' });
  b.connect(prev.id, sla.id);

  const createReq = b.addActionNode('Create Request', 'flowdesk.createServiceRequest', { serviceId });
  b.connect(sla.id, createReq.id);

  const end = b.addEndNode('Complete');
  b.connect(createReq.id, end.id);

  b.autoLayout();
  return b.build(`flowdesk.intake.${serviceId.toLowerCase().replace(/-/g, '_')}`, `Intake dialog for ${service.name}`);
}

module.exports = { enhanceIntakeDialog, generateServiceIntakeDialog };
