/**
 * SQL Procedure List Executor
 *
 * Retrieves stored procedures with their SQL definitions.
 */

const { BaseExecutor } = require('../../plugin-base');

class SqlProcedureListExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'sql.procedure_list';
    this.displayName = 'SQL Procedure List';
    this.description = 'Get stored procedures with definitions from SQL Server';
    this.domain = 'sql-extraction';

    this.parameterSchema = {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Connection ID from sql.connect' },
        schemas: { type: ['array', 'string'], default: ['dbo'], description: 'Schemas to scan (array or comma-separated string)' },
        includeTriggers: { type: 'boolean', default: true },
      },
      required: ['connectionId'],
    };
  }

  async execute(parameters, context) {
    const connectionId = this.getRequiredParam(parameters, 'connectionId');
    let schemas = this.getParam(parameters, 'schemas', ['dbo']);
    if (typeof schemas === 'string') {
      schemas = schemas.includes(',') ? schemas.split(',').map(s => s.trim()) : [schemas];
    }
    const includeTriggers = this.getParam(parameters, 'includeTriggers', true);

    const pool = context.sharedState?.get(`sql:pool:${connectionId}`);
    if (!pool) {
      return this.error('SQL_NO_CONNECTION', `Connection not found: ${connectionId}`, false);
    }

    try {
      const schemaList = schemas.map(s => `'${s}'`).join(',');

      // Stored procedures
      const procRes = await pool.request().query(`
        SELECT
          SCHEMA_NAME(p.schema_id) as schema_name,
          p.name as procedure_name,
          OBJECT_DEFINITION(p.object_id) as definition,
          p.create_date,
          p.modify_date
        FROM sys.procedures p
        WHERE SCHEMA_NAME(p.schema_id) IN (${schemaList})
        ORDER BY p.name
      `);

      const procedures = procRes.recordset.map(p => ({
        name: p.procedure_name,
        schema: p.schema_name,
        sql: p.definition || '',
        type: 'procedure',
        createdAt: p.create_date,
        modifiedAt: p.modify_date,
      }));

      // Triggers (optional)
      let triggers = [];
      if (includeTriggers) {
        const trgRes = await pool.request().query(`
          SELECT
            t.name as trigger_name,
            SCHEMA_NAME(tab.schema_id) as schema_name,
            tab.name as table_name,
            OBJECT_DEFINITION(t.object_id) as definition,
            t.create_date,
            t.modify_date
          FROM sys.triggers t
          JOIN sys.tables tab ON t.parent_id = tab.object_id
          WHERE SCHEMA_NAME(tab.schema_id) IN (${schemaList})
          ORDER BY t.name
        `);

        triggers = trgRes.recordset.map(t => ({
          name: t.trigger_name,
          schema: t.schema_name,
          tableName: t.table_name,
          sql: t.definition || '',
          type: 'trigger',
          createdAt: t.create_date,
          modifiedAt: t.modify_date,
        }));
      }

      const all = [...procedures, ...triggers];

      return this.success(
        {
          procedures: all,
          procedureCount: procedures.length,
          triggerCount: triggers.length,
          totalCount: all.length,
        },
        { schemas, includeTriggers },
        1.0,
      );
    } catch (error) {
      return this.error('SQL_PROC_LIST_ERROR', `Procedure listing failed: ${error.message}`, true);
    }
  }
}

module.exports = { SqlProcedureListExecutor };
