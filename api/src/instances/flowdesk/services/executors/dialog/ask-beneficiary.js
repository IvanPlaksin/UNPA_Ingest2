'use strict';

module.exports = {
  id: 'flowdesk.dialog.ask-beneficiary',

  async execute(context) {
    const { userInput, state } = context;

    // First call — ask
    if (!userInput || userInput === state.justification) {
      return {
        response: 'Is this request for yourself or for another staff member?',
        choices: [
          { label: 'For myself', value: 'myself' },
          { label: 'For another person', value: 'other' },
        ],
        state_updates: {},
        condition: '_wait',
      };
    }

    const lower = userInput.toLowerCase().trim();

    // Check for "self" indicators
    if (lower === '1' || lower.includes('myself') || lower.includes('me') || lower.includes('self')
        || lower.includes('себя') || lower.includes('мне') || lower.includes('для меня')
        || lower.includes('moi') || lower.includes('pour moi')) {
      return {
        response: null,
        state_updates: { beneficiary_type: 'self', beneficiary: null },
        condition: 'self',
      };
    }

    // Check for "other" indicators
    if (lower === '2' || lower.includes('other') || lower.includes('another') || lower.includes('someone')
        || lower.includes('colleague') || lower.includes('другого') || lower.includes('коллег')
        || lower.includes('quelqu') || lower.includes('autre')) {
      return {
        response: null,
        state_updates: { beneficiary_type: 'other' },
        condition: 'other',
      };
    }

    // Ambiguous — re-ask
    return {
      response: 'Please select an option:',
      choices: [
        { label: 'For myself', value: 'myself' },
        { label: 'For another person', value: 'other' },
      ],
      state_updates: {},
      condition: '_wait',
    };
  },
};
