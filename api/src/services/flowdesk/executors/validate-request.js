'use strict';

module.exports = {
  id: 'flowdesk.validate-request',
  name: 'Validate Request',

  async execute(context, config) {
    const { input } = context;
    const errors = [];

    for (const field of (config.required_fields || [])) {
      if (!input[field]) errors.push(`Missing required field: ${field}`);
    }

    if (config.min_justification_length && input.justification) {
      if (input.justification.length < config.min_justification_length) {
        errors.push(`Justification must be at least ${config.min_justification_length} characters`);
      }
    }

    if (errors.length > 0) {
      return { success: false, output: { errors }, condition: 'invalid' };
    }

    return {
      success: true,
      output: { userId: input.userId, justification: input.justification, validatedAt: new Date().toISOString() },
      condition: 'valid',
    };
  },
};
