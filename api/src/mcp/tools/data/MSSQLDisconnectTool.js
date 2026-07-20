const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLDisconnectTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_disconnect',
      name: 'MSSQL Disconnect',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Close connection pool to MS SQL Server.',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          message: { type: 'string' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 1000, maxMemoryMb: 10 },
    };
  }

  async execute() {
    await this.getConnector().disconnect();
    return this.success({ success: true, message: 'Disconnected' });
  }
}

module.exports = { MSSQLDisconnectTool };
