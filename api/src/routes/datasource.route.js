/**
 * DataSource API Routes
 *
 * CRUD (legacy DataSourceDefinition):
 *   GET    /api/v1/datasources           - List data sources
 *   GET    /api/v1/datasources/:id       - Get by ID
 *   POST   /api/v1/datasources/:id/resolve - Resolve data
 *   POST   /api/v1/datasources           - Create
 *   PATCH  /api/v1/datasources/:id       - Update
 *   DELETE /api/v1/datasources/:id       - Delete
 *   POST   /api/v1/datasources/validate  - Validate config
 *
 * DataSource v2 Operations (executor-based):
 *   GET    /api/v1/datasources/:id/load         - Load all data
 *   GET    /api/v1/datasources/:id/search       - Autocomplete / search
 *   GET    /api/v1/datasources/:id/get/:itemId  - Get single item
 *   GET    /api/v1/datasources/:id/count        - Count items
 *   POST   /api/v1/datasources/:id/validate-value - Validate value exists
 *   DELETE /api/v1/datasources/:id/cache        - Invalidate cache
 */

const express = require('express');
const router = express.Router();

let _dsService = null;
function getDSService() {
  if (!_dsService) {
    const { DataSourceService } = require('../services/datasources');
    const { getMemgraphService } = require('../services/memgraph.service');
    let redisClient = null;
    try { redisClient = require('../services/redis.service'); } catch {}
    _dsService = new DataSourceService({ memgraphService: getMemgraphService(), redisClient });
  }
  return _dsService;
}

let _dsServiceV2 = null;
function getDSServiceV2() {
  if (!_dsServiceV2) {
    const { DataSourceService: DSServiceV2 } = require('../services/datasource.service');
    const { getMemgraphService } = require('../services/memgraph.service');
    _dsServiceV2 = new DSServiceV2(getMemgraphService());
  }
  return _dsServiceV2;
}

function getDSRegistry() {
  const { dataSourceRegistry, ensureExecutorsInitialized } = require('../datasource');
  ensureExecutorsInitialized();
  return dataSourceRegistry;
}

// ─── CRUD (legacy) ───────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { type, namespace, sourceType, status, limit, offset } = req.query;

    // Fetch from both v1 (legacy) and v2 services
    const [legacyItems, v2Items] = await Promise.all([
      getDSService().list({ type, namespace, status, limit: parseInt(limit) || 50, offset: parseInt(offset) || 0 }).catch(() => []),
      getDSServiceV2().list(namespace || null, { sourceType, limit: parseInt(limit) || 100 }).catch(() => []),
    ]);

    const combined = [...legacyItems, ...v2Items];
    res.json({ success: true, dataSources: combined, count: combined.length });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    // Try v2 first (DataSource nodes), then legacy (DataSourceDefinition)
    const v2 = await getDSServiceV2().get(req.params.id);
    if (v2) return res.json({ success: true, ...v2 });

    const ds = await getDSService().getById(req.params.id);
    if (!ds) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, ...ds });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/resolve', async (req, res) => {
  try {
    const result = await getDSService().resolve(req.params.id, req.body);
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    // v2 DataSource (has sourceType: SQL/KB/API/FILE/COMPOSITE)
    if (req.body.sourceType) {
      const graphId = await getDSServiceV2().create(req.body);
      const created = await getDSServiceV2().get(graphId);
      return res.status(201).json({ success: true, data: created });
    }
    // Legacy DataSourceDefinition (has type: STATIC_LIST/MEMGRAPH_QUERY/etc.)
    const ds = await getDSService().create(req.body);
    res.status(201).json({ success: true, ...ds });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    // v2 update
    if (req.body.sourceType || req.body.config || req.body.sqlConfig || req.body.kbConfig || req.body.apiConfig || req.body.fileConfig) {
      const updated = await getDSServiceV2().update(req.params.id, req.body);
      return res.json({ success: true, data: updated });
    }
    // Legacy update
    const ds = await getDSService().update(req.params.id, req.body);
    res.json({ success: true, ...ds });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    // Try v2 first, then legacy
    const v2Exists = await getDSServiceV2().exists(req.params.id);
    if (v2Exists) {
      await getDSServiceV2().delete(req.params.id);
      return res.json({ success: true, deleted: true });
    }
    const result = await getDSService().delete(req.params.id);
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/validate', async (req, res) => {
  try {
    const { type, config } = req.body;
    res.json(getDSService().validateConfig(type, config));
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── V2 Data Operations (executor-based) ─────────────────────────────────────

router.get('/:id/load', async (req, res) => {
  try {
    const ds = await getDSServiceV2().get(req.params.id);
    if (!ds) return res.status(404).json({ success: false, error: 'DataSource not found' });

    const { limit, offset, ...filters } = req.query;
    const result = await getDSRegistry().execute(ds, 'loadAll', {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      filters,
    });
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id/search', async (req, res) => {
  try {
    const ds = await getDSServiceV2().get(req.params.id);
    if (!ds) return res.status(404).json({ success: false, error: 'DataSource not found' });

    const { q, query, limit = 10, ...filters } = req.query;
    const result = await getDSRegistry().execute(ds, 'search', {
      query: q || query,
      limit: parseInt(limit, 10),
      filters,
    });
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id/get/:itemId', async (req, res) => {
  try {
    const ds = await getDSServiceV2().get(req.params.id);
    if (!ds) return res.status(404).json({ success: false, error: 'DataSource not found' });

    const item = await getDSRegistry().execute(ds, 'getById', { id: req.params.itemId });
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/:id/count', async (req, res) => {
  try {
    const ds = await getDSServiceV2().get(req.params.id);
    if (!ds) return res.status(404).json({ success: false, error: 'DataSource not found' });

    const count = await getDSRegistry().execute(ds, 'count', { filters: req.query });
    res.json({ success: true, count });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/validate-value', async (req, res) => {
  try {
    const ds = await getDSServiceV2().get(req.params.id);
    if (!ds) return res.status(404).json({ success: false, error: 'DataSource not found' });

    const { value, field } = req.body;
    const valid = await getDSRegistry().execute(ds, 'validate', { value, field });
    res.json({ success: true, valid });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/:id/cache', async (req, res) => {
  try {
    const ds = await getDSServiceV2().get(req.params.id);
    if (!ds) return res.status(404).json({ success: false, error: 'DataSource not found' });

    const executor = getDSRegistry().getExecutor(ds.sourceType);
    await executor.invalidateCache(ds);
    res.json({ success: true, message: 'Cache invalidated' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── AI Assistant for DataSource configuration (with tool-use) ───────────────

const TOOL_INSTRUCTIONS = `
You have access to tools to inspect data sources and update form fields directly.

TOOLS AVAILABLE:
- update_form_fields: Update one or more DataSource form fields. Call this when the user asks to configure something.
- query_knowledge_base: Execute a Cypher query on Memgraph to discover schema or preview data (KB type).
- get_kb_schema: Get labels, node counts, and relationship types from the Knowledge Base (KB type).
- get_sql_tables: Get table list from connected SQL Server (SQL type).
- get_sql_columns: Get columns for a specific table (SQL type).
- test_query: Test a Cypher or SQL query and return sample results.

WORKFLOW:
1. When the user describes what they need, FIRST use inspection tools to understand the data structure.
2. Then use update_form_fields to fill in the DataSource configuration.
3. Explain what you did and why.

Always use update_form_fields to apply changes — do NOT just return JSON blocks.`;

const DS_SYSTEM_PROMPTS = {
  SQL: `You are an expert SQL developer assistant. You help configure DataSource form fields for SQL Server databases.
${TOOL_INSTRUCTIONS}
SQL-specific fields: sqlConfig.connectionId, sqlConfig.query, sqlConfig.searchQuery, sqlConfig.countQuery, sqlConfig.searchField, config.valueField, config.labelField.
Use parameterized queries with @searchText for search. Always include ORDER BY.`,

  KB: `You are a Knowledge Graph / Cypher expert. You help configure DataSource form fields for Memgraph queries.
${TOOL_INSTRUCTIONS}
KB-specific fields: kbConfig.queryType, kbConfig.cypherQuery, kbConfig.cypherSearchQuery, kbConfig.cypherCountQuery, kbConfig.namespace, config.valueField, config.labelField.
Use Memgraph-compatible Cypher. Use $searchPattern for regex, $limit for limiting. No APOC.
ALWAYS start by calling get_kb_schema to understand what's available.`,

  API: `You are a REST API integration expert. You help configure DataSource form fields for external APIs.
${TOOL_INSTRUCTIONS}
API-specific fields: apiConfig.endpoint, apiConfig.method, apiConfig.responsePath, apiConfig.totalPath, apiConfig.authType, apiConfig.headers, config.valueField, config.labelField.`,

  FILE: `You are a data file expert. You help configure DataSource form fields for JSON/CSV files.
${TOOL_INSTRUCTIONS}
FILE-specific fields: fileConfig.filePath, fileConfig.format, fileConfig.delimiter, fileConfig.hasHeader, fileConfig.encoding, config.valueField, config.labelField.`,

  COMPOSITE: `You are a data integration expert. You help configure Composite DataSource form fields.
${TOOL_INSTRUCTIONS}
COMPOSITE-specific fields: compositeConfig.mergeStrategy, compositeConfig.sources, config.valueField, config.labelField.`,
};

const AI_TOOLS = [
  {
    name: 'update_form_fields',
    description: 'Update DataSource form fields. Pass an object with field paths as keys and values to set. Example: {"sqlConfig.query": "SELECT ...", "config.valueField": "id"}',
    input_schema: {
      type: 'object',
      properties: {
        fields: { type: 'object', description: 'Object mapping field paths to values. E.g. {"kbConfig.cypherQuery": "MATCH (n) RETURN n", "config.valueField": "id"}' }
      },
      required: ['fields']
    }
  },
  {
    name: 'query_knowledge_base',
    description: 'Execute a read-only Cypher query on Memgraph and return results (max 10 rows). Use for discovery and preview.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Cypher MATCH/RETURN query' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_kb_schema',
    description: 'Get Knowledge Base schema: node labels with counts, relationship types.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_sql_tables',
    description: 'Get list of tables from connected SQL Server with row counts.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_sql_columns',
    description: 'Get columns for a specific SQL table.',
    input_schema: {
      type: 'object',
      properties: {
        schema: { type: 'string', default: 'dbo' },
        table: { type: 'string' }
      },
      required: ['table']
    }
  },
  {
    name: 'test_query',
    description: 'Test a query (Cypher or SQL) and return up to 5 sample rows.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        engine: { type: 'string', enum: ['cypher', 'sql'], default: 'cypher' }
      },
      required: ['query']
    }
  }
];

// Tool executor
async function executeAiTool(toolName, toolInput) {
  try {
    switch (toolName) {
      case 'update_form_fields':
        // Return the fields to the frontend for application
        return { applied: true, fields: toolInput.fields };

      case 'get_kb_schema': {
        const { getMemgraphService } = require('../services/memgraph.service');
        const mg = getMemgraphService();
        const [labelRows, relRows] = await Promise.all([
          mg.runQuery('MATCH (n) RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC LIMIT 30'),
          mg.runQuery('MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS cnt ORDER BY cnt DESC LIMIT 20'),
        ]);
        return {
          labels: labelRows.map(r => ({ label: r.label, count: typeof r.cnt === 'object' ? r.cnt.toNumber?.() ?? r.cnt : r.cnt })),
          relationships: relRows.map(r => ({ type: r.type, count: typeof r.cnt === 'object' ? r.cnt.toNumber?.() ?? r.cnt : r.cnt })),
        };
      }

      case 'query_knowledge_base': {
        const { getMemgraphService } = require('../services/memgraph.service');
        const mg = getMemgraphService();
        const q = toolInput.query;
        if (/\b(CREATE|DELETE|SET|REMOVE|DROP|MERGE)\b/i.test(q)) return { error: 'Write operations not allowed' };
        const rows = await mg.runQuery(q + (q.toLowerCase().includes('limit') ? '' : ' LIMIT 10'));
        return { rows: rows.slice(0, 10) };
      }

      case 'get_sql_tables': {
        const { getMSSQLConnector } = require('../services/connectors/mssql.connector');
        const conn = getMSSQLConnector();
        const tables = await conn.getTables({ includeRowCounts: true });
        return { tables: (tables || []).slice(0, 30).map(t => ({ schema: t.schema, name: t.name, rows: t.rowCount })) };
      }

      case 'get_sql_columns': {
        const { getMSSQLConnector } = require('../services/connectors/mssql.connector');
        const conn = getMSSQLConnector();
        const cols = await conn.getColumns(toolInput.schema || 'dbo', toolInput.table);
        return { columns: cols };
      }

      case 'test_query': {
        if (toolInput.engine === 'sql') {
          const { getMSSQLConnector } = require('../services/connectors/mssql.connector');
          const conn = getMSSQLConnector();
          const result = await conn.executeReadOnlyQuery(toolInput.query + ' OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY');
          return { rows: result?.slice(0, 5) || [] };
        } else {
          const { getMemgraphService } = require('../services/memgraph.service');
          const mg = getMemgraphService();
          const rows = await mg.runQuery(toolInput.query + (toolInput.query.toLowerCase().includes('limit') ? '' : ' LIMIT 5'));
          return { rows: rows.slice(0, 5) };
        }
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

router.post('/ai-assist', async (req, res) => {
  const t0 = Date.now();
  const log = (msg) => console.log(`[DS AI Assist ${Date.now() - t0}ms] ${msg}`);

  // Prevent Express/Node from holding the connection open indefinitely
  req.setTimeout(65000);
  res.setTimeout(65000);

  try {
    const { type, message, formFields, history } = req.body;
    log(`START type=${type} msg="${(message || '').slice(0, 60)}"`);

    if (!message) return res.status(400).json({ success: false, error: 'message is required' });

    const systemPrompt = DS_SYSTEM_PROMPTS[type] || DS_SYSTEM_PROMPTS.SQL;

    let llmService;
    try {
      const { getInstance: getLLMProvider } = require('../services/llm/LLMProviderService');
      llmService = getLLMProvider();
      log(`LLMProviderService loaded, type=${llmService.type}`);
    } catch (e) {
      log(`ERROR loading LLMProviderService: ${e.message}`);
      return res.status(503).json({ success: false, error: `LLM service not available: ${e.message}` });
    }

    const formContext = formFields
      ? `\n\nCurrent form state:\n${JSON.stringify(formFields, null, 2).slice(0, 1500)}`
      : '';

    const messages = [
      { role: 'system', content: systemPrompt + formContext },
      ...(history || []).slice(-8),
      { role: 'user', content: message },
    ];
    log(`messages=${messages.length}, system=${systemPrompt.length}ch, formContext=${formContext.length}ch`);

    const toolActions = [];

    // EXCEPTION: Direct llm.service usage required for tool loop-back (lines below up to llmService.chat call).
    // LLMProviderService does not support recursive tool execution with a caller-supplied toolExecutor callback.
    // TODO: Evaluate adding loop-back support to LLMProviderService and migrate this route.
    const toolExecutor = async (name, input) => {
      log(`TOOL CALL: ${name}(${JSON.stringify(input).slice(0, 120)})`);
      const result = await executeAiTool(name, input);
      log(`TOOL RESULT: ${name} → ${JSON.stringify(result).slice(0, 200)}`);
      if (name === 'update_form_fields' && result.applied) {
        toolActions.push(result.fields);
      }
      return result;
    };

    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY || llmService.type === 'azure';
    const useTools = hasAnthropicKey;
    log(`provider=${llmService.type}, useTools=${useTools}`);

    log('calling llmService.chat()...');

    // Extract system from messages (LLMProviderService takes system as option)
    let systemContent = '';
    const chatMessages = messages.filter(m => {
      if (m.role === 'system') { systemContent += (systemContent ? '\n\n' : '') + m.content; return false; }
      return true;
    });

    const chatOpts = { maxTokens: 4096 };
    if (systemContent) chatOpts.system = systemContent;
    if (useTools && AI_TOOLS?.length) chatOpts.tools = AI_TOOLS;

    const result = await Promise.race([
      llmService.chat(chatMessages, chatOpts),
      new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), 60000)),
    ]);
    log(`chat returned, type=${typeof result}, keys=${result ? Object.keys(result).join(',') : 'null'}`);

    let response = '';
    if (typeof result === 'string') {
      response = result;
    } else if (typeof result?.content === 'string') {
      response = result.content;
    } else if (Array.isArray(result?.content)) {
      response = result.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    } else {
      response = result?.message || result?.text || JSON.stringify(result || '');
    }

    log(`response=${response.length}ch, toolActions=${toolActions.length}, DONE`);

    res.json({
      success: true,
      response,
      fieldUpdates: toolActions.length > 0 ? Object.assign({}, ...toolActions) : null,
    });
  } catch (e) {
    log(`ERROR: ${e.message}`);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
