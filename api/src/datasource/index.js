/**
 * DataSource Executors Index
 */

const { BaseDataSourceExecutor } = require('./base-datasource.executor');
const { SQLDataSourceExecutor } = require('./sql-datasource.executor');
const { KBDataSourceExecutor } = require('./kb-datasource.executor');
const { APIDataSourceExecutor } = require('./api-datasource.executor');
const { FileDataSourceExecutor } = require('./file-datasource.executor');
const { CompositeDataSourceExecutor } = require('./composite-datasource.executor');
const { dataSourceRegistry } = require('../services/datasource-registry');
const { DataSourceType } = require('../schemas/datasource-config.schema');

// Create executor instances
const sqlExecutor = new SQLDataSourceExecutor();
const kbExecutor = new KBDataSourceExecutor();
const apiExecutor = new APIDataSourceExecutor();
const fileExecutor = new FileDataSourceExecutor();
const compositeExecutor = new CompositeDataSourceExecutor();

// Register executors
dataSourceRegistry.register(DataSourceType.SQL, sqlExecutor);
dataSourceRegistry.register(DataSourceType.KB, kbExecutor);
dataSourceRegistry.register(DataSourceType.API, apiExecutor);
dataSourceRegistry.register(DataSourceType.FILE, fileExecutor);
dataSourceRegistry.register(DataSourceType.COMPOSITE, compositeExecutor);

// Lazy dependency injection (services aren't ready at module load time)
let _initialized = false;
function ensureExecutorsInitialized() {
  if (_initialized) return;
  _initialized = true;
  const { getMemgraphService } = require('../services/memgraph.service');
  const qdrantService = require('../services/qdrant.service');
  const teiService = require('../services/tei.service');
  kbExecutor.setMemgraph(getMemgraphService()).setQdrant(qdrantService).setEmbedder(teiService);
}

module.exports = {
  BaseDataSourceExecutor,
  SQLDataSourceExecutor,
  KBDataSourceExecutor,
  APIDataSourceExecutor,
  FileDataSourceExecutor,
  CompositeDataSourceExecutor,

  // Pre-configured executor instances
  sqlExecutor,
  kbExecutor,
  apiExecutor,
  fileExecutor,
  compositeExecutor,

  // Registry with registered executors
  dataSourceRegistry,

  // Lazy init
  ensureExecutorsInitialized,
};
