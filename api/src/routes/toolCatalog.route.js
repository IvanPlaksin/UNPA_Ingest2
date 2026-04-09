const express = require('express');
const router = express.Router();

// ─── MCP Registry (single source of truth) ────────────────────────────────

let _mcpTools = null;
function getMcpTools() {
  if (_mcpTools) return _mcpTools;
  try {
    const { createAllTools } = require('../mcp/index.js');
    const toolInstances = createAllTools();
    _mcpTools = toolInstances.map(t => t.getDefinition());
  } catch (err) {
    console.warn('[ToolCatalog] Failed to load MCP tools:', err.message);
    _mcpTools = [];
  }
  return _mcpTools;
}

// ─── Category metadata ─────────────────────────────────────────────────────

const CATEGORY_META = {
  primitive: { name: 'Primitives', emoji: '⚙️', color: '#9ca3af', level: 1,
    description: 'Core data operations: get/set, merge, filter, aggregate' },
  text:      { name: 'Text', emoji: '📝', color: '#60a5fa', level: 2,
    description: 'Text processing: chunk, tokenize, normalize, sanitize' },
  extraction:{ name: 'Extraction', emoji: '🔬', color: '#f472b6', level: 2,
    description: 'Data extraction: entities, relations, topics, sentiment' },
  vector:    { name: 'Vector', emoji: '🔍', color: '#2dd4bf', level: 2,
    description: 'Embeddings, similarity, semantic search, clustering' },
  graph:     { name: 'Graph', emoji: '🔷', color: '#60a5fa', level: 2,
    description: 'Graph CRUD, query, traversal, community detection' },
  ai:        { name: 'AI', emoji: '🧠', color: '#a78bfa', level: 2,
    description: 'LLM chat, completion, summarization, classification' },
  control:   { name: 'Control', emoji: '⚡', color: '#22d3ee', level: 2,
    description: 'Control flow, orchestration, events' },
  pattern:   { name: 'Patterns', emoji: '🔗', color: '#fbbf24', level: 3,
    description: 'Composite: RAG, map-reduce, parallel, pipeline, retry' },
  meta:      { name: 'Meta', emoji: '🎯', color: '#fb7185', level: 4,
    description: 'Meta-tools: create, compose, introspect, optimize' },
  data:      { name: 'Data', emoji: '📥', color: '#fbbf24', level: 2,
    description: 'MSSQL connectors, schema discovery, data import' },
  catalog:   { name: 'Catalog', emoji: '📚', color: '#818cf8', level: 2,
    description: 'Graph catalog, tool catalog, versioning, reuse' },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatToolForApi(def) {
  return {
    id: def.id,
    name: def.name,
    version: def.version,
    level: def.level,
    category: def.category,
    description: def.description,
    executorId: def.id,
    inputSchema: JSON.stringify(def.inputSchema),
    outputSchema: JSON.stringify(def.outputSchema),
    wrapsService: def.wrapsService || null,
    composedOf: def.composedOf || [],
    safetyLevel: def.safetyLevel,
    sideEffects: def.sideEffects || [],
    tags: buildTags(def),
    requiresLLM: (def.sideEffects || []).includes('EXTERNAL_CALL') && ['ai'].includes(def.category),
    requiresNetwork: (def.sideEffects || []).includes('EXTERNAL_CALL'),
    isAsync: false,
    status: 'active',
    source: 'mcp-registry',
    resourceEstimate: def.resourceEstimate || null,
  };
}

function buildTags(def) {
  const tags = [];
  tags.push(`level-${def.level}`);
  if (def.wrapsService) tags.push(def.wrapsService);
  if (def.safetyLevel === 'REQUIRES_APPROVAL') tags.push('requires-approval');
  if (def.safetyLevel === 'GOD_MODE') tags.push('god-mode');
  if ((def.sideEffects || []).includes('WRITE')) tags.push('write');
  if ((def.sideEffects || []).includes('DELETE')) tags.push('delete');
  if ((def.sideEffects || []).includes('EXTERNAL_CALL')) tags.push('external');
  if (def.composedOf?.length) tags.push('composite');
  return tags;
}

function buildCatalog() {
  const defs = getMcpTools();
  const tools = defs.map(formatToolForApi);

  // Build categories from actual tools
  const catCounts = {};
  for (const t of tools) {
    catCounts[t.category] = (catCounts[t.category] || 0) + 1;
  }
  const categories = Object.entries(catCounts).map(([id, count]) => {
    const meta = CATEGORY_META[id] || { name: id, emoji: '📦', color: '#6b7280', description: id };
    return { id, name: meta.name, emoji: meta.emoji, color: meta.color, description: meta.description, level: meta.level, toolCount: count };
  }).sort((a, b) => (a.level || 2) - (b.level || 2) || a.name.localeCompare(b.name));

  return {
    categories,
    tools,
    meta: {
      totalTools: tools.length,
      totalCategories: categories.length,
      lastUpdated: new Date().toISOString(),
      source: 'mcp-registry',
    },
  };
}

// ─── Memgraph usage tracking (optional) ────────────────────────────────────

let memgraph = null;
function getMemgraph() {
  if (!memgraph) {
    try { memgraph = require('../services/memgraph.service'); } catch {}
  }
  return memgraph;
}

async function getUsageCounters() {
  const mg = getMemgraph();
  if (!mg) return {};
  try {
    const rows = await mg.runCypher(
      `MATCH (t:Tool:CORE)
       WHERE t.usageCount > 0
       RETURN t.id AS id, t.usageCount AS usageCount, t.lastUsedAt AS lastUsedAt`
    );
    const map = {};
    for (const r of rows) {
      map[r.id] = {
        usageCount: typeof r.usageCount === 'object' ? Number(r.usageCount) : (r.usageCount || 0),
        lastUsedAt: r.lastUsedAt || null,
      };
    }
    return map;
  } catch {
    return {};
  }
}

// ─── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/tool-catalog
 * Primary: MCP Registry (code). Enriched with Memgraph usage counters.
 */
router.get('/', async (_req, res) => {
  try {
    const catalog = buildCatalog();
    // Enrich with usage counters from Memgraph
    const usage = await getUsageCounters();
    for (const tool of catalog.tools) {
      const u = usage[tool.id];
      if (u) {
        tool.usageCount = u.usageCount;
        tool.lastUsedAt = u.lastUsedAt;
      }
    }
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ error: err.message, meta: { source: 'error' } });
  }
});

/**
 * GET /api/v1/tool-catalog/search?q=...&limit=20
 */
router.get('/search', (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter "q" required' });

  const query = q.toLowerCase();
  const { tools } = buildCatalog();
  const matches = tools.filter(t =>
    t.name.toLowerCase().includes(query) ||
    t.description.toLowerCase().includes(query) ||
    t.tags?.some(tag => tag.toLowerCase().includes(query)) ||
    t.executorId?.toLowerCase().includes(query)
  ).slice(0, Number(limit));

  res.json({ tools: matches, query: q, totalMatches: matches.length });
});

/**
 * GET /api/v1/tool-catalog/category/:categoryId
 */
router.get('/category/:categoryId', (req, res) => {
  const { categoryId } = req.params;
  const { tools } = buildCatalog();
  const filtered = tools.filter(t => t.category === categoryId);
  res.json({ category: categoryId, tools: filtered, count: filtered.length });
});

/**
 * GET /api/v1/tool-catalog/level/:level
 * New: filter by tool level (1-4)
 */
router.get('/level/:level', (req, res) => {
  const level = Number(req.params.level);
  if (![1, 2, 3, 4].includes(level)) {
    return res.status(400).json({ error: 'Level must be 1, 2, 3, or 4' });
  }
  const { tools } = buildCatalog();
  const filtered = tools.filter(t => t.level === level);
  res.json({ level, tools: filtered, count: filtered.length });
});

/**
 * GET /api/v1/tool-catalog/tool/:toolId
 */
router.get('/tool/:toolId', (req, res) => {
  const { toolId } = req.params;
  const { tools } = buildCatalog();
  const tool = tools.find(t => t.id === toolId);
  if (!tool) return res.status(404).json({ error: `Tool "${toolId}" not found` });
  res.json(tool);
});

/**
 * POST /api/v1/tool-catalog/tool/:toolId/usage
 * Increment usage counter in Memgraph
 */
router.post('/tool/:toolId/usage', async (req, res) => {
  const { toolId } = req.params;
  const mg = getMemgraph();

  if (!mg) {
    return res.json({ usageCount: 0, lastUsedAt: new Date().toISOString(), note: 'Memgraph unavailable' });
  }

  try {
    const now = new Date().toISOString();
    const result = await mg.runCypher(
      `MERGE (t:Tool:CORE {id: $toolId})
       ON CREATE SET t.usageCount = 1, t.lastUsedAt = $now, t.createdAt = $now
       ON MATCH SET t.usageCount = coalesce(t.usageCount, 0) + 1, t.lastUsedAt = $now
       RETURN t.usageCount AS usageCount, t.lastUsedAt AS lastUsedAt`,
      { toolId, now }
    );
    const row = result[0] || {};
    res.json({
      usageCount: typeof row.usageCount === 'object' ? Number(row.usageCount) : (row.usageCount || 1),
      lastUsedAt: row.lastUsedAt || now,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/tool-catalog/executor/:executorType/schema
 * Returns the parameterSchema for an AOPEG executor or MCP tool inputSchema.
 * Lookup order: AOPEG pluginRegistry → MCP tool catalog.
 */
router.get('/executor/:executorType/schema', async (req, res) => {
  const raw = req.params.executorType;

  // Normalize ID variants:
  //   "tool-flowdesk-check_location" → "flowdesk.check_location"
  //   "flowdesk.check_location"      → as-is
  const candidates = [raw];
  // Strip "tool-" prefix and convert first hyphen group to dot-separated domain
  if (raw.startsWith('tool-')) {
    const stripped = raw.slice(5); // "flowdesk-check_location"
    const dotted = stripped.replace(/-/g, '.'); // "flowdesk.check.location"
    const underscored = stripped.replace(/-/, '.'); // first hyphen → dot, rest keep: "flowdesk.check_location"
    candidates.push(underscored, dotted, stripped);
  }
  // Also try replacing hyphens with dots and underscores with dots
  candidates.push(raw.replace(/-/g, '.'));
  candidates.push(raw.replace(/-/g, '_'));
  // Strip ".dialog." prefix (flowdesk.dialog.check-location → flowdesk.check_location)
  for (const c of [...candidates]) {
    if (c.includes('.dialog.')) {
      candidates.push(c.replace('.dialog.', '.').replace(/-/g, '_'));
    }
  }
  // Deduplicate
  const ids = [...new Set(candidates)];

  // 1. Try AOPEG pluginRegistry first (ensure plugins are loaded)
  try {
    const { pluginRegistry } = require('../core/aopeg/registry/plugin-registry');

    // Lazy-load plugins if registry is empty
    if (pluginRegistry.executors.size === 0) {
      const { loadAllPlugins } = require('../core/aopeg/plugins/plugin-loader');
      await loadAllPlugins();
    }

    for (const id of ids) {
      const executor = pluginRegistry.getExecutor(id);
      if (executor && executor.parameterSchema && Object.keys(executor.parameterSchema).length > 0) {
        return res.json({
          executorType: id,
          source: 'aopeg',
          displayName: executor.displayName || id,
          description: executor.description || '',
          domain: executor.domain || '',
          schema: executor.parameterSchema,
        });
      }
    }
  } catch (err) {
    console.warn('[ToolCatalog] AOPEG lookup failed:', err.message);
  }

  // 2. Fallback: MCP tool catalog inputSchema
  const defs = getMcpTools();
  for (const id of ids) {
    const mcpTool = defs.find(d => d.id === id);
    if (mcpTool && mcpTool.inputSchema) {
      return res.json({
        executorType: id,
        source: 'mcp',
        displayName: mcpTool.name || id,
        description: mcpTool.description || '',
        domain: mcpTool.category || '',
        schema: mcpTool.inputSchema,
      });
    }
  }

  // 3. Not found
  res.status(404).json({ error: `No schema found for executor "${raw}"` });
});

/**
 * GET /api/v1/tool-catalog/stats
 * New: returns summary stats by level and category
 */
router.get('/stats', (_req, res) => {
  const { tools, categories } = buildCatalog();
  const byLevel = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const t of tools) byLevel[t.level] = (byLevel[t.level] || 0) + 1;
  res.json({
    total: tools.length,
    byLevel,
    byCategory: categories.map(c => ({ id: c.id, name: c.name, count: c.toolCount })),
  });
});

module.exports = router;
