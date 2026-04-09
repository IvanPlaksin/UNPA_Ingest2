const { BaseTool } = require('../primitives/BaseTool.js');

class BatchTool extends BaseTool {
  getDefinition() {
    return {
      id: 'pattern.batch',
      name: 'Batch Pattern',
      version: '1.0.0',
      level: 3,
      category: 'pattern',
      description: 'Execute a tool on multiple items with batching and rate limiting',
      inputSchema: {
        type: 'object',
        required: ['tool', 'items'],
        properties: {
          tool: { type: 'string', description: 'Tool ID to execute' },
          items: { type: 'array', description: 'Items to process' },
          argsTemplate: { type: 'object', description: 'Argument template with {{item}} placeholders' },
          batchSize: { type: 'integer', default: 10, description: 'Items per batch' },
          delayBetweenBatches: { type: 'integer', default: 0, description: 'Delay between batches in ms' },
          delayBetweenItems: { type: 'integer', default: 0, description: 'Delay between items in ms' },
          maxConcurrent: { type: 'integer', default: 5, description: 'Max concurrent within batch' },
          continueOnError: { type: 'boolean', default: true, description: 'Continue processing on errors' },
          progressCallback: { type: 'string', description: 'Signal name for progress updates' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          results: { type: 'array' },
          successful: { type: 'integer' },
          failed: { type: 'integer' },
          errors: { type: 'array' },
          stats: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 600000, maxMemoryMb: 200 }
    };
  }

  async execute(args, context, server) {
    const {
      tool,
      items,
      argsTemplate = {},
      batchSize = 10,
      delayBetweenBatches = 0,
      delayBetweenItems = 0,
      maxConcurrent = 5,
      continueOnError = true,
      progressCallback
    } = args;

    const targetTool = server?.registry?.getTool(tool);
    if (!targetTool) {
      return this.error('TOOL_NOT_FOUND', `Tool not found: ${tool}`);
    }

    const startTime = Date.now();
    const results = [];
    const errors = [];
    let successful = 0;
    let failed = 0;

    // Split into batches
    const batches = this.chunkArray(items, batchSize);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Process batch
      const batchResults = await this.processBatch(
        batch,
        targetTool,
        argsTemplate,
        context,
        server,
        maxConcurrent,
        delayBetweenItems,
        continueOnError
      );

      // Collect results
      for (const result of batchResults) {
        results.push(result);
        if (result.error) {
          failed++;
          errors.push({ index: result.index, error: result.error });
          if (!continueOnError) {
            return this.success({
              results,
              successful,
              failed,
              errors,
              stats: {
                totalItems: items.length,
                processedItems: results.length,
                durationMs: Date.now() - startTime,
                aborted: true
              }
            });
          }
        } else {
          successful++;
        }
      }

      // Emit progress
      if (progressCallback) {
        context.emitSignal(progressCallback, {
          batchIndex,
          totalBatches: batches.length,
          processedItems: results.length,
          totalItems: items.length,
          successful,
          failed
        });
      }

      // Delay between batches
      if (delayBetweenBatches > 0 && batchIndex < batches.length - 1) {
        await this.delay(delayBetweenBatches);
      }
    }

    return this.success({
      results: results.map(r => r.data),
      successful,
      failed,
      errors,
      stats: {
        totalItems: items.length,
        processedItems: results.length,
        batchCount: batches.length,
        durationMs: Date.now() - startTime,
        avgItemTime: results.length > 0 ? (Date.now() - startTime) / results.length : 0
      }
    });
  }

  async processBatch(items, tool, argsTemplate, context, server, maxConcurrent, delayBetweenItems, continueOnError) {
    const results = [];
    const queue = items.map((item, localIndex) => ({ item, localIndex }));

    // Process with concurrency limit
    const processItem = async ({ item, localIndex }) => {
      const itemArgs = this.buildItemArgs(argsTemplate, item, localIndex);

      try {
        const result = await tool.execute(itemArgs, context, server);
        return { index: localIndex, data: result.data, error: null };
      } catch (error) {
        return { index: localIndex, data: null, error: error.message };
      }
    };

    if (delayBetweenItems > 0) {
      // Sequential with delay
      for (const queueItem of queue) {
        results.push(await processItem(queueItem));
        if (queue.indexOf(queueItem) < queue.length - 1) {
          await this.delay(delayBetweenItems);
        }
      }
    } else {
      // Parallel with concurrency limit
      while (queue.length > 0) {
        const batch = queue.splice(0, maxConcurrent);
        const batchResults = await Promise.all(batch.map(processItem));
        results.push(...batchResults);
      }
    }

    return results;
  }

  buildItemArgs(template, item, index) {
    const args = {};

    for (const [key, value] of Object.entries(template)) {
      if (typeof value === 'string') {
        // Replace placeholders
        args[key] = value
          .replace(/\{\{item\}\}/g, typeof item === 'string' ? item : JSON.stringify(item))
          .replace(/\{\{index\}\}/g, String(index));
      } else if (value === '{{item}}') {
        args[key] = item;
      } else {
        args[key] = value;
      }
    }

    // Default: add item as 'data' if not in template
    if (!args.data && !args.item && !args.text && !args.input) {
      args.data = item;
      args.item = item;
    }

    return args;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { BatchTool };
