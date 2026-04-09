const { BaseTool } = require('../primitives/BaseTool.js');

class PipelineTool extends BaseTool {
  getDefinition() {
    return {
      id: 'pattern.pipeline',
      name: 'Pipeline Pattern',
      version: '1.0.0',
      level: 3,
      category: 'pattern',
      description: 'Define and execute complex data processing pipelines with branching',
      inputSchema: {
        type: 'object',
        required: ['stages'],
        properties: {
          stages: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'tool'],
              properties: {
                id: { type: 'string', description: 'Stage identifier' },
                tool: { type: 'string', description: 'Tool ID' },
                args: { type: 'object', description: 'Tool arguments' },
                inputs: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Input stage IDs (for DAG execution)'
                },
                inputMapping: { type: 'object', description: 'Map inputs to args' },
                condition: { type: 'object', description: 'Conditional execution' },
                onError: {
                  type: 'string',
                  enum: ['stop', 'skip', 'default'],
                  default: 'stop'
                },
                defaultValue: { description: 'Default value on error if onError=default' }
              }
            },
            description: 'Pipeline stages'
          },
          input: { description: 'Initial input data' },
          outputStage: { type: 'string', description: 'Final output stage ID (default: last)' },
          parallel: { type: 'boolean', default: true, description: 'Execute independent stages in parallel' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { description: 'Pipeline output' },
          stageOutputs: { type: 'object' },
          executionOrder: { type: 'array' },
          stats: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 300000, maxMemoryMb: 300 }
    };
  }

  async execute(args, context, server) {
    const {
      stages,
      input,
      outputStage,
      parallel = true
    } = args;

    const startTime = Date.now();
    const stageOutputs = { _input: input };
    const executionOrder = [];
    const stageStatus = new Map();

    // Build dependency graph
    const graph = this.buildDependencyGraph(stages);

    // Execute stages in topological order
    const executed = new Set();
    let iteration = 0;
    const maxIterations = stages.length * 2;

    while (executed.size < stages.length && iteration < maxIterations) {
      iteration++;

      // Find stages ready to execute
      const readyStages = stages.filter(stage => {
        if (executed.has(stage.id)) return false;

        // Check if all inputs are ready
        const inputs = stage.inputs || (stage.id === stages[0].id ? [] : [stages[0].id]);
        return inputs.every(inputId => inputId === '_input' || executed.has(inputId));
      });

      if (readyStages.length === 0) {
        // Check for circular dependencies
        const remaining = stages.filter(s => !executed.has(s.id));
        if (remaining.length > 0) {
          return this.error('CIRCULAR_DEPENDENCY', `Circular dependency detected in stages: ${remaining.map(s => s.id).join(', ')}`);
        }
        break;
      }

      // Execute ready stages
      if (parallel && readyStages.length > 1) {
        await Promise.all(readyStages.map(stage =>
          this.executeStage(stage, stageOutputs, context, server, stageStatus)
        ));
      } else {
        for (const stage of readyStages) {
          await this.executeStage(stage, stageOutputs, context, server, stageStatus);
        }
      }

      // Mark as executed
      for (const stage of readyStages) {
        executed.add(stage.id);
        executionOrder.push(stage.id);
      }
    }

    // Get final output
    const finalStageId = outputStage || stages[stages.length - 1].id;
    const result = stageOutputs[finalStageId];

    return this.success({
      result,
      stageOutputs,
      executionOrder,
      stats: {
        totalStages: stages.length,
        executedStages: executed.size,
        durationMs: Date.now() - startTime,
        stageStatus: Object.fromEntries(stageStatus)
      }
    });
  }

  async executeStage(stage, stageOutputs, context, server, stageStatus) {
    const { id, tool, args = {}, inputs, inputMapping, condition, onError = 'stop', defaultValue } = stage;

    // Check condition
    if (condition && !this.evaluateCondition(condition, stageOutputs)) {
      stageStatus.set(id, 'skipped');
      stageOutputs[id] = null;
      return;
    }

    // Get tool
    const targetTool = server?.registry?.getTool(tool);
    if (!targetTool) {
      if (onError === 'default') {
        stageOutputs[id] = defaultValue;
        stageStatus.set(id, 'default');
        return;
      }
      if (onError === 'skip') {
        stageOutputs[id] = null;
        stageStatus.set(id, 'skipped');
        return;
      }
      throw new Error(`Tool not found: ${tool}`);
    }

    // Build arguments
    const toolArgs = this.buildStageArgs(args, inputs, inputMapping, stageOutputs);

    try {
      const result = await targetTool.execute(toolArgs, context, server);
      stageOutputs[id] = result.data;
      stageStatus.set(id, 'success');
    } catch (error) {
      if (onError === 'default') {
        stageOutputs[id] = defaultValue;
        stageStatus.set(id, 'default');
      } else if (onError === 'skip') {
        stageOutputs[id] = null;
        stageStatus.set(id, 'error');
      } else {
        stageStatus.set(id, 'error');
        throw error;
      }
    }
  }

  buildStageArgs(baseArgs, inputs, inputMapping, stageOutputs) {
    const args = { ...baseArgs };

    // Get inputs
    const inputData = inputs?.length === 1
      ? stageOutputs[inputs[0]]
      : inputs?.reduce((acc, id) => ({ ...acc, [id]: stageOutputs[id] }), {}) || stageOutputs._input;

    // Apply input mapping
    if (inputMapping) {
      for (const [argKey, path] of Object.entries(inputMapping)) {
        args[argKey] = this.resolvePath(path, inputData, stageOutputs);
      }
    } else if (inputData !== undefined) {
      // Default mapping
      args.data = inputData;
      args.input = inputData;
    }

    return args;
  }

  resolvePath(path, inputData, stageOutputs) {
    if (typeof path !== 'string') return path;

    if (path.startsWith('$stage.')) {
      const [, stageId, ...rest] = path.split('.');
      return this.getNestedValue(stageOutputs[stageId], rest.join('.'));
    }
    if (path.startsWith('$input')) {
      if (path === '$input') return inputData;
      return this.getNestedValue(inputData, path.substring(7));
    }

    return this.getNestedValue(inputData, path);
  }

  getNestedValue(obj, path) {
    if (!path || !obj) return obj;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }
    return current;
  }

  evaluateCondition(condition, stageOutputs) {
    const { stage, field, op, value } = condition;
    const source = stage ? stageOutputs[stage] : stageOutputs._input;
    const fieldValue = field ? this.getNestedValue(source, field) : source;

    switch (op) {
      case 'eq': return fieldValue === value;
      case 'ne': return fieldValue !== value;
      case 'exists': return fieldValue !== undefined && fieldValue !== null;
      case 'notExists': return fieldValue === undefined || fieldValue === null;
      case 'gt': return fieldValue > value;
      case 'lt': return fieldValue < value;
      default: return true;
    }
  }

  buildDependencyGraph(stages) {
    const graph = new Map();
    for (const stage of stages) {
      graph.set(stage.id, stage.inputs || []);
    }
    return graph;
  }
}

module.exports = { PipelineTool };
