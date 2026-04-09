const { BaseTool } = require('../primitives/BaseTool.js');
const { ToolExecutionContext } = require('../../server/ToolExecutionContext.js');

class SandboxTool extends BaseTool {
  getDefinition() {
    return {
      id: 'meta.sandbox',
      name: 'Sandbox Execution',
      version: '1.0.0',
      level: 4,
      category: 'meta',
      description: 'Execute tools in an isolated sandbox environment',
      inputSchema: {
        type: 'object',
        required: ['tool'],
        properties: {
          tool: { type: 'string', description: 'Tool ID to execute' },
          args: { type: 'object', description: 'Tool arguments' },
          isolation: {
            type: 'string',
            enum: ['none', 'context', 'full'],
            default: 'context',
            description: 'Isolation level'
          },
          timeout: { type: 'integer', default: 30000, description: 'Execution timeout (ms)' },
          memoryLimit: { type: 'integer', default: 100, description: 'Memory limit (MB)' },
          allowedTools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tools allowed to be called from sandbox'
          },
          blockedTools: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tools blocked from sandbox'
          },
          captureOutput: { type: 'boolean', default: true, description: 'Capture all outputs' },
          dryRun: { type: 'boolean', default: false, description: 'Simulate without executing' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { description: 'Tool execution result' },
          sandbox: {
            type: 'object',
            properties: {
              isolated: { type: 'boolean' },
              duration: { type: 'integer' },
              toolsCalled: { type: 'array' },
              stateChanges: { type: 'array' },
              errors: { type: 'array' }
            }
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 200 }
    };
  }

  async execute(args, context, server) {
    const {
      tool,
      args: toolArgs = {},
      isolation = 'context',
      timeout = 30000,
      memoryLimit = 100,
      allowedTools,
      blockedTools,
      captureOutput = true,
      dryRun = false
    } = args;

    // Get target tool
    const targetTool = server?.registry?.getTool(tool);
    if (!targetTool) {
      return this.error('TOOL_NOT_FOUND', `Tool not found: ${tool}`);
    }

    // Check if tool is blocked
    if (blockedTools?.includes(tool)) {
      return this.error('TOOL_BLOCKED', `Tool ${tool} is blocked in this sandbox`);
    }

    // Check allowed tools
    if (allowedTools && !allowedTools.includes(tool)) {
      return this.error('TOOL_NOT_ALLOWED', `Tool ${tool} is not in allowed list`);
    }

    if (dryRun) {
      return this.success({
        result: null,
        sandbox: {
          isolated: true,
          dryRun: true,
          tool,
          args: toolArgs,
          wouldExecute: true
        }
      });
    }

    // Create sandbox environment
    const sandboxEnv = this.createSandbox(isolation, context, server, {
      allowedTools,
      blockedTools,
      captureOutput
    });

    const startTime = Date.now();
    const toolsCalled = [];
    const stateChanges = [];
    const errors = [];

    try {
      // Execute with timeout
      const resultPromise = targetTool.execute(
        toolArgs,
        sandboxEnv.context,
        sandboxEnv.server
      );

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sandbox timeout exceeded')), timeout)
      );

      const result = await Promise.race([resultPromise, timeoutPromise]);

      // Collect sandbox info
      if (captureOutput) {
        toolsCalled.push(...(sandboxEnv.toolsCalled || []));
        stateChanges.push(...this.getStateChanges(context, sandboxEnv.context));
      }

      return this.success({
        result: result.data,
        sandbox: {
          isolated: isolation !== 'none',
          duration: Date.now() - startTime,
          toolsCalled,
          stateChanges,
          errors
        }
      });

    } catch (error) {
      errors.push({
        type: error.name || 'Error',
        message: error.message,
        timestamp: Date.now()
      });

      return this.success({
        result: null,
        sandbox: {
          isolated: isolation !== 'none',
          duration: Date.now() - startTime,
          toolsCalled,
          stateChanges,
          errors
        }
      });
    }
  }

  createSandbox(isolation, originalContext, originalServer, options) {
    const { allowedTools, blockedTools, captureOutput } = options;
    const toolsCalled = [];

    switch (isolation) {
      case 'full':
        // Full isolation: new context, restricted registry
        const fullContext = new ToolExecutionContext();
        const restrictedRegistry = this.createRestrictedRegistry(
          originalServer?.registry,
          allowedTools,
          blockedTools,
          toolsCalled
        );

        return {
          context: fullContext,
          server: {
            ...originalServer,
            registry: restrictedRegistry
          },
          toolsCalled
        };

      case 'context':
        // Context isolation: new context, full registry with tracking
        const isolatedContext = new ToolExecutionContext();
        const trackingRegistry = this.createTrackingRegistry(
          originalServer?.registry,
          allowedTools,
          blockedTools,
          toolsCalled
        );

        return {
          context: isolatedContext,
          server: {
            ...originalServer,
            registry: trackingRegistry
          },
          toolsCalled
        };

      case 'none':
      default:
        // No isolation: use original context
        return {
          context: originalContext,
          server: originalServer,
          toolsCalled
        };
    }
  }

  createRestrictedRegistry(originalRegistry, allowedTools, blockedTools, toolsCalled) {
    if (!originalRegistry) return null;

    return {
      getTool: (id) => {
        // Check restrictions
        if (blockedTools?.includes(id)) {
          return null;
        }
        if (allowedTools && !allowedTools.includes(id)) {
          return null;
        }

        const tool = originalRegistry.getTool(id);
        if (tool) {
          toolsCalled.push({ id, timestamp: Date.now() });
        }
        return tool;
      },
      listTools: () => {
        let tools = originalRegistry.listTools();
        if (blockedTools) {
          tools = tools.filter(t => !blockedTools.includes(t.id));
        }
        if (allowedTools) {
          tools = tools.filter(t => allowedTools.includes(t.id));
        }
        return tools;
      }
    };
  }

  createTrackingRegistry(originalRegistry, allowedTools, blockedTools, toolsCalled) {
    if (!originalRegistry) return null;

    return {
      getTool: (id) => {
        if (blockedTools?.includes(id)) {
          console.warn(`Sandbox: Blocked access to tool ${id}`);
          return null;
        }

        const tool = originalRegistry.getTool(id);
        if (tool) {
          toolsCalled.push({ id, timestamp: Date.now() });
        }
        return tool;
      },
      listTools: () => originalRegistry.listTools(),
      register: () => {
        throw new Error('Cannot register tools from sandbox');
      }
    };
  }

  getStateChanges(originalContext, sandboxContext) {
    const changes = [];

    // Compare state maps
    const originalKeys = new Set(originalContext.state?.keys() || []);
    const sandboxKeys = new Set(sandboxContext.state?.keys() || []);

    for (const key of sandboxKeys) {
      if (!originalKeys.has(key)) {
        changes.push({ type: 'added', key, value: sandboxContext.get(key) });
      } else if (originalContext.get(key) !== sandboxContext.get(key)) {
        changes.push({
          type: 'modified',
          key,
          oldValue: originalContext.get(key),
          newValue: sandboxContext.get(key)
        });
      }
    }

    return changes;
  }
}

module.exports = { SandboxTool };
