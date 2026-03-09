/**
 * MssqlAgent
 *
 * Agentic SQL Knowledge Extraction orchestrator.
 * Implements a spiral extraction strategy across 9 phases:
 *
 *   STEP 0: META_CONSULTATION  — read past ingestion sessions for strategy hints
 *   STEP 1: RECONNAISSANCE     — discover schemas, classify tables, build FK graph
 *   STEP 2: MASTER_DATA        — full-read reference tables, build domain vocabulary
 *   STEP 3: ENTITY_DISCOVERY   — stratified sample of master tables, identify entities
 *   STEP 4: RELATIONSHIP_INFERENCE — FK graph + semantic analysis of soft FKs
 *   STEP 5: TRANSACTION_ANALYSIS   — temporal sample of transactions, lifecycle patterns
 *   STEP 6: BUSINESS_LOGIC     — AST-parse procedures/views/triggers for rules
 *   STEP 7: CROSS_VALIDATION   — verify consistency, find anomalies
 *   STEP 8: GRAPH_SYNTHESIS    — generate 6 knowledge graphs
 *
 * Each phase builds on the context produced by previous phases,
 * implementing the "spiral" approach where each cycle enriches understanding.
 *
 * Dependencies:
 *   - MSSQLConnector      — database access
 *   - MssqlTableClassifier — table type classification
 *   - MssqlStratifiedSampler — type-aware data sampling
 *   - LlmService          — AI reasoning
 *   - emit(event, data)   — SSE event emitter
 */

const { v4: uuidv4 } = require('uuid');
const { MssqlTableClassifier } = require('./mssql.classifier');
const { MssqlStratifiedSampler } = require('./mssql.sampler');
const { MssqlAstParser } = require('./mssql.ast-parser');
const { GxeIntegrationService } = require('./sql-to-gxe');
const { SemanticDomainService } = require('../semantic');
const { TemporalDomainService } = require('../temporal');

// ═══════════════════════════════════════════════════════════════════
// Phase definitions
// ═══════════════════════════════════════════════════════════════════

const PHASES = [
  { id: 'META_CONSULTATION',     name: 'Meta-consultation',      step: 0 },
  { id: 'RECONNAISSANCE',        name: 'Structural Reconnaissance', step: 1 },
  { id: 'MASTER_DATA',           name: 'Master Data Extraction',    step: 2 },
  { id: 'ENTITY_DISCOVERY',      name: 'Entity Discovery',          step: 3 },
  { id: 'RELATIONSHIP_INFERENCE', name: 'Relationship Inference',   step: 4 },
  { id: 'TRANSACTION_ANALYSIS',  name: 'Transaction Analysis',      step: 5 },
  { id: 'BUSINESS_LOGIC',        name: 'Business Logic Extraction', step: 6 },
  { id: 'CROSS_VALIDATION',      name: 'Cross-source Validation',   step: 7 },
  { id: 'GRAPH_SYNTHESIS',       name: 'Graph Synthesis',           step: 8 },
];

class MssqlAgent {
  /**
   * @param {Object} deps
   * @param {import('./mssql.connector')} deps.connector - MSSQLConnector instance
   * @param {import('../llm.service')} deps.llmService - LlmService instance
   * @param {Function} deps.emit - (eventType, data) => void
   * @param {Object} [deps.metaRetriever] - optional meta-learning retriever
   * @param {Object} [deps.ingestionGraph] - optional IngestionGraphService for persistence
   */
  constructor({ connector, llmService, emit, metaRetriever, ingestionGraph }) {
    this.connector = connector;
    this.llm = llmService;
    this.emit = emit || (() => {});
    this.metaRetriever = metaRetriever || null;
    this.ingestionGraph = ingestionGraph || null;

    this.classifier = new MssqlTableClassifier();
    this.sampler = new MssqlStratifiedSampler(connector);
    this.astParser = new MssqlAstParser();
    this.gxeIntegration = new GxeIntegrationService({
      memgraphService: ingestionGraph?.memgraphService || null,
      catalogService: ingestionGraph?.catalogService || null,
    });
    this.semanticService = new SemanticDomainService({
      memgraphService: ingestionGraph?.memgraphService || null,
      llmService,
    });
    this.temporalService = new TemporalDomainService({
      memgraphService: ingestionGraph?.memgraphService || null,
      llmService,
    });

    // Session state — grows across phases
    this.session = {
      id: uuidv4(),
      startedAt: new Date().toISOString(),
      phases: [],
      // Accumulated knowledge context
      context: {
        databaseMap: null,         // STEP 1 output
        domainVocabulary: null,    // STEP 2 output
        entityRegistry: null,      // STEP 3 output
        relationshipMap: null,     // STEP 4 output
        transactionPatterns: null, // STEP 5 output
        businessRules: null,       // STEP 6 output
        validationResults: null,   // STEP 7 output
        graphs: null,              // STEP 8 output
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Main Entry Point
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Run the full agentic extraction pipeline.
   *
   * @param {Object} connectionConfig - server, port, database, username, password, etc.
   * @param {Object} [options]
   * @param {string[]} [options.schemas] - schemas to analyze (null = all user schemas)
   * @param {boolean} [options.analyzeProcedures=true]
   * @param {boolean} [options.skipMetaConsultation=false]
   * @param {number[]} [options.onlyPhases] - run only specific phase steps (e.g., [1,2,3])
   * @returns {Promise<AgentResult>}
   */
  async run(connectionConfig, options = {}) {
    const {
      schemas = null,
      analyzeProcedures = true,
      skipMetaConsultation = false,
      onlyPhases = null,
    } = options;

    this.emit('agent_start', {
      sessionId: this.session.id,
      database: connectionConfig.database,
      server: connectionConfig.server,
      totalPhases: PHASES.length,
    });

    try {
      // Persist session start
      if (this.ingestionGraph) {
        try {
          await this.ingestionGraph.createSession({
            id: this.session.id,
            sourceDatabase: connectionConfig.database,
            sourceType: 'mssql',
            sourceServer: connectionConfig.server,
          });
        } catch (err) {
          this.emit('log', { level: 'warning', message: `Session persistence failed: ${err.message}` });
        }
      }

      // Connect
      await this._connect(connectionConfig);

      // Execute phases
      const phasesToRun = onlyPhases
        ? PHASES.filter(p => onlyPhases.includes(p.step))
        : PHASES;

      for (const phase of phasesToRun) {
        if (phase.id === 'META_CONSULTATION' && skipMetaConsultation) continue;
        if (phase.id === 'BUSINESS_LOGIC' && !analyzeProcedures) continue;

        await this._runPhase(phase, connectionConfig, { schemas, analyzeProcedures });
      }

      // Complete
      this.session.completedAt = new Date().toISOString();
      this.session.status = 'complete';

      // Persist session completion
      if (this.ingestionGraph) {
        try {
          const ctx = this.session.context;
          await this.ingestionGraph.completeSession(this.session.id, {
            status: 'complete',
            qualityScore: ctx.validationResults?.coveragePercent
              ? ctx.validationResults.coveragePercent / 100 : 0,
            coveragePercent: ctx.validationResults?.coveragePercent || 0,
            tablesProcessed: ctx.databaseMap?.totalTables || 0,
            entitiesDiscovered: ctx.entityRegistry?.totalAnalyzed || 0,
            rulesExtracted: ctx.businessRules?.procedures?.length || 0,
            tokensUsed: this.session.phases.reduce((s, p) => s + (p.tokensUsed || 0), 0),
            durationMs: Date.now() - new Date(this.session.startedAt).getTime(),
          });

          // Persist knowledge graphs
          for (const graph of ctx.graphs || []) {
            await this.ingestionGraph.saveKnowledgeGraph(
              this.session.id, graph.type, graph,
            );
          }
        } catch (err) {
          this.emit('log', { level: 'warning', message: `Session completion persistence failed: ${err.message}` });
        }
      }

      // Save to Graph Catalog (non-blocking — failure doesn't affect session)
      if (this.session.context.graphs?.length > 0) {
        try {
          const { catalogIntegrationService } = require('../ingestion/catalog-integration.service');
          const connInfo = this.connector?.getConnectionInfo?.() || {};

          this.emit('persisting_to_catalog', { graphCount: this.session.context.graphs.length });

          const catalogResult = await catalogIntegrationService.saveExtractedGraphs({
            sessionId: this.session.id,
            sourceDatabase: connInfo.databaseName || 'unknown',
            sourceServer: connInfo.server || 'unknown',
            graphs: this.session.context.graphs,
            summary: {
              tablesProcessed: this.session.context.databaseMap?.totalTables || 0,
              entitiesDiscovered: this.session.context.entityRegistry?.totalAnalyzed || 0,
              rulesExtracted: this.session.context.businessRules?.procedures?.length || 0,
              qualityScore: this.session.context.validationResults?.coveragePercent
                ? this.session.context.validationResults.coveragePercent / 100 : 0,
            },
          });

          this.session.catalogEntries = catalogResult.savedEntries;

          this.emit('catalog_save_complete', {
            saved: catalogResult.savedEntries.length,
            duplicates: catalogResult.skippedDuplicates.length,
            errors: catalogResult.errors.length,
            entries: catalogResult.savedEntries,
          });
        } catch (err) {
          this.emit('catalog_save_error', { error: err.message });
          this.emit('log', { level: 'warning', message: `Catalog integration failed: ${err.message}` });
        }
      }

      // agent_complete is emitted by the controller with full summary data
      return {
        session: this.session,
        graphs: this.session.context.graphs || [],
        context: this.session.context,
      };

    } catch (error) {
      this.session.status = 'failed';
      this.session.error = error.message;
      this.session.completedAt = new Date().toISOString();

      // Persist failure
      if (this.ingestionGraph) {
        try {
          await this.ingestionGraph.completeSession(this.session.id, {
            status: 'failed',
            error: error.message,
            durationMs: Date.now() - new Date(this.session.startedAt).getTime(),
          });
        } catch (_) {}
      }

      this.emit('agent_error', {
        sessionId: this.session.id,
        phase: error.phaseId || this.session.phases[this.session.phases.length - 1]?.phaseId,
        phaseName: error.phaseName || 'Unknown',
        phaseStep: error.phaseStep,
        message: error.message,
        stack: (error.originalStack || error.stack || '').split('\n').slice(0, 5).join('\n'),
        recoverable: false,
      });
      throw error;

    } finally {
      try { await this.connector.disconnect(); } catch (_) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase Runner
  // ═══════════════════════════════════════════════════════════════════

  async _runPhase(phase, connectionConfig, options) {
    const phaseRecord = {
      id: uuidv4(),
      phaseId: phase.id,
      phaseName: phase.name,
      step: phase.step,
      startedAt: new Date().toISOString(),
      status: 'running',
      toolCalls: 0,
      llmCalls: 0,
      tokensUsed: 0,
    };

    this.session.phases.push(phaseRecord);

    this.emit('phase_start', {
      phase: phase.id,
      phaseNumber: phase.step,
      description: phase.name,
      totalPhases: PHASES.length,
    });

    try {
      switch (phase.id) {
        case 'META_CONSULTATION':
          await this._phase0_metaConsultation(phaseRecord);
          break;
        case 'RECONNAISSANCE':
          await this._phase1_reconnaissance(phaseRecord, options);
          break;
        case 'MASTER_DATA':
          await this._phase2_masterData(phaseRecord);
          break;
        case 'ENTITY_DISCOVERY':
          await this._phase3_entityDiscovery(phaseRecord);
          break;
        case 'RELATIONSHIP_INFERENCE':
          await this._phase4_relationshipInference(phaseRecord);
          break;
        case 'TRANSACTION_ANALYSIS':
          await this._phase5_transactionAnalysis(phaseRecord);
          break;
        case 'BUSINESS_LOGIC':
          await this._phase6_businessLogic(phaseRecord);
          break;
        case 'CROSS_VALIDATION':
          await this._phase7_crossValidation(phaseRecord);
          break;
        case 'GRAPH_SYNTHESIS':
          await this._phase8_graphSynthesis(phaseRecord);
          break;
      }

      phaseRecord.status = 'complete';
      phaseRecord.completedAt = new Date().toISOString();
      phaseRecord.durationMs = Date.now() - new Date(phaseRecord.startedAt).getTime();

      // Persist phase
      if (this.ingestionGraph) {
        try {
          await this.ingestionGraph.recordPhase(this.session.id, phaseRecord);
        } catch (err) {
          this.emit('log', { level: 'warning', message: `Phase persistence failed: ${err.message}` });
        }
      }

      this.emit('phase_complete', {
        phase: phase.id,
        duration: phaseRecord.durationMs,
        metrics: {
          toolCalls: phaseRecord.toolCalls,
          llmCalls: phaseRecord.llmCalls,
        },
      });

    } catch (error) {
      phaseRecord.status = 'failed';
      phaseRecord.error = error.message;
      phaseRecord.completedAt = new Date().toISOString();
      phaseRecord.durationMs = Date.now() - new Date(phaseRecord.startedAt).getTime();

      // Persist failed phase
      if (this.ingestionGraph) {
        try { await this.ingestionGraph.recordPhase(this.session.id, phaseRecord); } catch (_) {}
      }

      this.emit('phase_error', {
        phase: phase.id,
        error: error.message,
        stack: error.stack,
        recoverable: false,
      });

      // Re-throw to stop the pipeline — caller handles agent_error
      const pipelineError = new Error(`Phase ${phase.id} (${phase.name}) failed: ${error.message}`);
      pipelineError.phaseId = phase.id;
      pipelineError.phaseName = phase.name;
      pipelineError.phaseStep = phase.step;
      pipelineError.originalStack = error.stack;
      throw pipelineError;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 0: META-CONSULTATION
  // ═══════════════════════════════════════════════════════════════════

  async _phase0_metaConsultation(phaseRecord) {
    if (!this.metaRetriever) {
      this.emit('log', { level: 'info', message: 'No meta-retriever — skipping meta-consultation' });
      return;
    }

    this.emit('log', { level: 'info', message: 'Consulting past ingestion sessions...' });

    try {
      const pastSessions = await this.metaRetriever.findSimilarSessions({
        database: this.connector.getConnectionInfo()?.databaseName,
      });
      phaseRecord.toolCalls++;

      if (pastSessions && pastSessions.length > 0) {
        this.session.context.metaHints = {
          pastSessionCount: pastSessions.length,
          bestStrategies: pastSessions.map(s => ({
            sessionId: s.id,
            qualityScore: s.quality_score,
            strategy: s.strategy_version,
          })),
        };
        this.emit('log', {
          level: 'info',
          message: `Found ${pastSessions.length} past sessions for strategy hints`,
        });
      }
    } catch (err) {
      this.emit('log', { level: 'warning', message: `Meta-consultation failed: ${err.message}` });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: STRUCTURAL RECONNAISSANCE
  // ═══════════════════════════════════════════════════════════════════

  async _phase1_reconnaissance(phaseRecord, options) {
    const { schemas: targetSchemas } = options;
    this.emit('log', { level: 'info', message: 'Starting structural reconnaissance...' });

    // 1.1 Discover schemas
    const allSchemas = await this.connector.getSchemas();
    phaseRecord.toolCalls++;

    const systemSchemas = [
      'sys', 'INFORMATION_SCHEMA', 'guest', 'db_owner',
      'db_accessadmin', 'db_securityadmin', 'db_ddladmin',
      'db_backupoperator', 'db_datareader', 'db_datawriter',
      'db_denydatareader', 'db_denydatawriter',
    ];

    const schemas = targetSchemas
      ? allSchemas.filter(s => targetSchemas.includes(s.schema_name))
      : allSchemas.filter(s => !systemSchemas.includes(s.schema_name));

    this.emit('schemas_discovered', { count: schemas.length, schemas: schemas.map(s => s.schema_name) });

    // 1.2 Discover tables with row counts
    const allTables = [];
    for (const schema of schemas) {
      const tables = await this.connector.getTables({
        schema: schema.schema_name,
        includeViews: true,
        includeRowCounts: true,
      });
      phaseRecord.toolCalls++;

      for (const t of tables) {
        allTables.push({ ...t, schema_name: schema.schema_name });
      }
    }

    this.emit('tables_discovered', { count: allTables.length });

    // 1.3 Get columns, constraints and classify each table
    const classificationInputs = [];
    const allColumns = {}; // schema.table -> columns

    for (const t of allTables) {
      const schema = t.schema_name;
      const table = t.table_name;

      try {
        const columns = await this.connector.getColumns(schema, table);
        const constraints = await this.connector.getConstraints(schema, table);
        phaseRecord.toolCalls += 2;

        allColumns[`${schema}.${table}`] = columns;

        const tableInfo = MssqlTableClassifier.buildTableInfo({
          tableInfo: t,
          columns,
          constraints,
          allColumns: Object.values(allColumns).flat(),
        });

        classificationInputs.push({ schema, table, tableInfo, columns, constraints });
      } catch (err) {
        this.emit('log', { level: 'warning', message: `Columns/constraints failed for ${schema}.${table}: ${err.message}` });
      }
    }

    // 1.4 Classify all tables
    const classifications = {};
    for (const input of classificationInputs) {
      const result = this.classifier.classify(input.tableInfo);
      classifications[`${input.schema}.${input.table}`] = {
        ...result,
        columns: input.columns,
        constraints: input.constraints,
      };
    }

    // 1.5 Build FK dependency graph
    const fkGraph = this._buildFkGraph(classificationInputs);

    // 1.6 Group by type
    const databaseMap = {
      reference: [],
      master: [],
      transaction: [],
      log: [],
      junction: [],
      unknown: [],
      fkGraph,
      classifications,
      totalTables: allTables.length,
    };

    for (const [fqn, cls] of Object.entries(classifications)) {
      const type = cls.tableType || 'unknown';
      databaseMap[type].push({
        fqn,
        schema: cls.schema,
        tableName: cls.tableName,
        confidence: cls.confidence,
        rowCount: cls.scores ? undefined : undefined,
      });
    }

    this.session.context.databaseMap = databaseMap;

    this.emit('tables_classified', {
      reference: databaseMap.reference.length,
      master: databaseMap.master.length,
      transaction: databaseMap.transaction.length,
      log: databaseMap.log.length,
      junction: databaseMap.junction.length,
      unknown: databaseMap.unknown.length,
    });

    // 1.7 LLM reflection on database structure
    const structureSummary = await this._llmReflect(phaseRecord, 'reconnaissance', {
      totalTables: allTables.length,
      schemas: schemas.map(s => s.schema_name),
      distribution: {
        reference: databaseMap.reference.length,
        master: databaseMap.master.length,
        transaction: databaseMap.transaction.length,
        log: databaseMap.log.length,
        junction: databaseMap.junction.length,
        unknown: databaseMap.unknown.length,
      },
      fkEdges: fkGraph.edges.length,
      topConnectedTables: fkGraph.edges
        .reduce((acc, e) => {
          acc[e.source] = (acc[e.source] || 0) + 1;
          acc[e.target] = (acc[e.target] || 0) + 1;
          return acc;
        }, {}),
    });

    databaseMap.llmInsights = structureSummary;
    phaseRecord.tablesProcessed = allTables.length;

    // Persist table profiles
    if (this.ingestionGraph) {
      for (const [fqn, cls] of Object.entries(classifications)) {
        try {
          await this.ingestionGraph.recordTableProfile(this.session.id, {
            schemaName: cls.schema,
            tableName: cls.tableName,
            rowCount: cls.scores ? 0 : 0,
            columnCount: (cls.columns || []).length,
            fkInbound: 0,
            fkOutbound: (cls.columns || []).filter(c => c.referenced_table).length,
            signals: cls.signals || [],
            classifiedAs: cls.tableType,
            confidence: cls.confidence,
            samplingStrategy: cls.samplingStrategy?.method || '',
          });
        } catch (_) {}
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: MASTER DATA EXTRACTION
  // ═══════════════════════════════════════════════════════════════════

  async _phase2_masterData(phaseRecord) {
    const map = this.session.context.databaseMap;
    if (!map) throw new Error('Reconnaissance phase must run first');

    this.emit('log', { level: 'info', message: 'Extracting master data (reference tables)...' });

    const domainVocabulary = {
      enumerations: {},   // tableName -> { columnName -> [{val, frequency}] }
      lookupData: {},     // tableName -> rows[]
      domainTerms: [],    // extracted domain-specific terms
    };

    // Full-read all reference tables
    const refTables = [...map.reference];

    for (let i = 0; i < refTables.length; i++) {
      const ref = refTables[i];
      const cls = map.classifications[ref.fqn];
      if (!cls) continue;

      this.emit('analyzing_table', {
        schema: ref.schema,
        table: ref.tableName,
        index: i + 1,
        total: refTables.length,
        phase: 'MASTER_DATA',
      });

      try {
        const sampleResult = await this.sampler.sample(
          ref.schema, ref.tableName, cls, cls.columns,
        );
        phaseRecord.toolCalls++;

        domainVocabulary.lookupData[ref.fqn] = sampleResult.rows;
        if (sampleResult.distinctValues) {
          domainVocabulary.enumerations[ref.fqn] = sampleResult.distinctValues;
        }

      } catch (err) {
        this.emit('log', { level: 'warning', message: `Sample failed for ${ref.fqn}: ${err.message}` });
      }
    }

    // LLM: build domain vocabulary from reference data
    const refDataSummary = {};
    for (const [fqn, rows] of Object.entries(domainVocabulary.lookupData)) {
      refDataSummary[fqn] = {
        rowCount: rows.length,
        columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        sampleRows: rows.slice(0, 5),
        enumerations: domainVocabulary.enumerations[fqn] || {},
      };
    }

    if (Object.keys(refDataSummary).length > 0) {
      const vocabAnalysis = await this._llmAnalyze(phaseRecord, 'domain_vocabulary', {
        prompt: PROMPTS.DOMAIN_VOCABULARY,
        data: refDataSummary,
      });

      if (vocabAnalysis) {
        domainVocabulary.domainTerms = vocabAnalysis.domainTerms || [];
        domainVocabulary.enumerationDescriptions = vocabAnalysis.enumerations || {};
        domainVocabulary.businessDomain = vocabAnalysis.businessDomain || 'Unknown';
      }
    }

    this.session.context.domainVocabulary = domainVocabulary;
    phaseRecord.tablesProcessed = refTables.length;

    this.emit('log', {
      level: 'info',
      message: `Master data: ${refTables.length} reference tables, ` +
        `${Object.keys(domainVocabulary.enumerations).length} enumeration sources, ` +
        `${domainVocabulary.domainTerms.length} domain terms`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: ENTITY DISCOVERY
  // ═══════════════════════════════════════════════════════════════════

  async _phase3_entityDiscovery(phaseRecord) {
    const map = this.session.context.databaseMap;
    const vocab = this.session.context.domainVocabulary;
    if (!map) throw new Error('Reconnaissance phase must run first');

    this.emit('log', { level: 'info', message: 'Discovering business entities (master tables)...' });

    const entityRegistry = {
      entities: {},   // fqn -> { entityName, description, attributes, businessRules }
      totalAnalyzed: 0,
    };

    const masterTables = [...map.master];

    for (let i = 0; i < masterTables.length; i++) {
      const entry = masterTables[i];
      const cls = map.classifications[entry.fqn];
      if (!cls) continue;

      this.emit('analyzing_table', {
        schema: entry.schema,
        table: entry.tableName,
        index: i + 1,
        total: masterTables.length,
        phase: 'ENTITY_DISCOVERY',
      });

      try {
        const sampleResult = await this.sampler.sample(
          entry.schema, entry.tableName, cls, cls.columns,
        );
        phaseRecord.toolCalls++;

        // LLM: analyze entity from sample + domain context
        const entityAnalysis = await this._llmAnalyze(phaseRecord, 'entity_analysis', {
          prompt: PROMPTS.ENTITY_ANALYSIS,
          data: {
            tableName: entry.fqn,
            columns: cls.columns.map(c => ({
              name: c.column_name || c.name,
              type: c.data_type,
              nullable: c.is_nullable,
              isPK: c.is_primary_key,
              isFK: !!c.referenced_table,
              referencedTable: c.referenced_table ? `${c.referenced_schema}.${c.referenced_table}` : null,
              description: c.description,
            })),
            constraints: cls.constraints,
            sampleRows: sampleResult.rows.slice(0, 10),
            distinctValues: sampleResult.distinctValues,
            totalRows: sampleResult.totalRows,
            domainContext: vocab ? {
              businessDomain: vocab.businessDomain,
              domainTerms: vocab.domainTerms?.slice(0, 30),
            } : null,
          },
        });

        if (entityAnalysis) {
          entityRegistry.entities[entry.fqn] = entityAnalysis;
          entityRegistry.totalAnalyzed++;

          this.emit('table_analyzed', {
            schema: entry.schema,
            table: entry.tableName,
            entityName: entityAnalysis.entityName || entry.tableName,
            phase: 'ENTITY_DISCOVERY',
          });
        }

      } catch (err) {
        this.emit('log', { level: 'warning', message: `Entity discovery failed for ${entry.fqn}: ${err.message}` });
      }
    }

    this.session.context.entityRegistry = entityRegistry;
    phaseRecord.tablesProcessed = masterTables.length;

    // Phase 3D: Discover state machines from entity metadata
    if (this.temporalService.memgraphService) {
      try {
        const tablesWithColumns = Object.entries(entityRegistry.entities || {}).map(([name, entity]) => ({
          name: entity.entityName || name,
          fullName: name,
          columns: entity.attributes || [],
        }));

        const discoveredMachines = this.temporalService.discoverStateMachines(tablesWithColumns);
        this.session.context.discoveredStateMachines = discoveredMachines;

        if (discoveredMachines.length > 0) {
          this.emit('log', {
            level: 'info',
            message: `Discovered ${discoveredMachines.length} potential state machines: ${discoveredMachines.map(m => m.entityName).join(', ')}`,
          });
        }
      } catch (err) {
        this.emit('log', { level: 'warning', message: `State machine discovery failed: ${err.message}` });
      }
    }

    this.emit('log', {
      level: 'info',
      message: `Entity discovery: ${entityRegistry.totalAnalyzed} entities from ${masterTables.length} master tables`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: RELATIONSHIP INFERENCE
  // ═══════════════════════════════════════════════════════════════════

  async _phase4_relationshipInference(phaseRecord) {
    const map = this.session.context.databaseMap;
    const entities = this.session.context.entityRegistry;
    if (!map) throw new Error('Reconnaissance phase must run first');

    this.emit('log', { level: 'info', message: 'Inferring relationships (FK graph + semantic analysis)...' });

    const fkGraph = map.fkGraph;
    const relationshipMap = {
      explicit: fkGraph.edges,       // Physical FK relationships
      semantic: [],                  // Inferred semantic relationships
      hierarchical: [],              // Parent-child patterns
      junctionResolved: [],          // M:N through junction tables
    };

    // 4.1 Find soft FKs — columns that look like FKs but aren't declared
    const softFkCandidates = [];
    for (const [fqn, cls] of Object.entries(map.classifications)) {
      for (const col of cls.columns || []) {
        const colName = (col.column_name || col.name || '').toLowerCase();
        if (!col.referenced_table && (colName.endsWith('_id') || colName.endsWith('id'))) {
          // Potential soft FK — look for matching table
          const baseName = colName.replace(/_id$/i, '').replace(/id$/i, '');
          if (baseName.length >= 2) {
            softFkCandidates.push({ fqn, column: col.column_name || col.name, baseName });
          }
        }
      }
    }

    // Match soft FK candidates to actual tables
    const tableNames = Object.keys(map.classifications).map(fqn => ({
      fqn,
      shortName: fqn.split('.').pop().toLowerCase(),
    }));

    for (const candidate of softFkCandidates) {
      const match = tableNames.find(t =>
        t.shortName === candidate.baseName ||
        t.shortName === candidate.baseName + 's' ||
        t.shortName === candidate.baseName + 'es' ||
        t.shortName.replace(/s$/, '') === candidate.baseName
      );
      if (match && match.fqn !== candidate.fqn) {
        relationshipMap.semantic.push({
          source: candidate.fqn,
          target: match.fqn,
          column: candidate.column,
          type: 'SOFT_FK',
          confidence: 0.7,
        });
      }
    }

    // 4.2 Resolve junction tables into M:N relationships
    for (const junctionEntry of map.junction) {
      const cls = map.classifications[junctionEntry.fqn];
      if (!cls) continue;

      const fkColumns = (cls.columns || []).filter(c => c.referenced_table);
      if (fkColumns.length >= 2) {
        const tables = fkColumns.map(c => `${c.referenced_schema || junctionEntry.schema}.${c.referenced_table}`);
        for (let i = 0; i < tables.length; i++) {
          for (let j = i + 1; j < tables.length; j++) {
            relationshipMap.junctionResolved.push({
              source: tables[i],
              target: tables[j],
              through: junctionEntry.fqn,
              type: 'MANY_TO_MANY',
              confidence: 0.9,
            });
          }
        }
      }
    }

    // 4.3 Detect hierarchical patterns (parent_id, level, path)
    for (const [fqn, cls] of Object.entries(map.classifications)) {
      const columns = (cls.columns || []).map(c => (c.column_name || c.name || '').toLowerCase());
      const hasParentId = columns.some(c => c === 'parent_id' || c === 'parentid' || c === 'parent');
      const hasLevel = columns.some(c => c === 'level' || c === 'depth' || c === 'hierarchy_level');
      const hasPath = columns.some(c => c === 'path' || c === 'hierarchy_path' || c === 'tree_path');

      if (hasParentId) {
        relationshipMap.hierarchical.push({
          table: fqn,
          type: 'SELF_REFERENCING',
          signals: { hasParentId, hasLevel, hasPath },
          confidence: hasLevel || hasPath ? 0.95 : 0.8,
        });
      }
    }

    // 4.4 LLM reflection on relationships
    if (relationshipMap.semantic.length > 0 || relationshipMap.junctionResolved.length > 0) {
      await this._llmReflect(phaseRecord, 'relationship_inference', {
        explicitFKs: fkGraph.edges.length,
        semanticFKs: relationshipMap.semantic.length,
        junctionResolved: relationshipMap.junctionResolved.length,
        hierarchical: relationshipMap.hierarchical.length,
        topSoftFKs: relationshipMap.semantic.slice(0, 10),
      });
    }

    this.session.context.relationshipMap = relationshipMap;

    this.emit('log', {
      level: 'info',
      message: `Relationships: ${fkGraph.edges.length} explicit FK, ` +
        `${relationshipMap.semantic.length} semantic, ` +
        `${relationshipMap.junctionResolved.length} M:N, ` +
        `${relationshipMap.hierarchical.length} hierarchical`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: TRANSACTION ANALYSIS
  // ═══════════════════════════════════════════════════════════════════

  async _phase5_transactionAnalysis(phaseRecord) {
    const map = this.session.context.databaseMap;
    const vocab = this.session.context.domainVocabulary;
    if (!map) throw new Error('Reconnaissance phase must run first');

    this.emit('log', { level: 'info', message: 'Analyzing transaction patterns...' });

    const transactionPatterns = {
      tables: {},
      lifecycles: [],
      businessRhythms: [],
    };

    const txTables = [...map.transaction];

    for (let i = 0; i < txTables.length; i++) {
      const entry = txTables[i];
      const cls = map.classifications[entry.fqn];
      if (!cls) continue;

      this.emit('analyzing_table', {
        schema: entry.schema,
        table: entry.tableName,
        index: i + 1,
        total: txTables.length,
        phase: 'TRANSACTION_ANALYSIS',
      });

      try {
        const sampleResult = await this.sampler.sample(
          entry.schema, entry.tableName, cls, cls.columns,
        );
        phaseRecord.toolCalls++;

        // LLM: analyze transaction patterns
        const txAnalysis = await this._llmAnalyze(phaseRecord, 'transaction_analysis', {
          prompt: PROMPTS.TRANSACTION_ANALYSIS,
          data: {
            tableName: entry.fqn,
            columns: cls.columns.map(c => ({
              name: c.column_name || c.name,
              type: c.data_type,
            })),
            sampleRows: sampleResult.rows.slice(0, 15),
            aggregates: sampleResult.aggregates,
            totalRows: sampleResult.totalRows,
            domainContext: vocab ? { businessDomain: vocab.businessDomain } : null,
          },
        });

        if (txAnalysis) {
          transactionPatterns.tables[entry.fqn] = txAnalysis;
          if (txAnalysis.lifecycle) transactionPatterns.lifecycles.push(txAnalysis.lifecycle);
          if (txAnalysis.rhythm) transactionPatterns.businessRhythms.push(txAnalysis.rhythm);
        }

      } catch (err) {
        this.emit('log', { level: 'warning', message: `Transaction analysis failed for ${entry.fqn}: ${err.message}` });
      }
    }

    this.session.context.transactionPatterns = transactionPatterns;
    phaseRecord.tablesProcessed = txTables.length;

    this.emit('log', {
      level: 'info',
      message: `Transaction analysis: ${txTables.length} tables, ` +
        `${transactionPatterns.lifecycles.length} lifecycles, ` +
        `${transactionPatterns.businessRhythms.length} rhythms`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: BUSINESS LOGIC EXTRACTION
  // ═══════════════════════════════════════════════════════════════════

  async _phase6_businessLogic(phaseRecord) {
    this.emit('log', { level: 'info', message: 'Extracting business logic from stored procedures...' });

    const businessRules = {
      procedures: [],
      workflows: [],
      validations: [],
      calculations: [],
      astStats: { parsed: 0, fallback: 0 },
      // Multi-domain: BEHAVIORAL graphs created via GxeIntegrationService
      behavioralGraphs: [],
      gxeStats: { translated: 0, failed: 0 },
      // Multi-domain: D3 SEMANTIC content
      semanticRules: [],
      semanticCalculations: [],
      semanticStats: { rulesCreated: 0, rulesFailed: 0, calcsCreated: 0, calcsFailed: 0, vocabCreated: 0 },
    };

    let procedures = [];
    try {
      procedures = await this.connector.getProcedures({ includeDefinition: true });
      phaseRecord.toolCalls++;
    } catch (err) {
      this.emit('log', { level: 'warning', message: `Failed to get procedures: ${err.message}` });
      this.session.context.businessRules = businessRules;
      return;
    }

    this.emit('procedures_found', { count: procedures.length });

    for (let i = 0; i < procedures.length; i++) {
      const proc = procedures[i];
      const procName = proc.object_name || proc.name;
      const definition = proc.definition || proc.object_definition || '';

      this.emit('analyzing_procedure', {
        name: procName,
        index: i + 1,
        total: procedures.length,
      });

      try {
        // Phase 6A: AST parsing (structural extraction)
        const astResult = definition ? this.astParser.analyzeProcedure(definition) : null;

        if (astResult?.parsed) {
          businessRules.astStats.parsed++;
        } else if (definition) {
          businessRules.astStats.fallback++;
        }

        // Phase 6B: LLM enrichment (semantic understanding)
        // Feed AST results as context for better LLM analysis
        const procAnalysis = await this._llmAnalyze(phaseRecord, 'procedure_analysis', {
          prompt: PROMPTS.PROCEDURE_ANALYSIS,
          data: {
            name: procName,
            schema: proc.schema_name,
            definition: definition.slice(0, 4000),
            parameters: proc.parameters,
            // AST-extracted context for LLM
            astContext: astResult?.parsed ? {
              dependencies: astResult.dependencies,
              businessRules: astResult.businessRules?.slice(0, 10),
              calculations: astResult.calculations,
              complexity: astResult.complexity,
              statementCount: astResult.statementCount,
            } : astResult?.fallback || null,
            entityContext: this.session.context.entityRegistry
              ? Object.values(this.session.context.entityRegistry.entities)
                  .map(e => e.entityName).filter(Boolean).slice(0, 20)
              : [],
          },
        });

        // Merge AST + LLM results
        const merged = {
          name: procName,
          schema: proc.schema_name,
          ...(procAnalysis || {}),
          // AST-derived fields (higher confidence than LLM guesses)
          astParsed: !!astResult?.parsed,
        };

        if (astResult?.parsed) {
          merged.dependencies = astResult.dependencies;
          merged.complexity = astResult.complexity;
          merged.calculations = astResult.calculations;
          // Merge AST rules with LLM rules (AST provides structure, LLM provides meaning)
          merged.astRules = astResult.businessRules;
          if (!merged.affectedTables?.length) {
            merged.affectedTables = [
              ...(astResult.dependencies?.writes || []),
              ...(astResult.dependencies?.reads || []),
            ];
          }
        } else if (astResult?.fallback) {
          merged.dependencies = {
            reads: [],
            writes: [],
            calls: astResult.fallback.proceduresCalled || [],
          };
          merged.affectedTables = merged.affectedTables || astResult.fallback.tablesReferenced || [];
          merged.complexity = { level: astResult.fallback.estimatedComplexity || 'unknown' };
        }

        businessRules.procedures.push(merged);

        // Categorize
        const cat = (merged.category || '').toLowerCase();
        if (cat === 'workflow') businessRules.workflows.push(procName);
        if (cat === 'validation') businessRules.validations.push(procName);
        if (cat === 'calculation') businessRules.calculations.push(procName);

        this.emit('procedure_analyzed', {
          name: procName,
          category: merged.category,
          astParsed: merged.astParsed,
          businessRules: merged.rules?.length || merged.astRules?.length || 0,
        });

        // Phase 6C: GXE Translation — create BEHAVIORAL domain graph
        if (definition && this.gxeIntegration.memgraphService) {
          try {
            const gxeResult = await this.gxeIntegration.processProcedure(
              {
                name: procName,
                schema: proc.schema_name || 'dbo',
                sql: definition,
                ast: astResult?.parsed ? astResult.ast : null,
              },
              {
                sessionId: this.session.id,
                sourceDatabase: this.session.context.databaseMap?.databaseName,
                sourceServer: this.connector?.config?.server,
              }
            );

            if (gxeResult.success) {
              businessRules.behavioralGraphs.push({
                procedureName: procName,
                procedureSchema: proc.schema_name || 'dbo',
                domainGraphId: gxeResult.domainGraphId,
                catalogEntryId: gxeResult.catalogEntryId,
                crossDomainEdges: gxeResult.crossDomainEdges.length,
                confidence: gxeResult.translation?.confidence || 0,
              });
              businessRules.gxeStats.translated++;
            } else {
              businessRules.gxeStats.failed++;
            }
          } catch (gxeErr) {
            businessRules.gxeStats.failed++;
            this.emit('log', { level: 'warning', message: `GXE translation failed for ${procName}: ${gxeErr.message}` });
          }
        }

        // Phase 6D: Collect semantic content (rules & calculations) for D3
        // Extract from LLM-analyzed rules
        if (merged.rules && Array.isArray(merged.rules)) {
          for (const rule of merged.rules) {
            businessRules.semanticRules.push({
              name: typeof rule === 'string' ? rule.substring(0, 60) : rule.name || 'Rule',
              expression: typeof rule === 'string' ? rule : rule.expression || '',
              naturalLanguage: typeof rule === 'string' ? rule : rule.naturalLanguage || null,
              ruleType: 'validation',
              sourceProcedure: procName,
              sourceSchema: proc.schema_name || 'dbo',
              confidence: 0.7,
            });
          }
        }
        // Extract from AST-parsed rules
        if (merged.astRules && Array.isArray(merged.astRules)) {
          for (const rule of merged.astRules) {
            businessRules.semanticRules.push({
              name: typeof rule === 'string' ? rule.substring(0, 60) : rule.name || 'AST Rule',
              expression: typeof rule === 'string' ? rule : rule.expression || '',
              ruleType: 'validation',
              sourceProcedure: procName,
              sourceSchema: proc.schema_name || 'dbo',
              confidence: 0.85,
            });
          }
        }
        // Extract from AST-parsed calculations
        if (merged.calculations && Array.isArray(merged.calculations)) {
          for (const calc of merged.calculations) {
            businessRules.semanticCalculations.push({
              name: typeof calc === 'string' ? calc : calc.variable || calc.name || 'Calculation',
              formula: typeof calc === 'string' ? calc : calc.expression || calc.formula || '',
              outputVariable: typeof calc === 'object' ? calc.variable : null,
              dataType: typeof calc === 'object' ? calc.dataType : null,
              sourceProcedure: procName,
              sourceSchema: proc.schema_name || 'dbo',
              confidence: 0.85,
            });
          }
        }

      } catch (err) {
        this.emit('log', { level: 'warning', message: `Procedure analysis failed for ${procName}: ${err.message}` });
      }
    }

    // Phase 6E: Persist semantic content to D3 domain in Memgraph
    if (this.semanticService.memgraphService) {
      this.emit('log', { level: 'info', message: 'Persisting semantic content to D3 domain...' });

      if (businessRules.semanticRules.length > 0) {
        const rulesResult = await this.semanticService.createRules(
          businessRules.semanticRules,
          { sessionId: this.session.id }
        );
        businessRules.semanticStats.rulesCreated = rulesResult.created.length;
        businessRules.semanticStats.rulesFailed = rulesResult.failed.length;
      }

      if (businessRules.semanticCalculations.length > 0) {
        const calcsResult = await this.semanticService.createCalculations(
          businessRules.semanticCalculations,
          { sessionId: this.session.id }
        );
        businessRules.semanticStats.calcsCreated = calcsResult.created.length;
        businessRules.semanticStats.calcsFailed = calcsResult.failed.length;
      }

      // Generate vocabulary from procedure names
      if (procedures.length > 0 && this.llm) {
        try {
          const procNames = procedures.map(p => ({
            name: `${p.schema_name || 'dbo'}.${p.object_name || p.name}`,
            type: 'procedure',
          }));
          const vocabResult = await this.semanticService.generateVocabulary(
            procNames,
            { sessionId: this.session.id }
          );
          businessRules.semanticStats.vocabCreated = vocabResult.created;
        } catch (vocabErr) {
          this.emit('log', { level: 'warning', message: `Vocabulary generation failed: ${vocabErr.message}` });
        }
      }
    }

    // Phase 6F: Create state machines and infer transitions from procedures
    if (this.temporalService.memgraphService && this.session.context.discoveredStateMachines?.length > 0) {
      this.emit('log', { level: 'info', message: 'Creating state machines and inferring transitions...' });

      const createdMachines = [];
      for (const machineData of this.session.context.discoveredStateMachines) {
        try {
          // Link to entity if found
          const entityId = this._findEntityId(machineData.entityName);
          if (entityId) machineData.entityId = entityId;

          const machine = await this.temporalService.createStateMachine(machineData, {
            sessionId: this.session.id,
            sourceDatabase: this.session.context.databaseMap?.databaseName,
          });

          // Find procedures that reference this entity's table
          const relevantProcs = (businessRules.procedures || []).filter(p => {
            const tables = p.affectedTables || [];
            return tables.some(t =>
              t.toLowerCase().includes(machineData.entityName.toLowerCase())
            );
          });

          if (relevantProcs.length > 0) {
            const procsWithDef = relevantProcs.map(p => ({
              name: p.name,
              schema: p.schema || 'dbo',
              definition: p.definition || '',
              domainGraphId: businessRules.behavioralGraphs?.find(
                bg => bg.procedureName === p.name
              )?.domainGraphId || null,
            }));

            const inferred = await this.temporalService.inferTransitionsFromProcedures(
              machine.id, procsWithDef
            );
            machine.inferredTransitions = inferred.length;
          }

          createdMachines.push(machine);
        } catch (err) {
          this.emit('log', { level: 'warning', message: `State machine creation failed for ${machineData.entityName}: ${err.message}` });
        }
      }

      this.session.context.stateMachines = createdMachines;
      businessRules.temporalStats = {
        machinesCreated: createdMachines.length,
        totalStates: createdMachines.reduce((s, m) => s + (m.stateCount || 0), 0),
        totalTransitions: createdMachines.reduce((s, m) => s + (m.transitionCount || 0) + (m.inferredTransitions || 0), 0),
      };
    }

    this.session.context.businessRules = businessRules;
    phaseRecord.tablesProcessed = procedures.length;

    this.emit('log', {
      level: 'info',
      message: `Business logic: ${procedures.length} procedures, ` +
        `${businessRules.astStats.parsed} AST-parsed, ${businessRules.astStats.fallback} regex-fallback, ` +
        `${businessRules.workflows.length} workflows, ` +
        `${businessRules.validations.length} validations, ` +
        `${businessRules.calculations.length} calculations, ` +
        `${businessRules.gxeStats.translated} GXE-translated, ${businessRules.gxeStats.failed} GXE-failed, ` +
        `D3: ${businessRules.semanticStats.rulesCreated} rules, ${businessRules.semanticStats.calcsCreated} calcs, ${businessRules.semanticStats.vocabCreated} vocab` +
        (businessRules.temporalStats ? `, D4: ${businessRules.temporalStats.machinesCreated} machines, ${businessRules.temporalStats.totalTransitions} transitions` : ''),
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 7: CROSS-SOURCE VALIDATION
  // ═══════════════════════════════════════════════════════════════════

  async _phase7_crossValidation(phaseRecord) {
    this.emit('log', { level: 'info', message: 'Running cross-source validation...' });

    const validationResults = {
      orphanRecords: [],
      inconsistencies: [],
      coveragePercent: 0,
      anomalyCandidates: [],
    };

    const map = this.session.context.databaseMap;
    if (!map) {
      this.session.context.validationResults = validationResults;
      return;
    }

    // 7.1 Check referential integrity on explicit FKs
    const fkEdges = map.fkGraph?.edges || [];
    const sampleFkChecks = fkEdges.slice(0, 20); // Check up to 20 FK relationships

    for (const fk of sampleFkChecks) {
      try {
        const query = `SELECT TOP 5 s.[${fk.column}] FROM [${fk.sourceSchema}].[${fk.sourceTable}] s ` +
          `LEFT JOIN [${fk.targetSchema}].[${fk.targetTable}] t ON s.[${fk.column}] = t.[${fk.targetColumn}] ` +
          `WHERE t.[${fk.targetColumn}] IS NULL AND s.[${fk.column}] IS NOT NULL`;

        const orphans = await this.connector.executeReadOnlyQuery(query, 5);
        phaseRecord.toolCalls++;

        if (orphans && orphans.length > 0) {
          validationResults.orphanRecords.push({
            source: `${fk.sourceSchema}.${fk.sourceTable}`,
            target: `${fk.targetSchema}.${fk.targetTable}`,
            column: fk.column,
            orphanCount: orphans.length,
            sample: orphans.slice(0, 3),
          });
        }
      } catch (_) {
        // Skip failed validation queries
      }
    }

    // 7.2 Coverage calculation
    const totalTables = map.totalTables || 0;
    const classifiedTables = totalTables - (map.unknown?.length || 0);
    validationResults.coveragePercent = totalTables > 0
      ? Math.round((classifiedTables / totalTables) * 100)
      : 0;

    this.session.context.validationResults = validationResults;

    this.emit('log', {
      level: 'info',
      message: `Validation: ${validationResults.orphanRecords.length} orphan issues, ` +
        `${validationResults.coveragePercent}% table coverage`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 8: GRAPH SYNTHESIS
  // ═══════════════════════════════════════════════════════════════════

  async _phase8_graphSynthesis(phaseRecord) {
    this.emit('log', { level: 'info', message: 'Synthesizing knowledge graphs...' });

    const graphs = [];
    const ctx = this.session.context;

    // G1: STRUCTURE GRAPH
    this.emit('generating_graphs', { type: 'structure', message: 'Building structure graph...' });
    const structureGraph = this._buildStructureGraph(ctx);
    if (structureGraph.nodes.length > 0) {
      graphs.push({ type: 'structure', title: 'Database Structure', ...structureGraph });
      this.emit('graph_ready', { type: 'structure', nodes: structureGraph.nodes.length, edges: structureGraph.edges.length });
    }

    // G2: ENTITY GRAPH
    if (ctx.entityRegistry?.entities && Object.keys(ctx.entityRegistry.entities).length > 0) {
      this.emit('generating_graphs', { type: 'entities', message: 'Building entity graph...' });
      const entityGraph = this._buildEntityGraph(ctx);
      graphs.push({ type: 'entities', title: 'Business Entities', ...entityGraph });
      this.emit('graph_ready', { type: 'entities', nodes: entityGraph.nodes.length, edges: entityGraph.edges.length });
    }

    // G3: RELATIONSHIP GRAPH
    if (ctx.relationshipMap) {
      this.emit('generating_graphs', { type: 'relationships', message: 'Building relationship graph...' });
      const relGraph = this._buildRelationshipGraph(ctx);
      if (relGraph.nodes.length > 0) {
        graphs.push({ type: 'relationships', title: 'Relationships', ...relGraph });
        this.emit('graph_ready', { type: 'relationships', nodes: relGraph.nodes.length, edges: relGraph.edges.length });
      }
    }

    // G4: BUSINESS PROCESS GRAPH (legacy flat format)
    if (ctx.businessRules?.procedures?.length > 0) {
      this.emit('generating_graphs', { type: 'businessLogic', message: 'Building business logic graph...' });
      const blGraph = this._buildBusinessLogicGraph(ctx);
      graphs.push({ type: 'businessLogic', title: 'Business Logic', ...blGraph });
      this.emit('graph_ready', { type: 'businessLogic', nodes: blGraph.nodes.length, edges: blGraph.edges.length });
    }

    // G4b: BEHAVIORAL DOMAIN SUMMARY (multi-domain: DomainGraph refs from Phase 6 GXE translation)
    if (ctx.businessRules?.behavioralGraphs?.length > 0) {
      const behavioralSummary = {
        type: 'behavioral',
        title: 'Behavioral Processes (GXE)',
        domain: 'BEHAVIORAL',
        count: ctx.businessRules.behavioralGraphs.length,
        graphIds: ctx.businessRules.behavioralGraphs.map(g => g.domainGraphId),
        nodes: [],
        edges: [],
      };
      // Create summary nodes for each translated procedure
      for (const bg of ctx.businessRules.behavioralGraphs) {
        behavioralSummary.nodes.push({
          id: bg.domainGraphId,
          type: 'procedure',
          data: {
            label: `${bg.procedureSchema}.${bg.procedureName}`,
            domainGraphId: bg.domainGraphId,
            catalogEntryId: bg.catalogEntryId,
            confidence: bg.confidence,
          },
        });
      }
      graphs.push(behavioralSummary);
      this.emit('graph_ready', {
        type: 'behavioral',
        nodes: behavioralSummary.nodes.length,
        edges: 0,
        message: `${behavioralSummary.count} GXE-executable behavioral graphs stored in Memgraph`,
      });
    }

    // G4c: SEMANTIC GRAPH (D3) — rules, calculations from SemanticDomainService
    if (this.semanticService.memgraphService) {
      try {
        const semanticContent = await this.semanticService.getSemanticContentForSession(this.session.id);
        const semanticNodeCount = semanticContent.rules.length + semanticContent.calculations.length + semanticContent.concepts.length;

        if (semanticNodeCount > 0) {
          const semanticGraph = {
            type: 'semantic',
            title: 'Semantic Knowledge',
            domain: 'SEMANTIC',
            stats: {
              rules: semanticContent.rules.length,
              calculations: semanticContent.calculations.length,
              concepts: semanticContent.concepts.length,
            },
            nodes: [
              ...semanticContent.rules.map(r => ({
                id: r.id,
                type: 'rule',
                data: { label: r.name, expression: r.expression, naturalLanguage: r.naturalLanguage, ruleType: r.ruleType },
              })),
              ...semanticContent.calculations.map(c => ({
                id: c.id,
                type: 'calculation',
                data: { label: c.name, formula: c.formula, naturalLanguage: c.naturalLanguage, outputVariable: c.outputVariable },
              })),
              ...semanticContent.concepts.map(c => ({
                id: c.id,
                type: 'concept',
                data: { label: c.name, description: c.description, businessContext: c.businessContext },
              })),
            ],
            edges: [],
          };

          graphs.push(semanticGraph);
          this.emit('graph_ready', { type: 'semantic', nodes: semanticNodeCount, stats: semanticGraph.stats });
        }
      } catch (semanticErr) {
        this.emit('log', { level: 'warning', message: `Semantic graph synthesis failed: ${semanticErr.message}` });
      }
    }

    // G4d: TEMPORAL GRAPH (D4) — state machines from TemporalDomainService
    if (this.temporalService.memgraphService) {
      try {
        const stateMachines = await this.temporalService.getStateMachinesForSession(this.session.id);

        if (stateMachines.length > 0) {
          const temporalGraph = {
            type: 'temporal',
            title: 'Lifecycle State Machines',
            domain: 'TEMPORAL',
            stats: { machines: stateMachines.length },
            nodes: stateMachines.map(m => ({
              id: m.id,
              type: 'stateMachine',
              data: {
                label: m.name,
                entityName: m.entityName,
                stateColumn: m.stateColumn,
                stateCount: m.stateCount,
                transitionCount: m.transitionCount,
              },
            })),
            edges: [],
          };

          graphs.push(temporalGraph);
          this.emit('graph_ready', {
            type: 'temporal',
            nodes: temporalGraph.nodes.length,
            stats: temporalGraph.stats,
          });
        }
      } catch (temporalErr) {
        this.emit('log', { level: 'warning', message: `Temporal graph synthesis failed: ${temporalErr.message}` });
      }
    }

    // G5: LIFECYCLE GRAPH (if detected — legacy from Phase 5 transaction analysis)
    if (ctx.transactionPatterns?.lifecycles?.length > 0) {
      this.emit('generating_graphs', { type: 'lifecycle', message: 'Building lifecycle graph...' });
      const lcGraph = this._buildLifecycleGraph(ctx);
      if (lcGraph.nodes.length > 0) {
        graphs.push({ type: 'lifecycle', title: 'Entity Lifecycles', ...lcGraph });
        this.emit('graph_ready', { type: 'lifecycle', nodes: lcGraph.nodes.length, edges: lcGraph.edges.length });
      }
    }

    // G6: ANOMALY GRAPH (if any found)
    if (ctx.validationResults?.orphanRecords?.length > 0 || ctx.validationResults?.anomalyCandidates?.length > 0) {
      this.emit('generating_graphs', { type: 'anomalies', message: 'Building anomaly graph...' });
      const anomalyGraph = this._buildAnomalyGraph(ctx);
      if (anomalyGraph.nodes.length > 0) {
        graphs.push({ type: 'anomalies', title: 'Anomalies & Issues', ...anomalyGraph });
        this.emit('graph_ready', { type: 'anomalies', nodes: anomalyGraph.nodes.length, edges: anomalyGraph.edges.length });
      }
    }

    this.session.context.graphs = graphs;
    phaseRecord.tablesProcessed = graphs.length;

    this.emit('log', {
      level: 'info',
      message: `Graph synthesis: ${graphs.length} graphs, ` +
        `${graphs.reduce((s, g) => s + g.nodes.length, 0)} total nodes, ` +
        `${graphs.reduce((s, g) => s + g.edges.length, 0)} total edges`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Cross-domain Helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Find entity ID by name for cross-domain linking.
   */
  _findEntityId(entityName) {
    const entities = this.session.context.entityRegistry?.entities || {};

    // Exact match
    if (entities[entityName]?.id) return entities[entityName].id;

    // Case-insensitive match
    const key = Object.keys(entities).find(k =>
      k.toLowerCase() === entityName.toLowerCase() ||
      (entities[k].entityName || '').toLowerCase() === entityName.toLowerCase()
    );
    return key ? entities[key]?.id : null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // LLM Helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Ask the LLM to reflect on gathered data and produce insights.
   */
  async _llmReflect(phaseRecord, topic, data) {
    try {
      const messages = [
        { role: 'system', content: PROMPTS.SYSTEM_REFLECTION },
        {
          role: 'user',
          content: `Analyze the following ${topic} data and provide structured insights.\n\n` +
            `Data:\n${JSON.stringify(data, null, 2).slice(0, 8000)}`,
        },
      ];

      const result = await this.llm.chat(messages);
      phaseRecord.llmCalls++;

      return this._parseJsonResponse(result?.content);
    } catch (err) {
      this.emit('log', { level: 'warning', message: `LLM reflection failed for ${topic}: ${err.message}` });
      return null;
    }
  }

  /**
   * Ask the LLM to analyze data with a specific prompt template.
   */
  async _llmAnalyze(phaseRecord, analysisType, { prompt, data }) {
    try {
      const messages = [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: JSON.stringify(data, null, 2).slice(0, 12000),
        },
      ];

      const result = await this.llm.chat(messages);
      phaseRecord.llmCalls++;

      return this._parseJsonResponse(result?.content);
    } catch (err) {
      this.emit('log', { level: 'warning', message: `LLM analysis failed for ${analysisType}: ${err.message}` });
      return null;
    }
  }

  /**
   * Parse LLM response that may contain JSON (possibly wrapped in markdown code blocks).
   */
  _parseJsonResponse(content) {
    if (!content) return null;

    // Try direct JSON parse
    try { return JSON.parse(content); } catch (_) {}

    // Try extracting from markdown code block
    const match = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) {
      try { return JSON.parse(match[1]); } catch (_) {}
    }

    // Return as plain text insight
    return { rawInsight: content };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Graph Builders
  // ═══════════════════════════════════════════════════════════════════

  _buildFkGraph(classificationInputs) {
    const edges = [];
    for (const input of classificationInputs) {
      for (const col of input.columns || []) {
        if (col.referenced_table) {
          edges.push({
            source: `${input.schema}.${input.table}`,
            target: `${col.referenced_schema || input.schema}.${col.referenced_table}`,
            column: col.column_name || col.name,
            sourceSchema: input.schema,
            sourceTable: input.table,
            targetSchema: col.referenced_schema || input.schema,
            targetTable: col.referenced_table,
            targetColumn: col.referenced_column || 'id',
          });
        }
      }
    }
    return { edges };
  }

  _buildStructureGraph(ctx) {
    const nodes = [];
    const edges = [];
    const map = ctx.databaseMap;
    if (!map) return { nodes, edges };

    let idx = 0;
    const cols = 5;

    for (const [fqn, cls] of Object.entries(map.classifications)) {
      const x = (idx % cols) * 280;
      const y = Math.floor(idx / cols) * 160;
      idx++;

      nodes.push({
        id: fqn,
        type: 'default',
        position: { x, y },
        data: {
          label: cls.tableName || fqn.split('.').pop(),
          kind: 'table',
          tableType: cls.tableType,
          confidence: cls.confidence,
          schema: cls.schema,
        },
      });
    }

    // FK edges
    for (const fk of map.fkGraph?.edges || []) {
      edges.push({
        id: `fk_${fk.source}_${fk.target}_${fk.column}`,
        source: fk.source,
        target: fk.target,
        label: `FK: ${fk.column}`,
        data: { type: 'foreignKey' },
      });
    }

    return { nodes, edges };
  }

  _buildEntityGraph(ctx) {
    const nodes = [];
    const edges = [];
    const entities = ctx.entityRegistry?.entities || {};

    let idx = 0;
    const cols = 4;

    for (const [fqn, entity] of Object.entries(entities)) {
      const x = (idx % cols) * 320;
      const y = Math.floor(idx / cols) * 200;
      idx++;

      nodes.push({
        id: fqn,
        type: 'default',
        position: { x, y },
        data: {
          label: entity.entityName || fqn.split('.').pop(),
          kind: 'entity',
          description: entity.description || entity.entityDescription,
          businessDomain: entity.businessDomain,
          attributes: entity.attributes,
        },
      });
    }

    // Add relationship edges from explicit + semantic FKs
    const rels = ctx.relationshipMap;
    if (rels) {
      for (const fk of rels.explicit || []) {
        if (entities[fk.source] && entities[fk.target]) {
          edges.push({
            id: `rel_${fk.source}_${fk.target}_${fk.column}`,
            source: fk.source,
            target: fk.target,
            label: 'REFERENCES',
          });
        }
      }
      for (const sem of rels.semantic || []) {
        if (entities[sem.source] && entities[sem.target]) {
          edges.push({
            id: `sem_${sem.source}_${sem.target}`,
            source: sem.source,
            target: sem.target,
            label: sem.type || 'RELATED_TO',
            style: { strokeDasharray: '5 5' },
          });
        }
      }
    }

    return { nodes, edges };
  }

  _buildRelationshipGraph(ctx) {
    const nodes = [];
    const edges = [];
    const rels = ctx.relationshipMap;
    const allFqns = new Set();

    // Collect all referenced tables
    for (const fk of rels.explicit || []) { allFqns.add(fk.source); allFqns.add(fk.target); }
    for (const sem of rels.semantic || []) { allFqns.add(sem.source); allFqns.add(sem.target); }
    for (const mn of rels.junctionResolved || []) { allFqns.add(mn.source); allFqns.add(mn.target); allFqns.add(mn.through); }

    let idx = 0;
    const cols = 5;
    for (const fqn of allFqns) {
      nodes.push({
        id: fqn,
        type: 'default',
        position: { x: (idx % cols) * 260, y: Math.floor(idx / cols) * 140 },
        data: {
          label: fqn.split('.').pop(),
          kind: 'table',
          tableType: ctx.databaseMap?.classifications[fqn]?.tableType,
        },
      });
      idx++;
    }

    for (const fk of rels.explicit || []) {
      edges.push({ id: `exp_${fk.source}_${fk.target}_${fk.column}`, source: fk.source, target: fk.target, label: `FK: ${fk.column}` });
    }
    for (const sem of rels.semantic || []) {
      edges.push({ id: `sem_${sem.source}_${sem.target}`, source: sem.source, target: sem.target, label: 'SOFT_FK', style: { strokeDasharray: '5 5' } });
    }
    for (const mn of rels.junctionResolved || []) {
      edges.push({ id: `mn_${mn.source}_${mn.through}`, source: mn.source, target: mn.through, label: 'M:N' });
      edges.push({ id: `mn_${mn.through}_${mn.target}`, source: mn.through, target: mn.target, label: 'M:N' });
    }

    return { nodes, edges };
  }

  _buildBusinessLogicGraph(ctx) {
    const nodes = [];
    const edges = [];

    let idx = 0;
    const cols = 3;

    for (const proc of ctx.businessRules?.procedures || []) {
      const nodeId = `proc_${proc.schema || 'dbo'}_${proc.name}`;
      const x = (idx % cols) * 350;
      const y = Math.floor(idx / cols) * 220;
      idx++;

      nodes.push({
        id: nodeId,
        type: 'default',
        position: { x, y },
        data: {
          label: proc.name,
          kind: 'procedure',
          category: proc.category,
          description: proc.businessPurpose || proc.purpose,
        },
      });

      // Rules as child nodes
      for (let r = 0; r < (proc.rules || []).length; r++) {
        const ruleId = `rule_${nodeId}_${r}`;
        const rule = proc.rules[r];
        nodes.push({
          id: ruleId,
          type: 'default',
          position: { x: x + 40, y: y + 100 + r * 70 },
          data: {
            label: typeof rule === 'string' ? rule.slice(0, 50) : `Rule ${r + 1}`,
            kind: 'businessRule',
            description: typeof rule === 'string' ? rule : JSON.stringify(rule),
          },
        });
        edges.push({ id: `e_${nodeId}_${ruleId}`, source: nodeId, target: ruleId, label: 'IMPLEMENTS' });
      }

      // Affected tables
      for (const table of proc.affectedTables || []) {
        const tId = `affected_${table}`;
        if (!nodes.find(n => n.id === tId)) {
          nodes.push({
            id: tId,
            type: 'default',
            position: { x: x + 200, y: y - 40 },
            data: { label: table, kind: 'table' },
          });
        }
        edges.push({ id: `mod_${nodeId}_${tId}`, source: nodeId, target: tId, label: 'MODIFIES' });
      }
    }

    return { nodes, edges };
  }

  _buildLifecycleGraph(ctx) {
    const nodes = [];
    const edges = [];
    let idx = 0;

    for (const lifecycle of ctx.transactionPatterns?.lifecycles || []) {
      const states = lifecycle.states || lifecycle.transitions || [];
      if (!Array.isArray(states) || states.length === 0) continue;

      const entityLabel = lifecycle.entity || lifecycle.table || `Lifecycle ${idx + 1}`;

      // Root entity node
      const rootId = `lc_root_${idx}`;
      nodes.push({
        id: rootId,
        type: 'default',
        position: { x: idx * 400, y: 0 },
        data: { label: entityLabel, kind: 'lifecycleRoot' },
      });

      let prevStateId = null;
      for (let s = 0; s < states.length; s++) {
        const state = typeof states[s] === 'string' ? { name: states[s] } : states[s];
        const stateId = `lc_${idx}_state_${s}`;

        nodes.push({
          id: stateId,
          type: 'default',
          position: { x: idx * 400, y: 80 + s * 100 },
          data: { label: state.name || state.status || `State ${s + 1}`, kind: 'lifecycleState' },
        });

        if (s === 0) {
          edges.push({ id: `e_${rootId}_${stateId}`, source: rootId, target: stateId, label: 'STARTS_WITH' });
        }
        if (prevStateId) {
          edges.push({ id: `e_${prevStateId}_${stateId}`, source: prevStateId, target: stateId, label: 'TRANSITIONS_TO' });
        }
        prevStateId = stateId;
      }
      idx++;
    }

    return { nodes, edges };
  }

  _buildAnomalyGraph(ctx) {
    const nodes = [];
    const edges = [];
    let idx = 0;

    for (const orphan of ctx.validationResults?.orphanRecords || []) {
      const srcId = `anomaly_src_${idx}`;
      const tgtId = `anomaly_tgt_${idx}`;
      const anomalyId = `anomaly_${idx}`;

      nodes.push({
        id: srcId,
        type: 'default',
        position: { x: 0, y: idx * 180 },
        data: { label: orphan.source, kind: 'table' },
      });

      nodes.push({
        id: tgtId,
        type: 'default',
        position: { x: 400, y: idx * 180 },
        data: { label: orphan.target, kind: 'table' },
      });

      nodes.push({
        id: anomalyId,
        type: 'default',
        position: { x: 200, y: idx * 180 + 60 },
        data: {
          label: `Orphan: ${orphan.column}`,
          kind: 'anomaly',
          description: `${orphan.orphanCount} orphan records in ${orphan.source}.${orphan.column}`,
        },
      });

      edges.push({ id: `e_${srcId}_${anomalyId}`, source: srcId, target: anomalyId, label: 'HAS_ORPHANS' });
      edges.push({ id: `e_${anomalyId}_${tgtId}`, source: anomalyId, target: tgtId, label: 'MISSING_IN' });

      idx++;
    }

    return { nodes, edges };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Connection Helper
  // ═══════════════════════════════════════════════════════════════════

  async _connect(config) {
    const resolvedPort = parseInt(config.port) || 1433;
    this.emit('log', { level: 'info', message: `Connecting to ${config.server}:${resolvedPort}/${config.database}...` });

    const result = await this.connector.connect({
      server: config.server,
      port: resolvedPort,
      database: config.database,
      username: config.username,
      password: config.password,
      domain: config.domain,
      encrypt: config.encryption ?? true,
      trustServerCertificate: config.trustServerCertificate ?? true,
      protocol: config.protocol || 'tcp',
      instanceName: config.instanceName || undefined,
      connectionName: `agent-${this.session.id.slice(0, 8)}`,
    });

    if (!result.success) throw new Error(`Connection failed: ${result.error}`);

    this.emit('connected', {
      server: config.server,
      database: config.database,
      version: result.version,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LLM Prompt Templates
// ═══════════════════════════════════════════════════════════════════════

const PROMPTS = {
  SYSTEM_REFLECTION: `You are a database analyst AI. Analyze the provided data and return a JSON object with structured insights. Be concise and precise. Always respond with valid JSON only — no markdown, no explanations outside JSON.`,

  DOMAIN_VOCABULARY: `You are a database analyst AI. Analyze reference/lookup table data and extract the business domain vocabulary.

Return JSON:
{
  "businessDomain": "string — primary business domain (e.g., 'E-Commerce', 'Healthcare', 'Finance')",
  "domainTerms": ["string — key domain-specific terms found in the data"],
  "enumerations": {
    "tableName.columnName": {
      "description": "what this enumeration represents",
      "values": [{"code": "value", "meaning": "business meaning"}]
    }
  }
}

Respond with valid JSON only.`,

  ENTITY_ANALYSIS: `You are a database analyst AI. Analyze the table structure and sample data to identify the business entity.

Return JSON:
{
  "entityName": "string — business entity name (e.g., 'Customer', 'Order', 'Product')",
  "entityDescription": "string — what this entity represents in business terms",
  "businessDomain": "string — business domain",
  "attributes": [
    {
      "column": "column_name",
      "businessName": "human-readable name",
      "semanticType": "identifier|descriptor|measure|timestamp|status|flag|reference",
      "businessRule": "optional business rule or constraint"
    }
  ],
  "relationships": [
    {
      "targetTable": "schema.table",
      "type": "REFERENCES|CONTAINS|MANAGES|BELONGS_TO",
      "cardinality": "1:1|1:N|N:1|M:N",
      "description": "relationship meaning"
    }
  ],
  "inferredBusinessRules": ["string — business rules inferred from constraints and data patterns"],
  "confidence": 0.0-1.0
}

Respond with valid JSON only.`,

  TRANSACTION_ANALYSIS: `You are a database analyst AI. Analyze transaction table data to identify operational patterns.

Return JSON:
{
  "entityName": "what kind of transaction this represents",
  "description": "business purpose of this transaction table",
  "lifecycle": {
    "entity": "entity undergoing lifecycle",
    "states": ["state1", "state2", "state3"],
    "statusColumn": "column tracking state"
  },
  "rhythm": {
    "frequency": "daily|weekly|monthly|quarterly|yearly|irregular",
    "peakPatterns": "description of peak usage patterns",
    "volumeTrend": "growing|stable|declining"
  },
  "keyMetrics": ["important numeric columns and their business meaning"],
  "anomalies": ["any suspicious patterns in the data"]
}

Respond with valid JSON only. Set lifecycle/rhythm to null if not detectable.`,

  PROCEDURE_ANALYSIS: `You are a database analyst AI. Analyze the stored procedure to understand its business purpose.

Return JSON:
{
  "businessPurpose": "what this procedure does in business terms",
  "category": "CRUD|workflow|validation|calculation|orchestration|reporting|maintenance",
  "affectedTables": ["schema.table1", "schema.table2"],
  "rules": ["business rule 1", "business rule 2"],
  "complexity": "low|medium|high|critical",
  "inputs": ["key input parameters and their purpose"],
  "sideEffects": ["what else happens when this runs"]
}

Respond with valid JSON only.`,
};

module.exports = { MssqlAgent, PHASES, PROMPTS };
