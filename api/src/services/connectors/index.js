/**
 * Connectors Module
 * Source connectors for external data sources
 *
 * @module services/connectors
 */

const { BaseConnector } = require('./base-connector');
const { FileSystemConnector, filesystemConnector } = require('./filesystem-connector');
const { TFSConnector, tfsConnector } = require('./tfs-connector');
const { SharePointConnector, sharePointConnector } = require('./sharepoint-connector');
const { MSSQLConnector } = require('./mssql.connector');
const { MSSQLSemanticAnalyzer } = require('./mssql.analyzer');
const { MSSQLGraphGenerator } = require('./mssql.graph-generator');
const { SourceManager, sourceManager } = require('./source-manager');

module.exports = {
  BaseConnector,

  FileSystemConnector,
  filesystemConnector,

  TFSConnector,
  tfsConnector,

  SharePointConnector,
  sharePointConnector,

  MSSQLConnector,
  MSSQLSemanticAnalyzer,
  MSSQLGraphGenerator,

  SourceManager,
  sourceManager
};
