const { BaseTool } = require('../primitives/BaseTool.js');
const crypto = require('crypto');

class CacheTool extends BaseTool {
  constructor() {
    super();
    this.cache = new Map();
  }

  getDefinition() {
    return {
      id: 'pattern.cache',
      name: 'Cache Pattern',
      version: '1.0.0',
      level: 3,
      category: 'pattern',
      description: 'Cache tool results with TTL and invalidation support',
      inputSchema: {
        type: 'object',
        required: ['tool'],
        properties: {
          tool: { type: 'string', description: 'Tool ID to execute' },
          args: { type: 'object', description: 'Tool arguments' },
          ttl: { type: 'integer', default: 300000, description: 'Time to live in ms (default 5 min)' },
          cacheKey: { type: 'string', description: 'Custom cache key (auto-generated if not provided)' },
          namespace: { type: 'string', default: 'default', description: 'Cache namespace' },
          operation: {
            type: 'string',
            enum: ['get', 'set', 'invalidate', 'clear'],
            default: 'get',
            description: 'Cache operation'
          },
          forceRefresh: { type: 'boolean', default: false, description: 'Bypass cache and refresh' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { description: 'Tool result or cached value' },
          cached: { type: 'boolean' },
          cacheKey: { type: 'string' },
          age: { type: 'integer', description: 'Cache age in ms' },
          ttl: { type: 'integer', description: 'Remaining TTL in ms' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 100 }
    };
  }

  async execute(args, context, server) {
    const {
      tool,
      args: toolArgs = {},
      ttl = 300000,
      cacheKey: customKey,
      namespace = 'default',
      operation = 'get',
      forceRefresh = false
    } = args;

    const cacheKey = customKey || this.generateCacheKey(tool, toolArgs);
    const fullKey = `${namespace}:${cacheKey}`;

    // Handle cache operations
    switch (operation) {
      case 'invalidate':
        this.cache.delete(fullKey);
        return this.success({ invalidated: true, cacheKey });

      case 'clear':
        if (namespace === '*') {
          this.cache.clear();
          return this.success({ cleared: true, count: 0 });
        }
        let count = 0;
        for (const key of this.cache.keys()) {
          if (key.startsWith(`${namespace}:`)) {
            this.cache.delete(key);
            count++;
          }
        }
        return this.success({ cleared: true, count });

      case 'set':
        // Direct set without execution
        const setEntry = {
          data: toolArgs.value || toolArgs,
          timestamp: Date.now(),
          ttl
        };
        this.cache.set(fullKey, setEntry);
        return this.success({ result: setEntry.data, cached: false, cacheKey });
    }

    // Default 'get' operation with execute-on-miss
    const now = Date.now();

    // Check cache
    if (!forceRefresh) {
      const cached = this.cache.get(fullKey);
      if (cached && (now - cached.timestamp) < cached.ttl) {
        return this.success({
          result: cached.data,
          cached: true,
          cacheKey,
          age: now - cached.timestamp,
          ttl: cached.ttl - (now - cached.timestamp)
        });
      }
    }

    // Cache miss or force refresh - execute tool
    const targetTool = server?.registry?.getTool(tool);
    if (!targetTool) {
      return this.error('TOOL_NOT_FOUND', `Tool not found: ${tool}`);
    }

    try {
      const result = await targetTool.execute(toolArgs, context, server);

      // Store in cache
      this.cache.set(fullKey, {
        data: result.data,
        timestamp: now,
        ttl
      });

      // Cleanup old entries periodically
      this.cleanup();

      return this.success({
        result: result.data,
        cached: false,
        cacheKey,
        age: 0,
        ttl
      });
    } catch (error) {
      // On error, return stale cache if available
      const stale = this.cache.get(fullKey);
      if (stale) {
        return this.success({
          result: stale.data,
          cached: true,
          stale: true,
          cacheKey,
          age: now - stale.timestamp,
          error: error.message
        });
      }
      throw error;
    }
  }

  generateCacheKey(tool, args) {
    const normalized = JSON.stringify({ tool, args }, Object.keys({ tool, args }).sort());
    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if ((now - entry.timestamp) > entry.ttl * 2) {
        this.cache.delete(key);
      }
    }
  }
}

module.exports = { CacheTool };
