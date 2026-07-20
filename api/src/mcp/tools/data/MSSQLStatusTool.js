const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLStatusTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_status',
      name: 'MSSQL Status',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Get current connection status and info.',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          connected: { type: 'boolean' },
          serverName: { type: 'string' },
          databaseName: { type: 'string' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 1000, maxMemoryMb: 10 },
    };
  }

  async execute() {
    const conn = this.getConnector();
    const info = conn.getConnectionInfo();
    const connected = await conn.isConnected();
    return this.success({ connected, ...info });
  }
}

module.exports = { MSSQLStatusTool };
