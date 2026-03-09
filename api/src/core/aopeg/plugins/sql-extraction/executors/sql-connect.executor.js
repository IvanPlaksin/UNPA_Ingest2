/**
 * SQL Connect Executor
 *
 * Establishes a connection to SQL Server and stores pool reference
 * in shared state for other sql-* executors.
 */

const { BaseExecutor } = require('../../plugin-base');

class SqlConnectExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'sql.connect';
    this.displayName = 'SQL Connect';
    this.description = 'Establish connection to SQL Server';
    this.domain = 'sql-extraction';

    this.parameterSchema = {
      type: 'object',
      properties: {
        server: { type: 'string', description: 'SQL Server host' },
        database: { type: 'string', description: 'Database name' },
        user: { type: 'string', description: 'Username' },
        password: { type: 'string', description: 'Password' },
        port: { type: 'number', default: 1433, description: 'Port number' },
        encrypt: { type: 'boolean', default: false },
        trustServerCertificate: { type: 'boolean', default: true },
      },
      required: ['server', 'database', 'user', 'password'],
    };
  }

  async execute(parameters, context) {
    const server = this.getRequiredParam(parameters, 'server');
    const database = this.getRequiredParam(parameters, 'database');
    const user = this.getRequiredParam(parameters, 'user');
    const password = this.getRequiredParam(parameters, 'password');
    const port = this.getParam(parameters, 'port', 1433);

    try {
      const sql = require('mssql');
      const { v4: uuidv4 } = require('uuid');

      const connectionId = uuidv4();
      const config = {
        server,
        database,
        user,
        password,
        port,
        options: {
          encrypt: this.getParam(parameters, 'encrypt', false),
          trustServerCertificate: this.getParam(parameters, 'trustServerCertificate', true),
        },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
      };

      const pool = await sql.connect(config);

      // Store pool in shared state for other executors
      if (context.sharedState) {
        context.sharedState.set(`sql:pool:${connectionId}`, pool);
      }

      return this.success(
        { connectionId, connected: true, server, database, port },
        { connectionId },
        1.0,
      );
    } catch (error) {
      return this.error('SQL_CONNECT_ERROR', `Connection failed: ${error.message}`, true);
    }
  }
}

module.exports = { SqlConnectExecutor };
