'use strict';

const createSR = require('./create-service-request.js');

module.exports = {
  id: 'flowdesk.update-sr-status',
  name: 'Update SR Status',

  async execute(context, config) {
    const sr = context.state['N3-CREATE-SR'] || {};
    const requestId = sr.requestId;
    const newStatus = config.status;

    // Update in-memory store
    const stored = createSR.getRequest(requestId);
    if (stored) {
      stored.status = newStatus;
      stored.updatedAt = new Date().toISOString();
      stored.history.push({ action: newStatus, timestamp: new Date().toISOString(), status: newStatus });
    }

    console.log(`[FlowDesk] SR ${requestId} → ${newStatus}`);
    return { success: true, output: { requestId, status: newStatus } };
  },
};
