/**
 * SQL Query Executor
 *
 * Executes an arbitrary SQL query and returns results.
 * Requires a connectionId from sql.connect.
 */

const { BaseExecutor } = require('../../plugin-base');

class SqlQueryExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'sql.query';
    this.displayName = 'SQL Query';
    this.description = 'Execute SQL query against connected database';
    this.domain = 'sql-extraction';

    this.parameterSchema = {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Connection ID from sql.connect' },
        query: { type: 'string', description: 'SQL query to execute' },
        params: { type: 'object', default: {}, description: 'Named query parameters' },
        timeout: { type: 'number', default: 30000, description: 'Query timeout in ms' },
      },
      required: ['connectionId', 'query'],
    };
  }

  async execute(parameters, context) {
    const connectionId = this.getRequiredParam(parameters, 'connectionId');
    const query = this.getRequiredParam(parameters, 'query');
    const params = this.getParam(parameters, 'params', {});
    const timeout = this.getParam(parameters, 'timeout', 30000);

    const pool = context.sharedState?.get(`sql:pool:${connectionId}`);
    if (!pool) {
      return this.error('SQL_NO_CONNECTION', `Connection not found: ${connectionId}`, false);
    }

    try {
      const request = pool.request();
      request.timeout = timeout;

      for (const [name, value] of Object.entries(params)) {
        request.input(name, value);
      }

      const result = await request.query(query);
      const rows = result.recordset || [];

      return this.success(
        {
          rows,
          rowCount: rows.length,
          columns: rows.length > 0 ? Object.keys(rows[0]) : [],
        },
        { query: query.substring(0, 100) },
        1.0,
      );
    } catch (error) {
      return this.error('SQL_QUERY_ERROR', `Query failed: ${error.message}`, true);
    }
  }
}

module.exports = { SqlQueryExecutor };
