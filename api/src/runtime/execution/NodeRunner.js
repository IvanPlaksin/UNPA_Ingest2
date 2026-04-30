/**
 * NodeRunner
 *
 * Stateless executor for individual nodes. Executes one attempt of a node.
 * Does NOT manage retries - that's the Scheduler's responsibility.
 * Part of GXE Runtime Environment P0.
 *
 * Execution phases:
 * 1. RESOLVE - Find tool in registry
 * 2. VALIDATE_INPUT - Check required fields
 * 3. EXECUTE - Run the tool with timeout
 * 4. VALIDATE_OUTPUT - Basic output validation
 * 5. PROPAGATE - Push output to downstream ports
 *
 * @module runtime/execution/NodeRunner
 */

// ═══════════════════════════════════════════════════════════════════════════
// RESULT STATUS
// ═══════════════════════════════════════════════════════════════════════════

const { TemplateResolver } = require('./TemplateResolver');

const RunStatus = {
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  RETRY: 'RETRY',
  WAIT_FOR_INPUT: 'WAIT_FOR_INPUT'
};

const FailurePhase = {
  RESOLVE: 'RESOLVE',
  VALIDATE_INPUT: 'VALIDATE_INPUT',
  EXECUTE: 'EXECUTE',
  VALIDATE_OUTPUT: 'VALIDATE_OUTPUT',
  PROPAGATE: 'PROPAGATE'
};

// ═══════════════════════════════════════════════════════════════════════════
// NODE RUNNER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Executes a single attempt of a node
 */
class NodeRunner {
  /**
   * Default timeout for node execution (60 seconds)
   */
  static DEFAULT_TIMEOUT_MS = 60000;

  /**
   * Execute a node
   *
   * @param {string} nodeId - Node ID
   * @param {string} toolId - Tool ID to execute
   * @param {Object} ctx - Execution context
   * @param {Object} ctx.mcpRegistry - MCP Tool Registry
   * @param {import('../dataflow/PortManager').PortManager} ctx.portManager - Port Manager
   * @param {import('../dataflow/DataFlowManager').DataFlowManager} ctx.dataFlowManager - Data Flow Manager
   * @param {Map} [ctx.globalVariables] - Global variables map
   * @param {string} [ctx.executionId] - Execution ID
   * @param {Object} [ctx.config] - Configuration
   * @param {number} [ctx.config.nodeTimeoutMs] - Node timeout in ms
   * @param {Object} [ctx.nodeParameters] - Static parameters from node definition
   *
   * @returns {Promise<RunResult>}
   */
  async run(nodeId, toolId, ctx) {
    const metrics = {
      wallTimeMs: 0,
      phases: {
        resolveMs: 0,
        validateInputMs: 0,
        executeMs: 0,
        validateOutputMs: 0,
        propagateMs: 0
      }
    };

    const startTime = Date.now();
    const timeoutMs = ctx.config?.nodeTimeoutMs ?? NodeRunner.DEFAULT_TIMEOUT_MS;

    // Create AbortController for cancellation support
    const abortController = new AbortController();
    const { signal } = abortController;

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 1: RESOLVE
      // ═══════════════════════════════════════════════════════════════════════
      const resolveStart = Date.now();

      const tool = ctx.mcpRegistry.getTool(toolId);
      if (!tool) {
        metrics.phases.resolveMs = Date.now() - resolveStart;
        metrics.wallTimeMs = Date.now() - startTime;
        return this._failure('TOOL_NOT_FOUND', FailurePhase.RESOLVE, metrics, { toolId });
      }

      const toolDef = tool.getDefinition();
      metrics.phases.resolveMs = Date.now() - resolveStart;

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 2: VALIDATE_INPUT
      // ═══════════════════════════════════════════════════════════════════════
      const validateInputStart = Date.now();

      // Collect port data and merge with node parameters
      const portData = ctx.portManager.collectInput(nodeId);
      const nodeParams = ctx.nodeParameters || {};

      // Flatten port data: comes as { portId: data } but we need to extract actual data properties
      // Port system wraps data by port ID, but executors expect flat parameter objects
      let flatPortData = {};
      for (const [portId, data] of Object.entries(portData)) {
        // If data is an object, spread its properties; otherwise use as-is
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          flatPortData = { ...flatPortData, ...data };
        } else if (portId !== '_input') {
          flatPortData[portId] = data;
        }
      }

      // Build context.input for executors: smart unwrap based on port count.
      // Single port → unwrap value directly; multiple ports → keep port keys.
      // This separates upstream data from executor config in context.input.
      const portEntries = Object.entries(portData);
      let contextPortData;
      if (portEntries.length === 0) {
        contextPortData = {};
      } else if (portEntries.length === 1) {
        contextPortData = portEntries[0][1];
      } else {
        contextPortData = portData;
      }

      // Merge: static node params take precedence over port data
      // (prevents upstream output fields like 'path' from overriding executor config)
      const input = { ...flatPortData, ...nodeParams };

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 2.5: TEMPLATE RESOLUTION (before validation)
      // ═══════════════════════════════════════════════════════════════════════
      // Resolve {{path}} templates in input using ExecutionContext data.
      // Must happen BEFORE validation so template strings like '{{input.port}}'
      // resolve to their actual typed values before type checking.
      let resolvedInput = input;
      if (ctx.executionContext) {
        const templateResolver = new TemplateResolver();
        const templateContext = ctx.executionContext.getTemplateContext();
        resolvedInput = templateResolver.resolve(input, templateContext);
      }

      const validationResult = this._validateInput(resolvedInput, toolDef.inputSchema);

      if (!validationResult.valid) {
        metrics.phases.validateInputMs = Date.now() - validateInputStart;
        metrics.wallTimeMs = Date.now() - startTime;
        return this._failure('INVALID_INPUT', FailurePhase.VALIDATE_INPUT, metrics, {
          errors: validationResult.errors
        });
      }

      metrics.phases.validateInputMs = Date.now() - validateInputStart;

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 3: EXECUTE
      // ═══════════════════════════════════════════════════════════════════════
      const executeStart = Date.now();

      let result;
      let timeoutTimer = null;

      try {
        // Execute with timeout using Promise.race
        // Pass flatPortData separately so executors can distinguish upstream data
        // from their own configuration parameters (code, rules, prompt, etc.)
        const executePromise = tool.execute(resolvedInput, {
          signal,
          globalVariables: ctx.globalVariables || new Map(),
          executionId: ctx.executionId,
          nodeId,
          portData: contextPortData,
          executionContext: ctx.executionContext
        }, ctx.mcpRegistry);

        const timeoutPromise = new Promise((_, reject) => {
          timeoutTimer = setTimeout(() => {
            abortController.abort();
            reject(new Error('NODE_TIMEOUT'));
          }, timeoutMs);
        });

        result = await Promise.race([executePromise, timeoutPromise]);

        // Clear timeout if execution completed first
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
      } catch (execError) {
        // Clear timeout on error too
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }
        metrics.phases.executeMs = Date.now() - executeStart;
        metrics.wallTimeMs = Date.now() - startTime;

        const errorCode = execError.message === 'NODE_TIMEOUT' ? 'NODE_TIMEOUT' : 'EXECUTION_ERROR';
        return this._failure(errorCode, FailurePhase.EXECUTE, metrics, {
          error: execError.message,
          stack: execError.stack
        });
      }

      metrics.phases.executeMs = Date.now() - executeStart;

      // ═══════════════════════════════════════════════════════════════════════
      // CHECK: WAIT_FOR_SIGNAL — new AsyncSignalContract format
      // Executors return { __type: 'WAIT_FOR_SIGNAL', contract: {...} }
      // to trigger async signal waiting with full resolution policy support
      // ═══════════════════════════════════════════════════════════════════════
      console.log(`[NodeRunner] ${nodeId} result __type:`, result?.__type, '| keys:', result ? Object.keys(result).join(',') : 'null');
      if (result && result.__type === 'WAIT_FOR_SIGNAL') {
        console.log(`[NodeRunner] ${nodeId} ENTERING WAIT_FOR_SIGNAL block`);
        console.log(`[NodeRunner] ${nodeId} contract resumeToken:`, result.contract?.resumeToken ? 'YES' : 'NO');
        const { AsyncSignalContract } = require('../signals/async-signal-contract');
        const contract = new AsyncSignalContract({
          ...result.contract,
          contextRef: {
            ...(result.contract?.contextRef || {}),
            // NodeRunner values OVERRIDE executor values (executor may not have nodeId)
            execution_id: ctx.executionId,
            node_id: nodeId,
          },
        });

        const validation = contract.validate();
        console.log(`[NodeRunner] ${nodeId} contract validation:`, JSON.stringify(validation));
        if (!validation.valid) {
          console.log(`[NodeRunner] ${nodeId} INVALID CONTRACT:`, validation.errors);
          return this._failure(
            'INVALID_SIGNAL_CONTRACT',
            FailurePhase.EXECUTE,
            metrics,
            { errors: validation.errors }
          );
        }

        metrics.wallTimeMs = Date.now() - startTime;
        return {
          status: RunStatus.WAIT_FOR_INPUT,
          waitContext: contract.toLegacyWaitContext(),
          contract,
          metrics
        };
      }

      // ═══════════════════════════════════════════════════════════════════════
      // CHECK: WAIT_FOR_INPUT — legacy signal from executor
      // ═══════════════════════════════════════════════════════════════════════
      if (result && result.status === 'WAIT_FOR_INPUT') {
        const { AsyncSignalContract } = require('../signals/async-signal-contract');
        const legacyWaitContext = {
          resume_token: result.resume_token,
          expected_inputs: result.expected_inputs,
          recipients: result.recipients,
          timeout_at: result.timeout_at,
          timeout_action: result.timeout_action,
          prompt: result.prompt,
          choices: result.choices || null,
          accumulated_state: result.accumulated_state || null,
          response: result.response || result.prompt,
        };
        // Wrap legacy format in AsyncSignalContract for SignalOrchestrator
        const contract = AsyncSignalContract.fromLegacyWaitContext(
          legacyWaitContext,
          ctx.executionId,
          nodeId
        );
        legacyWaitContext._contract = contract;

        metrics.wallTimeMs = Date.now() - startTime;
        return {
          status: RunStatus.WAIT_FOR_INPUT,
          waitContext: legacyWaitContext,
          contract,
          metrics
        };
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 4: VALIDATE_OUTPUT
      // ═══════════════════════════════════════════════════════════════════════
      const validateOutputStart = Date.now();

      // Extract data from result (tools return { data, metrics? })
      const outputData = result?.data ?? result;

      if (outputData === null || outputData === undefined) {
        metrics.phases.validateOutputMs = Date.now() - validateOutputStart;
        metrics.wallTimeMs = Date.now() - startTime;
        return this._failure('INVALID_OUTPUT', FailurePhase.VALIDATE_OUTPUT, metrics, {
          error: 'Tool returned null or undefined'
        });
      }

      metrics.phases.validateOutputMs = Date.now() - validateOutputStart;

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 5: PROPAGATE
      // ═══════════════════════════════════════════════════════════════════════
      const propagateStart = Date.now();

      const propagationResults = ctx.dataFlowManager.propagateOutput(nodeId, outputData);

      // Check if any propagation failed
      const failedPropagations = propagationResults.filter(r => !r.success);
      if (failedPropagations.length > 0) {
        metrics.phases.propagateMs = Date.now() - propagateStart;
        metrics.wallTimeMs = Date.now() - startTime;
        return this._failure('PROPAGATION_ERROR', FailurePhase.PROPAGATE, metrics, {
          failedEdges: failedPropagations
        });
      }

      metrics.phases.propagateMs = Date.now() - propagateStart;
      metrics.wallTimeMs = Date.now() - startTime;

      // ═══════════════════════════════════════════════════════════════════════
      // STORE OUTPUT IN EXECUTION CONTEXT
      // ═══════════════════════════════════════════════════════════════════════
      if (ctx.executionContext) {
        ctx.executionContext.setNodeOutput(nodeId, outputData);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // SUCCESS
      // ═══════════════════════════════════════════════════════════════════════
      return {
        status: RunStatus.SUCCEEDED,
        output: outputData,
        metrics,
        toolMetrics: result?.metrics || null,
        propagationResults
      };

    } catch (unexpectedError) {
      // Catch-all for unexpected errors
      metrics.wallTimeMs = Date.now() - startTime;
      return this._failure('UNEXPECTED_ERROR', FailurePhase.EXECUTE, metrics, {
        error: unexpectedError.message,
        stack: unexpectedError.stack
      });
    }
  }

  /**
   * Validate input against schema
   * @private
   */
  _validateInput(input, schema) {
    const errors = [];

    if (!schema) {
      return { valid: true, errors };
    }

    // Check required fields
    const required = schema.required || [];
    for (const field of required) {
      if (input[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Basic type checking for defined properties
    if (schema.properties) {
      for (const [field, propSchema] of Object.entries(schema.properties)) {
        if (input[field] !== undefined && input[field] !== null && propSchema.type) {
          const actualType = Array.isArray(input[field]) ? 'array' : typeof input[field];
          const allowedTypes = Array.isArray(propSchema.type) ? propSchema.type : [propSchema.type];
          if (!allowedTypes.includes(actualType) && !allowedTypes.includes('any')) {
            // Allow 'object' to accept arrays (common pattern)
            if (!(allowedTypes.includes('object') && actualType === 'object')) {
              errors.push(`Field ${field}: expected ${allowedTypes.join('|')}, got ${actualType}`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create failure result
   * @private
   */
  _failure(errorCode, failedAtPhase, metrics, details = {}) {
    return {
      status: RunStatus.FAILED,
      error: errorCode,
      failedAtPhase,
      metrics,
      details
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  NodeRunner,
  RunStatus,
  FailurePhase
};
