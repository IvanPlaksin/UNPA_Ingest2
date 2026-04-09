/**
 * Workflow Plugin (JS)
 */

const { PluginBase } = require('../plugin-base');
const { WaitInputExecutor } = require('./executors/wait-input.executor');
const { SetVariableExecutor } = require('./executors/set-variable.executor');
const { ValidateExecutor } = require('./executors/validate.executor');
const { QueryProfileExecutor } = require('./executors/query-profile.executor');
const { SpawnGraphExecutor } = require('./executors/spawn-graph.executor');

class WorkflowPlugin extends PluginBase {
  constructor() {
    super({
      name: 'workflow',
      version: '1.0.0',
      description: 'Workflow control executors: pause, wait for input, validate, spawn graphs',
      author: 'UNPA Team',
      domain: 'workflow',
    });
  }

  async initialize() {
    this.addExecutor(new WaitInputExecutor());
    this.addExecutor(new SetVariableExecutor());
    this.addExecutor(new ValidateExecutor());
    this.addExecutor(new QueryProfileExecutor());
    this.addExecutor(new SpawnGraphExecutor());
  }
}

const workflowPlugin = new WorkflowPlugin();

module.exports = { WorkflowPlugin, workflowPlugin };
