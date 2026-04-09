/**
 * Start Executor — entry point for graph execution
 * Simply passes all input parameters through as output.
 */

const { BaseExecutor } = require('../../plugin-base');

class StartExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'workflow.start';
    this.displayName = 'Start';
    this.description = 'Entry point for graph execution; passes all input parameters through as output';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  async execute(parameters, context) {
    return this.success(
      { ...parameters },
      { started_at: new Date().toISOString() },
      1.0,
    );
  }
}

module.exports = { StartExecutor };
