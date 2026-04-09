const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class ToolExecutionContext extends EventEmitter {
  constructor(sessionId = null) {
    super();
    this.sessionId = sessionId || uuidv4();
    this.executionId = uuidv4();
    this.state = new Map();
    this.checkpoints = new Map();
    this.startTime = Date.now();
    this.signals = new Map();
  }

  // State management
  get(path) {
    const keys = path.split('.');
    let value = this.state;
    for (const key of keys) {
      if (value instanceof Map) value = value.get(key);
      else if (value && typeof value === 'object') value = value[key];
      else return undefined;
    }
    return value;
  }

  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.state;
    for (const key of keys) {
      if (!target.has(key)) target.set(key, new Map());
      target = target.get(key);
    }
    target.set(lastKey, value);
  }

  // Checkpoints
  createCheckpoint(name) {
    const checkpoint = {
      id: uuidv4(),
      name,
      timestamp: Date.now(),
      state: new Map(this.state)
    };
    this.checkpoints.set(name, checkpoint);
    return checkpoint.id;
  }

  restoreCheckpoint(name) {
    const checkpoint = this.checkpoints.get(name);
    if (!checkpoint) throw new Error(`Checkpoint not found: ${name}`);
    this.state = new Map(checkpoint.state);
    return true;
  }

  // Signals for async coordination
  emitSignal(signal, payload) {
    this.signals.set(signal, { payload, timestamp: Date.now() });
    this.emit(`signal:${signal}`, payload);
  }

  async waitForSignal(signal, timeoutMs = 30000) {
    if (this.signals.has(signal)) {
      return this.signals.get(signal).payload;
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Signal timeout: ${signal}`));
      }, timeoutMs);
      this.once(`signal:${signal}`, (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });
  }

  // Metrics
  getMetrics() {
    return {
      sessionId: this.sessionId,
      executionId: this.executionId,
      durationMs: Date.now() - this.startTime,
      stateSize: this.state.size,
      checkpointCount: this.checkpoints.size
    };
  }
}

module.exports = { ToolExecutionContext };
