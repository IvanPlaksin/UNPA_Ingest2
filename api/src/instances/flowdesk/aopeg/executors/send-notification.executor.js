/**
 * FlowDesk: Send notification (mock for MVP — logs to console)
 */

const { BaseExecutor } = require('../../../../core/aopeg/plugins/plugin-base');
const tpl = require('../../services/template-store.js');

class SendNotificationExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.send_notification';
    this.displayName = 'Send Notification';
    this.description = 'Send a notification to user (email/portal). MVP: console log.';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        template: { type: 'string', enum: ['request_approved', 'request_rejected', 'status_update'] },
        recipient: { type: 'string', description: 'Email or userId' },
        requestId: { type: 'string' },
        workOrderId: { type: 'string' },
        handler: { description: 'Handler name or object' },
        channel: { type: 'array', items: { type: 'string' }, default: ['portal'] },
      },
    };
  }

  async execute(parameters) {
    const template = this.getParam(parameters, 'template', 'status_update');
    const recipient = parameters.recipient || 'unknown';

    const vars = {
      recipient,
      requestId: parameters.requestId || '',
      workOrderId: parameters.workOrderId || '',
      handler: parameters.handler || 'TBD',
    };
    let message;
    if (template === 'request_approved') {
      message = await tpl.render('notification.request_approved', vars);
    } else if (template === 'request_rejected') {
      message = await tpl.render('notification.request_rejected', vars);
    } else {
      message = await tpl.render('notification.status_update', vars);
    }

    console.log(`[FlowDesk] Notification (${template}) → ${recipient}: ${message}`);

    return this.success({ sent: true, template, recipient, message, sentAt: new Date().toISOString() });
  }
}

module.exports = { SendNotificationExecutor };
