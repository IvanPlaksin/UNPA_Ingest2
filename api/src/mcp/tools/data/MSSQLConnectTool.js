const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLConnectTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_connect',
      name: 'MSSQL Connect',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Establish read-only connection to MS SQL Server database.',
      inputSchema: {
        type: 'object',
        required: ['server', 'database'],
        properties: {
          server: { type: 'string', description: 'Server hostname or IP' },
          database: { type: 'string', description: 'Database name' },
          port: { type: 'number', description: 'Port (default 1433)' },
          username: { type: 'string' },
          password: { type: 'string' },
          authentication: {
            type: 'string',
            description: 'Auth type: sql, windows, or azure-ad',
          },
          encrypt: { type: 'boolean' },
          trustServerCertificate: { type: 'boolean' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          serverName: { type: 'string' },
          databaseName: { type: 'string' },
          version: { type: 'string' },
          error: { type: 'string' },
        },
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 50 },
    };
  }

  async execute(args) {
    const result = await this.getConnector().connect(args);
    if (!result.success) {
      this.error('CONNECTION_FAILED', result.error || 'Connection failed');
    }
    return this.success(result);
  }
}

module.exports = { MSSQLConnectTool };
