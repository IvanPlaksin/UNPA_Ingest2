const { BaseTool } = require('../primitives/BaseTool.js');

class ChunkTool extends BaseTool {
  getDefinition() {
    return {
      id: 'text.chunk',
      name: 'Chunk Text',
      version: '1.0.0',
      level: 2,
      category: 'text',
      description: 'Split text into chunks with configurable size and overlap',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to chunk' },
          chunkSize: { type: 'integer', default: 1000, description: 'Target chunk size in characters' },
          overlap: { type: 'integer', default: 200, description: 'Overlap between chunks' },
          separator: { type: 'string', default: '\n\n', description: 'Preferred split separator' },
          preserveSentences: { type: 'boolean', default: true, description: 'Try to preserve sentence boundaries' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          chunks: { type: 'array', items: { type: 'string' } },
          metadata: {
            type: 'object',
            properties: {
              totalChunks: { type: 'integer' },
              avgChunkSize: { type: 'number' }
            }
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 1000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context) {
    const { text, chunkSize = 1000, overlap = 200, separator = '\n\n', preserveSentences = true } = args;

    if (!text || text.length === 0) {
      return this.success({ chunks: [], metadata: { totalChunks: 0, avgChunkSize: 0 } });
    }

    const chunks = [];
    let currentPos = 0;

    while (currentPos < text.length) {
      let endPos = Math.min(currentPos + chunkSize, text.length);

      // Try to find a good break point
      if (endPos < text.length) {
        // First try separator
        const sepIndex = text.lastIndexOf(separator, endPos);
        if (sepIndex > currentPos + chunkSize / 2) {
          endPos = sepIndex + separator.length;
        } else if (preserveSentences) {
          // Try sentence boundary
          const sentenceEnd = this.findSentenceEnd(text, currentPos + chunkSize / 2, endPos);
          if (sentenceEnd > 0) {
            endPos = sentenceEnd;
          }
        }
      }

      const chunk = text.slice(currentPos, endPos).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      // Move position with overlap
      currentPos = endPos - overlap;
      if (currentPos <= chunks.length > 0 ? text.indexOf(chunks[chunks.length - 1]) : 0) {
        currentPos = endPos; // Prevent infinite loop
      }
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);

    return this.success({
      chunks,
      metadata: {
        totalChunks: chunks.length,
        avgChunkSize: chunks.length > 0 ? Math.round(totalLength / chunks.length) : 0
      }
    });
  }

  findSentenceEnd(text, start, end) {
    const sentenceEnders = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
    let lastEnd = -1;

    for (const ender of sentenceEnders) {
      let pos = start;
      while (pos < end) {
        const idx = text.indexOf(ender, pos);
        if (idx >= start && idx < end) {
          lastEnd = Math.max(lastEnd, idx + ender.length);
          pos = idx + 1;
        } else {
          break;
        }
      }
    }

    return lastEnd;
  }
}

module.exports = { ChunkTool };
