/**
 * FlowDesk: Ask beneficiary — self or other staff member
 */

const { BaseExecutor } = require('../../../../core/aopeg/plugins/plugin-base');
const { randomUUID } = require('node:crypto');
const tpl = require('../../services/template-store.js');

class AskBeneficiaryExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.ask_beneficiary';
    this.displayName = 'Ask Beneficiary';
    this.description = 'Ask whether the request is for the user or another staff member';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        userInput: { type: 'string', description: 'User response' },
      },
    };
  }

  async execute(parameters) {
    // Already resolved in previous turn — pass through (preserve all flags)
    if (parameters.beneficiary_type) {
      return this.success({
        beneficiary_type: parameters.beneficiary_type,
        beneficiary: parameters.beneficiary,
        different_location: parameters.different_location || false,
        branch: parameters.different_location ? 'different' : parameters.beneficiary_type === 'other' ? 'other' : 'self',
      });
    }

    const userInput = parameters.userInput;

    if (!userInput) {
      return {
        status: 'WAIT_FOR_INPUT',
        resume_token: randomUUID(),
        expected_inputs: ['userInput'],
        recipients: ['current_user'],
        prompt: await tpl.get('ask_beneficiary.prompt', 'Is this request for yourself or for another staff member?'),
        choices: [
          { label: await tpl.get('ask_beneficiary.choice_self', 'For myself'), value: 'myself' },
          { label: await tpl.get('ask_beneficiary.choice_other', 'For another person'), value: 'other' },
        ],
      };
    }

    const lower = (userInput || '').toLowerCase().trim();
    // Self: myself, self, me, for myself, self_current
    if (['myself','self','me','self_current','1'].includes(lower) || lower.includes('myself') || lower.includes('self') || lower.includes('me ')
      || lower.includes('себя') || lower.includes('мне') || lower.includes('moi')) {
      return this.success({ beneficiary_type: 'self', branch: 'self' });
    }

    // Different location: different, self_different
    if (['different','self_different'].includes(lower) || lower.includes('different location') || lower.includes('другое место')) {
      return this.success({ beneficiary_type: 'self', different_location: true, branch: 'different' });
    }

    // Other person: other, another, other_staff
    if (['other','another','other_staff','2'].includes(lower) || lower.includes('other') || lower.includes('another')
      || lower.includes('другого') || lower.includes('autre')) {
      return this.success({ beneficiary_type: 'other', branch: 'other' });
    }

    // Custom choices from config
    const customChoices = (parameters.choices || []).map(c => (typeof c === 'string' ? c : c.value || '').toLowerCase()).filter(Boolean);
    if (customChoices.includes(lower)) {
      return this.success({ beneficiary_type: lower, branch: lower });
    }

    return {
      status: 'WAIT_FOR_INPUT',
      resume_token: randomUUID(),
      expected_inputs: ['userInput'],
      recipients: ['current_user'],
      prompt: parameters.prompt || await tpl.get('ask_beneficiary.retry_prompt', 'Please select an option:'),
      choices: parameters.choices && parameters.choices.length > 0
        ? parameters.choices.map((c, i) => typeof c === 'string' ? { label: c, value: c.toLowerCase(), variant: i === 0 ? 'primary' : 'secondary' } : c)
        : [
          { label: await tpl.get('ask_beneficiary.choice_self', 'For myself'), value: 'myself' },
          { label: await tpl.get('ask_beneficiary.choice_other', 'For another person'), value: 'other' },
        ],
    };
  }
}

module.exports = { AskBeneficiaryExecutor };
