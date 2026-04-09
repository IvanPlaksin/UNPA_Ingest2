/**
 * Graph Clustering — detect communities / clusters in a graph.
 *
 * Uses Label Propagation algorithm for fast community detection:
 * 1. Each node starts with its own label
 * 2. Iteratively, each node adopts the most common label among neighbors
 * 3. Converges when labels stabilize
 *
 * Returns a Map<nodeId, clusterId> that can be used by layout algorithms
 * to group related nodes together.
 */

/**
 * Detect clusters using Label Propagation.
 * @param {Array} nodes - ReactFlow nodes
 * @param {Array} edges - ReactFlow edges
 * @param {Object} options
 * @param {number} options.maxIterations - Max iterations (default: 30)
 * @param {number} options.minClusterSize - Minimum cluster size (default: 2)
 * @returns {{ clusters: Map<string, string>, clusterSizes: Map<string, number>, clusterOrder: string[] }}
 */
export function detectClusters(nodes, edges, options = {}) {
  const { maxIterations = 30, minClusterSize = 2 } = options;

  if (nodes.length === 0) {
    return { clusters: new Map(), clusterSizes: new Map(), clusterOrder: [] };
  }

  // Build adjacency list (undirected — both endpoints count)
  const adj = new Map();
  for (const n of nodes) {
    adj.set(n.id, []);
  }

  for (const e of edges) {
    const src = e.source?.id || e.source;
    const tgt = e.target?.id || e.target;
    if (adj.has(src) && adj.has(tgt)) {
      adj.get(src).push(tgt);
      adj.get(tgt).push(src);
    }
  }

  // Initialize: each node is its own label
  const labels = new Map();
  for (const n of nodes) {
    labels.set(n.id, n.id);
  }

  // Label Propagation iterations
  const nodeIds = nodes.map(n => n.id);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Shuffle order for randomness (simple Fisher-Yates)
    const order = [...nodeIds];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    for (const nodeId of order) {
      const neighbors = adj.get(nodeId) || [];
      if (neighbors.length === 0) continue;

      // Count neighbor labels (weighted by edge count to that neighbor)
      const labelCounts = new Map();
      for (const nbrId of neighbors) {
        const nbrLabel = labels.get(nbrId);
        labelCounts.set(nbrLabel, (labelCounts.get(nbrLabel) || 0) + 1);
      }

      // Find most frequent label
      let bestLabel = labels.get(nodeId);
      let bestCount = 0;
      for (const [label, count] of labelCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestLabel = label;
        }
      }

      if (bestLabel !== labels.get(nodeId)) {
        labels.set(nodeId, bestLabel);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Normalize cluster IDs to sequential numbers
  const labelToCluster = new Map();
  let nextCluster = 0;
  for (const label of labels.values()) {
    if (!labelToCluster.has(label)) {
      labelToCluster.set(label, `cluster-${nextCluster++}`);
    }
  }

  const clusters = new Map();
  for (const [nodeId, label] of labels) {
    clusters.set(nodeId, labelToCluster.get(label));
  }

  // Compute cluster sizes
  const clusterSizes = new Map();
  for (const clusterId of clusters.values()) {
    clusterSizes.set(clusterId, (clusterSizes.get(clusterId) || 0) + 1);
  }

  // Merge tiny clusters (< minClusterSize) into nearest large cluster
  if (minClusterSize > 1) {
    const smallClusters = new Set();
    for (const [cId, size] of clusterSizes) {
      if (size < minClusterSize) smallClusters.add(cId);
    }

    if (smallClusters.size > 0) {
      for (const nodeId of nodeIds) {
        const nodeCluster = clusters.get(nodeId);
        if (!smallClusters.has(nodeCluster)) continue;

        // Find the most common non-small cluster among neighbors
        const neighbors = adj.get(nodeId) || [];
        const nbrClusters = new Map();
        for (const nbrId of neighbors) {
          const nc = clusters.get(nbrId);
          if (nc && !smallClusters.has(nc)) {
            nbrClusters.set(nc, (nbrClusters.get(nc) || 0) + 1);
          }
        }

        if (nbrClusters.size > 0) {
          let bestCluster = nodeCluster;
          let bestCount = 0;
          for (const [c, count] of nbrClusters) {
            if (count > bestCount) {
              bestCount = count;
              bestCluster = c;
            }
          }
          clusters.set(nodeId, bestCluster);
        }
      }

      // Recompute sizes
      clusterSizes.clear();
      for (const cId of clusters.values()) {
        clusterSizes.set(cId, (clusterSizes.get(cId) || 0) + 1);
      }
    }
  }

  // Order clusters by size (largest first)
  const clusterOrder = [...clusterSizes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  return { clusters, clusterSizes, clusterOrder };
}

/**
 * Compute inter-cluster edge density to determine cluster spacing.
 * Returns a Map<"clustA||clustB", count> of edges between clusters.
 */
export function interClusterEdges(edges, clusters) {
  const inter = new Map();
  for (const e of edges) {
    const src = e.source?.id || e.source;
    const tgt = e.target?.id || e.target;
    const cSrc = clusters.get(src);
    const cTgt = clusters.get(tgt);
    if (cSrc && cTgt && cSrc !== cTgt) {
      const key = [cSrc, cTgt].sort().join('||');
      inter.set(key, (inter.get(key) || 0) + 1);
    }
  }
  return inter;
}
