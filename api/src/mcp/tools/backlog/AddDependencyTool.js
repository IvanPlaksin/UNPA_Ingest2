const BaseTool = require('../primitives/BaseTool').BaseTool;

class AddDependencyTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.add_dependency',
      name: 'Add BackLog Task Dependency',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Add a DEPENDS_ON relationship between two BackLog tasks. Cycle detection enforced (CODEX-RULE-BL-003).',
      inputSchema: {
        type: 'object',
        required: ['backlogId', 'dependsOn'],
        properties: {
          backlogId: { type: 'string', description: 'Task that depends on another' },
          dependsOn: { type: 'string', description: 'Task that must complete first' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args) {
    this.validateArgs(args, ['backlogId', 'dependsOn']);
    const backlogService = require('../../../services/backlog/backlog.service');
    await backlogService.addDependency(args.backlogId, args.dependsOn);
    return this.success({ success: true, message: `${args.backlogId} now depends on ${args.dependsOn}` });
  }
}

module.exports = { AddDependencyTool };
