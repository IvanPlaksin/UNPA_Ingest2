const { BaseTool } = require('../primitives/BaseTool.js');
const { v4: uuidv4 } = require('uuid');

class CreateToolTool extends BaseTool {
  getDefinition() {
    return {
      id: 'meta.create_tool',
      name: 'Create Dynamic Tool',
      version: '1.0.0',
      level: 4,
      category: 'meta',
      description: 'Dynamically create new tools from specifications',
      inputSchema: {
        type: 'object',
        required: ['definition'],
        properties: {
          definition: {
            type: 'object',
            required: ['id', 'name', 'description'],
            properties: {
              id: { type: 'string', pattern: '^[a-z]+\\.[a-z_]+$' },
              name: { type: 'string' },
              description: { type: 'string' },
              level: { type: 'integer', enum: [2, 3], default: 2 },
              category: { type: 'string' },
              inputSchema: { type: 'object' },
              outputSchema: { type: 'object' }
            }
          },
          implementation: {
            type: 'object',
            description: 'Tool implementation',
            properties: {
              type: {
                type: 'string',
                enum: ['pipeline', 'compose', 'template', 'script'],
                description: 'Implementation type'
              },
              pipeline: { type: 'array', description: 'Pipeline stages for type=pipeline' },
              tools: { type: 'array', description: 'Tools to compose for type=compose' },
              template: { type: 'string', description: 'Template for type=template' },
              script: { type: 'string', description: 'Safe script for type=script' }
            }
          },
          register: { type: 'boolean', default: true, description: 'Register tool immediately' },
          validate: { type: 'boolean', default: true, description: 'Validate before creating' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          toolId: { type: 'string' },
          registered: { type: 'boolean' },
          validation: { type: 'object' }
        }
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context, server) {
    const { definition, implementation, register = true, validate = true } = args;

    // Ensure ID follows pattern
    if (!definition.id.match(/^[a-z]+\.[a-z_]+$/)) {
      return this.error('INVALID_ID', 'Tool ID must match pattern: category.tool_name');
    }

    // Prevent creating Level 4 tools (security)
    if (definition.level === 4) {
      return this.error('SECURITY_VIOLATION', 'Cannot dynamically create Level 4 (meta) tools');
    }

    // Build full definition
    const fullDefinition = {
      id: definition.id,
      name: definition.name,
      version: definition.version || '1.0.0',
      level: definition.level || 2,
      category: definition.category || definition.id.split('.')[0],
      description: definition.description,
      inputSchema: definition.inputSchema || { type: 'object', properties: {} },
      outputSchema: definition.outputSchema || { type: 'object' },
      safetyLevel: 'AUTO',
      sideEffects: definition.sideEffects || [],
      resourceEstimate: definition.resourceEstimate || { maxDurationMs: 30000, maxMemoryMb: 50 },
      _dynamic: true,
      _createdAt: Date.now(),
      _createdBy: context.sessionId
    };

    // Validate if requested
    let validation = { valid: true, errors: [] };
    if (validate) {
      validation = this.validateDefinition(fullDefinition, implementation);
      if (!validation.valid) {
        return this.success({ toolId: definition.id, registered: false, validation });
      }
    }

    // Create dynamic tool class
    const DynamicTool = this.createDynamicToolClass(fullDefinition, implementation);

    // Register if requested
    if (register && server?.registry) {
      try {
        const toolInstance = new DynamicTool();
        server.registry.register(toolInstance);
        return this.success({
          toolId: definition.id,
          registered: true,
          validation
        });
      } catch (error) {
        return this.success({
          toolId: definition.id,
          registered: false,
          validation: { valid: false, errors: [error.message] }
        });
      }
    }

    return this.success({
      toolId: definition.id,
      registered: false,
      validation,
      definition: fullDefinition
    });
  }

  validateDefinition(definition, implementation) {
    const errors = [];

    // Check required fields
    if (!definition.id) errors.push('Missing required field: id');
    if (!definition.name) errors.push('Missing required field: name');
    if (!definition.description) errors.push('Missing required field: description');

    // Check implementation
    if (implementation) {
      if (!implementation.type) {
        errors.push('Implementation must specify type');
      } else {
        switch (implementation.type) {
          case 'pipeline':
            if (!implementation.pipeline || !Array.isArray(implementation.pipeline)) {
              errors.push('Pipeline implementation requires pipeline array');
            }
            break;
          case 'compose':
            if (!implementation.tools || !Array.isArray(implementation.tools)) {
              errors.push('Compose implementation requires tools array');
            }
            break;
          case 'template':
            if (!implementation.template) {
              errors.push('Template implementation requires template string');
            }
            break;
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  createDynamicToolClass(definition, implementation) {
    const self = this;

    return class DynamicTool extends BaseTool {
      getDefinition() {
        return definition;
      }

      async execute(args, context, server) {
        if (!implementation) {
          return this.success(args);
        }

        switch (implementation.type) {
          case 'pipeline':
            return this.executePipeline(implementation.pipeline, args, context, server);
          case 'compose':
            return this.executeCompose(implementation.tools, args, context, server);
          case 'template':
            return this.executeTemplate(implementation.template, args, context, server);
          default:
            return this.success(args);
        }
      }

      async executePipeline(stages, args, context, server) {
        const pipelineTool = server?.registry?.getTool('pattern.pipeline');
        if (pipelineTool) {
          return pipelineTool.execute({ stages, input: args }, context, server);
        }

        // Fallback: sequential execution
        let result = args;
        for (const stage of stages) {
          const tool = server?.registry?.getTool(stage.tool);
          if (tool) {
            const stageResult = await tool.execute({ ...stage.args, ...result }, context, server);
            result = stageResult.data;
          }
        }
        return this.success(result);
      }

      async executeCompose(tools, args, context, server) {
        const results = {};
        for (const toolSpec of tools) {
          const tool = server?.registry?.getTool(toolSpec.tool);
          if (tool) {
            const result = await tool.execute({ ...toolSpec.args, ...args }, context, server);
            results[toolSpec.id || toolSpec.tool] = result.data;
          }
        }
        return this.success(results);
      }

      async executeTemplate(template, args, context, server) {
        const templateTool = server?.registry?.getTool('text.template');
        if (templateTool) {
          return templateTool.execute({ template, variables: args }, context, server);
        }
        return this.success({ template, args });
      }
    };
  }
}

module.exports = { CreateToolTool };
