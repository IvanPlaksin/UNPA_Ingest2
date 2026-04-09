const { BaseTool } = require('../primitives/BaseTool.js');
const { getToolCatalog } = require('./ListToolsTool.js');

class GetToolDetailTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.get_tool',
      name: 'Get Tool Details',
      version: '1.0.0',
      level: 2,
      category: 'catalog',
      description: 'Get detailed information about a specific tool by its ID, including input/output schemas.',
      inputSchema: {
        type: 'object',
        properties: {
          toolId: { type: 'string', description: 'Tool ID (e.g., "tool.workflow.condition")' },
        },
        required: ['toolId'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'object', description: 'Full tool details or null if not found' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 2000, maxMemoryMb: 5 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['toolId']);
    const { toolId } = args;

    const { tools } = await getToolCatalog();
    const tool = tools.find(t => t.id === toolId);

    if (!tool) {
      return this.success({ tool: null, message: `Tool "${toolId}" not found` });
    }

    // Parse schemas if stored as strings
    let inputSchema = tool.inputSchema;
    let outputSchema = tool.outputSchema;
    try { if (typeof inputSchema === 'string') inputSchema = JSON.parse(inputSchema); } catch {}
    try { if (typeof outputSchema === 'string') outputSchema = JSON.parse(outputSchema); } catch {}

    return this.success({
      tool: {
        id: tool.id,
        name: tool.name,
        category: tool.category,
        description: tool.description,
        executorId: tool.executorId,
        inputSchema,
        outputSchema,
        tags: tool.tags || [],
        status: tool.status || 'active',
        version: tool.version || '1.0.0',
        requiresLLM: tool.requiresLLM || false,
        requiresNetwork: tool.requiresNetwork || false,
        isAsync: tool.isAsync || false,
        usageCount: typeof tool.usageCount === 'object' ? Number(tool.usageCount) : (tool.usageCount || 0),
      },
    });
  }
}

module.exports = { GetToolDetailTool };
