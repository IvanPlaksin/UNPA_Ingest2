/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG PLUGINS INDEX
 * Exports all plugin infrastructure and domain plugins
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Plugin infrastructure
export {
  PluginBase,
  BaseExecutor,
  createSimpleExecutor,
  createSimpleCondition,
  createSimpleTransformer,
} from './plugin-base';

export {
  pluginLoader,
  loadDefaultPlugins,
  loadDomainPlugins,
  loadAllPlugins,
} from './plugin-loader';

// Domain plugins
export * from './ingestion';
export * from './rag';
export * from './subgraph';
export * from './workflow';
export * from './notification';
