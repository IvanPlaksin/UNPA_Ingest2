'use strict';

module.exports = {
  id: 'flowdesk.dialog.confirm-request',

  async execute(context) {
    const { userInput, state, userContext } = context;

    // First call — present summary
    if (!state._confirm_asked) {
      const beneficiaryName = state.beneficiary_type === 'self'
        ? (userContext?.displayName || 'yourself')
        : (state.beneficiary?.name || 'another staff member');

      const locationName = state.location?.name || userContext?.location?.dutyStation || 'N/A';
      const serviceName = state.service_name || state.service_code;

      const summary = [
        `Please confirm your request:`,
        ``,
        `- **Service:** ${serviceName} (${state.service_code})`,
        `- **Location:** ${locationName}`,
        `- **For:** ${beneficiaryName}`,
        `- **Description:** "${state.justification?.slice(0, 100)}"`,
      ].join('\n');

      return {
        response: summary,
        choices: [
          { label: 'Create Request', value: 'yes', variant: 'primary' },
          { label: 'Edit', value: 'edit', variant: 'secondary' },
          { label: 'Cancel', value: 'cancel', variant: 'danger' },
        ],
        state_updates: { _confirm_asked: true },
        condition: '_wait',
      };
    }

    // Process user response
    const lower = (userInput || '').toLowerCase().trim();

    if (lower === 'yes' || lower === 'y' || lower === 'да' || lower === 'oui' || lower === 'confirm' || lower === '1') {
      return {
        response: null,
        state_updates: { confirmed: true, _confirm_asked: null },
        condition: 'confirmed',
      };
    }

    if (lower === 'edit' || lower === 'change' || lower === 'изменить' || lower === 'modifier') {
      return {
        response: 'What would you like to change? I\'ll restart from the location step.',
        state_updates: { _confirm_asked: null, location: null, beneficiary: null, beneficiary_type: null },
        condition: 'edit',
      };
    }

    if (lower === 'cancel' || lower === 'no' || lower === 'n' || lower === 'нет' || lower === 'non' || lower === 'abort') {
      return {
        response: 'Request cancelled. Feel free to start a new request anytime.',
        state_updates: { _confirm_asked: null },
        condition: 'cancel',
      };
    }

    return {
      response: 'Please select an option:',
      choices: [
        { label: 'Create Request', value: 'yes', variant: 'primary' },
        { label: 'Edit', value: 'edit', variant: 'secondary' },
        { label: 'Cancel', value: 'cancel', variant: 'danger' },
      ],
      state_updates: {},
      condition: '_wait',
    };
  },
};
