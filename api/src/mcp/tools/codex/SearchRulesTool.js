const { BaseTool } = require('../primitives/BaseTool');
const { executeCodexTool } = require('../../../services/codex/codex-tools');

class SearchRulesTool extends BaseTool {
  getDefinition() {
    return {
      id: 'codex.search_rules',
      name: 'Search Codex Rules',
      version: '1.0.0',
      level: 1,
      category: 'meta',
      toolNamespace: 'CODEX',
      description: 'Search Codex rules by query, scope, or modality. Use to find governance rules applicable to the current task.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (matches title, summary, rationale)' },
          scope: { type: 'string', description: 'Filter by scope: gxe, graph, dialog, flowdesk, crud, etc.' },
          modality: { type: 'string', enum: ['MUST', 'SHOULD', 'MAY', 'MUST_NOT', 'SHOULD_NOT'], description: 'Filter by modality' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          rules: { type: 'array' },
          count: { type: 'number' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args) {
    const result = await executeCodexTool('codex_search_rules', args);
    return this.success(JSON.parse(result));
  }
}

module.exports = { SearchRulesTool };
