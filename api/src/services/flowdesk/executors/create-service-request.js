'use strict';

const crypto = require('crypto');

// In-memory store for MVP (production: Memgraph or SQL)
const serviceRequests = new Map();

module.exports = {
  id: 'flowdesk.create-service-request',
  name: 'Create Service Request',

  // Expose store for status queries
  getRequest(id) { return serviceRequests.get(id); },
  getAllRequests() { return [...serviceRequests.values()]; },

  async execute(context, config) {
    const userCtx = context.state['N2-CONTEXT'] || {};
    const validation = context.state['N1-VALIDATE'] || {};

    const sr = {
      id: 'SR-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
      serviceCode: config.service_code || context.input.serviceCode,
      status: config.initial_status || 'PENDING_APPROVAL',
      requester: {
        userId: context.input.userId,
        email: userCtx.email,
        displayName: userCtx.displayName,
        orgUnit: userCtx.orgUnit?.name,
        location: userCtx.location?.dutyStation,
      },
      justification: context.input.justification || validation.justification,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [{ action: 'CREATED', timestamp: new Date().toISOString(), status: config.initial_status }],
    };

    serviceRequests.set(sr.id, sr);
    console.log(`[FlowDesk] SR created: ${sr.id} (${sr.serviceCode}) for ${sr.requester.email}`);

    return { success: true, output: { requestId: sr.id, ...sr } };
  },
};
