/**
 * End Executor — collects final output and marks execution complete
 */

const { BaseExecutor } = require('../../plugin-base');

class EndExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'workflow.end';
    this.displayName = 'End';
    this.description = 'Collects final output and marks graph execution as completed';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {},
      required: [],
    };
  }

  async execute(parameters, context) {
    return this.success(
      { ...parameters, status: 'completed' },
      { completed_at: new Date().toISOString() },
      1.0,
    );
  }
}

module.exports = { EndExecutor };
