/**
 * =============================================================================
 * DATASOURCE EXECUTOR REGISTRY
 *
 * Registry of executors by DataSource type.
 * Each executor implements operations: loadAll, search, getById, count, validate.
 * =============================================================================
 */

const { DataSourceType, DataSourceOperation } = require('../schemas/datasource-config.schema');

class DataSourceRegistry {
  constructor() {
    this.executors = new Map();
  }

  /**
   * Register an executor for a DataSource type.
   * Executor must implement at least loadAll() and search().
   */
  register(sourceType, executor) {
    if (!Object.values(DataSourceType).includes(sourceType)) {
      throw new Error(`Invalid sourceType: ${sourceType}`);
    }

    const requiredOps = ['loadAll', 'search'];
    for (const op of requiredOps) {
      if (typeof executor[op] !== 'function') {
        throw new Error(`Executor for ${sourceType} must implement ${op}()`);
      }
    }

    this.executors.set(sourceType, executor);
    return this;
  }

  /**
   * Get executor for a DataSource type
   */
  getExecutor(sourceType) {
    const executor = this.executors.get(sourceType);
    if (!executor) {
      throw new Error(`No executor registered for sourceType: ${sourceType}`);
    }
    return executor;
  }

  /**
   * Check if an executor is registered
   */
  hasExecutor(sourceType) {
    return this.executors.has(sourceType);
  }

  /**
   * List all registered source types
   */
  getRegisteredTypes() {
    return Array.from(this.executors.keys());
  }

  /**
   * Execute an operation on a DataSource config
   * @param {object} dataSourceConfig - Built DataSource configuration
   * @param {string} operation - One of DataSourceOperation values
   * @param {object} params - Operation parameters (search query, id, etc.)
   * @returns {Promise<*>} Operation result
   */
  async execute(dataSourceConfig, operation, params = {}) {
    const executor = this.getExecutor(dataSourceConfig.sourceType);

    if (!Object.values(DataSourceOperation).includes(operation)) {
      throw new Error(`Invalid operation: ${operation}`);
    }

    if (typeof executor[operation] !== 'function') {
      throw new Error(`Executor for ${dataSourceConfig.sourceType} does not support ${operation}`);
    }

    return executor[operation](dataSourceConfig, params);
  }
}

// Singleton instance
const dataSourceRegistry = new DataSourceRegistry();

module.exports = {
  DataSourceRegistry,
  dataSourceRegistry,
};
