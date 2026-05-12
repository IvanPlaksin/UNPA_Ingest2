'use strict';

module.exports = {
  id: 'flowdesk.dialog.select-location',

  async execute(context) {
    const { userInput, state } = context;
    const candidates = state.location_candidates || [];

    const num = parseInt(userInput?.trim());
    if (num >= 1 && num <= candidates.length) {
      const selected = candidates[num - 1];
      return {
        response: `Selected — **${selected.name}** (${selected.type}).`,
        state_updates: { location: selected, location_candidates: null },
        condition: 'selected',
      };
    }

    return {
      response: `Please reply with a number between 1 and ${candidates.length}.`,
      state_updates: {},
      condition: 'default',
    };
  },
};
