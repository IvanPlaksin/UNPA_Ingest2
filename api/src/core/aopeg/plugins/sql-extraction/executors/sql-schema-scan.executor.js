/**
 * SQL Schema Scan Executor
 *
 * Scans database schema: tables, columns, primary keys, foreign keys.
 * Returns a complete databaseMap object for downstream phases.
 */

const { BaseExecutor } = require('../../plugin-base');

class SqlSchemaScanExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'sql.schema_scan';
    this.displayName = 'SQL Schema Scan';
    this.description = 'Scan database schema (tables, columns, FKs)';
    this.domain = 'sql-extraction';

    this.parameterSchema = {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Connection ID from sql.connect' },
        schemas: { type: 'array', default: ['dbo'], description: 'Schemas to scan' },
        includeViews: { type: 'boolean', default: false },
      },
      required: ['connectionId'],
    };
  }

  async execute(parameters, context) {
    const connectionId = this.getRequiredParam(parameters, 'connectionId');
    const schemas = this.getParam(parameters, 'schemas', ['dbo']);
    const includeViews = this.getParam(parameters, 'includeViews', false);

    const pool = context.sharedState?.get(`sql:pool:${connectionId}`);
    if (!pool) {
      return this.error('SQL_NO_CONNECTION', `Connection not found: ${connectionId}`, false);
    }

    try {
      const schemaList = schemas.map(s => `'${s}'`).join(',');
      const tableTypes = includeViews ? "'BASE TABLE','VIEW'" : "'BASE TABLE'";

      // Tables
      const tablesRes = await pool.request().query(`
        SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as table_name, TABLE_TYPE as table_type
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA IN (${schemaList}) AND TABLE_TYPE IN (${tableTypes})
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `);

      // Columns
      const colsRes = await pool.request().query(`
        SELECT TABLE_SCHEMA as schema_name, TABLE_NAME as table_name,
               COLUMN_NAME as column_name, DATA_TYPE as data_type,
               CHARACTER_MAXIMUM_LENGTH as max_length,
               IS_NULLABLE as is_nullable, ORDINAL_POSITION as ordinal
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA IN (${schemaList})
        ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
      `);

      // Primary keys
      const pkRes = await pool.request().query(`
        SELECT tc.TABLE_SCHEMA as schema_name, tc.TABLE_NAME as table_name,
               kcu.COLUMN_NAME as column_name
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA IN (${schemaList})
      `);

      // Foreign keys
      const fkRes = await pool.request().query(`
        SELECT fk.name as constraint_name,
               SCHEMA_NAME(tp.schema_id) as from_schema, tp.name as from_table, cp.name as from_column,
               SCHEMA_NAME(tr.schema_id) as to_schema, tr.name as to_table, cr.name as to_column
        FROM sys.foreign_keys fk
        JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
        JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
        JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
        JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
        JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
        WHERE SCHEMA_NAME(tp.schema_id) IN (${schemaList})
      `);

      // Build lookups
      const pkLookup = {};
      for (const pk of pkRes.recordset) {
        const key = `${pk.schema_name}.${pk.table_name}`;
        if (!pkLookup[key]) pkLookup[key] = [];
        pkLookup[key].push(pk.column_name);
      }

      const columnLookup = {};
      for (const col of colsRes.recordset) {
        const key = `${col.schema_name}.${col.table_name}`;
        if (!columnLookup[key]) columnLookup[key] = [];
        columnLookup[key].push({
          column_name: col.column_name,
          data_type: col.data_type,
          max_length: col.max_length,
          is_nullable: col.is_nullable === 'YES',
          ordinal: col.ordinal,
          is_primary_key: pkLookup[key]?.includes(col.column_name) || false,
        });
      }

      // Build databaseMap
      const tables = {};
      for (const t of tablesRes.recordset) {
        const fqn = `${t.schema_name}.${t.table_name}`;
        tables[fqn] = {
          schemaName: t.schema_name,
          tableName: t.table_name,
          tableType: t.table_type,
          columns: columnLookup[fqn] || [],
          primaryKey: pkLookup[fqn] || [],
        };
      }

      const foreignKeys = fkRes.recordset.map(fk => ({
        constraintName: fk.constraint_name,
        from: `${fk.from_schema}.${fk.from_table}`,
        to: `${fk.to_schema}.${fk.to_table}`,
        column: fk.from_column,
        referencedColumn: fk.to_column,
      }));

      const databaseMap = { tables, foreignKeys };

      return this.success(
        {
          databaseMap,
          tableCount: Object.keys(tables).length,
          columnCount: colsRes.recordset.length,
          fkCount: foreignKeys.length,
        },
        { schemas },
        1.0,
      );
    } catch (error) {
      return this.error('SQL_SCHEMA_ERROR', `Schema scan failed: ${error.message}`, true);
    }
  }
}

module.exports = { SqlSchemaScanExecutor };
