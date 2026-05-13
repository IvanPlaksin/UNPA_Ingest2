'use strict';

module.exports = {
  id: 'flowdesk.dialog.check-location',

  async execute(context) {
    const { state, userContext } = context;

    // Check if location already known from user context
    const dutyStation = userContext?.location?.dutyStation;
    const country = userContext?.location?.country;

    if (dutyStation || state.location) {
      const loc = state.location || { name: dutyStation, country };
      return {
        response: null, // silently proceed
        state_updates: { location: loc },
        condition: 'has_location',
      };
    }

    // No location known
    return {
      response: null,
      state_updates: {},
      condition: 'no_location',
    };
  },
};
