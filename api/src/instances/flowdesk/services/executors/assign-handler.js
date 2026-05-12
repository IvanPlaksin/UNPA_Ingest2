'use strict';

const routing = require('../graph-routing.js');

module.exports = {
  id: 'flowdesk.assign-handler',
  name: 'Assign Handler',

  async execute(context) {
    await routing.init();
    const userId = context.input.userId;
    const serviceCode = context.input.serviceCode;

    // Use pre-computed handler from input if available
    let handler = context.input.handler;
    if (!handler) {
      const result = await routing.resolveServiceHandler(userId, serviceCode);
      handler = result?.handler;
    }

    const wo = context.state['N7-WORK-ORD'] || {};

    console.log(`[FlowDesk] WO ${wo.workOrderId} assigned to ${handler?.code || 'UNASSIGNED'} (${handler?.scope || 'unknown'})`);

    return {
      success: true,
      output: {
        workOrderId: wo.workOrderId,
        handler: handler || { code: 'UNASSIGNED', name: 'Unassigned', scope: 'global' },
        assignedAt: new Date().toISOString(),
      },
    };
  },
};
