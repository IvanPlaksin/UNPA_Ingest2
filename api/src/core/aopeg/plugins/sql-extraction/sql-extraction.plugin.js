/**
 * SQL Extraction Plugin
 *
 * Provides executors for the full SQL Server extraction pipeline:
 * connect → scan schema → list procedures → parse AST → translate to GXE →
 * persist to domains → create cross-domain links.
 *
 * 8 executors total, registered under domain 'sql-extraction'.
 */

const { PluginBase } = require('../plugin-base');
const {
  SqlConnectExecutor,
  SqlQueryExecutor,
  SqlSchemaScanExecutor,
  SqlProcedureListExecutor,
  SqlAstParseExecutor,
  GxeTranslateExecutor,
  DomainPersistExecutor,
  CrossDomainLinkExecutor,
} = require('./executors');

class SqlExtractionPlugin extends PluginBase {
  constructor() {
    super({
      name: 'sql-extraction',
      version: '1.0.0',
      domain: 'sql-extraction',
      description: 'SQL Server multi-domain extraction pipeline executors',
    });
  }

  async initialize() {
    this.addExecutor(new SqlConnectExecutor());
    this.addExecutor(new SqlQueryExecutor());
    this.addExecutor(new SqlSchemaScanExecutor());
    this.addExecutor(new SqlProcedureListExecutor());
    this.addExecutor(new SqlAstParseExecutor());
    this.addExecutor(new GxeTranslateExecutor());
    this.addExecutor(new DomainPersistExecutor());
    this.addExecutor(new CrossDomainLinkExecutor());
  }
}

module.exports = { SqlExtractionPlugin };
