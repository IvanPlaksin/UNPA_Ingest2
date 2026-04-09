const { BaseTool } = require('../primitives/BaseTool');

class AnalyzeSourcesTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.analyze_sources',
      name: 'Analyze WorkSpace Sources',
      version: '1.0.0',
      level: 2,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Analyze cross-source coverage, shared entities, source relationships, and missing links. Returns a section of analysis or the full report.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string', description: 'WorkSpace ID (UUID)' },
          reportType: {
            type: 'string',
            enum: ['coverage', 'shared-entities', 'relationships', 'suggestions', 'full'],
            default: 'full',
            description: 'Which analysis section to return (default: full report)'
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args) {
    this.validateArgs(args, ['workspaceId']);
    const svc = require('../../../services/workspace/cross-source.service');
    const reportType = args.reportType || 'full';

    let data;
    switch (reportType) {
      case 'coverage':         data = await svc.analyzeSourceCoverage(args.workspaceId); break;
      case 'shared-entities':  data = await svc.findSharedEntities(args.workspaceId); break;
      case 'relationships':    data = await svc.inferSourceRelationships(args.workspaceId); break;
      case 'suggestions':      data = await svc.suggestMissingLinks(args.workspaceId); break;
      case 'full':
      default:                 data = await svc.generateAnalysisReport(args.workspaceId); break;
    }
    return this.success({ reportType, ...data });
  }
}

module.exports = { AnalyzeSourcesTool };
