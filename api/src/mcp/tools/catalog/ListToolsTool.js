const { BaseTool } = require('../primitives/BaseTool.js');

// Lazy-load tool catalog data
let _catalogData = null;
async function getToolCatalog() {
  if (_catalogData && Date.now() - _catalogData._ts < 60000) return _catalogData;
  try {
    const memgraph = require('../../../services/memgraph.service');
    const rows = await memgraph.runCypher(
      `MATCH (t:Tool:CORE)
       RETURN t.id AS id, t.name AS name, t.category AS category,
              t.description AS description, t.executorId AS executorId,
              t.status AS status, t.tags AS tags, t.version AS version,
              t.requiresLLM AS requiresLLM, t.isAsync AS isAsync,
              t.usageCount AS usageCount
       ORDER BY t.category, t.name`
    );
    if (rows.length > 0) {
      _catalogData = { tools: rows, _ts: Date.now() };
      return _catalogData;
    }
  } catch {}
  // Fallback to AOPEG plugin registry (live executors)
  try {
    const aopeg = require('../../../core/aopeg/index.js');
    if (!aopeg.isAOPEGInitialized()) await aopeg.initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });
    const executors = aopeg.pluginRegistry.getAllExecutors();
    if (executors.length > 0) {
      const tools = executors.map(e => ({
        id: e.id || e.type,
        name: e.displayName || e.type,
        category: e.domain || 'general',
        description: e.description || '',
        executorId: e.type,
        status: 'active',
        tags: [e.domain].filter(Boolean),
        version: '1.0.0'
      }));
      _catalogData = { tools, _ts: Date.now() };
      return _catalogData;
    }
  } catch {}
  // Last resort: empty catalog
  _catalogData = { tools: [], _ts: Date.now() };
  return _catalogData;
}

class ListToolsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.list_tools',
      name: 'List GXE Tools',
      version: '1.0.0',
      level: 2,
      category: 'catalog',
      description: 'List all available GXE tools from the tool catalog. Supports filtering by category and status.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category ID (e.g., "workflow", "ai", "graph")' },
          status:   { type: 'string', enum: ['active', 'experimental', 'deprecated'], description: 'Filter by tool status' },
          limit:    { type: 'integer', default: 50, description: 'Max results to return' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          tools: { type: 'array', items: { type: 'object' } },
          total: { type: 'integer' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 3000, maxMemoryMb: 10 },
    };
  }

  async execute(args) {
    const { category, status, limit = 50 } = args;
    const { tools } = await getToolCatalog();

    let filtered = tools;
    if (category) filtered = filtered.filter(t => t.category === category);
    if (status) filtered = filtered.filter(t => (t.status || 'active') === status);
    filtered = filtered.slice(0, Math.min(limit, 200));

    const mapped = filtered.map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      description: (t.description || '').slice(0, 150),
      executorId: t.executorId,
      status: t.status || 'active',
      tags: t.tags || [],
      version: t.version || '1.0.0',
    }));

    return this.success({ tools: mapped, total: mapped.length });
  }
}

module.exports = { ListToolsTool, getToolCatalog };
