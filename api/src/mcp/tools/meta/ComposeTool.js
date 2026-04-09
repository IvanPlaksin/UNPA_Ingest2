const { BaseTool } = require('../primitives/BaseTool.js');

class ComposeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'meta.compose',
      name: 'Compose Tools',
      version: '1.0.0',
      level: 4,
      category: 'meta',
      description: 'Compose multiple tools into a single callable unit',
      inputSchema: {
        type: 'object',
        required: ['name', 'tools'],
        properties: {
          name: { type: 'string', description: 'Composition name' },
          tools: {
            type: 'array',
            items: {
              type: 'object',
              required: ['tool'],
              properties: {
                tool: { type: 'string', description: 'Tool ID' },
                args: { type: 'object', description: 'Static arguments' },
                inputMapping: { type: 'object', description: 'Map composition input to tool args' },
                outputMapping: { type: 'string', description: 'Path to extract from result' },
                optional: { type: 'boolean', default: false }
              }
            }
          },
          mode: {
            type: 'string',
            enum: ['sequence', 'parallel', 'conditional'],
            default: 'sequence',
            description: 'Execution mode'
          },
          inputSchema: { type: 'object', description: 'Input schema for composition' },
          description: { type: 'string' },
          saveAs: { type: 'string', description: 'Tool ID to register as (e.g., "custom.my_tool")' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          compositionId: { type: 'string' },
          result: { description: 'Composition execution result' },
          registered: { type: 'boolean' },
          toolCount: { type: 'integer' }
        }
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 100 }
    };
  }

  async execute(args, context, server) {
    const {
      name,
      tools,
      mode = 'sequence',
      inputSchema,
      description,
      saveAs
    } = args;

    // Validate all tools exist
    const missingTools = [];
    for (const toolSpec of tools) {
      if (!server?.registry?.getTool(toolSpec.tool)) {
        missingTools.push(toolSpec.tool);
      }
    }

    if (missingTools.length > 0) {
      return this.error('TOOLS_NOT_FOUND', `Missing tools: ${missingTools.join(', ')}`);
    }

    const compositionId = `composition_${Date.now()}`;

    // If saveAs provided, create and register as new tool
    if (saveAs) {
      const createToolTool = server?.registry?.getTool('meta.create_tool');
      if (createToolTool) {
        const result = await createToolTool.execute({
          definition: {
            id: saveAs,
            name,
            description: description || `Composed tool: ${name}`,
            level: 3,
            category: saveAs.split('.')[0],
            inputSchema: inputSchema || { type: 'object', properties: {} }
          },
          implementation: {
            type: mode === 'parallel' ? 'compose' : 'pipeline',
            [mode === 'parallel' ? 'tools' : 'pipeline']: tools.map((t, i) => ({
              id: `step_${i}`,
              tool: t.tool,
              args: t.args,
              inputMapping: t.inputMapping
            }))
          },
          register: true
        }, context, server);

        return this.success({
          compositionId,
          registered: result.data?.registered,
          toolId: saveAs,
          toolCount: tools.length
        });
      }
    }

    // Execute composition directly (one-off)
    const result = await this.executeComposition(tools, mode, args.input || {}, context, server);

    return this.success({
      compositionId,
      result,
      registered: false,
      toolCount: tools.length
    });
  }

  async executeComposition(tools, mode, input, context, server) {
    switch (mode) {
      case 'parallel':
        return this.executeParallel(tools, input, context, server);
      case 'conditional':
        return this.executeConditional(tools, input, context, server);
      case 'sequence':
      default:
        return this.executeSequence(tools, input, context, server);
    }
  }

  async executeSequence(tools, input, context, server) {
    let currentData = input;

    for (const toolSpec of tools) {
      const tool = server.registry.getTool(toolSpec.tool);
      if (!tool) {
        if (toolSpec.optional) continue;
        throw new Error(`Tool not found: ${toolSpec.tool}`);
      }

      const toolArgs = this.buildToolArgs(toolSpec, currentData, input);

      try {
        const result = await tool.execute(toolArgs, context, server);
        currentData = toolSpec.outputMapping
          ? this.extractPath(result.data, toolSpec.outputMapping)
          : result.data;
      } catch (error) {
        if (!toolSpec.optional) throw error;
      }
    }

    return currentData;
  }

  async executeParallel(tools, input, context, server) {
    const promises = tools.map(async (toolSpec) => {
      const tool = server.registry.getTool(toolSpec.tool);
      if (!tool) {
        if (toolSpec.optional) return { id: toolSpec.tool, result: null };
        throw new Error(`Tool not found: ${toolSpec.tool}`);
      }

      const toolArgs = this.buildToolArgs(toolSpec, input, input);

      try {
        const result = await tool.execute(toolArgs, context, server);
        return {
          id: toolSpec.id || toolSpec.tool,
          result: toolSpec.outputMapping
            ? this.extractPath(result.data, toolSpec.outputMapping)
            : result.data
        };
      } catch (error) {
        if (toolSpec.optional) return { id: toolSpec.tool, result: null, error: error.message };
        throw error;
      }
    });

    const results = await Promise.all(promises);
    return results.reduce((acc, r) => ({ ...acc, [r.id]: r.result }), {});
  }

  async executeConditional(tools, input, context, server) {
    for (const toolSpec of tools) {
      // Check condition if present
      if (toolSpec.condition) {
        const conditionMet = this.evaluateCondition(toolSpec.condition, input);
        if (!conditionMet) continue;
      }

      const tool = server.registry.getTool(toolSpec.tool);
      if (!tool) {
        if (toolSpec.optional) continue;
        throw new Error(`Tool not found: ${toolSpec.tool}`);
      }

      const toolArgs = this.buildToolArgs(toolSpec, input, input);
      const result = await tool.execute(toolArgs, context, server);

      // In conditional mode, return first successful result
      return toolSpec.outputMapping
        ? this.extractPath(result.data, toolSpec.outputMapping)
        : result.data;
    }

    return null;
  }

  buildToolArgs(toolSpec, currentData, originalInput) {
    const args = { ...toolSpec.args };

    if (toolSpec.inputMapping) {
      for (const [argKey, mapping] of Object.entries(toolSpec.inputMapping)) {
        if (typeof mapping === 'string') {
          if (mapping.startsWith('$input.')) {
            args[argKey] = this.extractPath(originalInput, mapping.substring(7));
          } else if (mapping === '$current') {
            args[argKey] = currentData;
          } else {
            args[argKey] = this.extractPath(currentData, mapping);
          }
        } else {
          args[argKey] = mapping;
        }
      }
    } else {
      // Default: pass current data as common input names
      if (currentData !== undefined) {
        args.data = currentData;
        args.input = currentData;
        args.text = typeof currentData === 'string' ? currentData : undefined;
      }
    }

    return args;
  }

  extractPath(obj, path) {
    if (!path || !obj) return obj;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }
    return current;
  }

  evaluateCondition(condition, data) {
    const { field, op, value } = condition;
    const fieldValue = field ? this.extractPath(data, field) : data;

    switch (op) {
      case 'eq': return fieldValue === value;
      case 'ne': return fieldValue !== value;
      case 'exists': return fieldValue !== undefined && fieldValue !== null;
      case 'gt': return fieldValue > value;
      case 'lt': return fieldValue < value;
      default: return true;
    }
  }
}

module.exports = { ComposeTool };
