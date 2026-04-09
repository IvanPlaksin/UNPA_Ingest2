const { BaseTool } = require('../primitives/BaseTool.js');
const { getToolCatalog } = require('./ListToolsTool.js');

class SuggestToolsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.suggest_tools',
      name: 'Suggest Tools',
      version: '1.0.0',
      level: 3,
      category: 'catalog',
      description: 'Get AI-powered tool suggestions based on task context. Analyzes the task description and optionally considers tools already in the graph to suggest complementary tools.',
      inputSchema: {
        type: 'object',
        properties: {
          context:        { type: 'string', description: 'Description of the task or goal' },
          currentTools:   { type: 'array', items: { type: 'string' }, description: 'Tool IDs already in the graph' },
          maxSuggestions: { type: 'integer', default: 5, description: 'Max number of suggestions to return' },
        },
        required: ['context'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'object' },
                reason: { type: 'string' },
                confidence: { type: 'number' },
              },
            },
          },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ', 'EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 15000, maxMemoryMb: 30 },
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['context']);
    const { context: taskContext, currentTools = [], maxSuggestions = 5 } = args;

    const { tools } = await getToolCatalog();

    // Filter out tools already in the graph
    const currentSet = new Set(currentTools);
    const available = tools.filter(t => !currentSet.has(t.id));

    // Build compact tool catalog for LLM
    const toolSummaries = available.map(t =>
      `- ${t.id}: ${t.name} — ${(t.description || '').slice(0, 100)}`
    ).join('\n');

    const currentToolNames = currentTools.length > 0
      ? `\nTools already in the graph: ${currentTools.join(', ')}`
      : '';

    // Try LLM-powered suggestion
    const llmService = context?.services?.llm;
    if (llmService) {
      try {
        return await this._suggestWithLLM(llmService, taskContext, toolSummaries, currentToolNames, available, maxSuggestions);
      } catch {
        // Fall through to keyword-based fallback
      }
    }

    // Fallback: keyword-based matching
    return this._suggestByKeywords(taskContext, available, maxSuggestions);
  }

  async _suggestWithLLM(llmService, taskContext, toolSummaries, currentToolNames, available, maxSuggestions) {
    const prompt = `You are a GXE graph construction assistant. Given a task description and available tools, suggest the ${maxSuggestions} most relevant tools to use.
${currentToolNames}

Task: ${taskContext}

Available tools:
${toolSummaries}

Return a JSON array of objects with exactly these fields:
- "toolId": the tool ID from the list
- "reason": brief explanation why this tool is useful (1 sentence)
- "confidence": number 0.0-1.0

Return ONLY the JSON array, no other text.`;

    const response = await llmService.complete(prompt, { maxTokens: 1500 });
    const text = (response?.text || response?.content || '').trim();

    // Parse JSON from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in response');

    const parsed = JSON.parse(match[0]);
    const toolMap = new Map(available.map(t => [t.id, t]));

    const suggestions = parsed
      .filter(s => s.toolId && toolMap.has(s.toolId))
      .slice(0, maxSuggestions)
      .map(s => ({
        tool: {
          id: s.toolId,
          name: toolMap.get(s.toolId).name,
          category: toolMap.get(s.toolId).category,
          description: (toolMap.get(s.toolId).description || '').slice(0, 150),
          executorId: toolMap.get(s.toolId).executorId,
        },
        reason: s.reason || 'Relevant to the task',
        confidence: Math.min(1, Math.max(0, Number(s.confidence) || 0.5)),
      }));

    return this.success({ suggestions, method: 'llm' });
  }

  _suggestByKeywords(taskContext, available, maxSuggestions) {
    const words = taskContext.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    const scored = available.map(t => {
      const text = `${t.name} ${t.description || ''} ${(t.tags || []).join(' ')} ${t.executorId || ''}`.toLowerCase();
      const score = words.reduce((sum, w) => sum + (text.includes(w) ? 1 : 0), 0);
      return { tool: t, score };
    })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSuggestions);

    const suggestions = scored.map(s => ({
      tool: {
        id: s.tool.id,
        name: s.tool.name,
        category: s.tool.category,
        description: (s.tool.description || '').slice(0, 150),
        executorId: s.tool.executorId,
      },
      reason: `Matches ${s.score} keyword(s) from task description`,
      confidence: Math.min(1, s.score * 0.2),
    }));

    return this.success({ suggestions, method: 'keyword-fallback' });
  }
}

module.exports = { SuggestToolsTool };
