const { BaseTool } = require('../primitives/BaseTool.js');

class ClusterTool extends BaseTool {
  getDefinition() {
    return {
      id: 'vector.cluster',
      name: 'Cluster Vectors',
      version: '1.0.0',
      level: 2,
      category: 'vector',
      description: 'Cluster vectors using k-means algorithm',
      inputSchema: {
        type: 'object',
        required: ['vectors'],
        properties: {
          vectors: {
            type: 'array',
            items: { type: 'array', items: { type: 'number' } },
            description: 'Vectors to cluster'
          },
          k: { type: 'integer', default: 3, description: 'Number of clusters' },
          maxIterations: { type: 'integer', default: 100, description: 'Maximum iterations' },
          seed: { type: 'integer', description: 'Random seed for reproducibility' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          clusters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                centroid: { type: 'array', items: { type: 'number' } },
                members: { type: 'array', items: { type: 'integer' } },
                size: { type: 'integer' }
              }
            }
          },
          assignments: { type: 'array', items: { type: 'integer' } },
          iterations: { type: 'integer' },
          converged: { type: 'boolean' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 200 }
    };
  }

  async execute(args, context) {
    const { vectors, k = 3, maxIterations = 100, seed } = args;

    if (!vectors || vectors.length === 0) {
      return this.success({ clusters: [], assignments: [], iterations: 0, converged: true });
    }

    if (k > vectors.length) {
      return this.error('INVALID_K', `k (${k}) cannot be greater than number of vectors (${vectors.length})`);
    }

    // Initialize random number generator
    const random = seed !== undefined ? this.seededRandom(seed) : Math.random;

    // Initialize centroids using k-means++
    const centroids = this.initializeCentroids(vectors, k, random);

    let assignments = new Array(vectors.length).fill(0);
    let converged = false;
    let iterations = 0;

    for (iterations = 0; iterations < maxIterations; iterations++) {
      // Assign vectors to nearest centroid
      const newAssignments = vectors.map(v => this.findNearestCentroid(v, centroids));

      // Check for convergence
      if (this.arraysEqual(assignments, newAssignments)) {
        converged = true;
        break;
      }

      assignments = newAssignments;

      // Update centroids
      for (let i = 0; i < k; i++) {
        const members = vectors.filter((_, idx) => assignments[idx] === i);
        if (members.length > 0) {
          centroids[i] = this.computeMean(members);
        }
      }
    }

    // Build cluster info
    const clusters = centroids.map((centroid, i) => {
      const members = assignments.map((a, idx) => a === i ? idx : -1).filter(idx => idx >= 0);
      return {
        centroid,
        members,
        size: members.length
      };
    });

    return this.success({
      clusters,
      assignments,
      iterations: iterations + 1,
      converged
    });
  }

  initializeCentroids(vectors, k, random) {
    // k-means++ initialization
    const centroids = [];
    const n = vectors.length;
    const dim = vectors[0].length;

    // First centroid: random
    centroids.push([...vectors[Math.floor(random() * n)]]);

    // Subsequent centroids: weighted by distance squared
    for (let i = 1; i < k; i++) {
      const distances = vectors.map(v => {
        const minDist = Math.min(...centroids.map(c => this.euclideanDistance(v, c)));
        return minDist * minDist;
      });

      const totalDist = distances.reduce((a, b) => a + b, 0);
      let r = random() * totalDist;

      for (let j = 0; j < n; j++) {
        r -= distances[j];
        if (r <= 0) {
          centroids.push([...vectors[j]]);
          break;
        }
      }

      // Fallback
      if (centroids.length <= i) {
        centroids.push([...vectors[Math.floor(random() * n)]]);
      }
    }

    return centroids;
  }

  findNearestCentroid(vector, centroids) {
    let minDist = Infinity;
    let nearest = 0;

    for (let i = 0; i < centroids.length; i++) {
      const dist = this.euclideanDistance(vector, centroids[i]);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }

    return nearest;
  }

  computeMean(vectors) {
    if (vectors.length === 0) return [];
    const dim = vectors[0].length;
    const mean = new Array(dim).fill(0);

    for (const v of vectors) {
      for (let i = 0; i < dim; i++) {
        mean[i] += v[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      mean[i] /= vectors.length;
    }

    return mean;
  }

  euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  seededRandom(seed) {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }
}

module.exports = { ClusterTool };
