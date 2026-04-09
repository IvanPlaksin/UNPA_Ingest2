const BaseTool = require('../primitives/BaseTool').BaseTool;

class AddSourceTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.add_source',
      name: 'Add Source Reference',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Add a source reference to a BackLog task for provenance tracking. Supports MCP_TOOL, CODEX_RULE, BLACKCODEX, EXTERNAL_URL and other source types.',
      inputSchema: {
        type: 'object',
        required: ['backlogId', 'sourceType', 'sourceId', 'relevance'],
        properties: {
          backlogId: { type: 'string', description: 'BackLog item ID (e.g. BACKLOG-0001)' },
          sourceType: {
            type: 'string',
            enum: ['MCP_TOOL', 'CODEX_RULE', 'CODEX_PRINCIPLE', 'BLACKCODEX', 'KNOWLEDGE_NODE', 'EXTERNAL_URL', 'AUDIT_FINDING', 'CONVERSATION', 'FILE_CONTENT'],
            description: 'Type of source being referenced'
          },
          sourceId: { type: 'string', description: 'Identifier of the source (tool name, codexId, URL, etc.)' },
          sourceTitle: { type: 'string', description: 'Human-readable title for the source' },
          relevance: { type: 'string', description: 'Why this source is relevant (min 10 chars)' },
          excerpt: { type: 'string', description: 'Relevant excerpt or summary from the source' },
          toolInput: { type: 'object', description: 'For MCP_TOOL: input parameters sent to the tool' },
          toolOutput: { type: 'object', description: 'For MCP_TOOL: output received (summarized if large)' },
          url: { type: 'string', description: 'For EXTERNAL_URL: the full URL' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          source: { type: 'object' },
          message: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['backlogId', 'sourceType', 'sourceId', 'relevance']);
    const { backlogId, sourceType, sourceId, sourceTitle, relevance, excerpt, toolInput, toolOutput, url } = args;

    if (!relevance || relevance.length < 10) {
      return this.error('VALIDATION', 'relevance must be at least 10 characters');
    }

    const sourceRef = require('../../../services/backlog/source-reference.service');
    const addedBy = context?.agentId || context?.get?.('agentId') || 'agent:mcp';
    let source;

    switch (sourceType) {
      case 'MCP_TOOL':
        source = await sourceRef.addMCPToolSource(backlogId, sourceId, toolInput, toolOutput, relevance, { addedBy });
        break;
      case 'CODEX_RULE':
      case 'CODEX_PRINCIPLE':
        source = await sourceRef.addCodexSource(backlogId, sourceId, relevance, { addedBy });
        break;
      case 'BLACKCODEX':
        source = await sourceRef.addBlackCodexSource(backlogId, sourceId, relevance, { addedBy });
        break;
      case 'EXTERNAL_URL':
        source = await sourceRef.addExternalSource(backlogId, url || sourceId, sourceTitle || sourceId, relevance, excerpt, { addedBy });
        break;
      default:
        source = await sourceRef.addSource(backlogId, {
          sourceType, sourceId, sourceTitle: sourceTitle || sourceId, relevance, excerpt
        }, { addedBy });
    }

    return this.success({ message: `Source reference added to ${backlogId}`, source });
  }
}

module.exports = { AddSourceTool };
