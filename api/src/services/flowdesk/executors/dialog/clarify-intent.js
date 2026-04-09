'use strict';

module.exports = {
  id: 'flowdesk.dialog.clarify-intent',

  async execute(context) {
    const { userInput, state } = context;
    const intent = state.intent;

    // First call — present options
    if (!userInput || userInput === state.justification) {
      const choices = [
        { label: intent.service_name || intent.service_code, value: '1' },
        ...(intent.alternatives || []).slice(0, 2).map((a, i) => ({
          label: a.service_name || a.service_code, value: String(i + 2),
        })),
        { label: 'Something else', value: 'other', variant: 'secondary' },
      ];

      return {
        response: 'I\'m not entirely sure what you need. Did you mean:',
        choices,
        state_updates: {},
        condition: '_wait',
      };
    }

    // Second call — process user choice
    const num = parseInt(userInput.trim());
    if (num === 1) {
      return {
        response: `Got it — **${intent.service_name || intent.service_code}**. Let me collect the details.`,
        state_updates: {
          service_code: intent.service_code,
          service_name: intent.service_name,
          intent: { ...intent, confidence: 'high' },
        },
        condition: 'confirmed',
      };
    }

    const alts = intent.alternatives || [];
    if (num >= 2 && num <= alts.length + 1) {
      const selected = alts[num - 2];
      return {
        response: `Got it — **${selected.service_name || selected.service_code}**. Let me collect the details.`,
        state_updates: {
          service_code: selected.service_code,
          service_name: selected.service_name,
          intent: { ...selected, method: 'semantic', confidence: 'high' },
        },
        condition: 'confirmed',
      };
    }

    // User typed something else — reclassify
    return {
      response: null,
      state_updates: { justification: userInput },
      condition: 'changed',
    };
  },
};
