/**
 * MSSQL Graph Generator
 * Creates ER graph from semantic analysis results.
 * Writes nodes and edges to Memgraph, vectors to Qdrant.
 *
 * Graph hierarchy: Database → Schema → Table → Column
 * Additional nodes: StoredProcedure, BusinessRule
 * Edge types: CONTAINS, REFERENCES, DEPENDS_ON, MODIFIES, IMPLEMENTS
 *
 * @module services/connectors/mssql-graph-generator
 */

const { v4: uuidv4 } = require('uuid');
const { DB_TO_GRAPH_LABELS, DB_EDGE_TYPES } = require('../../config/mssql.config');

class MSSQLGraphGenerator {
  /**
   * @param {Object} memgraphService - Graph database service
   * @param {Object} qdrantService - Vector database service
   * @param {Object} teiService - TEI embeddings service
   * @param {Object} domainService - Domain context manager
   */
  constructor(memgraphService, qdrantService, teiService, domainService) {
    this.memgraph = memgraphService;
    this.qdrant = qdrantService;
    this.tei = teiService;
    this.domain = domainService;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN ENTRY POINT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generate ER graph from database analysis result
   * @param {Object} analysisResult - Output from MSSQLSemanticAnalyzer.analyzeDatabase()
   * @param {Object} [options]
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<Object>} Generation result with stats
   */
  async generateERGraph(analysisResult, options = {}) {
    const { onProgress = () => {} } = options;

    const namespace = this.domain.getCurrentNamespace();
    const currentDomain = this.domain.getCurrentDomain();
    const containerLabel = currentDomain?.graphContainerLabel || 'Domain_Default';
    const vectorCollection = currentDomain?.vectorCollection || 'default';
    const extractionCycleId = uuidv4();

    const result = {
      nodesCreated: 0,
      edgesCreated: 0,
      extractionCycleId,
      namespace,
      errors: [],
      stats: {
        databases: 0,
        schemas: 0,
        tables: 0,
        columns: 0,
        procedures: 0,
        businessRules: 0,
        relationships: 0,
      },
    };

    // Map for linking nodes: "type:schema.name" → nodeId
    const nodeMap = new Map();

    try {
      // ═══ 1. Create Database root node ═══
      onProgress({ phase: 'graph_generation', message: 'Creating Database node...' });

      const dbNodeId = await this._createNode({
        labels: ['Database', containerLabel],
        properties: {
          name: analysisResult.database,
          analyzedAt: analysisResult.analyzedAt.toISOString(),
          domainId: analysisResult.domainId || currentDomain?.domainId,
          complexityScore: analysisResult.overallComplexityScore,
          sourceType: 'SQL_SERVER',
          extractionCycleId,
          namespace,
        },
      });
      nodeMap.set(`Database:${analysisResult.database}`, dbNodeId);
      result.nodesCreated++;
      result.stats.databases++;

      // ═══ 2. Process each schema ═══
      for (const schema of analysisResult.schemas) {
        onProgress({
          phase: 'graph_generation',
          message: `Processing schema: ${schema.schemaName}`,
          current: result.stats.schemas,
          total: analysisResult.schemas.length,
        });

        // Create Schema node
        const schemaNodeId = await this._createNode({
          labels: ['Schema', containerLabel],
          properties: {
            name: schema.schemaName,
            database: analysisResult.database,
            tableCount: schema.tables.length,
            viewCount: schema.views?.length || 0,
            procedureCount: schema.procedures.length,
            extractionCycleId,
            namespace,
          },
        });
        nodeMap.set(`Schema:${schema.schemaName}`, schemaNodeId);
        result.nodesCreated++;
        result.stats.schemas++;

        // Database → Schema
        await this._createEdge({
          sourceId: dbNodeId,
          targetId: schemaNodeId,
          type: DB_EDGE_TYPES.CONTAINS,
          properties: { extractionCycleId },
        });
        result.edgesCreated++;

        // ═══ 2.1 Create Table nodes ═══
        for (const table of schema.tables) {
          const tableName = table._meta?.originalName?.split('.')[1] || table.entityName;
          const tableNodeId = await this._createTableNode(
            table, schema.schemaName, containerLabel, extractionCycleId, namespace
          );
          nodeMap.set(`Table:${schema.schemaName}.${tableName}`, tableNodeId);
          result.nodesCreated++;
          result.stats.tables++;

          // Schema → Table
          await this._createEdge({
            sourceId: schemaNodeId,
            targetId: tableNodeId,
            type: DB_EDGE_TYPES.CONTAINS,
            properties: { extractionCycleId },
          });
          result.edgesCreated++;

          // ═══ 2.2 Create Column nodes ═══
          for (const column of table.columns || []) {
            const columnNodeId = await this._createColumnNode(
              column, containerLabel, extractionCycleId, namespace
            );
            nodeMap.set(`Column:${schema.schemaName}.${tableName}.${column.name}`, columnNodeId);
            result.nodesCreated++;
            result.stats.columns++;

            // Table → Column
            await this._createEdge({
              sourceId: tableNodeId,
              targetId: columnNodeId,
              type: DB_EDGE_TYPES.CONTAINS,
              properties: { extractionCycleId },
            });
            result.edgesCreated++;
          }

          // ═══ 2.3 Create BusinessRule nodes from table analysis ═══
          for (const rule of table.inferredBusinessRules || []) {
            const ruleNodeId = await this._createNode({
              labels: ['BusinessRule', containerLabel],
              properties: {
                description: rule,
                sourceTable: `${schema.schemaName}.${tableName}`,
                inferredBy: 'MSSQL_SEMANTIC_ANALYSIS',
                confidence: (table.confidence || 0.5) * 0.8,
                extractionCycleId,
                namespace,
              },
            });
            result.nodesCreated++;
            result.stats.businessRules++;

            // Table → BusinessRule (IMPLEMENTS)
            await this._createEdge({
              sourceId: tableNodeId,
              targetId: ruleNodeId,
              type: DB_EDGE_TYPES.IMPLEMENTS,
              properties: { extractionCycleId },
            });
            result.edgesCreated++;
          }
        }

        // ═══ 2.4 Create View nodes ═══
        for (const view of schema.views || []) {
          const viewName = view._meta?.originalName?.split('.')[1] || view.entityName;
          const viewNodeId = await this._createTableNode(
            view, schema.schemaName, containerLabel, extractionCycleId, namespace, 'VIEW'
          );
          nodeMap.set(`Table:${schema.schemaName}.${viewName}`, viewNodeId);
          result.nodesCreated++;

          // Schema → View
          await this._createEdge({
            sourceId: schemaNodeId,
            targetId: viewNodeId,
            type: DB_EDGE_TYPES.CONTAINS,
            properties: { extractionCycleId },
          });
          result.edgesCreated++;
        }

        // ═══ 2.5 Create StoredProcedure nodes ═══
        for (const proc of schema.procedures || []) {
          const procNodeId = await this._createNode({
            labels: ['StoredProcedure', containerLabel],
            properties: {
              name: proc.name,
              schema: schema.schemaName,
              businessPurpose: proc.businessPurpose,
              complexity: proc.complexity,
              extractionCycleId,
              namespace,
            },
          });
          nodeMap.set(`Procedure:${proc.name}`, procNodeId);
          result.nodesCreated++;
          result.stats.procedures++;

          // Schema → StoredProcedure
          await this._createEdge({
            sourceId: schemaNodeId,
            targetId: procNodeId,
            type: DB_EDGE_TYPES.CONTAINS,
            properties: { extractionCycleId },
          });
          result.edgesCreated++;

          // StoredProcedure → affected tables (MODIFIES)
          for (const affectedTable of proc.affectedTables || []) {
            const targetKey = `Table:${affectedTable}`;
            const targetId = nodeMap.get(targetKey);
            if (targetId) {
              await this._createEdge({
                sourceId: procNodeId,
                targetId,
                type: DB_EDGE_TYPES.MODIFIES,
                properties: { extractionCycleId },
              });
              result.edgesCreated++;
            }
          }

          // BusinessRules from procedure analysis
          for (const rule of proc.businessRules || []) {
            const ruleNodeId = await this._createNode({
              labels: ['BusinessRule', containerLabel],
              properties: {
                description: rule,
                sourceProcedure: proc.name,
                inferredBy: 'MSSQL_PROCEDURE_ANALYSIS',
                extractionCycleId,
                namespace,
              },
            });
            result.nodesCreated++;
            result.stats.businessRules++;

            // StoredProcedure → BusinessRule
            await this._createEdge({
              sourceId: procNodeId,
              targetId: ruleNodeId,
              type: DB_EDGE_TYPES.IMPLEMENTS,
              properties: { extractionCycleId },
            });
            result.edgesCreated++;
          }
        }
      }

      // ═══ 3. Create inter-table relationships (FK and inferred) ═══
      onProgress({ phase: 'graph_generation', message: 'Creating relationships...' });

      for (const schema of analysisResult.schemas) {
        for (const table of schema.tables) {
          const tableName = table._meta?.originalName?.split('.')[1] || table.entityName;
          const sourceKey = `Table:${schema.schemaName}.${tableName}`;
          const sourceId = nodeMap.get(sourceKey);

          if (!sourceId) continue;

          for (const rel of table.relationships || []) {
            let targetTableName = rel.relatedTable;
            if (!targetTableName.includes('.')) {
              targetTableName = `${schema.schemaName}.${targetTableName}`;
            }

            const targetKey = `Table:${targetTableName}`;
            const targetId = nodeMap.get(targetKey);

            if (targetId) {
              const edgeType = rel.type === 'FK'
                ? DB_EDGE_TYPES.REFERENCES
                : rel.type === 'SEMANTIC'
                  ? 'RELATED_TO'
                  : DB_EDGE_TYPES.DEPENDS_ON;

              await this._createEdge({
                sourceId,
                targetId,
                type: edgeType,
                properties: {
                  cardinality: rel.cardinality,
                  businessMeaning: rel.businessMeaning,
                  evidence: rel.evidence,
                  relationType: rel.type,
                  extractionCycleId,
                },
              });
              result.edgesCreated++;
              result.stats.relationships++;
            }
          }
        }
      }

      // ═══ 4. Vectorize for semantic search ═══
      onProgress({ phase: 'vectorization', message: 'Creating embeddings...' });

      await this._vectorizeAnalysis(analysisResult, vectorCollection, extractionCycleId);

      onProgress({
        phase: 'complete',
        message: 'Graph generation complete',
        result: result.stats,
      });

    } catch (error) {
      console.error('[MSSQLGraphGenerator] Error:', error);
      result.errors.push(error.message);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NODE CREATION HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create Table/View node with semantic enrichment
   * @private
   */
  async _createTableNode(table, schemaName, containerLabel, extractionCycleId, namespace, tableType = 'TABLE') {
    const originalName = table._meta?.originalName || `${schemaName}.${table.entityName}`;

    return this._createNode({
      labels: [tableType === 'VIEW' ? 'View' : 'Table', containerLabel],
      properties: {
        name: table.entityName,
        originalName,
        schema: schemaName,
        businessDomain: table.businessDomain,
        description: table.entityDescription,
        confidence: table.confidence,
        columnCount: table.columns?.length || 0,
        anomalies: JSON.stringify(table.anomalies || []),
        tableType,
        extractionCycleId,
        namespace,
      },
    });
  }

  /**
   * Create Column node
   * @private
   */
  async _createColumnNode(column, containerLabel, extractionCycleId, namespace) {
    return this._createNode({
      labels: ['Column', containerLabel],
      properties: {
        name: column.name,
        businessMeaning: column.businessMeaning,
        dataClassification: column.dataClassification,
        isEnumLike: column.isEnumLike,
        enumValues: column.enumValues ? JSON.stringify(column.enumValues) : null,
        extractionCycleId,
        namespace,
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH PRIMITIVES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create node in Memgraph
   * @private
   */
  async _createNode({ labels, properties }) {
    const nodeId = uuidv4();
    const labelsStr = labels.map(l => `:${l}`).join('');

    const propsWithId = { ...properties, id: nodeId, createdAt: new Date().toISOString() };

    const query = `
      CREATE (n${labelsStr} $props)
      RETURN n.id as nodeId
    `;

    try {
      await this.memgraph.query(query, { props: propsWithId });
      return nodeId;
    } catch (error) {
      console.error('[MSSQLGraphGenerator] Failed to create node:', error.message);
      throw error;
    }
  }

  /**
   * Create edge in Memgraph
   * @private
   */
  async _createEdge({ sourceId, targetId, type, properties = {} }) {
    const edgeId = uuidv4();
    const propsWithId = { ...properties, id: edgeId, createdAt: new Date().toISOString() };

    const query = `
      MATCH (source {id: $sourceId}), (target {id: $targetId})
      CREATE (source)-[r:${type} $props]->(target)
      RETURN r
    `;

    try {
      await this.memgraph.query(query, { sourceId, targetId, props: propsWithId });
      return edgeId;
    } catch (error) {
      console.error('[MSSQLGraphGenerator] Failed to create edge:', error.message);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VECTORIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Vectorize analysis results for semantic search
   * @private
   */
  async _vectorizeAnalysis(analysisResult, collectionName, extractionCycleId) {
    const points = [];

    for (const schema of analysisResult.schemas) {
      // Vectorize tables
      for (const table of schema.tables) {
        const text = this._buildTableTextForEmbedding(table, schema.schemaName);

        try {
          const embedding = await this.tei.embed(text);

          points.push({
            id: uuidv4(),
            vector: embedding,
            payload: {
              type: 'TABLE',
              name: table.entityName,
              originalName: table._meta?.originalName,
              schema: schema.schemaName,
              database: analysisResult.database,
              businessDomain: table.businessDomain,
              description: table.entityDescription,
              namespace: this.domain.getCurrentNamespace(),
              extractionCycleId,
              text: text.substring(0, 1000),
            },
          });
        } catch (err) {
          console.warn(`[MSSQLGraphGenerator] Failed to embed table ${table.entityName}:`, err.message);
        }
      }

      // Vectorize stored procedures
      for (const proc of schema.procedures || []) {
        const text = `Stored Procedure: ${proc.name}\nPurpose: ${proc.businessPurpose}\nAffected Tables: ${proc.affectedTables?.join(', ') || 'none'}\nBusiness Rules: ${proc.businessRules?.join('; ') || 'none'}`;

        try {
          const embedding = await this.tei.embed(text);

          points.push({
            id: uuidv4(),
            vector: embedding,
            payload: {
              type: 'STORED_PROCEDURE',
              name: proc.name,
              schema: schema.schemaName,
              database: analysisResult.database,
              businessPurpose: proc.businessPurpose,
              namespace: this.domain.getCurrentNamespace(),
              extractionCycleId,
              text: text.substring(0, 1000),
            },
          });
        } catch (err) {
          console.warn(`[MSSQLGraphGenerator] Failed to embed procedure ${proc.name}:`, err.message);
        }
      }
    }

    // Batch upsert to Qdrant
    if (points.length > 0) {
      try {
        const batchSize = 100;
        for (let i = 0; i < points.length; i += batchSize) {
          const batch = points.slice(i, i + batchSize);
          await this.qdrant.upsertPoints(collectionName, batch);
        }
        console.log(`[MSSQLGraphGenerator] Vectorized ${points.length} entities to ${collectionName}`);
      } catch (err) {
        console.error('[MSSQLGraphGenerator] Failed to upsert to Qdrant:', err.message);
      }
    }
  }

  /**
   * Build text representation of table for embedding
   * @private
   */
  _buildTableTextForEmbedding(table, schemaName) {
    const parts = [
      `Table: ${table.entityName}`,
      `Schema: ${schemaName}`,
      `Description: ${table.entityDescription || 'No description'}`,
      `Business Domain: ${table.businessDomain || 'Unknown'}`,
    ];

    if (table.columns && table.columns.length > 0) {
      const columnDescs = table.columns
        .slice(0, 20)
        .map(c => `${c.name} (${c.businessMeaning || c.dataClassification || 'unknown'})`)
        .join(', ');
      parts.push(`Columns: ${columnDescs}`);
    }

    if (table.relationships && table.relationships.length > 0) {
      const relDescs = table.relationships
        .map(r => `${r.type} to ${r.relatedTable}: ${r.businessMeaning || ''}`)
        .join('; ');
      parts.push(`Relationships: ${relDescs}`);
    }

    if (table.inferredBusinessRules && table.inferredBusinessRules.length > 0) {
      parts.push(`Business Rules: ${table.inferredBusinessRules.join('; ')}`);
    }

    return parts.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Delete all nodes and edges for a given extractionCycleId (rollback/cleanup)
   * @param {string} extractionCycleId
   */
  async deleteExtractionCycle(extractionCycleId) {
    try {
      await this.memgraph.query(`
        MATCH ()-[r {extractionCycleId: $cycleId}]-()
        DELETE r
      `, { cycleId: extractionCycleId });

      await this.memgraph.query(`
        MATCH (n {extractionCycleId: $cycleId})
        DETACH DELETE n
      `, { cycleId: extractionCycleId });

      console.log(`[MSSQLGraphGenerator] Deleted extraction cycle: ${extractionCycleId}`);
    } catch (error) {
      console.error('[MSSQLGraphGenerator] Failed to delete extraction cycle:', error.message);
      throw error;
    }
  }

  /**
   * Get statistics for a given extractionCycleId
   * @param {string} extractionCycleId
   */
  async getExtractionStats(extractionCycleId) {
    const result = await this.memgraph.query(`
      MATCH (n {extractionCycleId: $cycleId})
      WITH labels(n) as nodeLabels, count(*) as cnt
      UNWIND nodeLabels as label
      RETURN label, sum(cnt) as count
      ORDER BY count DESC
    `, { cycleId: extractionCycleId });

    return (result || []).map(r => ({ label: r.label, count: r.count }));
  }
}

module.exports = { MSSQLGraphGenerator };
