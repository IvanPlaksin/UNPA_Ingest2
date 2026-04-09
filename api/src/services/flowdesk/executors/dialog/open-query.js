'use strict';

const { keywordClassify } = require('../../keyword-filter');
const search = require('../../semantic-search');

module.exports = {
  id: 'flowdesk.dialog.open-query',

  async execute(context) {
    const { userInput, state } = context;

    // If this is the first call (from D1 low confidence), ask
    if (!userInput || userInput === state.justification) {
      return {
        response: 'I\'m not sure what you need. Could you describe your request in more detail? For example:\n- "I need a new laptop"\n- "Password reset"\n- "Book a meeting room"',
        state_updates: {},
        condition: '_wait',
      };
    }

    // Try to classify the new input
    const kwMatch = keywordClassify(userInput);
    if (kwMatch) {
      return {
        response: `Got it — **${kwMatch.service_code}**. Let me collect the details.`,
        state_updates: {
          intent: { service_code: kwMatch.service_code, method: 'keyword', confidence: 'high', score: 0.95 },
          service_code: kwMatch.service_code,
          justification: userInput,
        },
        condition: 'classified',
      };
    }

    try {
      await search.init();
      const result = await search.classifyUserIntent(userInput);
      if (result.top_match && result.confidence_score >= 0.65) {
        return {
          response: `I identified your request as **${result.top_match.service_name}**. Let me collect the details.`,
          state_updates: {
            intent: { ...result.top_match, method: 'semantic', confidence: 'medium', score: result.confidence_score },
            service_code: result.top_match.service_code,
            service_name: result.top_match.service_name,
            justification: userInput,
          },
          condition: 'classified',
        };
      }
    } catch (err) {
      console.error('[Dialog] open-query classify error:', err.message);
    }

    return {
      response: 'I still couldn\'t determine the service you need. Could you be more specific? You can also browse services by category: IT, HR, Facilities, Security, Finance, Logistics.',
      state_updates: {},
      condition: 'default',
    };
  },
};
