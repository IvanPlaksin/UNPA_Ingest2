const { BaseTool } = require('../primitives/BaseTool.js');

class MapReduceTool extends BaseTool {
  getDefinition() {
    return {
      id: 'pattern.map_reduce',
      name: 'Map-Reduce Pattern',
      version: '1.0.0',
      level: 3,
      category: 'pattern',
      description: 'Process large data by mapping over chunks and reducing results',
      inputSchema: {
        type: 'object',
        required: ['data', 'mapTool'],
        properties: {
          data: {
            oneOf: [
              { type: 'array' },
              { type: 'string', description: 'Text to chunk and process' }
            ],
            description: 'Data to process'
          },
          mapTool: { type: 'string', description: 'Tool ID to apply to each item' },
          mapArgs: { type: 'object', description: 'Additional arguments for map tool' },
          reduceTool: { type: 'string', description: 'Tool ID for reducing results' },
          reduceArgs: { type: 'object', description: 'Additional arguments for reduce tool' },
          chunkSize: { type: 'integer', default: 1000, description: 'For text: chunk size' },
          chunkOverlap: { type: 'integer', default: 100, description: 'For text: chunk overlap' },
          parallel: { type: 'boolean', default: true, description: 'Run map operations in parallel' },
          maxConcurrency: { type: 'integer', default: 5, description: 'Maximum parallel operations' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { description: 'Final reduced result' },
          mapResults: { type: 'array', description: 'Individual map results' },
          stats: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 300000, maxMemoryMb: 500 }
    };
  }

  async execute(args, context, server) {
    const {
      data,
      mapTool,
      mapArgs = {},
      reduceTool,
      reduceArgs = {},
      chunkSize = 1000,
      chunkOverlap = 100,
      parallel = true,
      maxConcurrency = 5
    } = args;

    const startTime = Date.now();

    // Prepare items to process
    let items;
    if (typeof data === 'string') {
      // Chunk text
      const chunkTool = server?.registry?.getTool('text.chunk');
      if (chunkTool) {
        const chunkResult = await chunkTool.execute({
          text: data,
          chunkSize,
          overlap: chunkOverlap
        }, context, server);
        items = chunkResult.data?.chunks || [data];
      } else {
        items = this.simpleChunk(data, chunkSize, chunkOverlap);
      }
    } else {
      items = Array.isArray(data) ? data : [data];
    }

    // Get map tool
    const mapToolInstance = server?.registry?.getTool(mapTool);
    if (!mapToolInstance) {
      return this.error('TOOL_NOT_FOUND', `Map tool not found: ${mapTool}`);
    }

    // Execute map phase
    let mapResults;
    if (parallel) {
      mapResults = await this.parallelMap(items, mapToolInstance, mapArgs, context, server, maxConcurrency);
    } else {
      mapResults = await this.sequentialMap(items, mapToolInstance, mapArgs, context, server);
    }

    // Execute reduce phase
    let result;
    if (reduceTool) {
      const reduceToolInstance = server?.registry?.getTool(reduceTool);
      if (reduceToolInstance) {
        const reduceResult = await reduceToolInstance.execute({
          ...reduceArgs,
          data: mapResults.map(r => r.data)
        }, context, server);
        result = reduceResult.data;
      } else {
        // Default reduce: combine results
        result = this.defaultReduce(mapResults);
      }
    } else {
      result = this.defaultReduce(mapResults);
    }

    return this.success({
      result,
      mapResults: mapResults.map(r => r.data),
      stats: {
        itemsProcessed: items.length,
        successCount: mapResults.filter(r => !r.error).length,
        errorCount: mapResults.filter(r => r.error).length,
        durationMs: Date.now() - startTime
      }
    });
  }

  async parallelMap(items, tool, args, context, server, maxConcurrency) {
    const results = [];
    const queue = [...items.map((item, index) => ({ item, index }))];

    const processItem = async ({ item, index }) => {
      try {
        const result = await tool.execute({ ...args, data: item, item }, context, server);
        return { index, data: result.data, error: null };
      } catch (error) {
        return { index, data: null, error: error.message };
      }
    };

    // Process in batches
    while (queue.length > 0) {
      const batch = queue.splice(0, maxConcurrency);
      const batchResults = await Promise.all(batch.map(processItem));
      results.push(...batchResults);
    }

    // Sort by original index
    results.sort((a, b) => a.index - b.index);
    return results;
  }

  async sequentialMap(items, tool, args, context, server) {
    const results = [];
    for (let i = 0; i < items.length; i++) {
      try {
        const result = await tool.execute({ ...args, data: items[i], item: items[i] }, context, server);
        results.push({ index: i, data: result.data, error: null });
      } catch (error) {
        results.push({ index: i, data: null, error: error.message });
      }
    }
    return results;
  }

  defaultReduce(mapResults) {
    const validResults = mapResults.filter(r => !r.error).map(r => r.data);

    // Try to intelligently combine results
    if (validResults.length === 0) return null;
    if (validResults.length === 1) return validResults[0];

    // If all results are strings, concatenate
    if (validResults.every(r => typeof r === 'string')) {
      return validResults.join('\n\n');
    }

    // If all results are numbers, sum
    if (validResults.every(r => typeof r === 'number')) {
      return validResults.reduce((a, b) => a + b, 0);
    }

    // If all results are arrays, flatten
    if (validResults.every(r => Array.isArray(r))) {
      return validResults.flat();
    }

    // If all results are objects, merge
    if (validResults.every(r => typeof r === 'object' && r !== null)) {
      return validResults.reduce((acc, obj) => ({ ...acc, ...obj }), {});
    }

    // Default: return array
    return validResults;
  }

  simpleChunk(text, size, overlap) {
    const chunks = [];
    let pos = 0;
    while (pos < text.length) {
      chunks.push(text.slice(pos, pos + size));
      pos += size - overlap;
    }
    return chunks;
  }
}

module.exports = { MapReduceTool };
