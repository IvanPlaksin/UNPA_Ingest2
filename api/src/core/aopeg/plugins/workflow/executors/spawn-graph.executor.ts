/**
 * Spawn Graph Executor — launches a child graph execution
 *
 * Loads a DAG from PatternLibrary or Memgraph and executes it as a child process.
 * Supports sync (wait for result) and async (fire-and-forget) modes.
 */

import { BaseExecutor, ExecutionContext, NodeExecutionResult } from '../../plugin-base';
import { randomUUID } from 'node:crypto';

export class SpawnGraphExecutor extends BaseExecutor {
  readonly type = 'workflow.spawn_graph';
  readonly displayName = 'Spawn Graph';
  readonly description = 'Launches a child graph execution from PatternLibrary or stored DAG';
  readonly domain = 'workflow';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      graph_id: {
        type: 'string',
        description: 'Graph ID or task category to look up in PatternLibrary',
      },
      dag: {
        type: 'object',
        description: 'Inline DAG definition (alternative to graph_id)',
      },
      params: {
        type: 'object',
        description: 'Input parameters for the child graph',
      },
      mode: {
        type: 'string',
        enum: ['sync', 'async'],
        default: 'async',
        description: 'sync: wait for completion; async: fire-and-forget',
      },
      timeout_minutes: {
        type: 'number',
        default: 60,
        description: 'Timeout for sync mode (minutes)',
      },
    },
    required: ['params'],
  };

  async execute(parameters: Record<string, unknown>, context: ExecutionContext): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const graphId = this.getParam<string>(parameters, 'graph_id', '');
    const inlineDag = this.getParam<any>(parameters, 'dag', null);
    const params = this.getRequiredParam<Record<string, unknown>>(parameters, 'params');
    const mode = this.getParam<string>(parameters, 'mode', 'async');
    const timeoutMinutes = this.getParam<number>(parameters, 'timeout_minutes', 60);

    if (!graphId && !inlineDag) {
      return this.error('INVALID_INPUT', 'Either graph_id or dag must be provided', true);
    }

    try {
      // Resolve DAG
      let dag: any = inlineDag;

      if (!dag && graphId) {
        dag = await this.loadDag(graphId);
        if (!dag) {
          return this.error('GRAPH_NOT_FOUND', `Graph not found: ${graphId}`, true);
        }
      }

      // Create child RuntimeEngine
      const { RuntimeEngine } = require('../../../../runtime/RuntimeEngine');
      const childExecutionId = randomUUID();

      // Get MCP registry from parent context
      const mcpRegistry = (context as any).mcpRegistry;
      if (!mcpRegistry) {
        // Try to get from AOPEG adapter
        const { AOPEGAdapter } = require('../../../../runtime/integration/AOPEGAdapter');
        const { pluginRegistry } = require('../../../registry/plugin-registry');
        const adapter = new AOPEGAdapter(pluginRegistry);
        const registry = adapter.createMcpCompatibleRegistry();

        return await this.executeChild(registry, dag, params, childExecutionId, mode, timeoutMinutes, startTime, graphId, context);
      }

      return await this.executeChild(mcpRegistry, dag, params, childExecutionId, mode, timeoutMinutes, startTime, graphId, context);

    } catch (error: any) {
      return this.error('SPAWN_ERROR', `Failed to spawn graph: ${error.message}`, true);
    }
  }

  private async executeChild(
    mcpRegistry: any,
    dag: any,
    params: Record<string, unknown>,
    childExecutionId: string,
    mode: string,
    timeoutMinutes: number,
    startTime: number,
    graphId: string,
    context: ExecutionContext,
  ): Promise<NodeExecutionResult> {
    const { RuntimeEngine } = require('../../../../runtime/RuntimeEngine');

    const childEngine = new RuntimeEngine(mcpRegistry, {
      graphTimeoutMs: timeoutMinutes * 60 * 1000,
    });

    if (mode === 'async') {
      // Fire and forget
      childEngine.execute(dag, params, { executionId: childExecutionId })
        .then((result: any) => {
          console.log(`[spawn_graph] Child ${childExecutionId} completed: ${result.status}`);
        })
        .catch((err: any) => {
          console.error(`[spawn_graph] Child ${childExecutionId} failed: ${err.message}`);
        });

      // Record in Memgraph
      await this.recordSpawn(childExecutionId, graphId, context);

      return this.success(
        {
          child_execution_id: childExecutionId,
          status: 'STARTED',
          mode: 'async',
          graph_id: graphId || 'inline',
        },
        { duration: Date.now() - startTime },
        0.9,
      );
    } else {
      // Sync — wait for result
      const result = await childEngine.execute(dag, params, { executionId: childExecutionId });

      await this.recordSpawn(childExecutionId, graphId, context);

      return this.success(
        {
          child_execution_id: childExecutionId,
          status: result.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
          mode: 'sync',
          graph_id: graphId || 'inline',
          result: result.output,
          metrics: result.metrics,
        },
        { duration: Date.now() - startTime },
        result.status === 'COMPLETED' ? 0.95 : 0.3,
      );
    }
  }

  private async loadDag(graphId: string): Promise<any> {
    // Try PatternLibrary first
    try {
      const { PatternLibrary } = require('../../../../runtime/learning/PatternLibrary');
      const library = new PatternLibrary();
      const dag = await library.getPattern(graphId);
      if (dag) return dag;
    } catch {
      // PatternLibrary not available
    }

    // Try Memgraph
    try {
      const memgraph = require('../../../../services/memgraph.service');
      const query = `
        MATCH (g:Graph {id: $graphId})
        RETURN g.dag as dag`;
      const result = await memgraph.executeCypher(query, { graphId });
      if (result?.[0]?.dag) {
        const dag = typeof result[0].dag === 'string' ? JSON.parse(result[0].dag) : result[0].dag;
        return dag;
      }
    } catch {
      // Memgraph not available
    }

    return null;
  }

  private async recordSpawn(childExecutionId: string, graphId: string, context: ExecutionContext): Promise<void> {
    try {
      const memgraph = require('../../../../services/memgraph.service');
      const parentExecutionId = (context as any).executionId || '';

      await memgraph.executeCypher(`
        CREATE (e:Execution {
          id: $childId,
          graph_id: $graphId,
          parent_execution_id: $parentId,
          spawned_at: $spawnedAt,
          status: 'running'
        })`, {
        childId: childExecutionId,
        graphId: graphId || 'inline',
        parentId: parentExecutionId,
        spawnedAt: new Date().toISOString(),
      });

      if (parentExecutionId) {
        await memgraph.executeCypher(`
          MATCH (p:Execution {id: $parentId})
          MATCH (c:Execution {id: $childId})
          CREATE (c)-[:SPAWNED_FROM]->(p)`, {
          parentId: parentExecutionId,
          childId: childExecutionId,
        }).catch(() => {});
      }
    } catch {
      // Non-blocking
    }
  }
}
