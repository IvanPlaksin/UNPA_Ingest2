/**
 * RuntimeSSEStreamer
 *
 * Server-Sent Events (SSE) streamer for GXE RuntimeEngine.
 * Provides real-time execution observability over HTTP.
 *
 * Part of GXE Runtime Environment P1.
 *
 * @module runtime/observability/RuntimeSSEStreamer
 */

// ═══════════════════════════════════════════════════════════════════════════
// SSE EVENT TYPES (consistent with existing codebase patterns)
// ═══════════════════════════════════════════════════════════════════════════

const SSE_EVENTS = {
  // Connection
  CONNECTED: 'connected',

  // Node lifecycle
  NODE_STARTED: 'node:started',
  NODE_COMPLETED: 'node:completed',
  NODE_FAILED: 'node:failed',
  NODE_RETRY: 'node:retry',

  // Execution lifecycle
  EXECUTION_PROGRESS: 'execution:progress',
  EXECUTION_COMPLETED: 'execution:completed',
  EXECUTION_FAILED: 'execution:failed',
  EXECUTION_CANCELLED: 'execution:cancelled',
  EXECUTION_PAUSED: 'execution:paused',
  EXECUTION_RESUMED: 'execution:resumed',

  // Wait for input
  WAITING_INPUT: 'waiting:input'
};

// ═══════════════════════════════════════════════════════════════════════════
// RUNTIME SSE STREAMER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SSE streamer that bridges RuntimeEngine events to HTTP clients
 */
class RuntimeSSEStreamer {
  /**
   * @param {Object} runtimeEngine - RuntimeEngine instance
   */
  constructor(runtimeEngine) {
    if (!runtimeEngine) {
      throw new Error('RuntimeSSEStreamer requires a runtimeEngine');
    }

    this._runtimeEngine = runtimeEngine;
    this._res = null;
    this._req = null;
    this._executionId = null;
    this._sendEvent = null;
    this._closed = false;
    this._listeners = null;
    this._heartbeatTimer = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SSE SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Attach to Express req/res for SSE streaming
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {string} executionId - Execution ID for filtering
   */
  attach(req, res, executionId) {
    if (this._closed) {
      throw new Error('Cannot attach: streamer is closed');
    }

    // 1. Set SSE headers (matching existing pattern from aopeg.controller)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    req.setTimeout(0);

    // 2. Create sendEvent helper
    const streamer = this;
    const sendEvent = (type, data) => {
      if (streamer._closed) return false;
      try {
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify({ ...data, executionId, timestamp: Date.now() })}\n\n`);
        return true;
      } catch (e) {
        // Connection closed
        return false;
      }
    };

    // 3. Store state
    this._res = res;
    this._req = req;
    this._executionId = executionId;
    this._sendEvent = sendEvent;

    // 4. Send connected event
    sendEvent(SSE_EVENTS.CONNECTED, { executionId });

    // 5. Subscribe to RuntimeEngine events
    this._subscribeToEngine(sendEvent);

    // 6. Start heartbeat (every 15 seconds)
    this._heartbeatTimer = setInterval(() => {
      if (!this._closed) {
        try {
          res.write(':heartbeat\n\n');
        } catch (e) {
          // Connection closed
          this.detach();
        }
      }
    }, 15000);

    // 7. Handle client disconnect
    req.on('close', () => this.detach());

    return this;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENGINE EVENT SUBSCRIPTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to RuntimeEngine events and forward to SSE
   * @private
   */
  _subscribeToEngine(sendEvent) {
    const engine = this._runtimeEngine;

    this._listeners = {
      // Node state changes → node:started
      'node:stateChange': (data) => {
        if (data.to === 'EXECUTING') {
          sendEvent(SSE_EVENTS.NODE_STARTED, {
            nodeId: data.nodeId,
            toolId: data.toolId,
            from: data.from,
            attempt: data.attempt
          });
        }
      },

      // Node completed successfully
      'node:completed': (data) => {
        sendEvent(SSE_EVENTS.NODE_COMPLETED, {
          nodeId: data.nodeId,
          output: this._safeSerialize(data.output),
          metrics: data.metrics
        });
      },

      // Node failed (retry or permanent)
      'node:failed': (data) => {
        if (data.willRetry) {
          sendEvent(SSE_EVENTS.NODE_RETRY, {
            nodeId: data.nodeId,
            error: data.error,
            attempt: data.attempt,
            nextAttemptIn: data.nextDelay
          });
        } else {
          sendEvent(SSE_EVENTS.NODE_FAILED, {
            nodeId: data.nodeId,
            error: data.error,
            attempt: data.attempt,
            details: data.details
          });
        }
      },

      // Node waiting for user input
      'node:waitingInput': (data) => {
        sendEvent(SSE_EVENTS.WAITING_INPUT, {
          nodeId: data.nodeId,
          nodeLabel: data.waitContext?.nodeLabel || data.nodeId,
          expected_inputs: data.waitContext?.expected_inputs || [],
          resume_token: data.waitContext?.resume_token,
          recipients: data.waitContext?.recipients,
          timeout_at: data.waitContext?.timeout_at,
          timeout_action: data.waitContext?.timeout_action,
          prompt: data.waitContext?.prompt,
          attempt: data.attempt
        });
      },

      // Execution progress updates
      'execution:progress': (data) => {
        sendEvent(SSE_EVENTS.EXECUTION_PROGRESS, {
          completed: data.completed,
          total: data.total,
          percentage: data.percentage,
          activeNodes: data.activeNodes
        });
      },

      // Execution state changes
      'execution:stateChange': (data) => {
        if (data.to === 'WAITING') {
          // Execution paused waiting for user input — keep SSE stream open
          sendEvent(SSE_EVENTS.EXECUTION_PAUSED, { from: data.from, reason: 'waiting_input' });
        } else if (data.to === 'PAUSED') {
          sendEvent(SSE_EVENTS.EXECUTION_PAUSED, { from: data.from });
        } else if ((data.from === 'PAUSED' || data.from === 'WAITING') && data.to === 'RUNNING') {
          sendEvent(SSE_EVENTS.EXECUTION_RESUMED, {});
        } else if (data.to === 'CANCELLED') {
          sendEvent(SSE_EVENTS.EXECUTION_CANCELLED, { from: data.from });
          this._scheduleDetach();
        }
      },

      // Execution completed
      'execution:completed': (data) => {
        sendEvent(SSE_EVENTS.EXECUTION_COMPLETED, {
          status: 'COMPLETED',
          metrics: data.metrics,
          duration: data.totalDurationMs,
          nodeResults: this._summarizeNodeResults(data.nodeResults)
        });
        this._scheduleDetach();
      },

      // Execution failed
      'execution:failed': (data) => {
        sendEvent(SSE_EVENTS.EXECUTION_FAILED, {
          status: 'FAILED',
          error: data.error,
          failedNodes: data.failedNodes,
          missingTools: data.missingTools,
          metrics: data.metrics
        });
        this._scheduleDetach();
      },

      // Tool validation failed (pre-execution)
      'execution:toolValidationFailed': (data) => {
        sendEvent('execution:toolValidationFailed', {
          status: 'FAILED',
          error: data.message,
          missingTools: data.missingTools,
        });
      }
    };

    // Attach all listeners
    for (const [event, handler] of Object.entries(this._listeners)) {
      engine.on(event, handler);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Schedule detach with delay (allows client to receive final event)
   * @private
   */
  _scheduleDetach() {
    setTimeout(() => this.detach(), 500);
  }

  /**
   * Detach from SSE stream and cleanup
   */
  detach() {
    if (this._closed) return;
    this._closed = true;

    // Stop heartbeat
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    // Unsubscribe from engine events
    if (this._listeners && this._runtimeEngine) {
      for (const [event, handler] of Object.entries(this._listeners)) {
        this._runtimeEngine.off(event, handler);
      }
      this._listeners = null;
    }

    // Close SSE stream
    try {
      this._res?.end();
    } catch (e) {
      // Connection already closed
    }

    // Clear references
    this._res = null;
    this._req = null;
    this._sendEvent = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MANUAL EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send a custom event manually
   * @param {string} type - Event type
   * @param {Object} data - Event data
   * @returns {boolean} - Success
   */
  sendManualEvent(type, data) {
    if (this._closed || !this._sendEvent) {
      return false;
    }
    return this._sendEvent(type, data);
  }

  /**
   * Send a validation warning event
   * @param {Object} validation - Validation result
   */
  sendValidationWarning(validation) {
    this.sendManualEvent('validation:warning', {
      warnings: validation.warnings || [],
      fixed: validation.fixed || [],
      stats: validation.stats
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Safe serialize data for JSON (truncate large outputs)
   * @private
   */
  _safeSerialize(data, maxLength = 10000) {
    if (data === undefined || data === null) return data;

    try {
      const json = JSON.stringify(data);
      if (json.length > maxLength) {
        return {
          _truncated: true,
          _originalLength: json.length,
          preview: json.substring(0, maxLength) + '...'
        };
      }
      return data;
    } catch (e) {
      return { _error: 'Serialization failed', message: e.message };
    }
  }

  /**
   * Summarize node results for final event
   * @private
   */
  _summarizeNodeResults(nodeResults) {
    if (!nodeResults) return null;

    const summary = {};
    for (const [nodeId, result] of Object.entries(nodeResults)) {
      summary[nodeId] = {
        status: result.status,
        hasOutput: result.output !== undefined,
        error: result.error
      };
    }
    return summary;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if streamer is closed
   * @returns {boolean}
   */
  get closed() {
    return this._closed;
  }

  /**
   * Get execution ID
   * @returns {string|null}
   */
  get executionId() {
    return this._executionId;
  }

  /**
   * Get runtime engine reference
   * @returns {Object}
   */
  get runtimeEngine() {
    return this._runtimeEngine;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  RuntimeSSEStreamer,
  SSE_EVENTS
};
