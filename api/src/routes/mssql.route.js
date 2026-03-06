/**
 * MSSQL Routes
 * API endpoints for MS SQL Server database exploration and analysis.
 * All operations are READ-ONLY (readOnlyIntent: true).
 *
 * @module routes/mssql
 */

const express = require('express');
const router = express.Router();
const { MSSQLConnector } = require('../services/connectors');

// ═══════════════════════════════════════════════════════════════════════
// Singleton connector instance (per-process)
// ═══════════════════════════════════════════════════════════════════════

let connector = null;

const getConnector = () => {
  if (!connector) {
    connector = new MSSQLConnector();
  }
  return connector;
};

// ═══════════════════════════════════════════════════════════════════════
// CONNECTION LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/mssql/connect
 * Connect to MS SQL Server
 * Body: { server, database, port?, username?, password?, authentication?, encrypt?, trustServerCertificate? }
 */
router.post('/connect', async (req, res) => {
  try {
    const params = req.body;

    if (!params.server || !params.database) {
      return res.status(400).json({
        success: false,
        error: 'server and database are required'
      });
    }

    const result = await getConnector().connect(params);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[MSSQL API] Connect error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/mssql/disconnect
 * Disconnect from server
 */
router.post('/disconnect', async (req, res) => {
  try {
    await getConnector().disconnect();
    res.json({ success: true, message: 'Disconnected' });
  } catch (error) {
    console.error('[MSSQL API] Disconnect error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/mssql/status
 * Get connection status
 */
router.get('/status', async (req, res) => {
  try {
    const info = getConnector().getConnectionInfo();
    const connected = await getConnector().isConnected();
    res.json({ success: true, connected, ...info });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA DISCOVERY
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/mssql/schemas
 * Get list of user schemas with object counts
 */
router.get('/schemas', async (req, res) => {
  try {
    const schemas = await getConnector().getSchemas();
    res.json({ success: true, schemas, count: schemas.length });
  } catch (error) {
    console.error('[MSSQL API] Get schemas error:', error);
    res.status(error.message.includes('Not connected') ? 400 : 500)
       .json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/mssql/tables
 * Get tables and views
 * Query: schema?, includeViews=true, includeRowCounts=false
 */
router.get('/tables', async (req, res) => {
  try {
    const { schema, includeViews, includeRowCounts } = req.query;

    const tables = await getConnector().getTables({
      schema,
      includeViews: includeViews !== 'false',
      includeRowCounts: includeRowCounts === 'true',
    });

    res.json({ success: true, tables, count: tables.length });
  } catch (error) {
    console.error('[MSSQL API] Get tables error:', error);
    res.status(error.message.includes('Not connected') ? 400 : 500)
       .json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/mssql/columns/:schema/:table
 * Get detailed column information
 */
router.get('/columns/:schema/:table', async (req, res) => {
  try {
    const { schema, table } = req.params;
    const columns = await getConnector().getColumns(schema, table);
    res.json({ success: true, columns, count: columns.length });
  } catch (error) {
    console.error('[MSSQL API] Get columns error:', error);
    res.status(error.message.includes('Not connected') ? 400 : 500)
       .json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/mssql/constraints/:schema/:table
 * Get all constraints (PK, FK, UNIQUE, CHECK)
 */
router.get('/constraints/:schema/:table', async (req, res) => {
  try {
    const { schema, table } = req.params;
    const constraints = await getConnector().getConstraints(schema, table);
    res.json({ success: true, constraints, count: constraints.length });
  } catch (error) {
    console.error('[MSSQL API] Get constraints error:', error);
    res.status(error.message.includes('Not connected') ? 400 : 500)
       .json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/mssql/indexes/:schema/:table
 * Get table indexes
 */
router.get('/indexes/:schema/:table', async (req, res) => {
  try {
    const { schema, table } = req.params;
    const indexes = await getConnector().getIndexes(schema, table);
    res.json({ success: true, indexes, count: indexes.length });
  } catch (error) {
    console.error('[MSSQL API] Get indexes error:', error);
    res.status(error.message.includes('Not connected') ? 400 : 500)
       .json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PROCEDURES & DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/mssql/procedures
 * Get stored procedures and triggers
 * Query: schema?, includeTriggers=true, includeDefinition=true
 */
router.get('/procedures', async (req, res) => {
  try {
    const { schema, includeTriggers, includeDefinition } = req.query;

    const procedures = await getConnector().getProcedures({
      schema,
      includeTriggers: includeTriggers !== 'false',
      includeDefinition: includeDefinition !== 'false',
    });

    res.json({ success: true, procedures, count: procedures.length });
  } catch (error) {
    console.error('[MSSQL API] Get procedures error:', error);
    res.status(error.message.includes('Not connected') ? 400 : 500)
       .json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/mssql/dependencies
 * Get object dependencies
 * Query: schema?
 */
router.get('/dependencies', async (req, res) => {
  try {
    const { schema } = req.query;
    const dependencies = await getConnector().getDependencies(schema);
    res.json({ success: true, dependencies, count: dependencies.length });
  } catch (error) {
    console.error('[MSSQL API] Get dependencies error:', error);
    res.status(error.message.includes('Not connected') ? 400 : 500)
       .json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DATA SAMPLING & QUERIES
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/mssql/sample/:schema/:table
 * Sample data from a table for analysis
 * Body: { sampleSize?, includeDistinctValues?, includeStatistics? }
 */
router.post('/sample/:schema/:table', async (req, res) => {
  try {
    const { schema, table } = req.params;
    const { sampleSize, includeDistinctValues, includeStatistics } = req.body;

    const sample = await getConnector().sampleData(schema, table, {
      sampleSize: sampleSize || 50,
      includeDistinctValues: includeDistinctValues !== false,
      includeStatistics: includeStatistics !== false,
    });

    res.json({ success: true, sample });
  } catch (error) {
    console.error('[MSSQL API] Sample data error:', error);
    res.status(error.message.includes('Not connected') ? 400 : 500)
       .json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/mssql/query
 * Execute read-only query (DML/DDL blocked)
 * Body: { query, maxRows? }
 */
router.post('/query', async (req, res) => {
  try {
    const { query, maxRows } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'query is required'
      });
    }

    const result = await getConnector().executeReadOnlyQuery(query, maxRows);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[MSSQL API] Execute query error:', error);

    const status = error.message.includes('Blocked') || error.message.includes('Not connected')
      ? 400 : 500;

    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/mssql/row-counts
 * Get fast row counts via sys.partitions
 * Query: schema?
 */
router.get('/row-counts', async (req, res) => {
  try {
    const { schema } = req.query;
    const rowCounts = await getConnector().getRowCounts(schema);
    res.json({ success: true, rowCounts, count: rowCounts.length });
  } catch (error) {
    console.error('[MSSQL API] Get row counts error:', error);
    res.status(error.message.includes('Not connected') ? 400 : 500)
       .json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/mssql/overview
 * Full database overview (schemas + tables + row counts)
 */
router.get('/overview', async (req, res) => {
  try {
    const conn = getConnector();

    const [schemas, tables, rowCounts] = await Promise.all([
      conn.getSchemas(),
      conn.getTables({ includeViews: true, includeRowCounts: false }),
      conn.getRowCounts(),
    ]);

    // Group by schema
    const overview = schemas.map(schema => ({
      ...schema,
      tables: tables.filter(t => t.schema_name === schema.schema_name),
      rowCounts: rowCounts.filter(r => r.schema_name === schema.schema_name),
    }));

    res.json({
      success: true,
      connectionInfo: conn.getConnectionInfo(),
      overview,
      totals: {
        schemas: schemas.length,
        tables: tables.filter(t => t.table_type === 'TABLE').length,
        views: tables.filter(t => t.table_type === 'VIEW').length,
        totalRows: rowCounts.reduce((sum, r) => sum + (r.row_count || 0), 0),
      }
    });
  } catch (error) {
    console.error('[MSSQL API] Get overview error:', error);
    res.status(error.message.includes('Not connected') ? 400 : 500)
       .json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// IMPORT & ANALYZE (SSE)
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/mssql/import-analyze
 * SSE endpoint — full import pipeline with real-time progress streaming.
 * Query: domainId, connectionName, includeStructure, includeEntities, includeBusinessLogic, sampleRows, schemas
 */
const { streamImportAnalysis, streamAgentImport } = require('../controllers/mssql-import.controller');
const { assistantChat } = require('../controllers/mssql-assistant.controller');
router.get('/import-analyze', streamImportAnalysis);

/**
 * GET /api/v1/mssql/agent-import
 * SSE endpoint — agentic 9-phase spiral extraction with granular events.
 * Query: domainId, connectionName, includeStructure, includeEntities,
 *        includeBusinessLogic, enableMetaLearning, schemas
 */
router.get('/agent-import', streamAgentImport);

/**
 * POST /api/v1/mssql/assistant
 * AI assistant for extraction results Q&A.
 * Body: { message, sessionId, context }
 */
router.post('/assistant', assistantChat);

/**
 * GET /api/v1/mssql/extraction-sessions
 * List completed extraction sessions (for NEXUS SQL source filters).
 */
router.get('/extraction-sessions', async (req, res) => {
  try {
    const { IngestionGraphService } = require('../services/ingestion/ingestion-graph.service');
    const memgraphService = require('../services/memgraph.service');
    const ingestionGraph = new IngestionGraphService(memgraphService);

    const sessions = await ingestionGraph.getCompletedSessions(50);

    res.json({
      success: true,
      sessions: (sessions || []).map(s => ({
        id: s.id,
        sourceDatabase: s.sourceDatabase,
        sourceServer: s.sourceServer,
        completedAt: s.completedAt,
        qualityScore: s.qualityScore,
        tablesProcessed: s.tablesProcessed,
        entitiesDiscovered: s.entitiesDiscovered,
      })),
    });
  } catch (error) {
    console.error('[MSSQL] Get extraction sessions error:', error);
    res.json({ success: true, sessions: [] }); // Graceful fallback
  }
});

module.exports = router;
