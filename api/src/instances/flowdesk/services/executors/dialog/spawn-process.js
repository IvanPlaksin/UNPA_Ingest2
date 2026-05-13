'use strict';

const routing = require('../../graph-routing.js');
const workflowRunner = require('../../workflow-runner.js');

module.exports = {
  id: 'flowdesk.dialog.spawn-process',

  async execute(context) {
    const { state, userContext } = context;
    const serviceCode = state.service_code;
    const userId = state.beneficiary_type === 'other' && state.beneficiary
      ? state.beneficiary.id
      : context.userId;

    // Resolve handler
    await routing.init();
    const routingResult = await routing.resolveServiceHandler(userId, serviceCode);

    // Check if workflow exists
    const graphId = routingResult?.service?.gxeGraphId;
    if (!graphId) {
      return {
        response: `Request noted for **${state.service_name || serviceCode}**, but no automated workflow is available yet. Your request has been logged and will be processed manually.\n\nHandler: **${routingResult?.handler?.name || 'TBD'}**`,
        state_updates: {},
        condition: 'default',
      };
    }

    // Init and spawn workflow
    if (!workflowRunner.executorMap?.size) workflowRunner.init();

    const result = await workflowRunner.spawn(graphId, {
      userId,
      serviceCode,
      justification: state.justification || '',
      handler: routingResult.handler,
      userContext: routingResult.userContext,
    });

    const sr = result.result?.['N3-CREATE-SR'];
    const wo = result.result?.['N7-WORK-ORD'];
    const handler = routingResult.handler;

    const lines = [
      `Request created successfully!`,
      ``,
      sr ? `- **Request ID:** ${sr.requestId}` : null,
      wo ? `- **Work Order:** ${wo.workOrderId}` : null,
      handler ? `- **Assigned to:** ${handler.name} (${handler.scope})` : null,
      wo ? `- **Due date:** ${new Date(wo.dueDate).toLocaleDateString()}` : null,
      `- **Status:** ${result.status}`,
      ``,
      `You will receive a notification when your manager approves the request.`,
    ].filter(Boolean).join('\n');

    return {
      response: lines,
      state_updates: {
        process_result: {
          workflowId: result.workflowId,
          requestId: sr?.requestId,
          workOrderId: wo?.workOrderId,
          status: result.status,
          handler,
          history: result.history,
        },
      },
      spawn_result: result,
      condition: 'default',
    };
  },
};
