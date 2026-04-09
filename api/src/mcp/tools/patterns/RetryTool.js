const { BaseTool } = require('../primitives/BaseTool.js');

class RetryTool extends BaseTool {
  getDefinition() {
    return {
      id: 'pattern.retry',
      name: 'Retry Pattern',
      version: '1.0.0',
      level: 3,
      category: 'pattern',
      description: 'Execute a tool with retry logic and exponential backoff',
      inputSchema: {
        type: 'object',
        required: ['tool'],
        properties: {
          tool: { type: 'string', description: 'Tool ID to execute' },
          args: { type: 'object', description: 'Tool arguments' },
          maxRetries: { type: 'integer', default: 3, description: 'Maximum retry attempts' },
          initialDelay: { type: 'integer', default: 1000, description: 'Initial delay in ms' },
          maxDelay: { type: 'integer', default: 30000, description: 'Maximum delay in ms' },
          backoffMultiplier: { type: 'number', default: 2, description: 'Delay multiplier for each retry' },
          retryOn: {
            type: 'array',
            items: { type: 'string' },
            description: 'Error codes/messages to retry on'
          },
          timeout: { type: 'integer', description: 'Timeout per attempt in ms' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { description: 'Tool result' },
          attempts: { type: 'integer' },
          totalDuration: { type: 'integer' },
          errors: { type: 'array' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 120000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context, server) {
    const {
      tool,
      args: toolArgs = {},
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffMultiplier = 2,
      retryOn,
      timeout
    } = args;

    const targetTool = server?.registry?.getTool(tool);
    if (!targetTool) {
      return this.error('TOOL_NOT_FOUND', `Tool not found: ${tool}`);
    }

    const startTime = Date.now();
    const errors = [];
    let lastResult = null;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        // Execute with optional timeout
        let result;
        if (timeout) {
          result = await this.executeWithTimeout(targetTool, toolArgs, context, server, timeout);
        } else {
          result = await targetTool.execute(toolArgs, context, server);
        }

        lastResult = result;

        // Check if result indicates an error that should be retried
        if (result.data?.error && this.shouldRetry(result.data.error, retryOn)) {
          throw new Error(result.data.error);
        }

        // Success
        return this.success({
          result: result.data,
          attempts: attempt,
          totalDuration: Date.now() - startTime,
          errors
        });

      } catch (error) {
        errors.push({
          attempt,
          error: error.message,
          timestamp: Date.now()
        });

        // Check if we should retry
        if (attempt > maxRetries || !this.shouldRetry(error.message, retryOn)) {
          return this.success({
            result: lastResult?.data || null,
            attempts: attempt,
            totalDuration: Date.now() - startTime,
            errors,
            failed: true
          });
        }

        // Wait before retry
        await this.delay(delay);

        // Increase delay with backoff
        delay = Math.min(delay * backoffMultiplier, maxDelay);

        // Add jitter
        delay += Math.random() * 100;
      }
    }

    return this.success({
      result: lastResult?.data || null,
      attempts: maxRetries + 1,
      totalDuration: Date.now() - startTime,
      errors,
      failed: true
    });
  }

  async executeWithTimeout(tool, args, context, server, timeout) {
    return Promise.race([
      tool.execute(args, context, server),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
  }

  shouldRetry(errorMessage, retryOn) {
    if (!retryOn || retryOn.length === 0) {
      // Default: retry on common transient errors
      const transientErrors = [
        'timeout', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED',
        'rate limit', 'too many requests', '429', '503', '504',
        'temporarily unavailable', 'try again'
      ];
      return transientErrors.some(e =>
        errorMessage.toLowerCase().includes(e.toLowerCase())
      );
    }

    return retryOn.some(e =>
      errorMessage.toLowerCase().includes(e.toLowerCase())
    );
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { RetryTool };
