const { BaseTool } = require('../primitives/BaseTool.js');

class SimilarityTool extends BaseTool {
  getDefinition() {
    return {
      id: 'vector.similarity',
      name: 'Calculate Similarity',
      version: '1.0.0',
      level: 2,
      category: 'vector',
      description: 'Calculate similarity between vectors using various metrics',
      inputSchema: {
        type: 'object',
        required: ['vectorA', 'vectorB'],
        properties: {
          vectorA: { type: 'array', items: { type: 'number' }, description: 'First vector' },
          vectorB: {
            oneOf: [
              { type: 'array', items: { type: 'number' } },
              { type: 'array', items: { type: 'array', items: { type: 'number' } } }
            ],
            description: 'Second vector or array of vectors to compare against'
          },
          metric: {
            type: 'string',
            enum: ['cosine', 'euclidean', 'dot', 'manhattan'],
            default: 'cosine',
            description: 'Similarity metric'
          },
          topK: { type: 'integer', description: 'Return only top K results (for multiple vectors)' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          similarity: { type: 'number' },
          similarities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'integer' },
                similarity: { type: 'number' }
              }
            }
          },
          metric: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 100, maxMemoryMb: 50 }
    };
  }

  async execute(args, context) {
    const { vectorA, vectorB, metric = 'cosine', topK } = args;

    if (!vectorA || !vectorB) {
      return this.error('INVALID_INPUT', 'Both vectors are required');
    }

    // Check if vectorB is a single vector or array of vectors
    const isMultiple = Array.isArray(vectorB[0]);

    if (isMultiple) {
      let similarities = vectorB.map((vb, index) => ({
        index,
        similarity: this.calculateSimilarity(vectorA, vb, metric)
      }));

      // Sort by similarity (descending for all metrics)
      similarities.sort((a, b) => {
        if (metric === 'euclidean' || metric === 'manhattan') {
          return a.similarity - b.similarity; // Lower is better for distance
        }
        return b.similarity - a.similarity; // Higher is better for similarity
      });

      if (topK) {
        similarities = similarities.slice(0, topK);
      }

      return this.success({ similarities, metric });
    } else {
      const similarity = this.calculateSimilarity(vectorA, vectorB, metric);
      return this.success({ similarity, metric });
    }
  }

  calculateSimilarity(a, b, metric) {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }

    switch (metric) {
      case 'cosine':
        return this.cosineSimilarity(a, b);
      case 'euclidean':
        return this.euclideanDistance(a, b);
      case 'dot':
        return this.dotProduct(a, b);
      case 'manhattan':
        return this.manhattanDistance(a, b);
      default:
        return this.cosineSimilarity(a, b);
    }
  }

  cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  dotProduct(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  manhattanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs(a[i] - b[i]);
    }
    return sum;
  }
}

module.exports = { SimilarityTool };
