/**
 * MssqlImportOrchestrator
 *
 * Coordinates the full SQL Server import pipeline:
 *   Connect → Discover → Analyze (LLM) → Generate Graphs → Return ReactFlow-compatible data
 *
 * Emits SSE events at every step so the frontend can display real-time progress.
 */

const { v4: uuidv4 } = require('uuid');
const { SYSTEM_SCHEMAS } = require('../../config/mssql.config');

class MssqlImportOrchestrator {
  /**
   * @param {object} deps
   * @param {import('./mssql.connector')} deps.connector - MSSQLConnector instance
   * @param {import('./mssql.analyzer')} deps.analyzer - MSSQLSemanticAnalyzer instance
   * @param {Function} deps.emit - (eventType: string, data: object) => void
   */
  constructor({ connector, analyzer, emit }) {
    this.connector = connector;
    this.analyzer = analyzer;
    this.emit = emit || (() => {});
    this.currentPhase = 'init';
  }

  /**
   * Run the full import pipeline.
   * @param {object} connectionConfig - server, port, database, username, password, etc.
   * @param {object} options
   * @returns {Promise<{graphs: object[], summary: object}>}
   */
  async runFullImport(connectionConfig, options = {}) {
    const {
      includeStructure = true,
      includeEntities = true,
      includeBusinessLogic = true,
      sampleRows = 5,
      schemas = null,
      analyzeProcedures = true,
    } = options;

    const allTableAnalysis = [];
    const procedureAnalysis = [];
    const graphs = [];

    try {
      // ═══════════════════════════════════════════════════════════════
      // 1. Connect
      // ═══════════════════════════════════════════════════════════════
      this.currentPhase = 'connecting';
      this.emit('log', { level: 'info', message: `Connecting to ${connectionConfig.server}/${connectionConfig.database}...` });

      const connResult = await this.connector.connect({
        server: connectionConfig.server,
        port: connectionConfig.port || 1433,
        database: connectionConfig.database,
        username: connectionConfig.username,
        password: connectionConfig.password,
        domain: connectionConfig.domain,
        encrypt: connectionConfig.encryption ?? true,
        trustServerCertificate: connectionConfig.trustServerCertificate ?? true,
        protocol: connectionConfig.protocol || 'tcp',
        instanceName: connectionConfig.instanceName || undefined,
        connectionName: `import-${Date.now()}`,
      });

      if (!connResult.success) {
        throw new Error(`Connection failed: ${connResult.error}`);
      }

      this.emit('connected', {
        server: connectionConfig.server,
        database: connectionConfig.database,
        version: connResult.version,
      });

      // ═══════════════════════════════════════════════════════════════
      // 2. Schema Discovery
      // ═══════════════════════════════════════════════════════════════
      this.currentPhase = 'discovery';
      this.emit('log', { level: 'info', message: 'Discovering schemas...' });

      const schemaList = await this.connector.getSchemas();
      const systemSchemas = SYSTEM_SCHEMAS || [
        'sys', 'INFORMATION_SCHEMA', 'guest', 'db_owner',
        'db_accessadmin', 'db_securityadmin', 'db_ddladmin',
        'db_backupoperator', 'db_datareader', 'db_datawriter',
        'db_denydatareader', 'db_denydatawriter',
      ];

      const targetSchemas = schemas
        ? schemaList.filter(s => schemas.includes(s.schema_name))
        : schemaList.filter(s => !systemSchemas.includes(s.schema_name));

      const schemaNames = targetSchemas.map(s => s.schema_name);
      this.emit('schemas_found', { count: schemaNames.length, names: schemaNames });

      // ═══════════════════════════════════════════════════════════════
      // 3. Table Discovery
      // ═══════════════════════════════════════════════════════════════
      this.currentPhase = 'tables';
      let allTables = [];

      for (const schema of schemaNames) {
        const tables = await this.connector.getTables({ schema, includeViews: true, includeRowCounts: true });
        for (const t of tables) {
          allTables.push({ ...t, schema_name: schema });
        }
      }

      this.emit('tables_found', { total: allTables.length });
      this.emit('log', { level: 'info', message: `Found ${allTables.length} tables/views across ${schemaNames.length} schemas` });

      // ═══════════════════════════════════════════════════════════════
      // 4. Per-table Analysis
      // ═══════════════════════════════════════════════════════════════
      this.currentPhase = 'analyzing';

      for (let i = 0; i < allTables.length; i++) {
        const t = allTables[i];
        const schema = t.schema_name;
        const table = t.table_name;

        this.emit('analyzing_table', {
          schema,
          table,
          index: i + 1,
          total: allTables.length,
        });

        try {
          const columns = await this.connector.getColumns(schema, table);
          const constraints = await this.connector.getConstraints(schema, table);

          let sample = null;
          if (sampleRows > 0) {
            try {
              sample = await this.connector.sampleData(schema, table, { sampleSize: sampleRows });
            } catch (_) { /* sample may fail for views */ }
          }

          // LLM analysis
          const analysis = await this.analyzer.analyzeTable(
            { schema_name: schema, table_name: table, ...t },
            columns,
            constraints,
            sample,
            { database: connectionConfig.database }
          );

          allTableAnalysis.push({
            schema,
            table,
            columns,
            constraints,
            sample,
            analysis,
            tableInfo: t,
          });

          this.emit('table_analyzed', {
            schema,
            table,
            entityType: analysis?.entityName || table,
            columnsCount: columns.length,
          });
        } catch (err) {
          this.emit('log', {
            level: 'warning',
            message: `Failed to analyze ${schema}.${table}: ${err.message}`,
          });
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 5. Procedures Analysis
      // ═══════════════════════════════════════════════════════════════
      if (analyzeProcedures) {
        this.currentPhase = 'procedures';
        this.emit('log', { level: 'info', message: 'Discovering stored procedures...' });

        let procedures = [];
        try {
          procedures = await this.connector.getProcedures({ includeDefinition: true });
        } catch (err) {
          this.emit('log', { level: 'warning', message: `Failed to get procedures: ${err.message}` });
        }

        this.emit('procedures_found', { count: procedures.length });

        for (let i = 0; i < procedures.length; i++) {
          const proc = procedures[i];
          this.emit('analyzing_procedure', {
            name: proc.object_name || proc.name,
            index: i + 1,
            total: procedures.length,
          });

          try {
            const procAnalysis = await this.analyzer.analyzeProcedure(proc);
            procedureAnalysis.push({ ...proc, analysis: procAnalysis });

            this.emit('procedure_analyzed', {
              name: proc.object_name || proc.name,
              businessRules: procAnalysis?.businessRules?.length || 0,
            });
          } catch (err) {
            this.emit('log', {
              level: 'warning',
              message: `Failed to analyze procedure ${proc.object_name}: ${err.message}`,
            });
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // 6. Generate ReactFlow-compatible Graphs
      // ═══════════════════════════════════════════════════════════════
      this.currentPhase = 'generating';

      if (includeStructure) {
        this.emit('generating_graphs', { type: 'structure', message: 'Generating ER structure graph...' });
        const structureGraph = this._buildStructureGraph(allTableAnalysis, connectionConfig.database);
        graphs.push({ type: 'structure', title: `${connectionConfig.database} — Structure`, ...structureGraph });
        this.emit('graph_ready', { type: 'structure', nodes: structureGraph.nodes.length, edges: structureGraph.edges.length });
      }

      if (includeEntities && allTableAnalysis.length > 0) {
        this.emit('generating_graphs', { type: 'entities', message: 'Generating entity relationship graph...' });
        const entityGraph = this._buildEntityGraph(allTableAnalysis, connectionConfig.database);
        graphs.push({ type: 'entities', title: `${connectionConfig.database} — Entities`, ...entityGraph });
        this.emit('graph_ready', { type: 'entities', nodes: entityGraph.nodes.length, edges: entityGraph.edges.length });
      }

      if (includeBusinessLogic && procedureAnalysis.length > 0) {
        this.emit('generating_graphs', { type: 'businessLogic', message: 'Generating business logic graph...' });
        const blGraph = this._buildBusinessLogicGraph(procedureAnalysis, connectionConfig.database);
        graphs.push({ type: 'businessLogic', title: `${connectionConfig.database} — Business Logic`, ...blGraph });
        this.emit('graph_ready', { type: 'businessLogic', nodes: blGraph.nodes.length, edges: blGraph.edges.length });
      }

      // ═══════════════════════════════════════════════════════════════
      // 7. Summary
      // ═══════════════════════════════════════════════════════════════
      const totalNodes = graphs.reduce((s, g) => s + g.nodes.length, 0);
      const totalEdges = graphs.reduce((s, g) => s + g.edges.length, 0);

      const summary = {
        database: connectionConfig.database,
        server: connectionConfig.server,
        schemasAnalyzed: schemaNames.length,
        tablesAnalyzed: allTableAnalysis.length,
        proceduresAnalyzed: procedureAnalysis.length,
        graphsGenerated: graphs.length,
        totalNodes,
        totalEdges,
      };

      this.emit('complete', { graphs, summary });
      return { graphs, summary };

    } catch (error) {
      this.emit('error_event', {
        message: error.message,
        phase: this.currentPhase,
        recoverable: error.code === 'ETIMEOUT' || error.code === 'ECONNRESET',
      });
      throw error;
    } finally {
      try { await this.connector.disconnect(); } catch (_) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ReactFlow Graph Builders
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build ER Structure graph — schemas, tables, columns as ReactFlow nodes/edges.
   */
  _buildStructureGraph(tableAnalyses, dbName) {
    const nodes = [];
    const edges = [];
    let y = 0;

    // Database root node
    const dbId = `db_${dbName}`;
    nodes.push({
      id: dbId,
      type: 'default',
      position: { x: 400, y: 0 },
      data: { label: dbName, kind: 'database', description: `Database: ${dbName}` },
    });

    const schemaMap = {};
    for (const ta of tableAnalyses) {
      if (!schemaMap[ta.schema]) schemaMap[ta.schema] = [];
      schemaMap[ta.schema].push(ta);
    }

    let schemaX = 0;
    for (const [schema, tables] of Object.entries(schemaMap)) {
      y += 150;
      const schemaId = `schema_${schema}`;
      nodes.push({
        id: schemaId,
        type: 'default',
        position: { x: schemaX, y },
        data: { label: schema, kind: 'schema', description: `Schema: ${schema} (${tables.length} tables)` },
      });
      edges.push({ id: `e_${dbId}_${schemaId}`, source: dbId, target: schemaId, label: 'CONTAINS' });

      let tableY = y + 120;
      for (const ta of tables) {
        const tableId = `table_${schema}_${ta.table}`;
        nodes.push({
          id: tableId,
          type: 'default',
          position: { x: schemaX, y: tableY },
          data: {
            label: ta.table,
            kind: 'table',
            description: ta.analysis?.entityDescription || `Table: ${schema}.${ta.table}`,
            entityName: ta.analysis?.entityName,
            businessDomain: ta.analysis?.businessDomain,
            columnsCount: ta.columns?.length || 0,
            rowCount: ta.tableInfo?.row_count,
          },
        });
        edges.push({ id: `e_${schemaId}_${tableId}`, source: schemaId, target: tableId, label: 'CONTAINS' });

        // FK edges
        for (const col of ta.columns || []) {
          if (col.referenced_table && col.referenced_schema) {
            const targetId = `table_${col.referenced_schema}_${col.referenced_table}`;
            edges.push({
              id: `fk_${tableId}_${targetId}_${col.column_name}`,
              source: tableId,
              target: targetId,
              label: `FK: ${col.column_name}`,
              data: { type: 'foreignKey', column: col.column_name },
            });
          }
        }

        tableY += 100;
      }
      schemaX += 350;
    }

    return { nodes, edges };
  }

  /**
   * Build Entity Relationship graph — business entities inferred by LLM.
   */
  _buildEntityGraph(tableAnalyses, dbName) {
    const nodes = [];
    const edges = [];
    const entityMap = new Map(); // entityName -> nodeId

    let x = 0, y = 0;
    const cols = 4;

    for (let i = 0; i < tableAnalyses.length; i++) {
      const ta = tableAnalyses[i];
      const entityName = ta.analysis?.entityName || ta.table;
      const nodeId = `entity_${ta.schema}_${ta.table}`;

      x = (i % cols) * 300;
      y = Math.floor(i / cols) * 200;

      nodes.push({
        id: nodeId,
        type: 'default',
        position: { x, y },
        data: {
          label: entityName,
          kind: 'entity',
          description: ta.analysis?.entityDescription || '',
          businessDomain: ta.analysis?.businessDomain || 'Unknown',
          confidence: ta.analysis?.confidence,
          sourceTable: `${ta.schema}.${ta.table}`,
          columns: (ta.columns || []).map(c => c.column_name),
        },
      });

      entityMap.set(`${ta.schema}.${ta.table}`, nodeId);
    }

    // Build relationship edges from FK info
    for (const ta of tableAnalyses) {
      const sourceId = entityMap.get(`${ta.schema}.${ta.table}`);
      for (const col of ta.columns || []) {
        if (col.referenced_table && col.referenced_schema) {
          const targetId = entityMap.get(`${col.referenced_schema}.${col.referenced_table}`);
          if (sourceId && targetId && sourceId !== targetId) {
            edges.push({
              id: `rel_${sourceId}_${targetId}_${col.column_name}`,
              source: sourceId,
              target: targetId,
              label: 'REFERENCES',
              data: { column: col.column_name, type: 'reference' },
            });
          }
        }
      }

      // Add inferred relationships from LLM analysis
      for (const rel of ta.analysis?.relationships || []) {
        if (rel.targetTable) {
          const targetId = entityMap.get(rel.targetTable) || entityMap.get(`dbo.${rel.targetTable}`);
          if (sourceId && targetId && sourceId !== targetId) {
            const edgeId = `inferred_${sourceId}_${targetId}_${rel.type || 'RELATED_TO'}`;
            if (!edges.find(e => e.id === edgeId)) {
              edges.push({
                id: edgeId,
                source: sourceId,
                target: targetId,
                label: rel.type || 'RELATED_TO',
                data: { type: 'inferred', cardinality: rel.cardinality },
                style: { strokeDasharray: '5 5' },
              });
            }
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Build Business Logic graph — procedures, rules, dependencies.
   */
  _buildBusinessLogicGraph(procedureAnalyses, dbName) {
    const nodes = [];
    const edges = [];

    let x = 0, y = 0;
    const cols = 3;

    for (let i = 0; i < procedureAnalyses.length; i++) {
      const proc = procedureAnalyses[i];
      const nodeId = `proc_${proc.schema_name || 'dbo'}_${proc.object_name}`;

      x = (i % cols) * 350;
      y = Math.floor(i / cols) * 250;

      nodes.push({
        id: nodeId,
        type: 'default',
        position: { x, y },
        data: {
          label: proc.object_name || proc.name,
          kind: 'procedure',
          description: proc.analysis?.businessPurpose || '',
          complexity: proc.analysis?.complexity,
          schema: proc.schema_name,
        },
      });

      // Business rules as child nodes
      const rules = proc.analysis?.businessRules || [];
      for (let r = 0; r < rules.length; r++) {
        const ruleId = `rule_${nodeId}_${r}`;
        nodes.push({
          id: ruleId,
          type: 'default',
          position: { x: x + 50, y: y + 120 + r * 80 },
          data: {
            label: typeof rules[r] === 'string' ? rules[r].slice(0, 60) : `Rule ${r + 1}`,
            kind: 'businessRule',
            description: typeof rules[r] === 'string' ? rules[r] : JSON.stringify(rules[r]),
          },
        });
        edges.push({
          id: `e_${nodeId}_${ruleId}`,
          source: nodeId,
          target: ruleId,
          label: 'IMPLEMENTS',
        });
      }

      // Affected tables
      for (const table of proc.analysis?.affectedTables || []) {
        const tableNodeId = `affected_${table}`;
        if (!nodes.find(n => n.id === tableNodeId)) {
          nodes.push({
            id: tableNodeId,
            type: 'default',
            position: { x: x + 200, y: y - 50 },
            data: { label: table, kind: 'table', description: `Affected by ${proc.object_name}` },
          });
        }
        edges.push({
          id: `mod_${nodeId}_${tableNodeId}`,
          source: nodeId,
          target: tableNodeId,
          label: 'MODIFIES',
        });
      }
    }

    return { nodes, edges };
  }
}

module.exports = MssqlImportOrchestrator;
