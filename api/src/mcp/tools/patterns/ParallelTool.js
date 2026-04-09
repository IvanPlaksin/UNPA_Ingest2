const { BaseTool } = require('../primitives/BaseTool.js');

class ParallelTool extends BaseTool {
  getDefinition() {
    return {
      id: 'pattern.parallel',
      name: 'Parallel Pattern',
      version: '1.0.0',
      level: 3,
      category: 'pattern',
      description: 'Execute multiple tools in parallel and aggregate results',
      inputSchema: {
        type: 'object',
        required: ['tasks'],
        properties: {
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['tool'],
              properties: {
                id: { type: 'string', description: 'Task identifier' },
                tool: { type: 'string', description: 'Tool ID' },
                args: { type: 'object', description: 'Tool arguments' }
              }
            },
            description: 'Tasks to execute in parallel'
          },
          timeout: { type: 'integer', default: 30000, description: 'Timeout per task (ms)' },
          failFast: { type: 'boolean', default: false, description: 'Cancel remaining on first error' },
          aggregation: {
            type: 'string',
            enum: ['all', 'any', 'race', 'allSettled'],
            default: 'allSettled',
            description: 'Result aggregation strategy'
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          results: { type: 'object', description: 'Results keyed by task ID' },
          succeeded: { type: 'array' },
          failed: { type: 'array' },
          stats: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 200 }
    };
  }

  async execute(args, context, server) {
    const {
      tasks,
      timeout = 30000,
      failFast = false,
      aggregation = 'allSettled'
    } = args;

    const startTime = Date.now();

    // Create task executors
    const taskExecutors = tasks.map((task, index) => {
      const taskId = task.id || `task_${index}`;
      return this.createTaskExecutor(taskId, task, timeout, context, server);
    });

    // Execute based on aggregation strategy
    let rawResults;
    try {
      switch (aggregation) {
        case 'all':
          rawResults = await Promise.all(taskExecutors);
          break;
        case 'any':
          const firstSuccess = await Promise.any(taskExecutors.map(p =>
            p.then(r => r.error ? Promise.reject(r) : r)
          )).catch(() => null);
          rawResults = firstSuccess ? [firstSuccess] : [];
          break;
        case 'race':
          rawResults = [await Promise.race(taskExecutors)];
          break;
        case 'allSettled':
        default:
          rawResults = await Promise.allSettled(taskExecutors).then(results =>
            results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message || 'Unknown error' })
          );
      }
    } catch (error) {
      if (failFast) {
        return this.success({
          results: {},
          succeeded: [],
          failed: [{ error: error.message }],
          stats: { durationMs: Date.now() - startTime, totalTasks: tasks.length }
        });
      }
      rawResults = [];
    }

    // Process results
    const results = {};
    const succeeded = [];
    const failed = [];

    for (const result of rawResults) {
      if (result) {
        results[result.taskId] = result.data || result.error;
        if (result.error) {
          failed.push({ taskId: result.taskId, error: result.error });
        } else {
          succeeded.push({ taskId: result.taskId, data: result.data });
        }
      }
    }

    return this.success({
      results,
      succeeded: succeeded.map(s => s.taskId),
      failed: failed.map(f => f.taskId),
      stats: {
        durationMs: Date.now() - startTime,
        totalTasks: tasks.length,
        successCount: succeeded.length,
        failureCount: failed.length
      }
    });
  }

  async createTaskExecutor(taskId, task, timeout, context, server) {
    const tool = server?.registry?.getTool(task.tool);
    if (!tool) {
      return { taskId, error: `Tool not found: ${task.tool}`, data: null };
    }

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), timeout);
    });

    try {
      const resultPromise = tool.execute(task.args || {}, context, server);
      const result = await Promise.race([resultPromise, timeoutPromise]);
      return { taskId, data: result.data, error: null };
    } catch (error) {
      return { taskId, data: null, error: error.message };
    }
  }
}

module.exports = { ParallelTool };
