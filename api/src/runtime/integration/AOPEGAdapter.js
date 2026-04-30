/**
 * AOPEGAdapter
 *
 * Bridges AOPEG executors to GXE Runtime.
 * Wraps existing AOPEG plugin executors for use with RuntimeEngine/NodeRunner.
 *
 * Part of GXE Runtime Environment P1.
 *
 * @module runtime/integration/AOPEGAdapter
 */

// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN MAPPING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps AOPEG executor types to Runtime tool IDs
 * If no mapping exists, executorType is used as-is
 */
const EXECUTOR_TO_TOOL_MAP = {
  // Ingestion domain
  'ingestion.parse_document': 'text.parse',
  'ingestion.sanitize': 'text.sanitize',
  'ingestion.detect_language': 'text.detect_language',
  'ingestion.chunk_text': 'text.chunk',
  'ingestion.extract_entities': 'extraction.entities',
  'ingestion.extract_relations': 'extraction.relations',
  'ingestion.classify_content': 'ai.classify',
  'ingestion.write_graph': 'graph.create_node',
  'ingestion.write_vector': 'vector.write',

  // RAG domain
  'rag.search': 'vector.search',
  'rag.generate': 'ai.generate',
  'rag.chat': 'ai.chat',
  'rag.rerank': 'ai.rerank',

  // Common primitives
  'primitive.pass_through': 'primitive.echo',
  'primitive.merge': 'primitive.merge',
  'primitive.split': 'primitive.split',
};

/**
 * Alias map: MCP tool IDs → AOPEG executor types.
 * GXE graphs may use MCP tool IDs (from Tool Catalog) that need
 * resolution to AOPEG executors for Live Execution.
 */
const MCP_TOOL_ALIAS_MAP = {
  'primitive.get_value':          'workflow.start',
  'primitive.set_value':          'workflow.end',
  'ai.complete':                  'ai.generate',
  'runtime.execute_subgraph':     'workflow.spawn_graph',
  'primitive.transform':          'workflow.set_variable',
  'primitive.filter':             'workflow.condition',
  'text.parse':                   'ingestion.parse_document',
  'text.sanitize':                'ingestion.sanitize',
  'text.detect_language':         'ingestion.detect_language',
  'text.chunk':                   'ingestion.chunk_text',
  'extraction.entities':          'ingestion.extract_entities',
  'extraction.relations':         'ingestion.extract_relations',
  'ai.classify':                  'ingestion.classify_content',
  'vector.write':                 'ingestion.write_vector',
  'ai.rerank':                    'rag.rerank',
  'ai.chat':                      'rag.chat',
};

/**
 * Reverse mapping: Tool ID → Executor Type
 */
const TOOL_TO_EXECUTOR_MAP = Object.fromEntries(
  Object.entries(EXECUTOR_TO_TOOL_MAP).map(([k, v]) => [v, k])
);

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CODES
// ═══════════════════════════════════════════════════════════════════════════

const RuntimeErrorCodes = {
  EXECUTION_ERROR: 'EXECUTION_ERROR',     // Retryable
  FATAL_ERROR: 'FATAL_ERROR',             // Non-retryable
  INVALID_INPUT: 'INVALID_INPUT',         // Non-retryable
  EXECUTOR_NOT_FOUND: 'TOOL_NOT_FOUND',   // Non-retryable
};

// ═══════════════════════════════════════════════════════════════════════════
// AOPEG ADAPTER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Adapter that wraps AOPEG executors for use with GXE Runtime
 */
class AOPEGAdapter {
  /**
   * @param {Object} pluginRegistry - AOPEG PluginRegistry instance
   */
  constructor(pluginRegistry) {
    if (!pluginRegistry) {
      throw new Error('AOPEGAdapter requires a pluginRegistry');
    }
    this._pluginRegistry = pluginRegistry;
    this._wrappedCache = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTOR TYPE ↔ TOOL ID MAPPING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Map AOPEG executor type to Runtime tool ID
   * @param {string} executorType - AOPEG executor type
   * @returns {string} Runtime tool ID
   */
  mapExecutorTypeToToolId(executorType) {
    return EXECUTOR_TO_TOOL_MAP[executorType] || executorType;
  }

  /**
   * Map Runtime tool ID to AOPEG executor type
   * @param {string} toolId - Runtime tool ID
   * @returns {string} AOPEG executor type
   */
  mapToolIdToExecutorType(toolId) {
    return TOOL_TO_EXECUTOR_MAP[toolId] || toolId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTOR WRAPPING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Wrap a single AOPEG executor for Runtime compatibility
   * @param {string} executorType - AOPEG executor type
   * @returns {Object|null} Wrapped executor compatible with NodeRunner, or null if not found
   */
  wrapExecutor(executorType) {
    // Check cache first
    if (this._wrappedCache.has(executorType)) {
      return this._wrappedCache.get(executorType);
    }

    const executor = this._pluginRegistry.getExecutor(executorType);
    if (!executor) {
      return null;
    }

    const toolId = this.mapExecutorTypeToToolId(executorType);
    const adapter = this;

    const wrapped = {
      toolId,
      executorType,  // Preserve original for reference

      // Schema mapping
      inputSchema: executor.parameterSchema || { type: 'object', properties: {} },
      outputSchema: { type: 'object', properties: { output: { type: 'object' } } },

      // Metadata
      displayName: executor.displayName || executorType,
      description: executor.description || '',
      domain: executor.domain || 'aopeg',
      safetyLevel: 'AUTO',

      /**
       * Execute the wrapped AOPEG executor
       * @param {Object} input - Input parameters
       * @param {Object} ctx - Runtime execution context
       * @returns {Promise<Object>} Output data
       * @throws {Object} Error with code and message
       */
      async execute(input, ctx) {
        // 1. Build AOPEG context from Runtime context
        const aopegContext = adapter._buildAOPEGContext(input, ctx);

        // 2. Validate parameters if validator exists
        if (typeof executor.validateParameters === 'function') {
          const validation = executor.validateParameters(input);
          if (!validation.valid) {
            const error = new Error(validation.errors.join('; '));
            error.code = RuntimeErrorCodes.INVALID_INPUT;
            throw error;
          }
        }

        // 3. Call AOPEG executor
        let result;
        try {
          result = await executor.execute(input, aopegContext);
        } catch (execError) {
          // Wrap raw exceptions
          const error = new Error(execError.message || String(execError));
          error.code = RuntimeErrorCodes.EXECUTION_ERROR;
          error.cause = execError;
          throw error;
        }

        // 4a. WAIT_FOR_INPUT passthrough — don't treat as error
        if (result && result.status === 'WAIT_FOR_INPUT') {
          return result;
        }

        // 4a2. WAIT_FOR_SIGNAL passthrough — new AsyncSignalContract format
        if (result && result.__type === 'WAIT_FOR_SIGNAL') {
          console.log('[AOPEGAdapter:inner] WAIT_FOR_SIGNAL detected for', executorType);
          return result;
        }

        // DEBUG: log what result looks like before success check
        if (result && !result.success && !result.status) {
          console.log('[AOPEGAdapter:inner]', executorType, 'result has no success/status. Keys:', Object.keys(result).join(','), '__type:', result.__type);
        }

        // 4b. Map AOPEG result → Runtime result
        if (!result.success) {
          const recoverable = result.errors?.some(e => e.recoverable) ?? false;
          const error = new Error(
            result.errors?.map(e => e.message).join('; ') || 'Unknown error'
          );
          error.code = recoverable ? RuntimeErrorCodes.EXECUTION_ERROR : RuntimeErrorCodes.FATAL_ERROR;
          error.aopegErrors = result.errors;
          error.aopegMetadata = result.metadata;
          throw error;
        }

        // 5. Return output (Runtime expects flat object for ports)
        return result.output;
      },

      /**
       * Get default parameters from AOPEG executor
       * @returns {Object}
       */
      getDefaultParameters() {
        if (typeof executor.getDefaultParameters === 'function') {
          return executor.getDefaultParameters();
        }
        return {};
      },

      /**
       * Validate parameters using AOPEG validator
       * @param {Object} params
       * @returns {{valid: boolean, errors: string[]}}
       */
      validateParameters(params) {
        if (typeof executor.validateParameters === 'function') {
          return executor.validateParameters(params);
        }
        return { valid: true, errors: [] };
      },

      // Reference to original AOPEG executor
      _aopegExecutor: executor
    };

    // Cache the wrapped executor
    this._wrappedCache.set(executorType, wrapped);

    return wrapped;
  }

  /**
   * Wrap all registered AOPEG executors
   * @returns {Map<string, Object>} Map of toolId → wrapped executor
   */
  wrapAllExecutors() {
    const result = new Map();
    const executors = this._pluginRegistry.listExecutors();

    for (const { type } of executors) {
      const wrapped = this.wrapExecutor(type);
      if (wrapped) {
        result.set(wrapped.toolId, wrapped);
      }
    }

    return result;
  }

  /**
   * Register all wrapped executors in an MCP registry
   * @param {Object} mcpRegistry - MCP tool registry with registerTool method
   * @param {Object} options - Options
   * @param {boolean} [options.overwrite=false] - Overwrite existing tools
   * @returns {{registered: number, skipped: number, errors: string[]}}
   */
  registerInMcpRegistry(mcpRegistry, options = {}) {
    const { overwrite = false } = options;
    const wrapped = this.wrapAllExecutors();
    const stats = { registered: 0, skipped: 0, errors: [] };

    for (const [toolId, executor] of wrapped) {
      try {
        // Check if tool already exists
        if (mcpRegistry.hasTool && mcpRegistry.hasTool(toolId)) {
          if (!overwrite) {
            stats.skipped++;
            continue;
          }
        }

        // Register the wrapped executor as an MCP tool
        if (typeof mcpRegistry.registerTool === 'function') {
          mcpRegistry.registerTool(toolId, executor.execute, executor.inputSchema, executor.outputSchema);
        } else if (typeof mcpRegistry.set === 'function') {
          // Simple Map-like registry
          mcpRegistry.set(toolId, executor);
        } else {
          stats.errors.push(`Registry doesn't support registerTool or set for ${toolId}`);
          continue;
        }

        stats.registered++;
      } catch (error) {
        stats.errors.push(`Failed to register ${toolId}: ${error.message}`);
      }
    }

    return stats;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build AOPEG-compatible context from Runtime context
   * @private
   */
  _buildAOPEGContext(input, ctx) {
    // Use portData (upstream data only) for context.input when available.
    // This prevents executor config params (code, rules, prompt, etc.)
    // from leaking into context.input that scripts/AI prompts consume.
    const contextInput = ctx?.portData !== undefined ? ctx.portData : input;

    return {
      executionId: ctx?.executionId || `exec-${Date.now()}`,
      graphId: ctx?.graphId || 'runtime',
      input: contextInput,
      variables: ctx?.globalVariables instanceof Map
        ? Object.fromEntries(ctx.globalVariables)
        : (ctx?.globalVariables || {}),
      globalVariables: ctx?.globalVariables || new Map(),
      nodeOutputs: new Map(),
      // Share state across all nodes in the execution (e.g., SQL connection pools).
      // Uses ExecutionContext.sharedState if available, otherwise creates a fresh Map.
      sharedState: ctx?.executionContext?.sharedState || new Map(),
      executionContext: ctx?.executionContext || null,
      metadata: {
        source: 'gxe-runtime',
        nodeId: ctx?.nodeId,
        timestamp: Date.now()
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if an executor type is registered in AOPEG
   * @param {string} executorType
   * @returns {boolean}
   */
  hasExecutor(executorType) {
    return this._pluginRegistry.hasExecutor(executorType);
  }

  /**
   * Get list of all available executor types
   * @returns {string[]}
   */
  getAvailableExecutorTypes() {
    return this._pluginRegistry.listExecutors().map(e => e.type);
  }

  /**
   * Get executor info including mapping
   * @param {string} executorType
   * @returns {Object|null}
   */
  getExecutorInfo(executorType) {
    const executor = this._pluginRegistry.getExecutor(executorType);
    if (!executor) return null;

    return {
      executorType,
      toolId: this.mapExecutorTypeToToolId(executorType),
      displayName: executor.displayName,
      description: executor.description,
      domain: executor.domain,
      parameterSchema: executor.parameterSchema
    };
  }

  /**
   * Clear the wrapped executor cache
   */
  clearCache() {
    this._wrappedCache.clear();
  }

  /**
   * Get adapter statistics
   * @returns {Object}
   */
  getStats() {
    return {
      availableExecutors: this._pluginRegistry.listExecutors().length,
      cachedWrappers: this._wrappedCache.size,
      mappedTypes: Object.keys(EXECUTOR_TO_TOOL_MAP).length
    };
  }

  /**
   * List all available executors with metadata
   * @returns {Array<{type: string, displayName: string, domain: string, description: string}>}
   */
  listExecutors() {
    return this._pluginRegistry.listExecutors();
  }

  /**
   * Create an MCP-compatible registry that wraps AOPEG executors
   * This can be used directly with RuntimeEngine
   * @returns {Object} Registry with hasTool, callTool, listTools methods
   */
  createMcpCompatibleRegistry() {
    const adapter = this;
    const wrappedExecutors = this.wrapAllExecutors();

    return {
      /**
       * Check if a tool exists
       * @param {string} toolId
       * @returns {boolean}
       */
      hasTool(toolId) {
        // Check both toolId and executorType mappings
        if (wrappedExecutors.has(toolId)) {
          return true;
        }
        // Try executor type directly
        const executorType = adapter.mapToolIdToExecutorType(toolId);
        return adapter.hasExecutor(executorType) || adapter.hasExecutor(toolId);
      },

      /**
       * Call a tool with parameters
       * @param {string} toolId
       * @param {Object} params
       * @param {Object} [ctx] - Optional execution context
       * @returns {Promise<Object>}
       */
      async callTool(toolId, params, ctx = {}) {
        // Find the wrapped executor
        let wrapped = wrappedExecutors.get(toolId);

        if (!wrapped) {
          // Try to find by executor type
          const executorType = adapter.mapToolIdToExecutorType(toolId);
          wrapped = adapter.wrapExecutor(executorType);

          if (!wrapped) {
            wrapped = adapter.wrapExecutor(toolId);
          }
        }

        if (!wrapped) {
          return {
            success: false,
            error: `Tool not found: ${toolId}`,
            code: RuntimeErrorCodes.EXECUTOR_NOT_FOUND
          };
        }

        try {
          const output = await wrapped.execute(params, ctx);
          return {
            success: true,
            output,
            toolId: wrapped.toolId,
            executorType: wrapped.executorType
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            code: error.code || RuntimeErrorCodes.EXECUTION_ERROR,
            details: error.aopegErrors || null
          };
        }
      },

      /**
       * List all available tools
       * @returns {Array<{name: string, description: string, inputSchema: Object}>}
       */
      listTools() {
        const tools = [];
        for (const [toolId, wrapped] of wrappedExecutors) {
          tools.push({
            name: toolId,
            description: wrapped.description,
            inputSchema: wrapped.inputSchema,
            domain: wrapped.domain,
            executorType: wrapped.executorType
          });
        }
        return tools;
      },

      /**
       * Get the wrapped executor directly
       * @param {string} toolId
       * @returns {Object|null}
       */
      getExecutor(toolId) {
        return wrappedExecutors.get(toolId) || null;
      },

      /**
       * Get a tool object compatible with NodeRunner
       * Returns tool with getDefinition() and execute() methods
       * @param {string} toolIdOrExecutorType - Tool ID or executor type (both accepted)
       * @returns {Object|null}
       */
      getTool(toolIdOrExecutorType) {
        // Find the wrapped executor - try multiple lookup strategies
        let wrapped = wrappedExecutors.get(toolIdOrExecutorType);

        if (!wrapped) {
          // toolIdOrExecutorType might be an executorType like 'ingestion.parse_document'
          // Map it to toolId (e.g., 'text.parse') and look up
          const mappedToolId = adapter.mapExecutorTypeToToolId(toolIdOrExecutorType);
          wrapped = wrappedExecutors.get(mappedToolId);
        }

        if (!wrapped) {
          // Try MCP tool alias → AOPEG executor type (e.g., 'primitive.get_value' → 'workflow.start')
          const aliasedExecutorType = MCP_TOOL_ALIAS_MAP[toolIdOrExecutorType];
          if (aliasedExecutorType) {
            wrapped = wrappedExecutors.get(aliasedExecutorType)
              || wrappedExecutors.get(adapter.mapExecutorTypeToToolId(aliasedExecutorType));
            if (!wrapped) {
              wrapped = adapter.wrapExecutor(aliasedExecutorType);
            }
          }
        }

        if (!wrapped) {
          // Still not found - try wrapping the executor directly
          // This handles cases where executor type is used but not in mapping
          wrapped = adapter.wrapExecutor(toolIdOrExecutorType);
        }

        if (!wrapped) {
          return null;
        }

        // Return tool object compatible with NodeRunner
        return {
          /**
           * Get tool definition (schema for validation)
           */
          getDefinition() {
            return {
              inputSchema: wrapped.inputSchema || { type: 'object', properties: {} },
              outputSchema: wrapped.outputSchema || { type: 'object', properties: {} }
            };
          },

          /**
           * Execute the tool
           * @param {Object} input - Input parameters (may be wrapped in port names)
           * @param {Object} ctx - Execution context
           * @param {Object} registry - MCP registry (unused but part of signature)
           * @returns {Promise<{data: Object}>}
           */
          async execute(input, ctx, registry) {
            try {
              // Unwrap single-port input: port system may wrap as { _input: {...} }
              // NodeRunner already flattens port data and merges with nodeParams,
              // so multi-key input is already in final form — pass through as-is.
              let flatInput = input;
              if (input && typeof input === 'object') {
                const keys = Object.keys(input);
                if (process.env.DEBUG_RUNTIME) {
                  console.log(`[AOPEGAdapter] ${wrapped.executorType} input:`, JSON.stringify(input).substring(0, 200));
                }
                // Only unwrap single-port wrapper (e.g. { _input: { text: "..." } })
                if (keys.length === 1 && typeof input[keys[0]] === 'object' && input[keys[0]] !== null && !Array.isArray(input[keys[0]])) {
                  flatInput = input[keys[0]];
                }
                // Multi-key input: already merged by NodeRunner, pass as-is
              }

              if (process.env.DEBUG_RUNTIME) {
                console.log(`[AOPEGAdapter] ${wrapped.executorType || wrapped.type} flatInput:`, JSON.stringify(flatInput).substring(0, 200));
              }
              let output;
              try {
                output = await wrapped.execute(flatInput, ctx);
              } catch(execErr) {
                if (process.env.DEBUG_RUNTIME) {
                  console.log(`[AOPEGAdapter] ${wrapped.executorType || wrapped.type} THREW:`, execErr.message);
                }
                throw execErr;
              }
              if (process.env.DEBUG_RUNTIME) {
                console.log(`[AOPEGAdapter] ${wrapped.executorType || wrapped.type} output type: ${output?.__type || output?.status || 'data'}`);
              }
              // WAIT_FOR_INPUT passthrough — return as-is for NodeRunner
              if (output && output.status === 'WAIT_FOR_INPUT') {
                return output;
              }
              // WAIT_FOR_SIGNAL passthrough — new AsyncSignalContract format
              if (output && output.__type === 'WAIT_FOR_SIGNAL') {
                return output;
              }
              return { data: output };
            } catch (error) {
              // Re-throw with proper error structure
              const wrappedError = new Error(error.message || 'Execution failed');
              wrappedError.code = error.code || RuntimeErrorCodes.EXECUTION_ERROR;
              throw wrappedError;
            }
          }
        };
      }
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  AOPEGAdapter,
  EXECUTOR_TO_TOOL_MAP,
  TOOL_TO_EXECUTOR_MAP,
  RuntimeErrorCodes
};
