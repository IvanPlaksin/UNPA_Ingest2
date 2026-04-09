const { BaseTool } = require('../primitives/BaseTool.js');

class ChainTool extends BaseTool {
  getDefinition() {
    return {
      id: 'pattern.chain',
      name: 'Chain Pattern',
      version: '1.0.0',
      level: 3,
      category: 'pattern',
      description: 'Execute a sequence of tools where each output feeds into the next',
      inputSchema: {
        type: 'object',
        required: ['steps'],
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              required: ['tool'],
              properties: {
                tool: { type: 'string', description: 'Tool ID' },
                args: { type: 'object', description: 'Tool arguments' },
                inputMapping: { type: 'object', description: 'Map previous output to args' },
                outputKey: { type: 'string', description: 'Key to store output under' },
                condition: { type: 'object', description: 'Conditional execution' }
              }
            },
            description: 'Steps to execute in sequence'
          },
          input: { description: 'Initial input data' },
          stopOnError: { type: 'boolean', default: true, description: 'Stop chain on first error' },
          collectAllOutputs: { type: 'boolean', default: false, description: 'Return all step outputs' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { description: 'Final output' },
          outputs: { type: 'object', description: 'All step outputs (if collectAllOutputs)' },
          stepsExecuted: { type: 'integer' },
          error: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 300000, maxMemoryMb: 200 }
    };
  }

  async execute(args, context, server) {
    const {
      steps,
      input,
      stopOnError = true,
      collectAllOutputs = false
    } = args;

    const outputs = {};
    let currentOutput = input;
    let stepsExecuted = 0;
    let lastError = null;

    for (const step of steps) {
      // Check condition
      if (step.condition && !this.evaluateCondition(step.condition, currentOutput, outputs)) {
        continue;
      }

      // Get tool
      const tool = server?.registry?.getTool(step.tool);
      if (!tool) {
        const error = { step: stepsExecuted, tool: step.tool, message: `Tool not found: ${step.tool}` };
        if (stopOnError) {
          return this.success({ result: null, outputs, stepsExecuted, error });
        }
        lastError = error;
        continue;
      }

      // Build arguments
      const toolArgs = this.buildArgs(step.args || {}, step.inputMapping, currentOutput, outputs);

      try {
        const result = await tool.execute(toolArgs, context, server);
        currentOutput = result.data;

        // Store output
        const outputKey = step.outputKey || `step_${stepsExecuted}`;
        outputs[outputKey] = currentOutput;

        stepsExecuted++;
      } catch (error) {
        const errorInfo = { step: stepsExecuted, tool: step.tool, message: error.message };
        if (stopOnError) {
          return this.success({ result: currentOutput, outputs, stepsExecuted, error: errorInfo });
        }
        lastError = errorInfo;
      }
    }

    return this.success({
      result: currentOutput,
      ...(collectAllOutputs && { outputs }),
      stepsExecuted,
      ...(lastError && { error: lastError })
    });
  }

  buildArgs(baseArgs, inputMapping, currentOutput, allOutputs) {
    const args = { ...baseArgs };

    if (!inputMapping) {
      // Default: pass current output as 'data' or 'input'
      if (currentOutput !== undefined) {
        args.data = currentOutput;
        args.input = currentOutput;
      }
      return args;
    }

    // Apply input mapping
    for (const [argKey, mapping] of Object.entries(inputMapping)) {
      if (typeof mapping === 'string') {
        // Simple path mapping
        args[argKey] = this.resolvePath(mapping, currentOutput, allOutputs);
      } else if (typeof mapping === 'object') {
        // Complex mapping with source
        const source = mapping.from === 'outputs' ? allOutputs : currentOutput;
        args[argKey] = mapping.path ? this.resolvePath(mapping.path, source, allOutputs) : source;
      }
    }

    return args;
  }

  resolvePath(path, data, allOutputs) {
    // Handle special prefixes
    if (path.startsWith('$outputs.')) {
      const outputPath = path.substring(9);
      return this.getNestedValue(allOutputs, outputPath);
    }
    if (path.startsWith('$current')) {
      if (path === '$current') return data;
      return this.getNestedValue(data, path.substring(9));
    }

    // Default: resolve from current data
    return this.getNestedValue(data, path);
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

  evaluateCondition(condition, currentOutput, allOutputs) {
    const { field, op, value, from } = condition;
    const source = from === 'outputs' ? allOutputs : currentOutput;
    const fieldValue = field ? this.getNestedValue(source, field) : source;

    switch (op) {
      case 'eq': return fieldValue === value;
      case 'ne': return fieldValue !== value;
      case 'gt': return fieldValue > value;
      case 'gte': return fieldValue >= value;
      case 'lt': return fieldValue < value;
      case 'lte': return fieldValue <= value;
      case 'exists': return fieldValue !== undefined && fieldValue !== null;
      case 'notExists': return fieldValue === undefined || fieldValue === null;
      case 'contains': return String(fieldValue).includes(value);
      case 'in': return Array.isArray(value) && value.includes(fieldValue);
      default: return true;
    }
  }
}

module.exports = { ChainTool };
