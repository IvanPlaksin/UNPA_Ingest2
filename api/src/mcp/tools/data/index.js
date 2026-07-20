// Level 2 — Individual MSSQL tools
const { MSSQLConnectTool } = require('./MSSQLConnectTool.js');
const { MSSQLDisconnectTool } = require('./MSSQLDisconnectTool.js');
const { MSSQLStatusTool } = require('./MSSQLStatusTool.js');
const { MSSQLSchemasTool } = require('./MSSQLSchemasTool.js');
const { MSSQLTablesTool } = require('./MSSQLTablesTool.js');
const { MSSQLColumnsTool } = require('./MSSQLColumnsTool.js');
const { MSSQLConstraintsTool } = require('./MSSQLConstraintsTool.js');
const { MSSQLIndexesTool } = require('./MSSQLIndexesTool.js');
const { MSSQLProceduresTool } = require('./MSSQLProceduresTool.js');
const { MSSQLDependenciesTool } = require('./MSSQLDependenciesTool.js');
const { MSSQLSampleDataTool } = require('./MSSQLSampleDataTool.js');
const { MSSQLExecuteQueryTool } = require('./MSSQLExecuteQueryTool.js');
const { MSSQLRowCountsTool } = require('./MSSQLRowCountsTool.js');
const { MSSQLOverviewTool } = require('./MSSQLOverviewTool.js');

// Level 3 — Composite patterns
const { MSSQLIngestTool } = require('./MSSQLIngestTool.js');
const { MSSQLERExtractionTool } = require('./MSSQLERExtractionTool.js');
const { MSSQLBusinessLogicTool } = require('./MSSQLBusinessLogicTool.js');

function createDataTools() {
  return [
    // Level 2: Connection
    new MSSQLConnectTool(),
    new MSSQLDisconnectTool(),
    new MSSQLStatusTool(),
    // Level 2: Schema Discovery
    new MSSQLSchemasTool(),
    new MSSQLTablesTool(),
    new MSSQLColumnsTool(),
    new MSSQLConstraintsTool(),
    new MSSQLIndexesTool(),
    // Level 2: Business Logic
    new MSSQLProceduresTool(),
    new MSSQLDependenciesTool(),
    // Level 2: Data Sampling
    new MSSQLSampleDataTool(),
    new MSSQLExecuteQueryTool(),
    new MSSQLRowCountsTool(),
    new MSSQLOverviewTool(),
    // Level 3: Patterns
    new MSSQLIngestTool(),
    new MSSQLERExtractionTool(),
    new MSSQLBusinessLogicTool(),
  ];
}

module.exports = {
  MSSQLConnectTool,
  MSSQLDisconnectTool,
  MSSQLStatusTool,
  MSSQLSchemasTool,
  MSSQLTablesTool,
  MSSQLColumnsTool,
  MSSQLConstraintsTool,
  MSSQLIndexesTool,
  MSSQLProceduresTool,
  MSSQLDependenciesTool,
  MSSQLSampleDataTool,
  MSSQLExecuteQueryTool,
  MSSQLRowCountsTool,
  MSSQLOverviewTool,
  MSSQLIngestTool,
  MSSQLERExtractionTool,
  MSSQLBusinessLogicTool,
  createDataTools,
};
