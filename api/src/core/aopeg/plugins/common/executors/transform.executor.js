/**
 * Transform Executor — dynamic service method invocation within GXE graphs.
 * Resolves services by name and calls methods with configurable parameters,
 * timeout, and retry logic.
 */

const { BaseExecutor } = require('../../plugin-base');

// Service registry — maps logical names to require paths
const SERVICE_REGISTRY = {
  'SessionContextService': '../../../../../services/sessionStore',
  'GraphValidator': '../../../../../services/graph/graph-validator',
  'GraphCatalogService': '../../../../../services/graphCatalog.service',
  'MemgraphService': '../../../../../services/memgraph.service',
  'LlmService': '../../../../../services/llm.service',
  'RedisService': '../../../../../services/redis.service',
  'QdrantService': '../../../../../services/qdrant.service',
  'IngestionService': '../../../../../services/ingestion.service',
};

class TransformExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'common.transform';
    this.displayName = 'Transform';
    this.description = 'Dynamic service method invocation — resolves a service by name and calls a method with parameters';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        data: { type: 'any', description: 'Input data passed to the service method' },
        params: { type: 'object', description: 'Additional parameters for the method call', default: {} },
        service: { type: 'string', description: 'Service name to resolve (e.g. "GraphValidator")' },
        method: { type: 'string', description: 'Method name to call on the service' },
        parameters: { type: 'array', description: 'Ordered arguments array for the method (alternative to data/params)', default: [] },
        timeout: { type: 'number', description: 'Timeout in milliseconds', default: 30000 },
        retries: { type: 'number', description: 'Number of retries on failure', default: 0 },
      },
      required: ['service', 'method'],
    };
  }

  async execute(parameters, context) {
    const serviceName = this.getRequiredParam(parameters, 'service');
    const methodName = this.getRequiredParam(parameters, 'method');
    const data = this.getParam(parameters, 'data', undefined);
    const params = this.getParam(parameters, 'params', {});
    const orderedArgs = this.getParam(parameters, 'parameters', []);
    const timeout = this.getParam(parameters, 'timeout', 30000);
    const retries = this.getParam(parameters, 'retries', 0);

    const startTime = Date.now();

    // Resolve service instance
    let serviceInstance;
    try {
      serviceInstance = this._resolveService(serviceName, context);
    } catch (err) {
      return this.error('SERVICE_RESOLUTION_FAILED',
        `Cannot resolve service "${serviceName}": ${err.message}`, false);
    }

    // Validate method exists
    if (typeof serviceInstance[methodName] !== 'function') {
      let available = [];
      try {
        const proto = Object.getPrototypeOf(serviceInstance);
        if (proto) {
          available = Object.getOwnPropertyNames(proto)
            .filter(m => m !== 'constructor')
            .slice(0, 10);
        }
      } catch { /* ignore */ }
      return this.error('METHOD_NOT_FOUND',
        `Method "${methodName}" not found on service "${serviceName}". Available: ${available.join(', ')}`, false);
    }

    // Build arguments
    const args = orderedArgs.length > 0
      ? orderedArgs
      : data !== undefined ? [data, params] : [params];

    // Execute with timeout and retries
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this._executeWithTimeout(
          () => serviceInstance[methodName](...args),
          timeout,
        );

        const executionTime = Date.now() - startTime;
        return this.success(
          { result },
          {
            service: serviceName,
            method: methodName,
            executionTime,
            attempt: attempt + 1,
          },
          1.0,
        );
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }

    const executionTime = Date.now() - startTime;
    return this.error('EXECUTION_FAILED',
      `${serviceName}.${methodName}() failed after ${retries + 1} attempt(s): ${lastError.message}`, true);
  }

  /**
   * Resolve a service instance by name.
   * Checks context.services first, then falls back to require().
   */
  _resolveService(serviceName, context) {
    // 1. Check context-provided services
    if (context?.services?.[serviceName]) {
      return context.services[serviceName];
    }

    // 2. Check execution context global variables
    if (context?.executionContext) {
      const fromCtx = context.executionContext.getVariable?.(serviceName);
      if (fromCtx) return fromCtx;
    }

    // 3. Fall back to require via registry
    const requirePath = SERVICE_REGISTRY[serviceName];
    if (requirePath) {
      const mod = require(requirePath);
      // Handle various export patterns: default, named, class, singleton
      if (mod[serviceName]) {
        const exported = mod[serviceName];
        // If it's a class constructor, instantiate it
        if (typeof exported === 'function' && exported.prototype && exported.prototype.constructor === exported) {
          return new exported();
        }
        return exported;
      }
      if (mod.default) return mod.default;
      if (typeof mod === 'function') return new mod();
      return mod;
    }

    throw new Error(`Unknown service: "${serviceName}". Known: ${Object.keys(SERVICE_REGISTRY).join(', ')}`);
  }

  /**
   * Execute a function with a timeout.
   */
  _executeWithTimeout(fn, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
      Promise.resolve(fn())
        .then(result => { clearTimeout(timer); resolve(result); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }
}

module.exports = { TransformExecutor };
