// src/services/rabbithole.service.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || "gemini-flash-latest";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function chat(message, currentFilters, visibleItems, visibleColumns, fieldDefinitions) {
    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL_NAME,
        generationConfig: {
            responseMimeType: "application/json"
        }
    });

    const systemPrompt = `
You are the "Rabbit Hole Guide", an AI assistant for a DevOps search tool called "The Rabbit Hole".
Your persona is slightly ironic, witty, but extremely helpful. You help users "dig deep" into their backlog.

CONTEXT:
- Current Filters: ${JSON.stringify(currentFilters)}
- Visible Work Items (Top 20): ${JSON.stringify(visibleItems.slice(0, 20))}
- Available Columns: ${JSON.stringify(Object.keys(fieldDefinitions || {}))}
- Visible Columns: ${JSON.stringify(visibleColumns || [])}

GOAL:
- Interpret the user's request.
- If the user wants to filter data (e.g., "show me bugs", "assigned to Bob"), generate an "UPDATE_FILTERS" action.
- If the user wants to change visible columns (e.g., "show me the ID", "hide the state", "add Area Path"), generate an "UPDATE_COLUMNS" action.
- If the user asks about the visible data (e.g., "summarize these items"), answer based on the "Visible Work Items".

RESPONSE FORMAT:
You must ALWAYS return a JSON object with the following structure:
{
    "text": "Your response to the user (ironic but helpful).",
    "action": {
        "type": "UPDATE_FILTERS" | "UPDATE_COLUMNS" | null,
        "payload": ...
    }
}

Action Payloads:
1. UPDATE_FILTERS:
{
    "title": "string or null",
    "state": "string or null",
    "assignedTo": "string or null",
    "areaPath": "string or null",
    "iterationPath": "string or null",
    "type": "string or null"
}

2. UPDATE_COLUMNS:
{
    "columns": ["System.Id", "System.Title", ...] // The COMPLETE list of columns to show.
}
IMPORTANT: When updating columns, you must provide the FULL list of columns you want visible, not just the changes. Start with the "Visible Columns" from context and add/remove as requested. Ensure "System.Id" and "System.Title" are always present unless explicitly asked to remove (which is rare).

If no update is needed, set "action" to null.
    `;

    const chat = model.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: systemPrompt }]
            },
            {
                role: "model",
                parts: [{ text: JSON.stringify({ text: "I'm ready to dig. What are we looking for?", action: null }) }]
            }
        ]
    });

    try {
        const result = await chat.sendMessage(message);
        const responseText = result.response.text();
        return JSON.parse(responseText);
    } catch (error) {
        console.error("[RabbitHole Service] Error:", error);
        return {
            text: "I hit a rock while digging. Something went wrong.",
            action: null
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════
// MSSQL INGESTION PIPELINE
// ═══════════════════════════════════════════════════════════════════════

let _mssqlServices = null;

/**
 * Lazy-load MSSQL services to avoid circular dependencies
 */
function _getMSSQLServices() {
  if (!_mssqlServices) {
    const { MSSQLConnector, MSSQLSemanticAnalyzer, MSSQLGraphGenerator } = require('./connectors');
    const { DomainService, CredentialStore } = require('./domain');
    const memgraphService = require('./memgraph.service');
    const qdrantService = require('./qdrant.service');
    const redisService = require('./redis.service');

    const credentialStore = new CredentialStore(
      redisService.getClient ? redisService.getClient() : redisService
    );
    const domainService = new DomainService(memgraphService, qdrantService, credentialStore);

    _mssqlServices = {
      MSSQLConnector,
      MSSQLSemanticAnalyzer,
      MSSQLGraphGenerator,
      domainService,
      memgraphService,
      qdrantService,
    };
  }
  return _mssqlServices;
}

/**
 * Ingest from MSSQL data source — full pipeline with progress callback.
 *
 * Phases:
 *   1. Domain Switch — activate domain, resolve credentials
 *   2. MSSQL Connect — open read-only connection
 *   3. Semantic Analysis — LLM-powered schema analysis
 *   4. Graph Generation — ER graph + vectorisation
 *   5. Cleanup — disconnect, emit summary
 *
 * @param {object} options
 * @param {string} options.domainId       - Target domain ID
 * @param {string} options.connectionName - Data source name within domain
 * @param {string} [options.schema]       - Optional schema filter
 * @param {boolean} [options.skipLLM]     - Skip LLM analysis (heuristics only)
 * @param {function} progressCallback     - (phase, message, progress%) => void
 * @returns {Promise<object>} ingestion result summary
 */
async function ingestFromMSSQL(options, progressCallback = () => {}) {
  const { domainId, connectionName, schema, skipLLM = false } = options;
  const services = _getMSSQLServices();
  const connector = new services.MSSQLConnector();
  const startTime = Date.now();
  let extractionCycleId = null;

  const progress = (phase, message, pct) => {
    try { progressCallback(phase, message, pct); } catch (_) { /* noop */ }
  };

  try {
    // ── Phase 1: Domain Switch ─────────────────────────────────────────
    progress('domain', 'Switching domain context...', 5);

    await services.domainService.switchDomain(domainId);
    const { config: dsConfig, credentials } = await services.domainService.getDataSourceWithCredentials(connectionName);

    if (dsConfig.sourceType !== 'MSSQL') {
      throw new Error(`Data source '${connectionName}' is type '${dsConfig.sourceType}', expected MSSQL`);
    }

    progress('domain', `Domain switched: ${domainId}`, 10);

    // ── Phase 2: MSSQL Connect ─────────────────────────────────────────
    progress('connect', 'Connecting to SQL Server...', 15);

    const connectResult = await connector.connect({
      ...dsConfig.connectionParams,
      ...credentials,
    });

    if (!connectResult.success) {
      throw new Error(`MSSQL connection failed: ${connectResult.error}`);
    }

    progress('connect', `Connected: ${connectResult.serverName} / ${connectResult.databaseName}`, 20);

    // ── Phase 3: Semantic Analysis ─────────────────────────────────────
    progress('analysis', 'Starting schema analysis...', 25);

    const analyzer = new services.MSSQLSemanticAnalyzer();
    const analysisResult = await analyzer.analyzeDatabase(connector, {
      schema,
      skipLLM,
      onTableAnalyzed: (tableName, idx, total) => {
        const pct = 25 + Math.round((idx / total) * 35); // 25% → 60%
        progress('analysis', `Analyzed: ${tableName} (${idx}/${total})`, pct);
      },
    });

    progress('analysis', `Analysis complete: ${analysisResult.tables?.length || 0} tables`, 60);

    // ── Phase 4: Graph Generation ──────────────────────────────────────
    progress('graph', 'Generating knowledge graph...', 65);

    const namespace = services.domainService.getCurrentNamespace();
    const generator = new services.MSSQLGraphGenerator(
      services.memgraphService,
      services.qdrantService
    );

    const graphResult = await generator.generateERGraph(analysisResult, {
      containerLabel: namespace || `PROJECT:${domainId}`,
      qdrantCollection: `domain_${domainId}`,
      onProgress: (msg, subPct) => {
        const pct = 65 + Math.round(subPct * 0.25); // 65% → 90%
        progress('graph', msg, pct);
      },
    });

    extractionCycleId = graphResult.extractionCycleId;

    progress('graph', `Graph created: ${graphResult.nodesCreated} nodes, ${graphResult.edgesCreated} edges`, 90);

    // Update sync status in domain
    await services.domainService.updateSyncStatus(domainId, connectionName, {
      lastSync: new Date().toISOString(),
      status: 'success',
      nodesCreated: graphResult.nodesCreated,
      edgesCreated: graphResult.edgesCreated,
      extractionCycleId,
    });

    // ── Phase 5: Cleanup ───────────────────────────────────────────────
    progress('cleanup', 'Disconnecting...', 95);
    await connector.disconnect();

    const elapsed = Date.now() - startTime;
    const summary = {
      success: true,
      domainId,
      connectionName,
      extractionCycleId,
      tables: analysisResult.tables?.length || 0,
      procedures: analysisResult.procedures?.length || 0,
      nodesCreated: graphResult.nodesCreated,
      edgesCreated: graphResult.edgesCreated,
      vectorsStored: graphResult.vectorsStored || 0,
      elapsedMs: elapsed,
      elapsedFormatted: `${Math.round(elapsed / 1000)}s`,
    };

    progress('done', 'Ingestion complete!', 100);
    return summary;

  } catch (error) {
    console.error('[RabbitHole MSSQL] Ingestion error:', error);

    // Attempt cleanup
    try { await connector.disconnect(); } catch (_) { /* noop */ }

    // Update sync status with failure
    try {
      await services.domainService.updateSyncStatus(domainId, connectionName, {
        lastSync: new Date().toISOString(),
        status: 'failed',
        error: error.message,
        extractionCycleId,
      });
    } catch (_) { /* noop */ }

    progress('error', error.message, -1);

    return {
      success: false,
      domainId,
      connectionName,
      extractionCycleId,
      error: error.message,
      elapsedMs: Date.now() - startTime,
    };
  }
}

module.exports = {
    chat,
    ingestFromMSSQL,
};
