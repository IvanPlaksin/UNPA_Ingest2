/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG - AI-Orchestrated Pipeline Execution Graph
 * Universal execution engine for domain-agnostic workflow orchestration
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// CORE TYPES
// ────────────────────────────────────────────────────────────────────────────

export * from './types/core.types';

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN REGISTRY
// ────────────────────────────────────────────────────────────────────────────

export { pluginRegistry, PluginMetadata } from './registry/plugin-registry';

// ────────────────────────────────────────────────────────────────────────────
// BUILT-IN CONDITIONS
// ────────────────────────────────────────────────────────────────────────────

export {
  registerBuiltinConditions,
  builtinConditions,
} from './conditions/builtin-conditions';

// ────────────────────────────────────────────────────────────────────────────
// BUILT-IN TRANSFORMERS
// ────────────────────────────────────────────────────────────────────────────

export {
  registerBuiltinTransformers,
  builtinTransformers,
} from './transformers/builtin-transformers';

// ────────────────────────────────────────────────────────────────────────────
// GRAPH WALKER (Execution Engine)
// ────────────────────────────────────────────────────────────────────────────

export {
  GraphWalker,
  createGraphWalker,
  WalkerEvents,
} from './engine/graph-walker';

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION ORCHESTRATOR
// ────────────────────────────────────────────────────────────────────────────

export {
  ExecutionOrchestrator,
  getOrchestrator,
  createOrchestrator,
  ExecutionOptions,
  OrchestratorEvents,
  IExecutionStore,
  IGraphStore,
  InMemoryExecutionStore,
  InMemoryGraphStore,
} from './engine/execution-orchestrator';

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN BASE
// ────────────────────────────────────────────────────────────────────────────

export {
  PluginBase,
  BaseExecutor,
  createSimpleExecutor,
  createSimpleCondition,
  createSimpleTransformer,
} from './plugins/plugin-base';

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN LOADER
// ────────────────────────────────────────────────────────────────────────────

export {
  pluginLoader,
  loadDefaultPlugins,
  loadDomainPlugins,
  loadToolPlugins,
  loadAllPlugins,
} from './plugins/plugin-loader';

// ────────────────────────────────────────────────────────────────────────────
// DOMAIN PLUGINS
// ────────────────────────────────────────────────────────────────────────────

export { IngestionPlugin, ingestionPlugin } from './plugins/ingestion';
export { RAGPlugin, ragPlugin } from './plugins/rag';

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLES
// ────────────────────────────────────────────────────────────────────────────

export {
  exampleGraphs,
  getExampleGraph,
  getAllExampleGraphs,
} from './examples/example-graphs';

// ────────────────────────────────────────────────────────────────────────────
// REPOSITORY (Memgraph Persistence)
// ────────────────────────────────────────────────────────────────────────────

export {
  AOPEG_LABELS,
  AOPEG_RELATIONSHIPS,
  AOPEG_INDEXES,
  AOPEG_QUERIES,
  getCreateIndexesCypher,
  GraphRepository,
  getGraphRepository,
  createGraphRepository,
  ExecutionRepository,
  getExecutionRepository,
  createExecutionRepository,
} from './repository';

// ────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────────────────────────────────

import { registerBuiltinConditions } from './conditions/builtin-conditions';
import { registerBuiltinTransformers } from './transformers/builtin-transformers';
import { loadDefaultPlugins, loadDomainPlugins, loadToolPlugins, loadAllPlugins } from './plugins/plugin-loader';

let initialized = false;

/**
 * Initialize AOPEG core with built-in components
 * Call this once at application startup
 */
export async function initializeAOPEG(options: {
  loadPlugins?: boolean;
  loadDomainPlugins?: boolean;
  loadToolPlugins?: boolean;
} = {}): Promise<void> {
  if (initialized) {
    console.warn('[AOPEG] Already initialized');
    return;
  }

  console.log('[AOPEG] Initializing Universal Execution Engine...');

  // Register built-in conditions
  registerBuiltinConditions();
  console.log('[AOPEG] Built-in conditions registered');

  // Register built-in transformers
  registerBuiltinTransformers();
  console.log('[AOPEG] Built-in transformers registered');

  // Load default plugins if requested
  if (options.loadPlugins !== false) {
    await loadDefaultPlugins();
    console.log('[AOPEG] Default plugins loaded');
  }

  // Load domain plugins (ingestion, RAG) if requested
  if (options.loadDomainPlugins !== false) {
    await loadDomainPlugins();
    console.log('[AOPEG] Domain plugins loaded');
  }

  // Load tool plugins (filesystem, session, script) if requested
  if (options.loadToolPlugins !== false) {
    await loadToolPlugins();
    console.log('[AOPEG] Tool plugins loaded');
  }

  initialized = true;
  console.log('[AOPEG] Initialization complete');
}

/**
 * Check if AOPEG is initialized
 */
export function isAOPEGInitialized(): boolean {
  return initialized;
}

/**
 * Reset AOPEG (for testing)
 */
export async function resetAOPEG(): Promise<void> {
  const { pluginRegistry } = await import('./registry/plugin-registry');
  const { pluginLoader } = await import('./plugins/plugin-loader');

  await pluginLoader.unloadAll();
  pluginRegistry.clear();
  initialized = false;
  console.log('[AOPEG] Reset complete');
}
