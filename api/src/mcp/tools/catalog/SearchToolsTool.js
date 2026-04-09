const { BaseTool } = require('../primitives/BaseTool.js');
const { getToolCatalog } = require('./ListToolsTool.js');

class SearchToolsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.search_tools',
      name: 'Search Tools',
      version: '1.0.0',
      level: 2,
      category: 'catalog',
      description: 'Search GXE tools by query across name, description, tags, and executor ID. Returns ranked results.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (matched against name, description, tags, executorId)' },
          category: { type: 'string', description: 'Optional category filter' },
          limit: { type: 'integer', default: 10, description: 'Max results to return' },
        },
        required: ['query'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          tools: { type: 'array', items: { type: 'object' } },
          query: { type: 'string' },
          totalMatches: { type: 'integer' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 3000, maxMemoryMb: 10 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['query']);
    const { query, category, limit = 10 } = args;
    const q = query.toLowerCase();

    const { tools } = await getToolCatalog();

    // Score each tool by match quality
    const scored = tools
      .filter(t => !category || t.category === category)
      .map(t => {
        let score = 0;
        const name = (t.name || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const execId = (t.executorId || '').toLowerCase();
        const tags = (t.tags || []).map(tag => (typeof tag === 'string' ? tag : '').toLowerCase());

        // Exact name match is highest
        if (name === q) score += 100;
        else if (name.includes(q)) score += 50;

        // executorId match
        if (execId.includes(q)) score += 30;

        // Tag match
        if (tags.some(tag => tag.includes(q))) score += 25;

        // Description match
        if (desc.includes(q)) score += 10;

        return { tool: t, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(limit, 50));

    const results = scored.map(s => ({
      id: s.tool.id,
      name: s.tool.name,
      category: s.tool.category,
      description: (s.tool.description || '').slice(0, 150),
      executorId: s.tool.executorId,
      tags: s.tool.tags || [],
      score: s.score,
    }));

    return this.success({ tools: results, query, totalMatches: results.length });
  }
}

module.exports = { SearchToolsTool };
