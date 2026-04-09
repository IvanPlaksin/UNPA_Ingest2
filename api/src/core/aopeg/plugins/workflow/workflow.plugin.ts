/**
 * Workflow Plugin
 *
 * Provides AOPEG executors for workflow control:
 *   - workflow.wait_input: Pause graph and wait for human input
 *   - workflow.set_variable: Set execution context variables
 *   - workflow.validate: Validate user permissions
 *   - workflow.spawn_graph: Spawn child graph execution
 *   - graph.query_profile: Query UNStaffProfile from Memgraph
 */

import { PluginBase } from '../plugin-base';
import { WaitInputExecutor } from './executors/wait-input.executor';
import { SetVariableExecutor } from './executors/set-variable.executor';
import { ValidateExecutor } from './executors/validate.executor';
import { QueryProfileExecutor } from './executors/query-profile.executor';
import { SpawnGraphExecutor } from './executors/spawn-graph.executor';

export class WorkflowPlugin extends PluginBase {
  constructor() {
    super({
      name: 'workflow',
      version: '1.0.0',
      description: 'Workflow control executors: pause, wait for input, validate, spawn graphs',
      author: 'UNPA Team',
      domain: 'workflow',
    });
  }

  async initialize(): Promise<void> {
    this.addExecutor(new WaitInputExecutor());
    this.addExecutor(new SetVariableExecutor());
    this.addExecutor(new ValidateExecutor());
    this.addExecutor(new QueryProfileExecutor());
    this.addExecutor(new SpawnGraphExecutor());
  }
}

export const workflowPlugin = new WorkflowPlugin();
