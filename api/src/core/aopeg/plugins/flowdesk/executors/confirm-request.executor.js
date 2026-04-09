/**
 * FlowDesk: Confirm request — show summary, ask user to confirm/edit/cancel
 */

const { BaseExecutor } = require('../../plugin-base');
const { randomUUID } = require('node:crypto');
const tpl = require('../../../../../services/flowdesk/template-store');

class ConfirmRequestExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.confirm_request';
    this.displayName = 'Confirm Request';
    this.description = 'Show request summary and ask user to confirm, edit, or cancel';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        service_code: { type: 'string' },
        service_name: { type: 'string' },
        location: { },  // object or string
        beneficiary_name: { type: 'string' },
        justification: { type: 'string' },
        userInput: { type: 'string', description: 'User response (yes/edit/cancel)' },
      },
    };
  }

  async execute(parameters) {
    // Already confirmed in previous turn — pass through
    // Use custom confirmField if specified (prevents cross-contamination between multiple confirm nodes)
    const confirmField = parameters.confirmField || 'confirmed';
    if (parameters[confirmField]) {
      return this.success({ [confirmField]: true, confirmed: true, branch: 'confirmed' });
    }

    // Check if this specific node's action was already recorded (from previous turn)
    // Uses confirmField as node discriminator — only pass through if THIS node's field is set
    if (confirmField !== 'confirmed' && parameters[confirmField] !== undefined && parameters[confirmField] !== false) {
      const prevAction = parameters[confirmField];
      if (typeof prevAction === 'string') {
        return this.success({ action: prevAction, branch: prevAction, [confirmField]: prevAction });
      }
    }

    const userInput = parameters.userInput;

    // First call — present summary (show if no confirm/edit/cancel action yet)
    // Build accepted inputs: standard + custom choices from config
    const standardActions = ['yes','y','да','oui','confirm','1','edit','change','cancel','no','n','нет','non','abort','изменить','modifier'];
    const customChoices = (parameters.choices || []).map(c => (typeof c === 'string' ? c : c.value || c.label || '').toLowerCase()).filter(Boolean);
    const acceptedInputs = [...new Set([...standardActions, ...customChoices])];

    if (!userInput || !acceptedInputs.includes((userInput||'').toLowerCase().trim())) {
      const locationName = typeof parameters.location === 'object' ? parameters.location?.name : parameters.location || 'N/A';
      const beneficiaryLabel = parameters.beneficiary_type === 'other'
        ? (parameters.beneficiary?.name || parameters.beneficiary_name || 'another staff member')
        : 'yourself';
      const serviceName = parameters.service_name || parameters.service_code;

      let summary = await tpl.render('confirm_request.summary', { serviceName, locationName, beneficiaryLabel });
      if (parameters.justification) {
        summary += '\n' + await tpl.render('confirm_request.summary_with_justification', {
          justification: parameters.justification.slice(0, 100),
        });
      }

      return {
        status: 'WAIT_FOR_INPUT',
        resume_token: randomUUID(),
        expected_inputs: ['userInput'],
        recipients: ['current_user'],
        prompt: parameters.prompt || summary,
        choices: parameters.choices && Array.isArray(parameters.choices) && parameters.choices.length > 0
          ? parameters.choices.map((c, i) => typeof c === 'string'
            ? { label: c, value: c.toLowerCase(), variant: i === 0 ? 'primary' : i === parameters.choices.length - 1 ? 'danger' : 'secondary' }
            : c)
          : [
            { label: await tpl.get('confirm_request.choice_confirm', 'Create Request'), value: 'yes', variant: 'primary' },
            { label: await tpl.get('confirm_request.choice_edit', 'Edit'), value: 'edit', variant: 'secondary' },
            { label: await tpl.get('confirm_request.choice_cancel', 'Cancel'), value: 'cancel', variant: 'danger' },
          ],
      };
    }

    const lower = (userInput || '').toLowerCase().trim();
    if (['yes', 'y', 'да', 'oui', 'confirm', '1', 'confirm request'].includes(lower)) {
      return this.success({ [confirmField]: true, confirmed: true, branch: 'confirmed' });
    }
    if (['edit', 'change', 'изменить', 'modifier'].includes(lower)) {
      return this.success({ branch: 'edit' });
    }
    if (['cancel', 'no', 'n', 'нет', 'non', 'abort'].includes(lower)) {
      return this.success({ response: await tpl.get('confirm_request.cancelled', 'Request cancelled.'), branch: 'cancel' });
    }

    // Custom choice matched but not standard action — return the choice value as action/branch
    // Also set confirmField so this node passes through on re-execution
    if (customChoices.includes(lower)) {
      return this.success({ action: lower, branch: lower, [confirmField]: lower, response: `Selected: ${lower}` });
    }

    return {
      status: 'WAIT_FOR_INPUT',
      resume_token: randomUUID(),
      expected_inputs: ['userInput'],
      recipients: ['current_user'],
      prompt: parameters.prompt || await tpl.get('confirm_request.retry_prompt', 'Please select an option:'),
      choices: parameters.choices && Array.isArray(parameters.choices) && parameters.choices.length > 0
        ? parameters.choices.map((c, i) => typeof c === 'string'
          ? { label: c, value: c.toLowerCase(), variant: i === 0 ? 'primary' : i === parameters.choices.length - 1 ? 'danger' : 'secondary' }
          : c)
        : [
          { label: await tpl.get('confirm_request.choice_confirm', 'Create Request'), value: 'yes', variant: 'primary' },
          { label: await tpl.get('confirm_request.choice_edit', 'Edit'), value: 'edit', variant: 'secondary' },
          { label: await tpl.get('confirm_request.choice_cancel', 'Cancel'), value: 'cancel', variant: 'danger' },
        ],
    };
  }
}

module.exports = { ConfirmRequestExecutor };
