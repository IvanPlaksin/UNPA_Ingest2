'use strict';

const crypto = require('crypto');

const workOrders = new Map();

module.exports = {
  id: 'flowdesk.create-work-order',
  name: 'Create Work Order',

  getWorkOrder(id) { return workOrders.get(id); },

  async execute(context, config) {
    const sr = context.state['N3-CREATE-SR'] || {};

    const wo = {
      id: 'WO-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
      requestId: sr.requestId,
      type: config.type || 'GENERAL',
      status: 'OPEN',
      slaHours: config.sla_hours,
      dueDate: new Date(Date.now() + (config.sla_hours || 72) * 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    workOrders.set(wo.id, wo);
    console.log(`[FlowDesk] WO created: ${wo.id} for SR ${sr.requestId} (SLA: ${wo.slaHours}h)`);

    return { success: true, output: { workOrderId: wo.id, ...wo } };
  },
};
