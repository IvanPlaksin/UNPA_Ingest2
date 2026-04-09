/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG - AI-Orchestrated Pipeline Execution Graph
 * Universal execution engine for domain-agnostic workflow orchestration
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN REGISTRY
// ────────────────────────────────────────────────────────────────────────────

const { pluginRegistry, PluginRegistry } = require('./registry/plugin-registry');

// ────────────────────────────────────────────────────────────────────────────
// BUILT-IN CONDITIONS
// ────────────────────────────────────────────────────────────────────────────

const {
  registerBuiltinConditions,
  builtinConditions,
} = require('./conditions/builtin-conditions');

// ────────────────────────────────────────────────────────────────────────────
// BUILT-IN TRANSFORMERS
// ────────────────────────────────────────────────────────────────────────────

const {
  registerBuiltinTransformers,
  builtinTransformers,
} = require('./transformers/builtin-transformers');

// ────────────────────────────────────────────────────────────────────────────
// GRAPH WALKER (Execution Engine)
// ────────────────────────────────────────────────────────────────────────────

const {
  GraphWalker,
  createGraphWalker,
  createErrorResult,
} = require('./engine/graph-walker');

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION ORCHESTRATOR
// ────────────────────────────────────────────────────────────────────────────

const {
  ExecutionOrchestrator,
  getOrchestrator,
  createOrchestrator,
  InMemoryExecutionStore,
  InMemoryGraphStore,
  createExecutionContext,
} = require('./engine/execution-orchestrator');

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN BASE
// ────────────────────────────────────────────────────────────────────────────

const {
  PluginBase,
  BaseExecutor,
  createSimpleExecutor,
  createSimpleCondition,
  createSimpleTransformer,
  createSuccessResult,
} = require('./plugins/plugin-base');

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN LOADER
// ────────────────────────────────────────────────────────────────────────────

const {
  pluginLoader,
  loadDefaultPlugins,
  loadDomainPlugins,
  loadToolPlugins,
  loadAllPlugins,
} = require('./plugins/plugin-loader');

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLES
// ────────────────────────────────────────────────────────────────────────────

const {
  exampleGraphs,
  getExampleGraph,
  getAllExampleGraphs,
} = require('./examples/example-graphs');

// ────────────────────────────────────────────────────────────────────────────
// REPOSITORY (Memgraph Persistence)
// ────────────────────────────────────────────────────────────────────────────

const {
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
} = require('./repository');

// ────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────────────────────────────────

let initialized = false;

/**
 * Initialize AOPEG core with built-in components
 * Call this once at application startup
 */
async function initializeAOPEG(options = {}) {
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
function isAOPEGInitialized() {
  return initialized;
}

/**
 * Reset AOPEG (for testing)
 */
async function resetAOPEG() {
  await pluginLoader.unloadAll();
  pluginRegistry.clear();
  initialized = false;
  console.log('[AOPEG] Reset complete');
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Registry
  pluginRegistry,
  PluginRegistry,

  // Conditions
  registerBuiltinConditions,
  builtinConditions,

  // Transformers
  registerBuiltinTransformers,
  builtinTransformers,

  // Graph Walker
  GraphWalker,
  createGraphWalker,
  createErrorResult,

  // Orchestrator
  ExecutionOrchestrator,
  getOrchestrator,
  createOrchestrator,
  InMemoryExecutionStore,
  InMemoryGraphStore,
  createExecutionContext,

  // Plugin Base
  PluginBase,
  BaseExecutor,
  createSimpleExecutor,
  createSimpleCondition,
  createSimpleTransformer,
  createSuccessResult,

  // Plugin Loader
  pluginLoader,
  loadDefaultPlugins,
  loadDomainPlugins,
  loadToolPlugins,
  loadAllPlugins,

  // Examples
  exampleGraphs,
  getExampleGraph,
  getAllExampleGraphs,

  // Repository
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

  // Initialization
  initializeAOPEG,
  isAOPEGInitialized,
  resetAOPEG,
};
