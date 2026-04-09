/**
 * CommunityDetector — finds communities (clusters of densely-connected nodes).
 *
 * Strategy cascade:
 *   0. GNN KMeans (if GNN service available with loaded model)
 *   1. MAGE Louvain (if available in Memgraph image)
 *   2. Label Propagation in JS (always available)
 */

const memgraphService = require('../memgraph.service');

class CommunityDetector {
  constructor() {
    this.driver = memgraphService.driver;
    this._mageAvailable = null; // lazily detected
    this._gnnServiceUrl = process.env.GNN_SERVICE_URL || 'http://localhost:5000';
    this._gnnAvailable = null; // lazily detected
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Detect communities for a namespace subgraph.
   * @param {string} namespace
   * @param {{ maxIterations?: number, minCommunitySize?: number, nClusters?: number }} opts
   * @returns {Promise<CommunityResult>}
   */
  async detect(namespace, opts = {}) {
    const { maxIterations = 20, minCommunitySize = 2, nClusters } = opts;

    // Try GNN-based detection first (best quality when model is loaded)
    if (await this._hasGNN()) {
      try {
        return await this._gnnCommunities(namespace, minCommunitySize, nClusters);
      } catch (e) {
        console.warn('[CommunityDetector] GNN community detection failed, falling back:', e.message);
      }
    }

    // Try MAGE Louvain
    if (await this._hasMage()) {
      try {
        return await this._louvainMage(namespace, minCommunitySize);
      } catch (e) {
        console.warn('[CommunityDetector] MAGE Louvain failed, falling back to LP:', e.message);
      }
    }

    // Fallback: Label Propagation in JS
    return this._labelPropagation(namespace, maxIterations, minCommunitySize);
  }

  // ─── GNN KMeans ─────────────────────────────────────────────

  async _hasGNN() {
    if (this._gnnAvailable !== null) return this._gnnAvailable;
    try {
      const res = await fetch(`${this._gnnServiceUrl}/api/v1/gnn/model-status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) { this._gnnAvailable = false; return false; }
      const status = await res.json();
      this._gnnAvailable = status.link_prediction?.loaded === true;
    } catch {
      this._gnnAvailable = false;
    }
    return this._gnnAvailable;
  }

  async _gnnCommunities(namespace, minSize, nClusters) {
    const res = await fetch(`${this._gnnServiceUrl}/api/v1/gnn/detect-communities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace: namespace || undefined,
        n_clusters: nClusters || undefined,
        min_community_size: minSize,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GNN service returned ${res.status}: ${err}`);
    }

    const data = await res.json();
    // The Python endpoint already returns the correct format
    return {
      method: data.method || 'gnn_kmeans',
      clusters: data.clusters || [],
      totalCommunities: data.totalCommunities || 0,
      filteredCommunities: data.filteredCommunities || 0,
      modularity: data.modularity || null,
    };
  }

  // ─── MAGE Louvain ────────────────────────────────────────────

  async _hasMage() {
    if (this._mageAvailable !== null) return this._mageAvailable;
    const session = this._session();
    try {
      const result = await session.run("CALL mg.procedures() YIELD name WITH name WHERE name = 'community_detection.louvain' RETURN name");
      this._mageAvailable = result.records.length > 0;
    } catch {
      this._mageAvailable = false;
    } finally {
      await session.close();
    }
    return this._mageAvailable;
  }

  async _louvainMage(namespace, minSize) {
    const session = this._session();
    try {
      const res = await session.run(`
        MATCH (n) WHERE n.namespace = $ns
          AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        WITH collect(n) AS nodes
        CALL community_detection.louvain(nodes) YIELD node, community_id
        RETURN node.id AS id, node.name AS name, labels(node)[0] AS label, community_id AS community
      `, { ns: namespace });

      return this._formatCommunities(res.records, minSize, 'louvain');
    } finally {
      await session.close();
    }
  }

  // ─── Label Propagation (JS) ──────────────────────────────────

  async _labelPropagation(namespace, maxIterations, minSize) {
    const session = this._session();
    try {
      // 1. Fetch nodes and undirected adjacency
      const nodesRes = await session.run(`
        MATCH (n) WHERE n.namespace = $ns
          AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        RETURN n.id AS id, n.name AS name, labels(n)[0] AS label
      `, { ns: namespace });

      const edgesRes = await session.run(`
        MATCH (a)-[r]-(b)
        WHERE a.namespace = $ns AND b.namespace = $ns
          AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
        RETURN DISTINCT a.id AS src, b.id AS tgt
      `, { ns: namespace });

      const nodes = nodesRes.records.map(r => ({
        id: r.get('id'), name: r.get('name'), label: r.get('label'),
      }));
      const adj = new Map();
      for (const n of nodes) adj.set(n.id, []);
      for (const rec of edgesRes.records) {
        const s = rec.get('src'), t = rec.get('tgt');
        if (adj.has(s) && adj.has(t)) {
          adj.get(s).push(t);
          adj.get(t).push(s);
        }
      }

      // 2. Initialise: each node in its own community
      const community = new Map();
      for (const n of nodes) community.set(n.id, n.id);

      // 3. Iterate
      for (let iter = 0; iter < maxIterations; iter++) {
        let changed = false;
        // Shuffle order each iteration for convergence stability
        const shuffled = [...nodes].sort(() => Math.random() - 0.5);

        for (const node of shuffled) {
          const neighbors = adj.get(node.id) || [];
          if (neighbors.length === 0) continue;

          // Count neighbor communities
          const freq = new Map();
          for (const nb of neighbors) {
            const c = community.get(nb);
            freq.set(c, (freq.get(c) || 0) + 1);
          }

          // Pick most frequent (ties broken randomly)
          let best = community.get(node.id), bestCount = 0;
          for (const [c, count] of freq) {
            if (count > bestCount || (count === bestCount && Math.random() > 0.5)) {
              best = c; bestCount = count;
            }
          }

          if (best !== community.get(node.id)) {
            community.set(node.id, best);
            changed = true;
          }
        }

        if (!changed) break;
      }

      // 4. Format
      const records = nodes.map(n => ({
        id: n.id, name: n.name, label: n.label,
        community: community.get(n.id),
      }));
      return this._formatCommunities(records, minSize, 'label_propagation');
    } finally {
      await session.close();
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  _formatCommunities(records, minSize, method) {
    // records: array of { id, name, label, community }
    const raw = Array.isArray(records[0]?.get)
      ? records.map(r => ({ id: r.get('id'), name: r.get('name'), label: r.get('label'), community: _val(r.get('community')) }))
      : records;

    // Group by community
    const groups = new Map();
    for (const r of raw) {
      if (!groups.has(r.community)) groups.set(r.community, []);
      groups.get(r.community).push(r);
    }

    // Filter by minSize, sort by size desc
    const clusters = [...groups.values()]
      .filter(g => g.length >= minSize)
      .sort((a, b) => b.length - a.length)
      .map((members, idx) => ({
        strategy: 'community',
        communityId: idx,
        nodes: members.map(m => m.id),
        nodeDetails: members.map(m => ({ id: m.id, name: m.name, label: m.label })),
        nodeCount: members.length,
      }));

    return {
      method,
      clusters,
      totalCommunities: groups.size,
      filteredCommunities: clusters.length,
      modularity: null, // only computable with MAGE
    };
  }
}

function _val(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') return v.toNumber();
  return v;
}

module.exports = { CommunityDetector };
