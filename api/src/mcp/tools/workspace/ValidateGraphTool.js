const { BaseTool } = require('../primitives/BaseTool');

class ValidateGraphTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.validate_graph',
      name: 'Validate WorkSpace Graph',
      version: '1.0.0',
      level: 2,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Run validation rules over a workspace draft graph (structure, content, contradictions, graph type). Returns full ValidationResult including blockers, errors, warnings.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string', description: 'WorkSpace ID (UUID)' },
          rules: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of rule IDs to run (default: all)'
          },
          graphType: {
            type: 'string',
            enum: ['STRUCTURAL', 'EXECUTABLE', 'CONSTRAINT'],
            description: 'Optional graph type — filters type-specific rules'
          },
          stopOnFirstError: { type: 'boolean', default: false }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args) {
    this.validateArgs(args, ['workspaceId']);
    const validator = require('../../../services/workspace/graph-validator.service');
    const result = await validator.validateGraph(args.workspaceId, {
      rules: args.rules,
      graphType: args.graphType,
      stopOnFirstError: !!args.stopOnFirstError
    });
    return this.success(result);
  }
}

module.exports = { ValidateGraphTool };
