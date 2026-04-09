/**
 * MssqlStratifiedSampler
 *
 * Executes type-aware sampling strategies for SQL Server tables.
 * Uses classification from MssqlTableClassifier to determine
 * how to read data from each table type.
 *
 * Strategies:
 *   FULL_READ           — reference tables: SELECT * (small tables)
 *   STRATIFIED          — master data: top N + random N + recent N + distinct enums
 *   TEMPORAL_STRATIFIED — transactions: recent period + historical sample + aggregates
 *   RECENT_ONLY         — logs: recent N days + aggregate stats
 *   STRUCTURE_ONLY      — junctions: small sample + cardinality count
 *   EXPLORATORY         — unknown: general sample + distribution analysis
 */

const { SAMPLING_STRATEGIES } = require('./mssql.classifier');

class MssqlStratifiedSampler {
  /**
   * @param {Object} connector - MSSQLConnector instance
   */
  constructor(connector) {
    this.connector = connector;
  }

  /**
   * Sample a table according to its classification.
   *
   * @param {string} schema - Schema name
   * @param {string} tableName - Table name
   * @param {Object} classification - Output of MssqlTableClassifier.classify()
   * @param {Array} columns - Column metadata from connector.getColumns()
   * @returns {Promise<SampleResult>}
   */
  async sample(schema, tableName, classification, columns) {
    const strategy = classification.samplingStrategy || SAMPLING_STRATEGIES.unknown;
    const fqn = `[${schema}].[${tableName}]`;

    switch (strategy.method) {
      case 'FULL_READ':
        return this._fullRead(schema, tableName, fqn, columns, strategy.params);
      case 'STRATIFIED':
        return this._stratified(schema, tableName, fqn, columns, strategy.params);
      case 'TEMPORAL_STRATIFIED':
        return this._temporalStratified(schema, tableName, fqn, columns, strategy.params);
      case 'RECENT_ONLY':
        return this._recentOnly(schema, tableName, fqn, columns, strategy.params);
      case 'STRUCTURE_ONLY':
        return this._structureOnly(schema, tableName, fqn, columns, strategy.params);
      case 'EXPLORATORY':
      default:
        return this._exploratory(schema, tableName, fqn, columns, strategy.params);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Strategy Implementations
  // ═══════════════════════════════════════════════════════════════════

  /**
   * FULL_READ — read all rows from small reference/lookup tables.
   */
  async _fullRead(schema, tableName, fqn, columns, params) {
    const limit = parseInt(params.limit) || 10000; // safety cap
    const query = `SELECT TOP (${limit}) * FROM ${fqn}`;
    const rows = await this._executeQuery(query);

    const distinctValues = await this._getDistinctValues(fqn, columns);

    return {
      method: 'FULL_READ',
      tableName: `${schema}.${tableName}`,
      totalRows: rows.length,
      isComplete: rows.length < limit,
      rows,
      distinctValues,
      aggregates: null,
      sampledAt: new Date().toISOString(),
    };
  }

  /**
   * STRATIFIED — top N + random N + recent N + distinct enums for master data.
   */
  async _stratified(schema, tableName, fqn, columns, params) {
    const { topN = 100, randomN = 100, recentN = 50, distinctEnums = true } = params;

    // Top N rows (by PK or first column)
    const topRows = await this._executeQuery(`SELECT TOP (${topN}) * FROM ${fqn}`);

    // Random N rows
    const randomRows = await this._executeQuery(
      `SELECT TOP (${randomN}) * FROM ${fqn} ORDER BY NEWID()`,
    );

    // Recent N rows (if a date column exists)
    const dateCol = this._findDateColumn(columns);
    let recentRows = [];
    if (dateCol) {
      recentRows = await this._executeQuery(
        `SELECT TOP (${recentN}) * FROM ${fqn} ORDER BY [${dateCol}] DESC`,
      );
    }

    // Distinct values for enum-like columns
    let distinctValues = {};
    if (distinctEnums) {
      distinctValues = await this._getDistinctValues(fqn, columns);
    }

    // Row count
    const countResult = await this._executeQuery(`SELECT COUNT(*) AS cnt FROM ${fqn}`);
    const totalRows = countResult[0]?.cnt || 0;

    return {
      method: 'STRATIFIED',
      tableName: `${schema}.${tableName}`,
      totalRows,
      isComplete: false,
      topRows,
      randomRows,
      recentRows,
      rows: this._deduplicateRows(topRows, randomRows, recentRows),
      distinctValues,
      aggregates: null,
      sampledAt: new Date().toISOString(),
    };
  }

  /**
   * TEMPORAL_STRATIFIED — recent period + historical sample + aggregates for transactions.
   */
  async _temporalStratified(schema, tableName, fqn, columns, params) {
    const { recentDays = 90, recentSample = 200, historicalSample = 100, aggregates = true } = params;

    const dateCol = this._findDateColumn(columns);

    let recentRows = [];
    let historicalRows = [];

    if (dateCol) {
      // Recent data (last N days)
      recentRows = await this._executeQuery(
        `SELECT TOP (${recentSample}) * FROM ${fqn} WHERE [${dateCol}] >= DATEADD(DAY, -${recentDays}, GETDATE()) ORDER BY [${dateCol}] DESC`,
      );

      // Historical sample (older data, random)
      historicalRows = await this._executeQuery(
        `SELECT TOP (${historicalSample}) * FROM ${fqn} WHERE [${dateCol}] < DATEADD(DAY, -${recentDays}, GETDATE()) ORDER BY NEWID()`,
      );
    } else {
      // No date column — fallback to random sample
      recentRows = await this._executeQuery(
        `SELECT TOP (${recentSample}) * FROM ${fqn} ORDER BY NEWID()`,
      );
    }

    // Aggregates
    let aggResult = null;
    if (aggregates) {
      aggResult = await this._computeAggregates(fqn, columns, dateCol);
    }

    const countResult = await this._executeQuery(`SELECT COUNT(*) AS cnt FROM ${fqn}`);
    const totalRows = countResult[0]?.cnt || 0;

    return {
      method: 'TEMPORAL_STRATIFIED',
      tableName: `${schema}.${tableName}`,
      totalRows,
      isComplete: false,
      recentRows,
      historicalRows,
      rows: this._deduplicateRows(recentRows, historicalRows),
      distinctValues: {},
      aggregates: aggResult,
      sampledAt: new Date().toISOString(),
    };
  }

  /**
   * RECENT_ONLY — recent records + aggregate stats for log/audit tables.
   */
  async _recentOnly(schema, tableName, fqn, columns, params) {
    const { recentDays = 30, sample = 100, aggregatesOnly = true } = params;

    const dateCol = this._findDateColumn(columns);

    let rows = [];
    if (dateCol) {
      rows = await this._executeQuery(
        `SELECT TOP (${sample}) * FROM ${fqn} WHERE [${dateCol}] >= DATEADD(DAY, -${recentDays}, GETDATE()) ORDER BY [${dateCol}] DESC`,
      );
    } else {
      rows = await this._executeQuery(`SELECT TOP (${sample}) * FROM ${fqn}`);
    }

    const countResult = await this._executeQuery(`SELECT COUNT(*) AS cnt FROM ${fqn}`);
    const totalRows = countResult[0]?.cnt || 0;

    // Aggregates (always for log tables)
    const aggResult = await this._computeAggregates(fqn, columns, dateCol);

    return {
      method: 'RECENT_ONLY',
      tableName: `${schema}.${tableName}`,
      totalRows,
      isComplete: false,
      rows,
      distinctValues: {},
      aggregates: aggResult,
      sampledAt: new Date().toISOString(),
    };
  }

  /**
   * STRUCTURE_ONLY — small sample + cardinality for junction tables.
   */
  async _structureOnly(schema, tableName, fqn, columns, params) {
    const { sample = 50 } = params;

    const rows = await this._executeQuery(`SELECT TOP (${sample}) * FROM ${fqn}`);

    const countResult = await this._executeQuery(`SELECT COUNT(*) AS cnt FROM ${fqn}`);
    const totalRows = countResult[0]?.cnt || 0;

    // Cardinality of FK columns
    const fkColumns = columns.filter((c) => c.referenced_table);
    const cardinality = {};
    for (const col of fkColumns) {
      const colName = col.column_name || col.name;
      try {
        const result = await this._executeQuery(
          `SELECT COUNT(DISTINCT [${colName}]) AS distinct_count FROM ${fqn}`,
        );
        cardinality[colName] = {
          distinctCount: result[0]?.distinct_count || 0,
          referencedTable: `${col.referenced_schema || schema}.${col.referenced_table}`,
        };
      } catch {
        cardinality[colName] = { distinctCount: -1, error: true };
      }
    }

    return {
      method: 'STRUCTURE_ONLY',
      tableName: `${schema}.${tableName}`,
      totalRows,
      isComplete: totalRows <= sample,
      rows,
      distinctValues: {},
      aggregates: null,
      cardinality,
      sampledAt: new Date().toISOString(),
    };
  }

  /**
   * EXPLORATORY — general sample + distribution analysis for unknown tables.
   */
  async _exploratory(schema, tableName, fqn, columns, params) {
    const { sample = 100, analyzeDistribution = true } = params;

    const rows = await this._executeQuery(`SELECT TOP (${sample}) * FROM ${fqn} ORDER BY NEWID()`);

    const countResult = await this._executeQuery(`SELECT COUNT(*) AS cnt FROM ${fqn}`);
    const totalRows = countResult[0]?.cnt || 0;

    let distinctValues = {};
    if (analyzeDistribution) {
      distinctValues = await this._getDistinctValues(fqn, columns);
    }

    const aggResult = await this._computeAggregates(fqn, columns, this._findDateColumn(columns));

    return {
      method: 'EXPLORATORY',
      tableName: `${schema}.${tableName}`,
      totalRows,
      isComplete: totalRows <= sample,
      rows,
      distinctValues,
      aggregates: aggResult,
      sampledAt: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  async _executeQuery(query) {
    try {
      const result = await this.connector.executeReadOnlyQuery(query);
      // executeReadOnlyQuery returns {columns, rows, rowCount, truncated}
      return result.rows || result || [];
    } catch (err) {
      console.warn(`[Sampler] Query failed: ${err.message}\n  SQL: ${query.substring(0, 200)}`);
      return [];
    }
  }

  /**
   * Find the best date/timestamp column for temporal ordering.
   */
  _findDateColumn(columns) {
    const datePatterns = [
      /^created/i, /^modified/i, /^updated/i, /^inserted/i,
      /date$/i, /time$/i, /_at$/i, /_on$/i,
      /timestamp/i, /logged/i, /occurred/i,
    ];

    const dateTypes = ['datetime', 'datetime2', 'smalldatetime', 'date', 'datetimeoffset'];

    for (const pattern of datePatterns) {
      const col = columns.find(
        (c) =>
          pattern.test(c.column_name || c.name) &&
          dateTypes.includes((c.data_type || '').toLowerCase()),
      );
      if (col) return col.column_name || col.name;
    }

    // Fallback: any datetime column
    const anyDate = columns.find((c) => dateTypes.includes((c.data_type || '').toLowerCase()));
    return anyDate ? anyDate.column_name || anyDate.name : null;
  }

  /**
   * Get distinct values for low-cardinality (enum-like) columns.
   */
  async _getDistinctValues(fqn, columns, maxDistinct = 50) {
    const result = {};
    const candidates = columns.filter((c) => {
      const dt = (c.data_type || '').toLowerCase();
      return (
        ['varchar', 'nvarchar', 'char', 'nchar', 'int', 'smallint', 'tinyint', 'bit'].includes(dt) &&
        (c.max_length || 255) <= 255
      );
    });

    for (const col of candidates.slice(0, 15)) {
      const colName = col.column_name || col.name;
      try {
        const rows = await this._executeQuery(
          `SELECT TOP (${maxDistinct}) [${colName}] AS val, COUNT(*) AS frequency FROM ${fqn} GROUP BY [${colName}] ORDER BY COUNT(*) DESC`,
        );
        // Only include if truly low cardinality (enum-like)
        if (rows.length > 0 && rows.length <= maxDistinct) {
          result[colName] = rows;
        }
      } catch {
        // skip columns that fail
      }
    }

    return result;
  }

  /**
   * Compute aggregate statistics for a table.
   */
  async _computeAggregates(fqn, columns, dateCol) {
    const agg = { rowCount: 0, dateRange: null, numericStats: {} };

    // Row count
    const countResult = await this._executeQuery(`SELECT COUNT(*) AS cnt FROM ${fqn}`);
    agg.rowCount = countResult[0]?.cnt || 0;

    // Date range
    if (dateCol) {
      const dateResult = await this._executeQuery(
        `SELECT MIN([${dateCol}]) AS min_date, MAX([${dateCol}]) AS max_date FROM ${fqn}`,
      );
      if (dateResult[0]) {
        agg.dateRange = {
          min: dateResult[0].min_date,
          max: dateResult[0].max_date,
        };
      }
    }

    // Numeric column stats (min, max, avg for up to 5 numeric columns)
    const numericTypes = ['int', 'bigint', 'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney', 'smallint', 'tinyint'];
    const numCols = columns
      .filter((c) => numericTypes.includes((c.data_type || '').toLowerCase()) && !(c.is_identity || c.is_primary_key))
      .slice(0, 5);

    for (const col of numCols) {
      const colName = col.column_name || col.name;
      try {
        const stats = await this._executeQuery(
          `SELECT MIN([${colName}]) AS min_val, MAX([${colName}]) AS max_val, AVG(CAST([${colName}] AS FLOAT)) AS avg_val FROM ${fqn}`,
        );
        if (stats[0]) {
          agg.numericStats[colName] = {
            min: stats[0].min_val,
            max: stats[0].max_val,
            avg: stats[0].avg_val != null ? Math.round(stats[0].avg_val * 100) / 100 : null,
          };
        }
      } catch {
        // skip
      }
    }

    return agg;
  }

  /**
   * Deduplicate rows from multiple sample sets (by JSON equality).
   */
  _deduplicateRows(...arrays) {
    const seen = new Set();
    const result = [];
    for (const arr of arrays) {
      for (const row of arr) {
        const key = JSON.stringify(row);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(row);
        }
      }
    }
    return result;
  }
}

module.exports = { MssqlStratifiedSampler };
