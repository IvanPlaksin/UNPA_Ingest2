'use strict';

module.exports = {
  id: 'flowdesk.send-notification',
  name: 'Send Notification',

  async execute(context, config) {
    const sr = context.state['N3-CREATE-SR'] || {};
    const userCtx = context.state['N2-CONTEXT'] || {};
    const wo = context.state['N7-WORK-ORD'];
    const handler = context.state['N9-ASSIGN'];

    const notification = {
      template: config.template,
      channels: config.channel || ['portal'],
      recipient: userCtx.email || context.input.userId,
      data: {
        requestId: sr.requestId,
        serviceName: 'Laptop Request',
        serviceCode: sr.serviceCode || context.input.serviceCode,
        status: sr.status,
      },
    };

    if (config.template === 'request_approved' && wo) {
      notification.data.workOrderId = wo.workOrderId;
      notification.data.handler = handler?.handler?.name || 'IT Support';
      notification.data.dueDate = wo.dueDate;
      notification.data.message = `Your laptop request (${sr.requestId}) has been approved. Work order ${wo.workOrderId} assigned to ${notification.data.handler}. Expected completion by ${new Date(wo.dueDate).toLocaleDateString()}.`;
    } else if (config.template === 'request_rejected') {
      notification.data.message = `Your laptop request (${sr.requestId}) has been rejected. Please contact your manager for more information.`;
    }

    // MVP: log instead of sending
    console.log(`[FlowDesk] Notification (${config.template}) → ${notification.recipient}: ${notification.data.message || 'Status update'}`);

    return { success: true, output: { notification, sentAt: new Date().toISOString() } };
  },
};
