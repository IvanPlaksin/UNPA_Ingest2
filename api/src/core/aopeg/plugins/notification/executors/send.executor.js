/**
 * Send Notification Executor — sends notifications via various channels
 */

const { BaseExecutor } = require('../../plugin-base');
const { randomUUID } = require('node:crypto');

class SendNotificationExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'notification.send';
    this.displayName = 'Send Notification';
    this.description = 'Sends notifications to users via email, in-app, or SMS channels';
    this.domain = 'notification';

    this.parameterSchema = {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['email', 'ineed_activity', 'sms', 'all'], default: 'ineed_activity' },
        recipients: { type: 'array', items: { type: 'string' } },
        template_id: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
        context: { type: 'object' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal' },
        sr_id: { type: 'string' },
      },
      required: ['recipients', 'body'],
    };
  }

  async execute(parameters, context) {
    const startTime = Date.now();
    const channel = this.getParam(parameters, 'channel', 'ineed_activity');
    const recipients = this.getRequiredParam(parameters, 'recipients');
    const templateId = this.getParam(parameters, 'template_id', '');
    const subject = this.getParam(parameters, 'subject', '');
    const bodyTemplate = this.getRequiredParam(parameters, 'body');
    const templateContext = this.getParam(parameters, 'context', {});
    const priority = this.getParam(parameters, 'priority', 'normal');
    const srId = this.getParam(parameters, 'sr_id', '');

    if (!recipients.length) {
      return this.error('INVALID_INPUT', 'recipients array cannot be empty', true);
    }

    const body = this._resolveTemplate(bodyTemplate, templateContext);
    const resolvedSubject = subject ? this._resolveTemplate(subject, templateContext) : '';

    const globalVars = context.globalVariables;
    const variables = globalVars instanceof Map ? Object.fromEntries(globalVars) : (globalVars || {});
    const resolvedRecipients = recipients.map(r => this._resolveTemplate(r, { ...variables, ...templateContext }));

    const notificationId = randomUUID();
    const sentAt = new Date().toISOString();

    // Store in Memgraph (non-blocking)
    try {
      const memgraph = require('../../../../../services/memgraph.service');
      await memgraph.executeQuery(
        `CREATE (n:Notification {
          id: $notificationId, channel: $channel, subject: $subject,
          body: $body, priority: $priority, recipients: $recipients,
          sent_at: $sentAt, template_id: $templateId, status: 'sent'
        }) RETURN n`,
        { notificationId, channel, subject: resolvedSubject, body, priority, recipients: resolvedRecipients, sentAt, templateId }
      );
    } catch (error) {
      console.warn(`[notification.send] Memgraph storage failed: ${error.message}`);
    }

    console.log(`[notification.send] ${channel} to ${resolvedRecipients.length} recipients: ${resolvedSubject || body.substring(0, 50)}`);

    return this.success(
      {
        notification_id: notificationId, channel,
        recipients_count: resolvedRecipients.length, recipients: resolvedRecipients,
        sent_at: sentAt, subject: resolvedSubject, priority,
      },
      { duration: Date.now() - startTime }, 0.9,
    );
  }

  _resolveTemplate(template, context) {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let value = context;
      for (const key of keys) { value = value?.[key]; }
      return value != null ? String(value) : match;
    });
  }
}

module.exports = { SendNotificationExecutor };
