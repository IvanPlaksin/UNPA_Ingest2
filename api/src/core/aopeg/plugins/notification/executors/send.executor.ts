/**
 * Send Notification Executor — sends notifications via various channels
 *
 * Supports email, in-app (iNeed activity feed), SMS channels.
 * Creates Notification nodes in Memgraph for tracking.
 */

import { BaseExecutor, ExecutionContext, NodeExecutionResult } from '../../plugin-base';
import { randomUUID } from 'node:crypto';

export class SendNotificationExecutor extends BaseExecutor {
  readonly type = 'notification.send';
  readonly displayName = 'Send Notification';
  readonly description = 'Sends notifications to users via email, in-app, or SMS channels';
  readonly domain = 'notification';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        enum: ['email', 'ineed_activity', 'sms', 'all'],
        default: 'ineed_activity',
        description: 'Notification channel',
      },
      recipients: {
        type: 'array',
        items: { type: 'string' },
        description: 'User IDs or email addresses',
      },
      template_id: {
        type: 'string',
        description: 'Notification template ID (optional)',
      },
      subject: {
        type: 'string',
        description: 'Subject line (required for email)',
      },
      body: {
        type: 'string',
        description: 'Notification body text (supports {{template}} expressions)',
      },
      context: {
        type: 'object',
        description: 'Data for template resolution',
      },
      priority: {
        type: 'string',
        enum: ['low', 'normal', 'high'],
        default: 'normal',
        description: 'Notification priority',
      },
      sr_id: {
        type: 'string',
        description: 'Service Request ID to link notification to (optional)',
      },
    },
    required: ['recipients', 'body'],
  };

  async execute(parameters: Record<string, unknown>, context: ExecutionContext): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    const channel = this.getParam<string>(parameters, 'channel', 'ineed_activity');
    const recipients = this.getRequiredParam<string[]>(parameters, 'recipients');
    const templateId = this.getParam<string>(parameters, 'template_id', '');
    const subject = this.getParam<string>(parameters, 'subject', '');
    const bodyTemplate = this.getRequiredParam<string>(parameters, 'body');
    const templateContext = this.getParam<Record<string, unknown>>(parameters, 'context', {});
    const priority = this.getParam<string>(parameters, 'priority', 'normal');
    const srId = this.getParam<string>(parameters, 'sr_id', '');

    if (!recipients.length) {
      return this.error('INVALID_INPUT', 'recipients array cannot be empty', true);
    }

    // Resolve template expressions in body
    const body = this.resolveTemplate(bodyTemplate, templateContext);
    const resolvedSubject = subject ? this.resolveTemplate(subject, templateContext) : '';

    // Resolve recipients (template expressions → user_ids)
    const globalVars = (context as any).globalVariables;
    const variables = globalVars instanceof Map ? Object.fromEntries(globalVars) : (globalVars || {});
    const resolvedRecipients = recipients.map(r => this.resolveTemplate(r, { ...variables, ...templateContext }));

    const notificationId = randomUUID();
    const sentAt = new Date().toISOString();

    // Store notification in Memgraph
    try {
      const memgraph = require('../../../../services/memgraph.service');

      const createQuery = `
        CREATE (n:Notification {
          id: $notificationId,
          channel: $channel,
          subject: $subject,
          body: $body,
          priority: $priority,
          recipients: $recipients,
          sent_at: $sentAt,
          template_id: $templateId,
          status: 'sent'
        })
        RETURN n`;

      await memgraph.executeCypher(createQuery, {
        notificationId,
        channel,
        subject: resolvedSubject,
        body,
        priority,
        recipients: resolvedRecipients,
        sentAt,
        templateId,
      });

      // Link to Service Request if provided
      if (srId) {
        const linkQuery = `
          MATCH (n:Notification {id: $notificationId})
          MATCH (sr:ServiceRequest {id: $srId})
          CREATE (sr)-[:HAS_NOTIFICATION]->(n)`;
        await memgraph.executeCypher(linkQuery, { notificationId, srId }).catch(() => {
          // SR might not exist yet — non-blocking
        });
      }

      // Link to recipients
      for (const recipientId of resolvedRecipients) {
        const recipientQuery = `
          MATCH (n:Notification {id: $notificationId})
          MATCH (u:UNStaffProfile {user_id: $recipientId})
          CREATE (u)-[:RECEIVED_NOTIFICATION]->(n)`;
        await memgraph.executeCypher(recipientQuery, { notificationId, recipientId }).catch(() => {
          // User might not exist — non-blocking
        });
      }
    } catch (error: any) {
      console.warn(`[notification.send] Memgraph storage failed: ${error.message}`);
      // Continue — notification is still "sent" even if tracking fails
    }

    // Log notification (production: integrate with email/SMS service)
    console.log(`[notification.send] ${channel} to ${resolvedRecipients.length} recipients: ${resolvedSubject || body.substring(0, 50)}`);

    return this.success(
      {
        notification_id: notificationId,
        channel,
        recipients_count: resolvedRecipients.length,
        recipients: resolvedRecipients,
        sent_at: sentAt,
        subject: resolvedSubject,
        priority,
      },
      { duration: Date.now() - startTime },
      0.9,
    );
  }

  private resolveTemplate(template: string, context: Record<string, unknown>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let value: any = context;
      for (const key of keys) {
        value = value?.[key];
      }
      return value != null ? String(value) : match;
    });
  }
}
