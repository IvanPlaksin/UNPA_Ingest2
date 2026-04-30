'use strict';
/**
 * FlowDesk: Clarify Intent
 *
 * Sits immediately after classify_intent in the SR dialog graph.
 * Pass-through if service_code was resolved with sufficient confidence.
 * Waits for user clarification if classify_intent returned low_confidence (service_code=null).
 * On re-execution with new userInput, classify_intent re-runs automatically because
 * service_code remains null until classification succeeds.
 */

const { BaseExecutor } = require('../../plugin-base');
const { randomUUID } = require('node:crypto');
const tpl = require('../../../../../services/flowdesk/template-store');

class ClarifyIntentExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.clarify_intent';
    this.displayName = 'Clarify Intent';
    this.description = 'Asks user to clarify when intent classification confidence is too low';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        service_code:          { type: 'string',  description: 'Service code from classify_intent (null = low confidence)' },
        service_name:          { type: 'string',  description: 'Service name from classify_intent' },
        branch:                { type: 'string',  description: 'Branch from classify_intent' },
        clarification_prompt:  { type: 'string',  description: 'Custom prompt override' },
      },
    };
  }

  async execute(parameters) {
    // Pass-through: classify_intent resolved intent this turn
    if (parameters.service_code) {
      return this.success({
        service_code: parameters.service_code,
        service_name: parameters.service_name || null,
        branch:       parameters.branch || 'resolved',
        clarification_needed: false,
      });
    }

    // Needs clarification — wait for user to describe request more clearly.
    // accumulated_state ensures service_code stays null so classify_intent re-runs next turn.
    const prompt = parameters.clarification_prompt
      || await tpl.get(
          'clarify_intent.prompt',
          "I'm not sure I understood what you need. Could you describe your request in a bit more detail?",
        );

    return {
      status: 'WAIT_FOR_INPUT',
      resume_token: randomUUID(),
      expected_inputs: ['userInput'],
      recipients: ['current_user'],
      prompt,
      choices: null,
      accumulated_state: { service_code: null },
    };
  }
}

module.exports = { ClarifyIntentExecutor };
