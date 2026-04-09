/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG PLUGINS INDEX
 * Exports all plugin infrastructure and domain plugins
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Plugin infrastructure
const {
  PluginBase,
  BaseExecutor,
  createSimpleExecutor,
  createSimpleCondition,
  createSimpleTransformer,
  createSuccessResult,
  createErrorResult,
} = require('./plugin-base');

const {
  pluginLoader,
  loadDefaultPlugins,
  loadDomainPlugins,
  loadAllPlugins,
} = require('./plugin-loader');

// Domain plugins
const { IngestionPlugin, ingestionPlugin } = require('./ingestion');
const { RAGPlugin, ragPlugin } = require('./rag');

module.exports = {
  // Plugin infrastructure
  PluginBase,
  BaseExecutor,
  createSimpleExecutor,
  createSimpleCondition,
  createSimpleTransformer,
  createSuccessResult,
  createErrorResult,

  // Plugin loader
  pluginLoader,
  loadDefaultPlugins,
  loadDomainPlugins,
  loadAllPlugins,

  // Domain plugins
  IngestionPlugin,
  ingestionPlugin,
  RAGPlugin,
  ragPlugin,
};
