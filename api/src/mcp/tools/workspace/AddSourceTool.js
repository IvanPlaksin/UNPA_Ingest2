const { BaseTool } = require('../primitives/BaseTool');

class AddSourceTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.add_source',
      name: 'Add Source to WorkSpace',
      version: '1.0.0',
      level: 2,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Add a source document or data reference to WorkSpace for knowledge extraction.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'filename'],
        properties: {
          workspaceId: { type: 'string' },
          filename: { type: 'string', description: 'Source file name or identifier' },
          mimeType: { type: 'string', default: 'application/octet-stream' },
          sourceType: { type: 'string', enum: ['FILE', 'DATABASE', 'API', 'FILESYSTEM'], default: 'FILE' },
          uri: { type: 'string', description: 'URI or path to the source' },
          sizeBytes: { type: 'number', default: 0 }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId', 'filename']);
    const ws = require('../../../services/workspace/workspace.service');
    const source = await ws.addSource(args.workspaceId, {
      filename: args.filename,
      mimeType: args.mimeType || 'application/octet-stream',
      sourceType: args.sourceType || 'FILE',
      uri: args.uri || '',
      sizeBytes: args.sizeBytes || 0
    });
    return this.success({ sourceId: source.id, filename: source.filename, status: source.status });
  }
}

module.exports = { AddSourceTool };
