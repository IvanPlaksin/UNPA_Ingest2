/**
 * Wait Input Executor — pauses graph execution waiting for human input
 *
 * Returns a special WAIT_FOR_INPUT status that NodeRunner and TopologicalScheduler
 * recognize to pause the execution and store a checkpoint.
 */

import { BaseExecutor, ExecutionContext, NodeExecutionResult } from '../../plugin-base';
import { randomUUID } from 'node:crypto';

interface ExpectedInput {
  name: string;
  type: 'string' | 'boolean' | 'enum' | 'date' | 'number';
  values?: string[];
  required?: boolean;
}

export class WaitInputExecutor extends BaseExecutor {
  readonly type = 'workflow.wait_input';
  readonly displayName = 'Wait for Input';
  readonly description = 'Pauses graph execution and waits for human input before continuing';
  readonly domain = 'workflow';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      expected_inputs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['string', 'boolean', 'enum', 'date', 'number'] },
            values: { type: 'array', items: { type: 'string' } },
            required: { type: 'boolean', default: true },
          },
          required: ['name', 'type'],
        },
        description: 'Expected input fields from the user',
      },
      recipients: {
        type: 'array',
        items: { type: 'string' },
        description: 'User IDs or role templates (e.g., "{{user.manager_id}}") who can provide input',
      },
      timeout_hours: {
        type: 'number',
        default: 48,
        description: 'Hours to wait before executing timeout_action',
      },
      timeout_action: {
        type: 'string',
        enum: ['auto_approve', 'auto_reject', 'escalate', 'cancel'],
        default: 'cancel',
        description: 'Action to take when timeout is reached',
      },
      prompt: {
        type: 'string',
        description: 'Message to display to recipients',
      },
    },
    required: ['expected_inputs', 'recipients'],
  };

  async execute(parameters: Record<string, unknown>, context: ExecutionContext): Promise<NodeExecutionResult> {
    const expectedInputs = this.getRequiredParam<ExpectedInput[]>(parameters, 'expected_inputs');
    const recipients = this.getRequiredParam<string[]>(parameters, 'recipients');
    const timeoutHours = this.getParam<number>(parameters, 'timeout_hours', 48);
    const timeoutAction = this.getParam<string>(parameters, 'timeout_action', 'cancel');
    const prompt = this.getParam<string>(parameters, 'prompt', '');

    if (!expectedInputs.length) {
      return this.error('INVALID_INPUT', 'expected_inputs array cannot be empty', true);
    }

    if (!recipients.length) {
      return this.error('INVALID_INPUT', 'recipients array cannot be empty', true);
    }

    // Resolve template expressions in recipients (e.g., "{{user.manager_id}}")
    const variables = (context as any).globalVariables || new Map();
    const variablesObj = variables instanceof Map
      ? Object.fromEntries(variables)
      : (variables || {});

    const resolvedRecipients = recipients.map(r => this.resolveTemplate(r, variablesObj));

    const resumeToken = randomUUID();
    const timeoutAt = new Date(Date.now() + timeoutHours * 60 * 60 * 1000);

    // Return special WAIT_FOR_INPUT status — NodeRunner intercepts this
    // before the VALIDATE_OUTPUT phase and returns it to the Scheduler
    return {
      status: 'WAIT_FOR_INPUT',
      resume_token: resumeToken,
      expected_inputs: expectedInputs,
      recipients: resolvedRecipients,
      timeout_at: timeoutAt.toISOString(),
      timeout_action: timeoutAction,
      prompt,
    } as any;
  }

  private resolveTemplate(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const keys = path.trim().split('.');
      let value: any = variables;
      for (const key of keys) {
        value = value?.[key];
      }
      return value != null ? String(value) : match;
    });
  }
}
