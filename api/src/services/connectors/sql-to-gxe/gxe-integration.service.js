/**
 * GXE Integration Service
 *
 * Integrates SQL→GXE translation with:
 * - Memgraph storage (DomainGraph nodes)
 * - GXE Catalog (for reuse and versioning)
 * - Cross-domain linking (BEHAVIORAL ↔ STRUCTURAL)
 * - Graph status management
 */

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');
const { SqlProcedureTranslator } = require('./procedure-translator');
const { GraphStatus } = require('../../graph/graph-status.service');

// Domain constants
const DOMAIN = {
  BEHAVIORAL: 'BEHAVIORAL',
  STRUCTURAL: 'STRUCTURAL',
};

/**
 * Integration result
 */
class IntegrationResult {
  constructor() {
    this.success = false;
    this.domainGraphId = null;
    this.catalogEntryId = null;
    this.crossDomainEdges = [];
    this.errors = [];
    this.warnings = [];
    this.translation = null;
  }
}

/**
 * Main integration service.
 * Connects SQL extraction → GXE translation → Memgraph storage → Catalog.
 */
class GxeIntegrationService {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.memgraphService - MemgraphService with runQuery()
   * @param {Object} [dependencies.catalogService] - GraphCatalogService (optional)
   * @param {Object} [dependencies.graphStatusService] - GraphStatusService (optional)
   * @param {Object} [dependencies.translatorOptions] - Options for SqlProcedureTranslator
   */
  constructor(dependencies = {}) {
    this.memgraphService = dependencies.memgraphService;
    this.catalogService = dependencies.catalogService;
    this.graphStatusService = dependencies.graphStatusService;
    this.translator = new SqlProcedureTranslator(dependencies.translatorOptions || {});

    // Namespace for SQL-extracted behavioral graphs
    this.namespace = 'sql-extraction';
  }

  /**
   * Process a stored procedure and integrate with GXE.
   *
   * @param {Object} procedure - Procedure info from SQL extraction
   * @param {string} procedure.name - Procedure name
   * @param {string} [procedure.schema='dbo'] - Schema name
   * @param {string} procedure.sql - Full SQL text
   * @param {Object} [procedure.ast] - Pre-parsed AST (optional, skips parsing)
   * @param {Object} [context] - Extraction context
   * @param {string} [context.sessionId] - Ingestion session ID
   * @param {string} [context.sourceDatabase] - Source database name
   * @param {string} [context.sourceServer] - Source server
   * @returns {Promise<IntegrationResult>}
   */
  async processProcedure(procedure, context = {}) {
    const result = new IntegrationResult();

    try {
      // 1. Translate to GXE graph
      const translation = procedure.ast
        ? this.translator.translateFromAst(procedure.ast, {
            name: procedure.name,
            schema: procedure.schema || 'dbo',
            sql: procedure.sql,
          })
        : this.translator.translate(procedure.sql);

      result.translation = translation;

      if (!translation.success) {
        result.errors.push(...translation.errors);
        result.warnings.push(...translation.warnings);
        // Continue with partial result if we have nodes
        if (translation.nodes.length === 0) {
          return result;
        }
      }

      // 2. Create DomainGraph in Memgraph
      const domainGraph = await this._createDomainGraph(translation, procedure, context);
      result.domainGraphId = domainGraph.id;

      // 3. Register in GXE Catalog (if catalog service available)
      if (this.catalogService) {
        try {
          const catalogEntry = await this._registerInCatalog(
            translation, procedure, context, domainGraph.id
          );
          result.catalogEntryId = catalogEntry?.id || catalogEntry?.entryId;

          // Update DomainGraph with catalog reference
          if (result.catalogEntryId) {
            await this._linkToCatalog(domainGraph.id, result.catalogEntryId);
          }
        } catch (catalogError) {
          result.warnings.push({ message: `Catalog registration failed: ${catalogError.message}` });
        }
      }

      // 4. Create cross-domain edges to STRUCTURAL entities
      const crossEdges = await this._createCrossDomainEdges(
        domainGraph.id, translation, context
      );
      result.crossDomainEdges = crossEdges;

      result.success = true;
    } catch (error) {
      result.errors.push({ message: `Integration failed: ${error.message}` });
    }

    return result;
  }

  /**
   * Process multiple procedures in batch.
   */
  async processProcedures(procedures, context = {}) {
    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      results: [],
    };

    for (const procedure of procedures) {
      const result = await this.processProcedure(procedure, context);
      results.results.push({
        name: procedure.name,
        schema: procedure.schema || 'dbo',
        ...result,
      });

      results.processed++;
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
      }
    }

    return results;
  }

  // ============================================================
  // MEMGRAPH STORAGE
  // ============================================================

  async _createDomainGraph(translation, procedure, context) {
    const graphId = uuidv4();
    const now = new Date().toISOString();
    const gxeGraph = translation.toGxeGraph();
    const schema = procedure.schema || 'dbo';

    // Note: Memgraph uses // for line comments in Cypher; avoid them inside node literals.
    // Using ISO string directly (no datetime() wrapper — Memgraph stores as string).
    const query = `
      MERGE (g:DomainGraph:BehavioralProcess {
        procedureName: $procedureName,
        procedureSchema: $procedureSchema
      })
      ON CREATE SET
        g.id = $graphId,
        g.globalId = $globalId,
        g.domain = $domain,
        g.domainVersion = 1,
        g.status = $status,
        g.statusChangedAt = $now,
        g.statusChangedBy = 'system',
        g.statusReason = 'Auto-extracted from SQL',
        g.sourceSystem = 'MSSQL',
        g.isExecutable = true,
        g.executionCount = 0,
        g.humanValidated = false,
        g.createdAt = $now
      ON MATCH SET
        g.id = $graphId
      SET
        g.extractionSessionId = $sessionId,
        g.sourceReference = $sourceRef,
        g.confidence = $confidence,
        g.title = $title,
        g.description = $description,
        g.sqlComplexity = $complexity,
        g.translationConfidence = $confidence,
        g.nodesJson = $nodesJson,
        g.edgesJson = $edgesJson,
        g.inputSchemaJson = $inputSchemaJson,
        g.outputSchemaJson = $outputSchemaJson,
        g.metadataJson = $metadataJson,
        g.originalSql = $originalSql,
        g.updatedAt = $now
      RETURN g.id as id
    `;

    const params = {
      graphId,
      globalId: `${this.namespace}:BEHAVIORAL:${schema}.${procedure.name}`,
      domain: DOMAIN.BEHAVIORAL,
      status: GraphStatus.DRAFT,
      now,
      sessionId: context.sessionId || '',
      sourceRef: `${context.sourceDatabase || 'unknown'}.${schema}.${procedure.name}`,
      confidence: translation.confidence,
      title: `${schema}.${procedure.name}`,
      description: `Executable graph for stored procedure ${schema}.${procedure.name}`,
      procedureName: procedure.name,
      procedureSchema: schema,
      complexity: translation.metadata.sqlComplexity,
      nodesJson: JSON.stringify(gxeGraph.nodes),
      edgesJson: JSON.stringify(gxeGraph.edges),
      inputSchemaJson: JSON.stringify(translation.inputSchema),
      outputSchemaJson: JSON.stringify(translation.outputSchema),
      metadataJson: JSON.stringify(translation.metadata),
      originalSql: procedure.sql || translation.originalSql || '',
    };

    await this.memgraphService.runQuery(query, params);

    // Create individual BehavioralNode entries for querying
    await this._createBehavioralNodes(graphId, gxeGraph.nodes);

    return { id: graphId };
  }

  /**
   * Create individual BehavioralNode entries linked to the DomainGraph.
   */
  async _createBehavioralNodes(graphId, nodes) {
    if (!nodes || nodes.length === 0) return;

    // Delete existing behavioral nodes for this graph before re-creating
    await this.memgraphService.runQuery(
      'MATCH (g:DomainGraph {id: $graphId})-[:CONTAINS_NODE]->(n:BehavioralNode) DETACH DELETE n',
      { graphId }
    ).catch(() => {});

    for (const node of nodes) {
      const query = `
        MATCH (g:DomainGraph {id: $graphId})
        CREATE (n:BehavioralNode {
          id: $nodeId,
          graphId: $graphId,
          nodeType: $nodeType,
          label: $label,
          dataJson: $dataJson,
          positionX: $posX,
          positionY: $posY
        })
        CREATE (g)-[:CONTAINS_NODE]->(n)
      `;

      await this.memgraphService.runQuery(query, {
        graphId,
        nodeId: node.id,
        nodeType: node.type,
        label: node.data?.label || '',
        dataJson: JSON.stringify(node.data || {}),
        posX: node.position?.x || 0,
        posY: node.position?.y || 0,
      });
    }
  }

  async _linkToCatalog(domainGraphId, catalogEntryId) {
    await this.memgraphService.runQuery(
      `MATCH (g:DomainGraph {id: $graphId}) SET g.gxeCatalogId = $catalogId`,
      { graphId: domainGraphId, catalogId: catalogEntryId }
    );
  }

  // ============================================================
  // CATALOG REGISTRATION
  // ============================================================

  async _registerInCatalog(translation, procedure, context, domainGraphId) {
    const gxeGraph = translation.toGxeGraph();
    const schema = procedure.schema || 'dbo';

    const catalogData = {
      name: `${schema}.${procedure.name}`,
      type: 'executable',
      namespace: this.namespace,
      tags: [
        'auto-extracted',
        'sql-procedure',
        `source:${context.sourceDatabase || 'unknown'}`,
        `schema:${schema}`,
      ],
      nodes: gxeGraph.nodes,
      edges: gxeGraph.edges,
      metadata: {
        sourceType: 'MSSQL',
        sourceDatabase: context.sourceDatabase,
        sourceServer: context.sourceServer,
        procedureName: procedure.name,
        procedureSchema: schema,
        domainGraphId,
        extractionSessionId: context.sessionId,
        sqlComplexity: translation.metadata.sqlComplexity,
        confidence: translation.confidence,
        referencedTables: translation.metadata.referencedTables,
        calledProcedures: translation.metadata.calledProcedures,
      },
    };

    return this.catalogService.createGraph(catalogData);
  }

  // ============================================================
  // CROSS-DOMAIN LINKING
  // ============================================================

  /**
   * Create cross-domain edges:
   *   BEHAVIORAL -[OPERATES_ON]-> STRUCTURAL (for referenced tables)
   *   BEHAVIORAL -[CALLS]-> BEHAVIORAL (for called procedures)
   */
  async _createCrossDomainEdges(graphId, translation, context) {
    const edges = [];

    // Remove existing cross-domain edges for this graph before re-creating
    await this.memgraphService.runQuery(
      'MATCH (g:DomainGraph {id: $graphId})-[e:CROSS_DOMAIN]->() DELETE e',
      { graphId }
    ).catch(() => {});

    // OPERATES_ON edges to structural entities (tables)
    const referencedTables = translation.metadata.referencedTables || [];
    for (const tableName of referencedTables) {
      const structuralEntity = await this._findStructuralEntity(tableName, context);
      if (!structuralEntity) continue;

      const edgeId = uuidv4();
      try {
        await this.memgraphService.runQuery(
          `MATCH (b:DomainGraph {id: $behavioralId})
           MATCH (s {id: $structuralId})
           WHERE s:StructuralEntity OR s:DomainGraph
           CREATE (b)-[:CROSS_DOMAIN {
             id: $edgeId,
             edgeType: 'OPERATES_ON',
             sourceDomain: 'BEHAVIORAL',
             targetDomain: 'STRUCTURAL',
             createdAt: $now
           }]->(s)`,
          {
            behavioralId: graphId,
            structuralId: structuralEntity.id,
            edgeId,
            now: new Date().toISOString(),
          }
        );

        edges.push({
          id: edgeId,
          type: 'OPERATES_ON',
          source: graphId,
          target: structuralEntity.id,
          targetName: tableName,
        });
      } catch (err) {
        // Entity might not exist yet — not an error
        console.warn(`[GxeIntegration] Could not link to structural entity ${tableName}: ${err.message}`);
      }
    }

    // CALLS edges to other behavioral graphs (called procedures)
    const calledProcedures = translation.metadata.calledProcedures || [];
    for (const procName of calledProcedures) {
      const calledGraph = await this._findBehavioralGraph(procName, context);
      if (!calledGraph) continue;

      const edgeId = uuidv4();
      try {
        await this.memgraphService.runQuery(
          `MATCH (caller:DomainGraph {id: $callerId})
           MATCH (callee:DomainGraph {id: $calleeId})
           CREATE (caller)-[:CROSS_DOMAIN {
             id: $edgeId,
             edgeType: 'CALLS',
             sourceDomain: 'BEHAVIORAL',
             targetDomain: 'BEHAVIORAL',
             createdAt: $now
           }]->(callee)`,
          {
            callerId: graphId,
            calleeId: calledGraph.id,
            edgeId,
            now: new Date().toISOString(),
          }
        );

        edges.push({
          id: edgeId,
          type: 'CALLS',
          source: graphId,
          target: calledGraph.id,
          targetName: procName,
        });
      } catch (err) {
        console.warn(`[GxeIntegration] Could not link to called procedure ${procName}: ${err.message}`);
      }
    }

    return edges;
  }

  /**
   * Find a STRUCTURAL entity by table name.
   * runQuery() returns plain objects: [{id, name, ...}]
   */
  async _findStructuralEntity(tableName, context) {
    let query = `MATCH (e:StructuralEntity) WHERE e.name = $tableName OR e.tableName = $tableName`;
    if (context.sessionId) {
      query += ` AND e.extractionSessionId = $sessionId`;
    }
    query += ` RETURN e.id as id, e.name as name LIMIT 1`;

    const result = await this.memgraphService.runQuery(query, {
      tableName,
      sessionId: context.sessionId || '',
    });

    if (result && result.length > 0) {
      return { id: result[0].id, name: result[0].name };
    }

    // Fuzzy match: try without schema prefix
    const shortName = tableName.includes('.') ? tableName.split('.').pop() : tableName;
    if (shortName !== tableName) {
      const fuzzy = await this.memgraphService.runQuery(
        `MATCH (e:StructuralEntity) WHERE e.name = $shortName RETURN e.id as id, e.name as name LIMIT 1`,
        { shortName }
      );
      if (fuzzy && fuzzy.length > 0) {
        return { id: fuzzy[0].id, name: fuzzy[0].name };
      }
    }

    return null;
  }

  /**
   * Find a BEHAVIORAL DomainGraph by procedure name.
   */
  async _findBehavioralGraph(procedureName, context) {
    let query = `MATCH (g:DomainGraph {domain: 'BEHAVIORAL'}) WHERE g.procedureName = $procName`;
    if (context.sessionId) {
      query += ` AND g.extractionSessionId = $sessionId`;
    }
    query += ` RETURN g.id as id LIMIT 1`;

    const result = await this.memgraphService.runQuery(query, {
      procName: procedureName,
      sessionId: context.sessionId || '',
    });

    if (result && result.length > 0) {
      return { id: result[0].id };
    }
    return null;
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  /**
   * Get behavioral graph by procedure name.
   * Returns deserialized graph with nodes/edges.
   */
  async getBehavioralGraph(procedureName, schema = 'dbo') {
    const result = await this.memgraphService.runQuery(
      `MATCH (g:DomainGraph {domain: 'BEHAVIORAL', procedureName: $procName, procedureSchema: $schema})
       RETURN g.id as id, g.title as title, g.status as status,
              g.confidence as confidence, g.sqlComplexity as sqlComplexity,
              g.nodesJson as nodesJson, g.edgesJson as edgesJson,
              g.inputSchemaJson as inputSchemaJson, g.outputSchemaJson as outputSchemaJson,
              g.metadataJson as metadataJson, g.createdAt as createdAt
       ORDER BY g.createdAt DESC
       LIMIT 1`,
      { procName: procedureName, schema }
    );

    if (!result || result.length === 0) return null;

    const r = result[0];
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      confidence: r.confidence,
      sqlComplexity: r.sqlComplexity,
      nodes: JSON.parse(r.nodesJson || '[]'),
      edges: JSON.parse(r.edgesJson || '[]'),
      inputSchema: JSON.parse(r.inputSchemaJson || '{}'),
      outputSchema: JSON.parse(r.outputSchemaJson || '{}'),
      metadata: JSON.parse(r.metadataJson || '{}'),
      createdAt: r.createdAt,
    };
  }

  /**
   * Get all behavioral graphs for a source database.
   */
  async getBehavioralGraphsForDatabase(sourceDatabase, options = {}) {
    const { status, limit = 100 } = options;

    let query = `MATCH (g:DomainGraph {domain: 'BEHAVIORAL'}) WHERE g.sourceReference STARTS WITH $dbPrefix`;
    if (status) {
      query += ` AND g.status = $status`;
    }
    query += ` RETURN g.id as id, g.procedureName as procedureName,
                      g.procedureSchema as procedureSchema, g.status as status,
                      g.confidence as confidence, g.sqlComplexity as sqlComplexity,
                      g.createdAt as createdAt
               ORDER BY g.procedureName
               LIMIT $limit`;

    const result = await this.memgraphService.runQuery(query, {
      dbPrefix: `${sourceDatabase}.`,
      status: status || '',
      limit: neo4j.int(parseInt(limit) || 100),
    });

    return result || [];
  }

  /**
   * Get cross-domain edges for a graph.
   */
  async getCrossDomainEdges(graphId) {
    const result = await this.memgraphService.runQuery(
      `MATCH (g:DomainGraph {id: $graphId})-[r:CROSS_DOMAIN]->(target)
       RETURN r.id as id, r.edgeType as edgeType, r.sourceDomain as sourceDomain,
              r.targetDomain as targetDomain, r.createdAt as createdAt,
              target.id as targetId, target.name as targetName, target.title as targetTitle`,
      { graphId }
    );

    return (result || []).map(r => ({
      id: r.id,
      edgeType: r.edgeType,
      sourceDomain: r.sourceDomain,
      targetDomain: r.targetDomain,
      createdAt: r.createdAt,
      target: {
        id: r.targetId,
        name: r.targetName || r.targetTitle,
      },
    }));
  }
}

module.exports = {
  GxeIntegrationService,
  IntegrationResult,
  DOMAIN,
};
