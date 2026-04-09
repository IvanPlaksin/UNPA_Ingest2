/**
 * TriggerEngine
 *
 * Manages all trigger types for GxeManager:
 *   - CRON: periodic execution via cron expression
 *   - INTERVAL: fixed-interval repeating
 *   - ONCE: delayed one-shot execution
 *   - SIGNAL: event-driven (webhook, external callback)
 *   - DEPENDENCY: chain trigger (fires when another graph completes)
 *   - SENSOR: polling-based condition check (future)
 *
 * Persists trigger definitions to Memgraph and uses BullMQ for scheduling.
 *
 * @module gxe-manager/TriggerEngine
 */

const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { TriggerType } = require('./types/execution.types');
const { SignalAction } = require('./types/signals.types');

const LOG_TAG = '[TriggerEngine]';

class TriggerEngine extends EventEmitter {
  /**
   * @param {Object} deps
   * @param {import('./GxeManagerService').GxeManagerService} deps.gxeManager
   * @param {import('./QueueManager').QueueManager} deps.queueManager
   * @param {Object} [deps.memgraphService]
   */
  constructor(deps) {
    super();
    this.gxeManager = deps.gxeManager;
    this.queueManager = deps.queueManager;
    this.memgraphService = deps.memgraphService || null;

    /** @type {Map<string, Object>} triggerId → TriggerDefinition */
    this.triggers = new Map();

    /** @type {Map<string, string[]>} signalType → [triggerId, ...] */
    this.signalSubscriptions = new Map();

    /** @type {Map<string, string[]>} sourceGraphId → [triggerId, ...] */
    this.dependencySubscriptions = new Map();

    /** @type {Map<string, NodeJS.Timeout>} triggerId → interval handle (for INTERVAL without BullMQ) */
    this._intervalHandles = new Map();

    this._initialized = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  async initialize() {
    if (this._initialized) return;

    // Load persisted triggers from Memgraph
    if (this.memgraphService) {
      await this._loadTriggersFromMemgraph();
    }

    // Subscribe to GxeManager events for DEPENDENCY triggers
    this.gxeManager.on('execution.completed', (data) => {
      this._onExecutionCompleted(data).catch(err =>
        console.error(`${LOG_TAG} Error processing dependency on completion:`, err.message)
      );
    });
    this.gxeManager.on('execution.failed', (data) => {
      this._onExecutionFailed(data).catch(err =>
        console.error(`${LOG_TAG} Error processing dependency on failure:`, err.message)
      );
    });

    this._initialized = true;
    console.log(`${LOG_TAG} Initialized with ${this.triggers.size} triggers`);
  }

  async shutdown() {
    // Clear all interval handles
    for (const [id, handle] of this._intervalHandles) {
      clearInterval(handle);
    }
    this._intervalHandles.clear();
    this._initialized = false;
    console.log(`${LOG_TAG} Shut down`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGISTER / UNREGISTER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register a new trigger
   * @param {Object} definition
   * @param {string} definition.graphId - Graph to execute
   * @param {string} definition.type - TriggerType
   * @param {string} [definition.schedule] - Cron expression (for CRON)
   * @param {number} [definition.intervalMs] - Interval in ms (for INTERVAL)
   * @param {number} [definition.runAt] - Timestamp (for ONCE)
   * @param {string} [definition.signalType] - Signal to listen for (for SIGNAL)
   * @param {string} [definition.filterExpression] - Filter on signal payload
   * @param {string} [definition.sourceGraphId] - Graph to watch (for DEPENDENCY)
   * @param {string} [definition.condition] - ON_SUCCESS|ON_FAILURE|ON_ANY
   * @param {Object} [definition.inputMapping] - Map source output → target input
   * @param {Object} [definition.inputTemplate] - Static input template
   * @param {string} [definition.concurrencyPolicy] - ALLOW|SKIP|QUEUE|REPLACE
   * @param {number} [definition.delay] - Delay in ms after trigger fires
   * @param {string} [definition.timezone] - For CRON (default: UTC)
   * @param {boolean} [definition.enabled=true]
   * @param {Object} [definition.metadata]
   * @returns {Promise<Object>}
   */
  async registerTrigger(definition) {
    this._validateTriggerDefinition(definition);

    const trigger = {
      triggerId: definition.triggerId || randomUUID(),
      graphId: definition.graphId,
      type: definition.type,
      schedule: definition.schedule || null,
      intervalMs: definition.intervalMs || null,
      runAt: definition.runAt || null,
      signalType: definition.signalType || null,
      filterExpression: definition.filterExpression || null,
      sourceGraphId: definition.sourceGraphId || null,
      condition: definition.condition || 'ON_SUCCESS',
      inputMapping: definition.inputMapping || null,
      inputTemplate: definition.inputTemplate || null,
      concurrencyPolicy: definition.concurrencyPolicy || 'SKIP',
      delay: definition.delay || 0,
      timezone: definition.timezone || 'UTC',
      enabled: definition.enabled !== false,
      metadata: definition.metadata || {},
      createdAt: definition.createdAt || Date.now(),
      lastFiredAt: null,
      fireCount: 0
    };

    // Save to memory
    this.triggers.set(trigger.triggerId, trigger);

    // Persist to Memgraph
    if (this.memgraphService) {
      await this._persistTriggerToMemgraph(trigger);
    }

    // Activate if enabled
    if (trigger.enabled) {
      await this._activateTrigger(trigger);
    }

    this.emit('trigger.registered', { triggerId: trigger.triggerId, type: trigger.type });
    console.log(`${LOG_TAG} Registered trigger ${trigger.triggerId} (${trigger.type}) for graph ${trigger.graphId}`);
    return trigger;
  }

  async unregisterTrigger(triggerId) {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) throw new Error(`Trigger ${triggerId} not found`);

    await this._deactivateTrigger(trigger);
    this.triggers.delete(triggerId);

    if (this.memgraphService) {
      await this._deleteTriggerFromMemgraph(triggerId);
    }

    this.emit('trigger.unregistered', { triggerId });
    console.log(`${LOG_TAG} Unregistered trigger ${triggerId}`);
  }

  async enableTrigger(triggerId) {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) throw new Error(`Trigger ${triggerId} not found`);
    if (trigger.enabled) return;

    trigger.enabled = true;
    await this._activateTrigger(trigger);
    if (this.memgraphService) {
      await this._updateTriggerInMemgraph(triggerId, { enabled: true });
    }
    this.emit('trigger.enabled', { triggerId });
  }

  async disableTrigger(triggerId) {
    const trigger = this.triggers.get(triggerId);
    if (!trigger) throw new Error(`Trigger ${triggerId} not found`);
    if (!trigger.enabled) return;

    trigger.enabled = false;
    await this._deactivateTrigger(trigger);
    if (this.memgraphService) {
      await this._updateTriggerInMemgraph(triggerId, { enabled: false });
    }
    this.emit('trigger.disabled', { triggerId });
  }

  listTriggers(filters = {}) {
    let results = Array.from(this.triggers.values());
    if (filters.type) results = results.filter(t => t.type === filters.type);
    if (filters.graphId) results = results.filter(t => t.graphId === filters.graphId);
    if (filters.enabled !== undefined) results = results.filter(t => t.enabled === filters.enabled);
    if (filters.signalType) results = results.filter(t => t.signalType === filters.signalType);
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIRE (central execution point)
  // ═══════════════════════════════════════════════════════════════════════════

  async _fire(triggerId, inputPayload = {}) {
    const trigger = this.triggers.get(triggerId);
    if (!trigger || !trigger.enabled) return null;

    // Apply inputTemplate merging
    const finalPayload = this._applyInputTemplate(trigger.inputTemplate, inputPayload);

    // Check concurrency policy
    const canStart = await this._checkConcurrencyPolicy(trigger);
    if (!canStart) {
      this.emit('trigger.skipped', { triggerId, reason: 'concurrency_policy' });
      return null;
    }

    try {
      const record = await this.gxeManager.launch(trigger.graphId, finalPayload, {
        triggerType: trigger.type,
        triggerId: trigger.triggerId,
        metadata: { triggeredAt: Date.now(), ...trigger.metadata }
      });

      // Update stats
      trigger.lastFiredAt = Date.now();
      trigger.fireCount++;

      this.emit('trigger.fired', { triggerId, executionId: record.executionId });
      return record;
    } catch (err) {
      this.emit('trigger.error', { triggerId, error: err.message });
      console.error(`${LOG_TAG} Trigger ${triggerId} fire failed:`, err.message);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVATE / DEACTIVATE by type
  // ═══════════════════════════════════════════════════════════════════════════

  async _activateTrigger(trigger) {
    switch (trigger.type) {
      case TriggerType.CRON:
        await this._activateCronTrigger(trigger);
        break;
      case TriggerType.INTERVAL:
        this._activateIntervalTrigger(trigger);
        break;
      case TriggerType.ONCE:
        await this._activateOnceTrigger(trigger);
        break;
      case TriggerType.SIGNAL:
        this._activateSignalTrigger(trigger);
        break;
      case TriggerType.DEPENDENCY:
        this._activateDependencyTrigger(trigger);
        break;
      default:
        console.warn(`${LOG_TAG} Unknown trigger type: ${trigger.type}`);
    }
  }

  async _deactivateTrigger(trigger) {
    // Clear BullMQ repeatable job if exists
    if (trigger._bullmqJobKey && this.queueManager?.queues?.trigger) {
      try {
        const repeatableJobs = await this.queueManager.queues.trigger.getRepeatableJobs();
        for (const job of repeatableJobs) {
          if (job.key && job.key.includes(trigger.triggerId)) {
            await this.queueManager.queues.trigger.removeRepeatableByKey(job.key);
          }
        }
        // Remove delayed jobs
        const delayedJob = await this.queueManager.queues.trigger.getJob(trigger._bullmqJobKey);
        if (delayedJob) await delayedJob.remove();
      } catch (err) {
        console.warn(`${LOG_TAG} Error deactivating BullMQ job for ${trigger.triggerId}:`, err.message);
      }
    }

    // Clear interval handle
    if (this._intervalHandles.has(trigger.triggerId)) {
      clearInterval(this._intervalHandles.get(trigger.triggerId));
      this._intervalHandles.delete(trigger.triggerId);
    }

    // Clear signal subscription
    if (trigger.type === TriggerType.SIGNAL) {
      this._deactivateSignalTrigger(trigger);
    }

    // Clear dependency subscription
    if (trigger.type === TriggerType.DEPENDENCY) {
      this._deactivateDependencyTrigger(trigger);
    }
  }

  // ─── CRON ───

  async _activateCronTrigger(trigger) {
    if (!this.queueManager?.queues?.trigger) {
      console.warn(`${LOG_TAG} No trigger queue available for CRON`);
      return;
    }

    await this.queueManager.queues.trigger.add(
      'cron-trigger',
      { triggerId: trigger.triggerId },
      {
        repeat: {
          pattern: trigger.schedule,
          tz: trigger.timezone || 'UTC'
        },
        jobId: `cron-${trigger.triggerId}`
      }
    );
    trigger._bullmqJobKey = `cron-${trigger.triggerId}`;
  }

  // ─── INTERVAL ───

  _activateIntervalTrigger(trigger) {
    if (!trigger.intervalMs || trigger.intervalMs < 1000) {
      console.warn(`${LOG_TAG} Invalid intervalMs for trigger ${trigger.triggerId}`);
      return;
    }

    // Use setInterval for simplicity (BullMQ repeat.every is an alternative)
    const handle = setInterval(() => {
      this._fire(trigger.triggerId).catch(err =>
        console.error(`${LOG_TAG} Interval fire error:`, err.message)
      );
    }, trigger.intervalMs);

    this._intervalHandles.set(trigger.triggerId, handle);
  }

  // ─── ONCE ───

  async _activateOnceTrigger(trigger) {
    const delay = (trigger.runAt || 0) - Date.now();

    if (delay <= 0) {
      // Already due — fire immediately
      await this._fire(trigger.triggerId);
      // Auto-disable after firing
      trigger.enabled = false;
    } else {
      if (this.queueManager?.queues?.trigger) {
        await this.queueManager.queues.trigger.add(
          'once-trigger',
          { triggerId: trigger.triggerId },
          { delay, jobId: `once-${trigger.triggerId}` }
        );
        trigger._bullmqJobKey = `once-${trigger.triggerId}`;
      } else {
        // Fallback to setTimeout
        const handle = setTimeout(async () => {
          await this._fire(trigger.triggerId);
          trigger.enabled = false;
        }, delay);
        this._intervalHandles.set(trigger.triggerId, handle);
      }
    }
  }

  // ─── SIGNAL ───

  _activateSignalTrigger(trigger) {
    if (!trigger.signalType) return;

    if (!this.signalSubscriptions.has(trigger.signalType)) {
      this.signalSubscriptions.set(trigger.signalType, []);
    }
    const subs = this.signalSubscriptions.get(trigger.signalType);
    if (!subs.includes(trigger.triggerId)) {
      subs.push(trigger.triggerId);
    }
  }

  _deactivateSignalTrigger(trigger) {
    if (!trigger.signalType) return;
    const subs = this.signalSubscriptions.get(trigger.signalType);
    if (subs) {
      const idx = subs.indexOf(trigger.triggerId);
      if (idx !== -1) subs.splice(idx, 1);
    }
  }

  // ─── DEPENDENCY ───

  _activateDependencyTrigger(trigger) {
    if (!trigger.sourceGraphId) return;

    if (!this.dependencySubscriptions.has(trigger.sourceGraphId)) {
      this.dependencySubscriptions.set(trigger.sourceGraphId, []);
    }
    const subs = this.dependencySubscriptions.get(trigger.sourceGraphId);
    if (!subs.includes(trigger.triggerId)) {
      subs.push(trigger.triggerId);
    }
  }

  _deactivateDependencyTrigger(trigger) {
    if (!trigger.sourceGraphId) return;
    const subs = this.dependencySubscriptions.get(trigger.sourceGraphId);
    if (subs) {
      const idx = subs.indexOf(trigger.triggerId);
      if (idx !== -1) subs.splice(idx, 1);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNAL HANDLING (external input)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Process an incoming signal (from webhook, API, etc.)
   * @param {import('./types/signals.types').IncomingSignal} signal
   */
  async handleIncomingSignal(signal) {
    // For action = START or undefined: check SIGNAL triggers
    if (!signal.action || signal.action === SignalAction.START) {
      const triggerIds = this.signalSubscriptions.get(signal.signalType) || [];

      for (const triggerId of triggerIds) {
        const trigger = this.triggers.get(triggerId);
        if (!trigger || !trigger.enabled) continue;

        // Evaluate filter expression if present
        if (trigger.filterExpression) {
          const matches = this._evaluateFilter(trigger.filterExpression, signal.payload);
          if (!matches) continue;
        }

        await this._fire(triggerId, signal.payload);
      }
    }

    // For action = RESUME: forward to GxeManager
    if (signal.action === SignalAction.RESUME && signal.executionId) {
      await this.gxeManager.resume(signal.executionId, signal.payload);
    }

    this.emit('signal.processed', { signalType: signal.signalType, action: signal.action });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPENDENCY EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  async _onExecutionCompleted(data) {
    const record = data.result
      ? data
      : await this.gxeManager.getExecution(data.executionId);

    if (record?.graphId) {
      await this._processDependencyTriggers(record.graphId, 'SUCCESS', data);
    }
  }

  async _onExecutionFailed(data) {
    const record = await this.gxeManager.getExecution(data.executionId);
    if (record?.graphId) {
      await this._processDependencyTriggers(record.graphId, 'FAILURE', data);
    }
  }

  async _processDependencyTriggers(sourceGraphId, outcome, data) {
    const triggerIds = this.dependencySubscriptions.get(sourceGraphId) || [];

    for (const triggerId of triggerIds) {
      const trigger = this.triggers.get(triggerId);
      if (!trigger || !trigger.enabled) continue;

      if (!this._checkDependencyCondition(trigger.condition, outcome)) continue;

      // Apply input mapping
      const mappedPayload = this._applyInputMapping(trigger.inputMapping, data);
      const inputPayload = {
        ...mappedPayload,
        _sourceExecutionId: data.executionId,
        _sourceGraphId: sourceGraphId,
        _sourceOutcome: outcome
      };

      // Fire with optional delay
      if (trigger.delay && trigger.delay > 0) {
        if (this.queueManager?.queues?.trigger) {
          await this.queueManager.queues.trigger.add(
            'dependency-trigger-delayed',
            { triggerId, inputPayload },
            { delay: trigger.delay }
          );
        } else {
          setTimeout(() => this._fire(triggerId, inputPayload), trigger.delay);
        }
      } else {
        await this._fire(triggerId, inputPayload);
      }
    }
  }

  _checkDependencyCondition(condition, outcome) {
    switch (condition) {
      case 'ON_SUCCESS': return outcome === 'SUCCESS';
      case 'ON_FAILURE': return outcome === 'FAILURE';
      case 'ON_ANY': return true;
      case 'ON_PARTIAL_SUCCESS': return outcome === 'SUCCESS' || outcome === 'PARTIAL';
      default: return outcome === 'SUCCESS';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCURRENCY POLICY CHECK
  // ═══════════════════════════════════════════════════════════════════════════

  async _checkConcurrencyPolicy(trigger) {
    if (!trigger.concurrencyPolicy || trigger.concurrencyPolicy === 'ALLOW') {
      return true;
    }

    const activeExecutions = await this.gxeManager.registry.getActiveByGraph(trigger.graphId);

    if (activeExecutions.length === 0) return true;

    switch (trigger.concurrencyPolicy) {
      case 'SKIP':
        return false;

      case 'QUEUE':
        // Will be queued by GxeManager
        return true;

      case 'REPLACE':
        for (const exec of activeExecutions) {
          try {
            await this.gxeManager.cancel(exec.executionId, 'replaced_by_trigger');
          } catch (err) {
            console.warn(`${LOG_TAG} Failed to cancel ${exec.executionId} for REPLACE:`, err.message);
          }
        }
        return true;

      default:
        return true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  _validateTriggerDefinition(def) {
    if (!def.graphId) throw new Error('graphId is required');
    if (!def.type) throw new Error('type is required');

    const validTypes = Object.values(TriggerType);
    if (!validTypes.includes(def.type)) {
      throw new Error(`Invalid trigger type: ${def.type}. Valid: ${validTypes.join(', ')}`);
    }

    if (def.type === TriggerType.CRON && !def.schedule) {
      throw new Error('schedule is required for CRON trigger');
    }
    if (def.type === TriggerType.INTERVAL && !def.intervalMs) {
      throw new Error('intervalMs is required for INTERVAL trigger');
    }
    if (def.type === TriggerType.SIGNAL && !def.signalType) {
      throw new Error('signalType is required for SIGNAL trigger');
    }
    if (def.type === TriggerType.DEPENDENCY && !def.sourceGraphId) {
      throw new Error('sourceGraphId is required for DEPENDENCY trigger');
    }
  }

  _applyInputTemplate(template, dynamicPayload) {
    if (!template) return dynamicPayload || {};
    return { ...template, ...dynamicPayload };
  }

  _applyInputMapping(mapping, data) {
    if (!mapping) return {};

    const result = {};
    for (const [targetKey, sourcePath] of Object.entries(mapping)) {
      try {
        // Simple dot-path resolution (no external dependency)
        const value = this._resolvePath(data, sourcePath);
        if (value !== undefined) {
          result[targetKey] = value;
        }
      } catch (e) {
        console.warn(`${LOG_TAG} Input mapping failed for ${targetKey}: ${sourcePath}`);
      }
    }
    return result;
  }

  _resolvePath(obj, path) {
    // Simple dot-path resolver: "result.output.value" → obj.result.output.value
    const parts = path.replace(/^\$\./, '').split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }

  _evaluateFilter(filterExpression, payload) {
    // Simple key=value filter: "category=IT" or "priority>3"
    try {
      const eqMatch = filterExpression.match(/^(\w+(?:\.\w+)*)\s*==?\s*['"]?(.+?)['"]?$/);
      if (eqMatch) {
        const value = this._resolvePath(payload, eqMatch[1]);
        return String(value) === eqMatch[2];
      }

      const gtMatch = filterExpression.match(/^(\w+(?:\.\w+)*)\s*>\s*(\d+)$/);
      if (gtMatch) {
        const value = this._resolvePath(payload, gtMatch[1]);
        return Number(value) > Number(gtMatch[2]);
      }

      const ltMatch = filterExpression.match(/^(\w+(?:\.\w+)*)\s*<\s*(\d+)$/);
      if (ltMatch) {
        const value = this._resolvePath(payload, ltMatch[1]);
        return Number(value) < Number(ltMatch[2]);
      }

      // If no pattern matched, pass through
      return true;
    } catch (e) {
      return true;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMGRAPH PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════════════

  async _persistTriggerToMemgraph(trigger) {
    const session = this._getMemgraphSession();
    if (!session) return;

    try {
      await session.run(`
        MERGE (t:TriggerDefinition:META {triggerId: $triggerId})
        SET t.graphId = $graphId,
            t.type = $type,
            t.schedule = $schedule,
            t.intervalMs = $intervalMs,
            t.signalType = $signalType,
            t.sourceGraphId = $sourceGraphId,
            t.condition = $condition,
            t.concurrencyPolicy = $concurrencyPolicy,
            t.inputTemplate = $inputTemplate,
            t.inputMapping = $inputMapping,
            t.filterExpression = $filterExpression,
            t.delay = $delay,
            t.timezone = $timezone,
            t.enabled = $enabled,
            t.createdAt = $createdAt,
            t.metadata = $metadata
        WITH t
        OPTIONAL MATCH (c:CatalogEntry {entryId: $graphId})
        FOREACH (x IN CASE WHEN c IS NOT NULL THEN [1] ELSE [] END |
          MERGE (t)-[:TRIGGERS]->(c)
        )
      `, {
        triggerId: trigger.triggerId,
        graphId: trigger.graphId,
        type: trigger.type,
        schedule: trigger.schedule || '',
        intervalMs: trigger.intervalMs || 0,
        signalType: trigger.signalType || '',
        sourceGraphId: trigger.sourceGraphId || '',
        condition: trigger.condition || 'ON_SUCCESS',
        concurrencyPolicy: trigger.concurrencyPolicy || 'SKIP',
        inputTemplate: trigger.inputTemplate ? JSON.stringify(trigger.inputTemplate) : '',
        inputMapping: trigger.inputMapping ? JSON.stringify(trigger.inputMapping) : '',
        filterExpression: trigger.filterExpression || '',
        delay: trigger.delay || 0,
        timezone: trigger.timezone || 'UTC',
        enabled: trigger.enabled,
        createdAt: trigger.createdAt,
        metadata: JSON.stringify(trigger.metadata || {})
      });
    } finally {
      await session.close();
    }
  }

  async _loadTriggersFromMemgraph() {
    const session = this._getMemgraphSession();
    if (!session) return;

    try {
      const result = await session.run(`
        MATCH (t:TriggerDefinition:META)
        RETURN t
      `);

      for (const row of result.records) {
        const props = row.get('t').properties;
        const trigger = {
          triggerId: props.triggerId,
          graphId: props.graphId,
          type: props.type,
          schedule: props.schedule || null,
          intervalMs: typeof props.intervalMs === 'number' ? props.intervalMs : null,
          signalType: props.signalType || null,
          sourceGraphId: props.sourceGraphId || null,
          condition: props.condition || 'ON_SUCCESS',
          concurrencyPolicy: props.concurrencyPolicy || 'SKIP',
          inputTemplate: props.inputTemplate ? JSON.parse(props.inputTemplate) : null,
          inputMapping: props.inputMapping ? JSON.parse(props.inputMapping) : null,
          filterExpression: props.filterExpression || null,
          delay: typeof props.delay === 'number' ? props.delay : 0,
          timezone: props.timezone || 'UTC',
          enabled: props.enabled !== false,
          metadata: props.metadata ? JSON.parse(props.metadata) : {},
          createdAt: typeof props.createdAt === 'number' ? props.createdAt : Date.now(),
          lastFiredAt: null,
          fireCount: 0
        };

        this.triggers.set(trigger.triggerId, trigger);
        if (trigger.enabled) {
          await this._activateTrigger(trigger);
        }
      }
    } finally {
      await session.close();
    }
  }

  async _updateTriggerInMemgraph(triggerId, updates) {
    const session = this._getMemgraphSession();
    if (!session) return;

    try {
      const setClause = Object.keys(updates)
        .map(k => `t.${k} = $${k}`)
        .join(', ');

      await session.run(`
        MATCH (t:TriggerDefinition:META {triggerId: $triggerId})
        SET ${setClause}
      `, { triggerId, ...updates });
    } finally {
      await session.close();
    }
  }

  async _deleteTriggerFromMemgraph(triggerId) {
    const session = this._getMemgraphSession();
    if (!session) return;

    try {
      await session.run(`
        MATCH (t:TriggerDefinition:META {triggerId: $triggerId})
        DETACH DELETE t
      `, { triggerId });
    } finally {
      await session.close();
    }
  }

  _getMemgraphSession() {
    if (!this.memgraphService) return null;
    if (this.memgraphService.driver) return this.memgraphService.driver.session();
    if (this.memgraphService.getSession) return this.memgraphService.getSession();
    return null;
  }
}

module.exports = { TriggerEngine };
