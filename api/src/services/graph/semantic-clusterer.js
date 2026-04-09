/**
 * SemanticClusterer — embedding-based semantic grouping of graph nodes.
 *
 * Pipeline: nodes → build text repr → embed via TEI → k-means → clusters
 */

const memgraphService = require('../memgraph.service');
const teiService = require('../tei.service');

class SemanticClusterer {
  constructor() {
    this.driver = memgraphService.driver;
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Cluster namespace nodes by semantic similarity.
   * @param {string} namespace
   * @param {{ minK?: number, maxK?: number }} opts
   * @returns {Promise<SemanticClusterResult>}
   */
  async cluster(namespace, opts = {}) {
    const { minK = 3, maxK = 10 } = opts;
    const session = this._session();

    try {
      // 1. Fetch nodes
      const res = await session.run(`
        MATCH (n) WHERE n.namespace = $ns
          AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        RETURN n.id AS id, n.name AS name, labels(n)[0] AS label,
               n.description AS description, n.category AS category,
               n.status AS status, n.maturity AS maturity
      `, { ns: namespace });

      const nodes = res.records.map(r => ({
        id: r.get('id'),
        name: r.get('name'),
        label: r.get('label'),
        description: r.get('description') || '',
        category: r.get('category') || '',
        status: r.get('status') || '',
        maturity: r.get('maturity'),
      }));

      if (nodes.length < 3) {
        return { clusters: [], method: 'semantic', error: 'Too few nodes for clustering' };
      }

      // 2. Build embedding texts
      const texts = nodes.map(n => _buildEmbeddingText(n));

      // 3. Embed via TEI
      let embeddings;
      try {
        embeddings = await teiService.getEmbeddings(texts);
      } catch (e) {
        console.error('[SemanticClusterer] TEI embedding failed:', e.message);
        return { clusters: [], method: 'semantic', error: 'TEI unavailable: ' + e.message };
      }

      // 4. k-means with best k (silhouette score)
      const bestK = Math.min(maxK, Math.max(minK, Math.floor(Math.sqrt(nodes.length / 2))));
      const kRange = [];
      for (let k = minK; k <= Math.min(maxK, nodes.length - 1); k++) kRange.push(k);

      let bestResult = null;
      let bestScore = -1;

      for (const k of kRange) {
        const assignments = _kmeans(embeddings, k, 50);
        const score = _silhouetteScore(embeddings, assignments);
        if (score > bestScore) {
          bestScore = score;
          bestResult = { k, assignments, score };
        }
      }

      if (!bestResult) {
        return { clusters: [], method: 'semantic', error: 'k-means failed' };
      }

      // 5. Format clusters
      const groups = new Map();
      for (let i = 0; i < nodes.length; i++) {
        const c = bestResult.assignments[i];
        if (!groups.has(c)) groups.set(c, []);
        groups.get(c).push(nodes[i]);
      }

      const clusters = [...groups.entries()]
        .sort(([, a], [, b]) => b.length - a.length)
        .map(([clusterId, members]) => ({
          strategy: 'semantic',
          clusterId,
          nodes: members.map(m => m.id),
          nodeDetails: members.map(m => ({ id: m.id, name: m.name, label: m.label })),
          nodeCount: members.length,
        }));

      return {
        method: 'semantic',
        clusters,
        bestK: bestResult.k,
        silhouetteScore: +bestResult.score.toFixed(4),
      };
    } finally {
      await session.close();
    }
  }
}

// ─── Pure helpers ──────────────────────────────────────────────

function _buildEmbeddingText(node) {
  const parts = [
    node.name,
    node.description,
    node.category ? `category: ${node.category}` : '',
    node.status ? `status: ${node.status}` : '',
    node.maturity != null ? `maturity: ${node.maturity}%` : '',
  ].filter(Boolean);
  return parts.join('. ');
}

/** Simple k-means clustering on embedding vectors. */
function _kmeans(vectors, k, maxIter = 50) {
  const dim = vectors[0].length;
  const n = vectors.length;

  // Initialise centroids: k-means++ style
  const centroids = [vectors[Math.floor(Math.random() * n)].slice()];
  while (centroids.length < k) {
    const dists = vectors.map(v => {
      let minD = Infinity;
      for (const c of centroids) minD = Math.min(minD, _dist2(v, c));
      return minD;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total, cum = 0;
    for (let i = 0; i < n; i++) {
      cum += dists[i];
      if (cum >= r) { centroids.push(vectors[i].slice()); break; }
    }
  }

  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = _dist2(vectors[i], centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    // Recompute centroids
    const sums = Array.from({ length: k }, () => new Float64Array(dim));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let d = 0; d < dim; d++) sums[c][d] += vectors[i][d];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let d = 0; d < dim; d++) centroids[c][d] = sums[c][d] / counts[c];
    }
  }

  return assignments;
}

/** Squared Euclidean distance. */
function _dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}

/** Silhouette score for cluster quality evaluation. */
function _silhouetteScore(vectors, assignments) {
  const n = vectors.length;
  if (n < 2) return 0;

  const clusters = new Map();
  for (let i = 0; i < n; i++) {
    if (!clusters.has(assignments[i])) clusters.set(assignments[i], []);
    clusters.get(assignments[i]).push(i);
  }
  if (clusters.size < 2) return 0;

  let totalS = 0;
  for (let i = 0; i < n; i++) {
    const myCluster = assignments[i];
    const myMembers = clusters.get(myCluster);

    // a(i): avg distance to same-cluster members
    let a = 0;
    if (myMembers.length > 1) {
      for (const j of myMembers) { if (j !== i) a += Math.sqrt(_dist2(vectors[i], vectors[j])); }
      a /= (myMembers.length - 1);
    }

    // b(i): min avg distance to any other cluster
    let b = Infinity;
    for (const [cid, members] of clusters) {
      if (cid === myCluster) continue;
      let avg = 0;
      for (const j of members) avg += Math.sqrt(_dist2(vectors[i], vectors[j]));
      avg /= members.length;
      if (avg < b) b = avg;
    }

    const s = b === 0 && a === 0 ? 0 : (b - a) / Math.max(a, b);
    totalS += s;
  }

  return totalS / n;
}

module.exports = { SemanticClusterer };
