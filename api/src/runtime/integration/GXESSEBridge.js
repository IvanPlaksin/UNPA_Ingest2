/**
 * GXESSEBridge
 *
 * Translates RuntimeEngine events into the SSE format expected by
 * the GXE frontend (GXEAssistantTab.jsx).
 *
 * Streams every execution stage to the frontend:
 *   - start          — execution begins (node/edge counts)
 *   - node:start     — node enters EXECUTING
 *   - node:phase     — node execution phase (RESOLVE, VALIDATE, EXECUTE, PROPAGATE)
 *   - node:complete  — node succeeded (includes output + per-phase timing)
 *   - node:error     — node failed permanently
 *   - node:retry     — node will be retried
 *   - progress       — overall execution progress (% complete)
 *   - complete       — execution finished successfully
 *   - error          — execution failed
 *
 * @module runtime/integration/GXESSEBridge
 */

'use strict';

class GXESSEBridge {
  /**
   * @param {import('../RuntimeEngine').RuntimeEngine} engine
   * @param {Object} dag - { nodes: Node[], edges: Edge[] }
   */
  constructor(engine, dag) {
    if (!engine) throw new Error('GXESSEBridge requires a RuntimeEngine');
    this._engine = engine;
    this._dag = dag;
    this._res = null;
    this._req = null;
    this._executionId = null;
    this._closed = false;
    this._listeners = null;
    this._heartbeatTimer = null;
    this._nodeIndex = 0;
    this._totalNodes = dag.nodes.length;
    this._startTime = null;

    // Build nodeId → node lookup for labels/kinds
    this._nodeMap = new Map();
    for (const n of dag.nodes) {
      this._nodeMap.set(n.id, n);
    }
  }

  /**
   * Attach to Express req/res and start streaming SSE events.
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {string} executionId
   */
  attach(req, res, executionId) {
    if (this._closed) throw new Error('Cannot attach: bridge is closed');

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Allow-Origin', '*');
    req.setTimeout(0);
    res.flushHeaders();

    this._res = res;
    this._req = req;
    this._executionId = executionId;
    this._startTime = Date.now();

    // Send start event
    this._send('start', {
      executionId,
      nodeCount: this._dag.nodes.length,
      edgeCount: this._dag.edges.length,
      nodes: this._dag.nodes.map(n => ({
        id: n.id,
        label: n.data?.label || n.id,
        kind: n.data?.kind || 'action',
        toolId: n.data?.toolId || n.data?.executorType || n.data?.type || 'unknown',
      })),
    });

    // Subscribe to RuntimeEngine events
    this._subscribe();

    // Heartbeat every 15s
    this._heartbeatTimer = setInterval(() => {
      if (!this._closed) {
        try { this._res.write(':heartbeat\n\n'); }
        catch (_) { this.detach(); }
      }
    }, 15000);

    // Handle client disconnect
    req.on('close', () => this.detach());

    return this;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT SUBSCRIPTION
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _subscribe() {
    const engine = this._engine;

    this._listeners = {
      // ── Node state transitions ──
      'node:stateChange': (data) => {
        const node = this._nodeMap.get(data.nodeId);
        const nodeLabel = node?.data?.label || node?.id || data.nodeId;
        const nodeKind = node?.data?.kind || node?.data?.executorType || 'executor';

        if (data.to === 'EXECUTING') {
          this._send('node:start', {
            nodeId: data.nodeId,
            nodeLabel,
            nodeKind,
            toolId: node?.data?.toolId || node?.data?.executorType || 'unknown',
            index: this._nodeIndex++,
            total: this._totalNodes,
            attempt: data.attempt || 1,
          });
        } else if (data.to === 'RETRYING') {
          // Node about to retry
          this._send('node:retry', {
            nodeId: data.nodeId,
            nodeLabel,
            attempt: data.attempt || 1,
            from: data.from,
          });
        } else if (data.to === 'QUEUED') {
          // Node scheduled for execution
          this._send('node:phase', {
            nodeId: data.nodeId,
            nodeLabel,
            phase: 'QUEUED',
            message: 'Ожидание в очереди',
          });
        } else if (data.to === 'SKIPPED') {
          this._send('node:phase', {
            nodeId: data.nodeId,
            nodeLabel,
            phase: 'SKIPPED',
            message: 'Пропущен (условие не выполнено)',
          });
        }
      },

      // ── Node completed — includes output + per-phase timing ──
      'node:completed': (data) => {
        const node = this._nodeMap.get(data.nodeId);
        this._send('node:complete', {
          nodeId: data.nodeId,
          nodeLabel: node?.data?.label || data.nodeId,
          result: this._truncate(data.output),
          duration: data.metrics?.wallTimeMs || 0,
          phases: data.metrics?.phases || null,
          attempt: data.attempt || 1,
        });
      },

      // ── Node failed (only permanent failures) ──
      'node:failed': (data) => {
        const node = this._nodeMap.get(data.nodeId);
        if (data.willRetry) {
          // Temporary failure — will retry
          this._send('node:retry', {
            nodeId: data.nodeId,
            nodeLabel: node?.data?.label || data.nodeId,
            error: data.error || 'Unknown error',
            attempt: data.attempt || 1,
            willRetry: true,
          });
          return;
        }
        this._send('node:error', {
          nodeId: data.nodeId,
          nodeLabel: node?.data?.label || data.nodeId,
          error: data.error || 'Unknown error',
          details: this._truncate(data.details, 2048),
          failedAtPhase: data.details?.failedAtPhase || null,
          attempt: data.attempt || 1,
        });
      },

      // ── Execution progress ──
      'execution:progress': (data) => {
        this._send('progress', {
          completed: data.completed || 0,
          total: data.total || this._totalNodes,
          percentage: data.percentage || 0,
          elapsed: Date.now() - this._startTime,
        });
      },

      // ── Execution state changes (VALIDATING, EXECUTING, etc.) ──
      'execution:stateChange': (data) => {
        this._send('execution:phase', {
          from: data.from,
          to: data.to,
          elapsed: Date.now() - this._startTime,
        });
      },

      // ── Execution completed ──
      'execution:completed': (data) => {
        // Build per-node summary with results
        const nodeResults = {};
        if (data.nodeResults) {
          for (const [nodeId, nr] of Object.entries(data.nodeResults)) {
            const node = this._nodeMap.get(nodeId);
            nodeResults[nodeId] = {
              status: nr.status,
              label: node?.data?.label || nodeId,
              output: this._truncate(nr.output, 4096),
              duration: nr.metrics?.wallTimeMs || nr.durationMs || 0,
              phases: nr.metrics?.phases || null,
              attempt: nr.attempt || 1,
            };
          }
        }

        this._send('complete', {
          executionId: this._executionId,
          duration: data.totalDurationMs || data.metrics?.totalDurationMs || (Date.now() - this._startTime),
          nodeCount: this._totalNodes,
          nodeResults,
          output: this._truncate(data.output, 4096),
        });
        this._scheduleDetach();
      },

      // ── Execution failed ──
      'execution:failed': (data) => {
        this._send('error', {
          error: data.error || 'Execution failed',
          elapsed: Date.now() - this._startTime,
        });
        this._scheduleDetach();
      },
    };

    for (const [event, handler] of Object.entries(this._listeners)) {
      engine.on(event, handler);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SSE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /** @private */
  _send(event, data) {
    if (this._closed) return;
    try {
      this._res.write(`event: ${event}\n`);
      this._res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (_) {
      // Connection closed
    }
  }

  /** @private Truncate large results to prevent SSE payload explosion */
  _truncate(data, maxLen = 10240) {
    if (data === undefined || data === null) return data;
    try {
      const json = JSON.stringify(data);
      if (json.length > maxLen) {
        return json.substring(0, maxLen) + '...';
      }
      return data;
    } catch (_) {
      return String(data).substring(0, maxLen);
    }
  }

  /** @private */
  _scheduleDetach() {
    setTimeout(() => this.detach(), 500);
  }

  /**
   * Detach from SSE stream, cleanup listeners and timers.
   */
  detach() {
    if (this._closed) return;
    this._closed = true;

    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }

    if (this._listeners && this._engine) {
      for (const [event, handler] of Object.entries(this._listeners)) {
        this._engine.off(event, handler);
      }
      this._listeners = null;
    }

    try { this._res?.end(); } catch (_) { /* already closed */ }
    this._res = null;
    this._req = null;
  }

  get closed() { return this._closed; }
}

module.exports = { GXESSEBridge };
