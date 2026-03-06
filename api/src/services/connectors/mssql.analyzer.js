/**
 * MSSQL Semantic Analyzer
 * Uses LLM to analyze database structure and extract business semantics.
 * Provides both LLM-powered and fallback (heuristic) analysis.
 *
 * @module services/connectors/mssql-analyzer
 */

const { ENTITY_CATEGORIES, DB_TO_GRAPH_LABELS } = require('../../config/mssql.config');

class MSSQLSemanticAnalyzer {
  /**
   * @param {Object} llmService - LLM provider (Ollama/Gemini via llm.service.js)
   */
  constructor(llmService) {
    this.llm = llmService;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build LLM prompt for table analysis
   * @param {Object} tableInfo
   * @param {Array} columns
   * @param {Array} constraints
   * @param {Object} sample
   * @param {Object} dbContext
   * @returns {string}
   */
  buildTableAnalysisPrompt(tableInfo, columns, constraints, sample, dbContext) {
    const columnsDesc = columns.map(c => {
      let desc = `- ${c.column_name} (${c.data_type}`;
      if (c.max_length > 0 && c.max_length < 8000) desc += `(${c.max_length})`;
      desc += ')';
      if (c.is_primary_key) desc += ' [PK]';
      if (c.fk_constraint_name) {
        desc += ` [FK -> ${c.referenced_schema}.${c.referenced_table}.${c.referenced_column}]`;
      }
      desc += c.is_nullable ? ' NULLABLE' : ' NOT NULL';
      if (c.default_value) desc += ` DEFAULT ${c.default_value}`;
      if (c.description) desc += ` -- ${c.description}`;
      return desc;
    }).join('\n');

    const constraintsDesc = constraints.map(c => {
      if (c.constraint_type === 'FOREIGN KEY') {
        return `- ${c.constraint_type}: ${c.constraint_name} (${c.columns}) -> ${c.referenced_schema}.${c.referenced_table}(${c.referenced_columns})`;
      }
      return `- ${c.constraint_type}: ${c.constraint_name} (${c.columns || c.definition || ''})`;
    }).join('\n');

    const sampleRowsJson = JSON.stringify(sample.topRows?.slice(0, 5) || [], null, 2);

    const statsDesc = (sample.columnStatistics || []).map(s => {
      let line = `- ${s.columnName}: ${s.nullPercentage}% null`;
      if (s.min !== undefined && s.min !== null) line += `, range: [${s.min}, ${s.max}]`;
      if (s.avgLength) line += `, avg_len: ${Math.round(s.avgLength)}`;
      return line;
    }).join('\n');

    const enumDesc = Object.entries(sample.distinctValues || {}).map(([col, vals]) => {
      const values = vals.slice(0, 10).map(v => v.val);
      return `- ${col}: ${JSON.stringify(values)}${vals.length > 10 ? ` (+${vals.length - 10} more)` : ''}`;
    }).join('\n');

    return `You are analyzing a database table to extract business semantics and relationships.

## Database: ${dbContext.databaseName}
## Schema: ${dbContext.schemaName}
## Table: ${tableInfo.table_name}
${tableInfo.description ? `Description: ${tableInfo.description}` : 'No description available.'}
Row count: ${sample.totalRows || 'unknown'}

## Columns:
${columnsDesc}

## Constraints:
${constraintsDesc || 'None'}

## Sample Data (first 5 rows):
${sampleRowsJson}

## Column Statistics:
${statsDesc || 'Not available'}

## Low-Cardinality Columns (potential enums):
${enumDesc || 'None detected'}

## Other tables in this schema:
${dbContext.otherTables?.join(', ') || 'unknown'}

---

Analyze this table and respond with ONLY a valid JSON object (no markdown, no explanation):

{
  "entityName": "Business name for this entity (e.g., 'Employee', 'PayrollRecord')",
  "entityDescription": "What this table stores in business terms (1-2 sentences)",
  "businessDomain": "One of: HR, Finance, Logistics, Auth, Audit, Config, Master, Transaction, Reference, Other",
  "columns": [
    {
      "name": "column_name",
      "businessMeaning": "What this column represents",
      "dataClassification": "One of: IDENTIFIER, ATTRIBUTE, MEASURE, TIMESTAMP, STATUS, REFERENCE, COMPUTED, AUDIT",
      "isEnumLike": true,
      "enumValues": ["val1", "val2"],
      "possibleBusinessRules": ["Rule if apparent"]
    }
  ],
  "relationships": [
    {
      "type": "FK or INFERRED or SEMANTIC",
      "relatedTable": "schema.table",
      "cardinality": "1:1 or 1:N or N:M",
      "businessMeaning": "What this relationship represents",
      "evidence": "FK constraint / naming pattern / data correlation"
    }
  ],
  "inferredBusinessRules": [
    "Business rules apparent from constraints or data patterns"
  ],
  "anomalies": [
    "Potential issues: dead columns, denormalization, naming inconsistencies"
  ],
  "confidence": 0.85
}`;
  }

  /**
   * Analyze a table using LLM with fallback
   * @param {Object} tableInfo
   * @param {Array} columns
   * @param {Array} constraints
   * @param {Object} sample
   * @param {Object} dbContext
   * @returns {Promise<Object>}
   */
  async analyzeTable(tableInfo, columns, constraints, sample, dbContext) {
    const prompt = this.buildTableAnalysisPrompt(tableInfo, columns, constraints, sample, dbContext);

    try {
      const response = await this.llm.chat([
        {
          role: 'system',
          content: 'You are a database schema analyst. Respond ONLY with valid JSON, no markdown formatting, no code blocks, no explanation.'
        },
        { role: 'user', content: prompt }
      ]);

      // Extract response text (handle different LLM response formats)
      const text = typeof response === 'string' ? response
        : response?.choices?.[0]?.message?.content
        || response?.message?.content
        || response?.content
        || JSON.stringify(response);

      const jsonStr = this._extractJson(text);
      const analysis = JSON.parse(jsonStr);

      return this._normalizeTableAnalysis(analysis, tableInfo, columns, constraints);
    } catch (error) {
      console.error(`[MSSQLAnalyzer] Failed to analyze table ${tableInfo.table_name}:`, error.message);
      return this._fallbackTableAnalysis(tableInfo, columns, constraints, sample);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCEDURE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build LLM prompt for stored procedure analysis
   * @param {Object} procedureInfo
   * @returns {string}
   */
  buildProcedureAnalysisPrompt(procedureInfo) {
    return `Analyze this SQL Server stored procedure to extract business logic.

## Procedure: ${procedureInfo.schema_name}.${procedureInfo.object_name}
${procedureInfo.description ? `Description: ${procedureInfo.description}` : ''}
Parameters: ${procedureInfo.param_count || 0}

## Definition:
${procedureInfo.definition || 'Definition not available'}

---

Respond with ONLY a valid JSON object:

{
  "businessPurpose": "What this procedure does in business terms",
  "affectedTables": ["schema.table1", "schema.table2"],
  "businessRules": [
    "Business rule 1 implemented in this procedure",
    "Business rule 2"
  ],
  "complexity": "LOW or MEDIUM or HIGH",
  "sideEffects": ["What changes this procedure makes"],
  "inputValidations": ["Validations performed on inputs"]
}`;
  }

  /**
   * Analyze stored procedure using LLM
   * @param {Object} procedureInfo
   * @returns {Promise<Object>}
   */
  async analyzeProcedure(procedureInfo) {
    // Skip very large procedures (>50KB)
    if (procedureInfo.definition && procedureInfo.definition.length > 50000) {
      return {
        name: `${procedureInfo.schema_name}.${procedureInfo.object_name}`,
        businessPurpose: 'Large procedure - manual review recommended',
        affectedTables: this._extractTablesFromDefinition(procedureInfo.definition),
        businessRules: [],
        complexity: 'HIGH',
      };
    }

    const prompt = this.buildProcedureAnalysisPrompt(procedureInfo);

    try {
      const response = await this.llm.chat([
        {
          role: 'system',
          content: 'You are a SQL code analyst. Respond ONLY with valid JSON.'
        },
        { role: 'user', content: prompt }
      ]);

      const text = typeof response === 'string' ? response
        : response?.choices?.[0]?.message?.content
        || response?.message?.content
        || response?.content
        || JSON.stringify(response);

      const jsonStr = this._extractJson(text);
      const analysis = JSON.parse(jsonStr);

      return {
        name: `${procedureInfo.schema_name}.${procedureInfo.object_name}`,
        businessPurpose: analysis.businessPurpose || 'Unknown',
        affectedTables: analysis.affectedTables || [],
        businessRules: analysis.businessRules || [],
        complexity: analysis.complexity || 'MEDIUM',
      };
    } catch (error) {
      console.error(`[MSSQLAnalyzer] Failed to analyze procedure ${procedureInfo.object_name}:`, error.message);

      return {
        name: `${procedureInfo.schema_name}.${procedureInfo.object_name}`,
        businessPurpose: 'Analysis failed',
        affectedTables: this._extractTablesFromDefinition(procedureInfo.definition),
        businessRules: [],
        complexity: 'MEDIUM',
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL DATABASE ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Perform full database analysis
   * @param {Object} mssqlConnector - MSSQLConnector instance
   * @param {Object} options
   * @param {string[]} [options.schemas] - Schemas to analyze
   * @param {number} [options.sampleSize=50]
   * @param {boolean} [options.analyzeStoredProcedures=true]
   * @param {Function} [options.onProgress] - Progress callback
   * @param {string} [options.domainId]
   * @returns {Promise<Object>}
   */
  async analyzeDatabase(mssqlConnector, options = {}) {
    const {
      schemas: targetSchemas,
      sampleSize = 50,
      analyzeStoredProcedures = true,
      onProgress = () => {},
    } = options;

    const connInfo = mssqlConnector.getConnectionInfo();
    const result = {
      database: connInfo.databaseName,
      analyzedAt: new Date(),
      domainId: options.domainId || null,
      schemas: [],
      globalRelationships: [],
      overallComplexityScore: 0,
    };

    // 1. Discover schemas
    onProgress({ phase: 'schema_discovery', message: 'Discovering schemas...' });
    let allSchemas = await mssqlConnector.getSchemas();

    if (targetSchemas && targetSchemas.length > 0) {
      allSchemas = allSchemas.filter(s => targetSchemas.includes(s.schema_name));
    }

    const totalTables = allSchemas.reduce((sum, s) => sum + s.table_count, 0);
    let processedTables = 0;

    // 2. Analyze each schema
    for (const schema of allSchemas) {
      onProgress({
        phase: 'schema_analysis',
        message: `Analyzing schema: ${schema.schema_name}`,
        current: result.schemas.length,
        total: allSchemas.length,
      });

      const schemaAnalysis = {
        schemaName: schema.schema_name,
        tables: [],
        procedures: [],
        views: [],
      };

      // 2.1 Get schema tables
      const tables = await mssqlConnector.getTables({
        schema: schema.schema_name,
        includeViews: true,
        includeRowCounts: true,
      });

      const otherTables = tables.map(t => t.table_name);

      // 2.2 Analyze each table
      for (const table of tables) {
        processedTables++;
        onProgress({
          phase: 'table_analysis',
          message: `Analyzing ${schema.schema_name}.${table.table_name}`,
          current: processedTables,
          total: totalTables,
        });

        try {
          const [columns, constraints, sample] = await Promise.all([
            mssqlConnector.getColumns(schema.schema_name, table.table_name),
            mssqlConnector.getConstraints(schema.schema_name, table.table_name),
            mssqlConnector.sampleData(schema.schema_name, table.table_name, {
              sampleSize,
              includeStatistics: true,
              includeDistinctValues: true,
            }),
          ]);

          const dbContext = {
            databaseName: connInfo.databaseName,
            schemaName: schema.schema_name,
            otherTables: otherTables.filter(t => t !== table.table_name),
          };

          const tableAnalysis = await this.analyzeTable(
            table, columns, constraints, sample, dbContext
          );

          if (table.table_type === 'VIEW') {
            schemaAnalysis.views.push(tableAnalysis);
          } else {
            schemaAnalysis.tables.push(tableAnalysis);
          }

          // Collect global FK relationships
          for (const rel of tableAnalysis.relationships || []) {
            if (rel.type === 'FK') {
              result.globalRelationships.push({
                ...rel,
                sourceTable: `${schema.schema_name}.${table.table_name}`,
              });
            }
          }
        } catch (err) {
          console.error(`[MSSQLAnalyzer] Error analyzing ${schema.schema_name}.${table.table_name}:`, err.message);
        }
      }

      // 2.3 Analyze stored procedures
      if (analyzeStoredProcedures && schema.procedure_count > 0) {
        onProgress({
          phase: 'procedure_analysis',
          message: `Analyzing procedures in ${schema.schema_name}`,
        });

        const procedures = await mssqlConnector.getProcedures({
          schema: schema.schema_name,
          includeTriggers: true,
          includeDefinition: true,
        });

        for (const proc of procedures) {
          try {
            const procAnalysis = await this.analyzeProcedure(proc);
            schemaAnalysis.procedures.push(procAnalysis);
          } catch (err) {
            console.error(`[MSSQLAnalyzer] Error analyzing procedure ${proc.object_name}:`, err.message);
          }
        }
      }

      result.schemas.push(schemaAnalysis);
    }

    // 3. Calculate complexity score
    result.overallComplexityScore = this._calculateComplexityScore(result);

    onProgress({
      phase: 'complete',
      message: 'Analysis complete',
      result: {
        schemas: result.schemas.length,
        tables: result.schemas.reduce((sum, s) => sum + s.tables.length, 0),
        procedures: result.schemas.reduce((sum, s) => sum + s.procedures.length, 0),
      },
    });

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract JSON from LLM response (strip markdown)
   * @private
   */
  _extractJson(text) {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      throw new Error('No valid JSON object found in response');
    }

    return cleaned.substring(start, end + 1);
  }

  /**
   * Normalize and validate table analysis result
   * @private
   */
  _normalizeTableAnalysis(analysis, tableInfo, columns, constraints) {
    // Add FK relationships missing from LLM analysis
    const fkRelationships = [];
    for (const col of columns) {
      if (col.fk_constraint_name && col.referenced_table) {
        const exists = (analysis.relationships || []).some(
          r => r.relatedTable?.includes(col.referenced_table)
        );
        if (!exists) {
          fkRelationships.push({
            type: 'FK',
            relatedTable: `${col.referenced_schema}.${col.referenced_table}`,
            cardinality: '1:N',
            businessMeaning: `References ${col.referenced_table}`,
            evidence: `FK constraint: ${col.fk_constraint_name}`,
          });
        }
      }
    }

    return {
      entityName: analysis.entityName || tableInfo.table_name,
      entityDescription: analysis.entityDescription || tableInfo.description || '',
      businessDomain: analysis.businessDomain || 'Other',
      columns: (analysis.columns || []).map(col => ({
        name: col.name,
        businessMeaning: col.businessMeaning || '',
        dataClassification: col.dataClassification || 'ATTRIBUTE',
        isEnumLike: col.isEnumLike || false,
        enumValues: col.enumValues || null,
        possibleBusinessRules: col.possibleBusinessRules || [],
      })),
      relationships: [...(analysis.relationships || []), ...fkRelationships],
      inferredBusinessRules: analysis.inferredBusinessRules || [],
      anomalies: analysis.anomalies || [],
      confidence: Math.min(1, Math.max(0, analysis.confidence || 0.5)),
      _meta: {
        originalName: `${tableInfo.schema_name}.${tableInfo.table_name}`,
        tableType: tableInfo.table_type,
        columnCount: columns.length,
        constraintCount: constraints.length,
      },
    };
  }

  /**
   * Fallback analysis using heuristics (no LLM)
   * @private
   */
  _fallbackTableAnalysis(tableInfo, columns, constraints, sample) {
    const entityName = this._inferEntityName(tableInfo.table_name);
    const businessDomain = this._inferBusinessDomain(tableInfo.table_name, columns);

    const columnAnalyses = columns.map(col => ({
      name: col.column_name,
      businessMeaning: this._inferColumnMeaning(col),
      dataClassification: this._inferDataClassification(col),
      isEnumLike: (sample.distinctValues?.[col.column_name]?.length || 0) <= 20,
      enumValues: sample.distinctValues?.[col.column_name]?.map(v => v.val) || null,
      possibleBusinessRules: [],
    }));

    const relationships = columns
      .filter(c => c.fk_constraint_name)
      .map(col => ({
        type: 'FK',
        relatedTable: `${col.referenced_schema}.${col.referenced_table}`,
        cardinality: '1:N',
        businessMeaning: `References ${col.referenced_table}`,
        evidence: `FK: ${col.fk_constraint_name}`,
      }));

    const anomalies = [];

    // Detect dead columns (100% null)
    for (const stat of sample.columnStatistics || []) {
      if (parseFloat(stat.nullPercentage) >= 100) {
        anomalies.push(`Dead column: ${stat.columnName} is 100% NULL`);
      }
    }

    return {
      entityName,
      entityDescription: tableInfo.description || `${entityName} data`,
      businessDomain,
      columns: columnAnalyses,
      relationships,
      inferredBusinessRules: [],
      anomalies,
      confidence: 0.3,
      _meta: {
        originalName: `${tableInfo.schema_name}.${tableInfo.table_name}`,
        tableType: tableInfo.table_type,
        columnCount: columns.length,
        constraintCount: constraints.length,
        fallback: true,
      },
    };
  }

  /**
   * Extract table names from SQL definition via regex
   * @private
   */
  _extractTablesFromDefinition(definition) {
    if (!definition) return [];

    const tables = new Set();

    const patterns = [
      /FROM\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi,
      /JOIN\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi,
      /INTO\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi,
      /UPDATE\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(definition)) !== null) {
        tables.add(`${match[1]}.${match[2]}`);
      }
    }

    return Array.from(tables);
  }

  /**
   * Infer entity name from table name
   * @private
   */
  _inferEntityName(tableName) {
    let name = tableName.replace(/^(tbl_|vw_|v_|t_|dim_|fact_)/i, '');

    name = name
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');

    return name;
  }

  /**
   * Infer business domain from table/column names
   * @private
   */
  _inferBusinessDomain(tableName, columns) {
    const name = tableName.toLowerCase();
    const colNames = columns.map(c => c.column_name.toLowerCase()).join(' ');

    if (/employee|staff|person|user|worker|hr_/i.test(name + colNames)) return 'HR';
    if (/payment|invoice|account|budget|finance|amount|price/i.test(name + colNames)) return 'Finance';
    if (/order|shipment|inventory|warehouse|logistics/i.test(name + colNames)) return 'Logistics';
    if (/login|password|role|permission|auth/i.test(name + colNames)) return 'Auth';
    if (/log|audit|history|track/i.test(name + colNames)) return 'Audit';
    if (/config|setting|parameter/i.test(name + colNames)) return 'Config';
    if (/lookup|ref_|reference|code/i.test(name + colNames)) return 'Reference';

    return 'Other';
  }

  /**
   * Infer column meaning from metadata
   * @private
   */
  _inferColumnMeaning(column) {
    const name = column.column_name.toLowerCase();

    if (column.is_primary_key) return 'Primary identifier';
    if (column.fk_constraint_name) return `Reference to ${column.referenced_table}`;
    if (/^(id|_id)$/i.test(name) || name.endsWith('_id')) return 'Identifier';
    if (/created|inserted/i.test(name)) return 'Creation timestamp';
    if (/modified|updated/i.test(name)) return 'Modification timestamp';
    if (/deleted/i.test(name)) return 'Deletion flag/timestamp';
    if (/name|title|label/i.test(name)) return 'Display name';
    if (/desc|description/i.test(name)) return 'Description text';
    if (/status|state/i.test(name)) return 'Status indicator';
    if (/amount|total|sum|price|cost/i.test(name)) return 'Monetary value';
    if (/count|qty|quantity/i.test(name)) return 'Quantity';
    if (/date|_dt$/i.test(name)) return 'Date value';
    if (/email/i.test(name)) return 'Email address';
    if (/phone|tel/i.test(name)) return 'Phone number';
    if (/address/i.test(name)) return 'Address';
    if (/active|enabled|flag/i.test(name)) return 'Boolean flag';

    return '';
  }

  /**
   * Infer data classification from column metadata
   * @private
   */
  _inferDataClassification(column) {
    const name = column.column_name.toLowerCase();
    const type = column.data_type.toLowerCase();

    if (column.is_primary_key) return 'IDENTIFIER';
    if (column.fk_constraint_name) return 'REFERENCE';
    if (column.is_computed) return 'COMPUTED';

    if (/created|modified|updated|deleted|timestamp/i.test(name)) return 'TIMESTAMP';
    if (/status|state|type|category/i.test(name)) return 'STATUS';
    if (/amount|total|sum|count|qty|price|cost/i.test(name)) return 'MEASURE';
    if (/^(id|_id)$/i.test(name) || name.endsWith('_id')) return 'IDENTIFIER';
    if (/by$|_by$/i.test(name)) return 'AUDIT';

    if (['datetime', 'datetime2', 'date', 'time', 'datetimeoffset'].includes(type)) {
      return 'TIMESTAMP';
    }
    if (['int', 'bigint', 'decimal', 'numeric', 'float', 'money'].includes(type)) {
      if (/id$/i.test(name)) return 'IDENTIFIER';
      return 'MEASURE';
    }

    return 'ATTRIBUTE';
  }

  /**
   * Calculate overall database complexity score (0-10)
   * @private
   */
  _calculateComplexityScore(result) {
    let score = 0;

    const tableCount = result.schemas.reduce((sum, s) => sum + s.tables.length, 0);
    const procCount = result.schemas.reduce((sum, s) => sum + s.procedures.length, 0);
    const relCount = result.globalRelationships.length;

    score += Math.min(tableCount / 10, 5);  // Max 5 points from tables
    score += Math.min(procCount / 5, 3);    // Max 3 points from procedures
    score += Math.min(relCount / 20, 2);    // Max 2 points from relationships

    return Math.round(score * 10) / 10;
  }
}

module.exports = { MSSQLSemanticAnalyzer };
