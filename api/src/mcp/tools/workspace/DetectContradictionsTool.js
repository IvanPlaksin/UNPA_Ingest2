const { BaseTool } = require('../primitives/BaseTool');

class DetectContradictionsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.detect_contradictions',
      name: 'Detect Contradictions',
      version: '1.0.0',
      level: 2,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Scan workspace draft nodes and detect logical/factual conflicts between entities extracted from different sources. Idempotent — re-running does not create duplicates.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string', description: 'WorkSpace ID (UUID)' },
          similarityThreshold: {
            type: 'number',
            description: 'Name similarity threshold for grouping (0..1, default 0.75)'
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId']);
    const svc = require('../../../services/workspace/contradiction.service');
    const result = await svc.detectContradictions(args.workspaceId, {
      similarityThreshold: args.similarityThreshold,
      detectedBy: context?.userId || context?.agentId || 'agent'
    });
    return this.success(result);
  }
}

module.exports = { DetectContradictionsTool };
