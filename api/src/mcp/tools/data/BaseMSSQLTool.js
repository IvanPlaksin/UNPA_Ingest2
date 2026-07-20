const { BaseTool } = require('../primitives/BaseTool.js');

/**
 * Shared MSSQL connector singleton for all MSSQL tools.
 * Tools call getConnector() to get the active connector instance.
 */
let _connector = null;

function getConnector() {
  if (!_connector) {
    const { MSSQLConnector } = require('../../../services/connectors');
    _connector = new MSSQLConnector();
  }
  return _connector;
}

function resetConnector() {
  _connector = null;
}

class BaseMSSQLTool extends BaseTool {
  getConnector() {
    return getConnector();
  }

  /** Ensure connector is connected before executing */
  async requireConnection() {
    const conn = this.getConnector();
    const connected = await conn.isConnected();
    if (!connected) {
      this.error('NOT_CONNECTED', 'Not connected to MS SQL Server. Use data.mssql_connect first.');
    }
    return conn;
  }
}

module.exports = { BaseMSSQLTool, getConnector, resetConnector };
