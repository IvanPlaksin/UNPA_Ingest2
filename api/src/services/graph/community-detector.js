/**
 * CommunityDetector — finds communities (clusters of densely-connected nodes).
 *
 * Supports two graph domains:
 *   - Generic namespace graph (CoreComponent / CONNECTED_TO): detect()
 *   - Entity Store graph (ESEntity / ES_RELATED_TO): detectESEntity()
 *
 * Strategy cascade (both domains):
 *   0. GNN KMeans (if GNN service available with loaded model)
 *   1. MAGE Leiden (if leiden_community_detection available — guarantees cluster connectivity)
 *   2. MAGE Louvain (if community_detection available)
 *   3. Label Propagation in JS (always available)
 */

const memgraphService = require('../memgraph.service');

class CommunityDetector {
  constructor() {
    this.driver = memgraphService.driver;
    this._mageLouvainAvailable = null;
    this._mageLeidenAvailable  = null;
    this._gnnServiceUrl = process.env.GNN_SERVICE_URL || 'http://localhost:5001';
    this._gnnAvailable  = null;
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  // ─── Public: generic namespace graph ────────────────────────

  /**
   * Detect communities for a generic namespace subgraph (CoreComponent / CONNECTED_TO).
   */
  async detect(namespace, opts = {}) {
    if (process.env.GRAPH_DB_BACKEND === 'postgres-age') {
      return { method: 'none', clusters: [], totalCommunities: 0, filteredCommunities: 0, modularity: null };
    }
    const { maxIterations = 20, minCommunitySize = 2, nClusters } = opts;

    if (await this._hasGNN()) {
      try { return await this._gnnCommunities(namespace, minCommunitySize, nClusters); }
      catch (e) { console.warn('[CommunityDetector] GNN failed, falling back:', e.message); }
    }
    if (await this._hasLeiden()) {
      try { return await this._leidenMage(namespace, minCommunitySize); }
      catch (e) { console.warn('[CommunityDetector] Leiden failed, trying Louvain:', e.message); }
    }
    if (await this._hasLouvain()) {
      try { return await this._louvainMage(namespace, minCommunitySize); }
      catch (e) { console.warn('[CommunityDetector] Louvain failed, falling back to LP:', e.message); }
    }
    return this._labelPropagation(namespace, maxIterations, minCommunitySize);
  }

  // ─── Public: Entity Store graph ─────────────────────────────

  /**
   * Detect communities for an ESEntity/ES_RELATED_TO subgraph.
   * @param {string} namespace
   * @param {{ maxIterations?: number, minCommunitySize?: number }} opts
   * @returns {Promise<CommunityResult>}
   */
  async detectESEntity(namespace, opts = {}) {
    if (process.env.GRAPH_DB_BACKEND === 'postgres-age') {
      return { method: 'none', clusters: [], totalCommunities: 0, filteredCommunities: 0, modularity: null };
    }
    const { maxIterations = 20, minCommunitySize = 2 } = opts;

    if (await this._hasLeiden()) {
      try { return await this._leidenMageES(namespace, minCommunitySize); }
      catch (e) { console.warn('[CommunityDetector] Leiden ES failed, trying Louvain:', e.message); }
    }
    if (await this._hasLouvain()) {
      try { return await this._louvainMageES(namespace, minCommunitySize); }
      catch (e) { console.warn('[CommunityDetector] Louvain ES failed, falling back to LP:', e.message); }
    }
    return this._labelPropagationES(namespace, maxIterations, minCommunitySize);
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
      body: JSON.stringify({ namespace: namespace || undefined, n_clusters: nClusters || undefined, min_community_size: minSize }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`GNN service returned ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      method:              data.method || 'gnn_kmeans',
      clusters:            data.clusters || [],
      totalCommunities:    data.totalCommunities || 0,
      filteredCommunities: data.filteredCommunities || 0,
      modularity:          data.modularity || null,
    };
  }

  // ─── MAGE Leiden ─────────────────────────────────────────────

  async _hasLeiden() {
    if (process.env.GRAPH_DB_BACKEND === 'postgres-age') return false;
    if (this._mageLeidenAvailable !== null) return this._mageLeidenAvailable;
    const session = this._session();
    try {
      const r = await session.run('CALL mg.procedures() YIELD name RETURN name');
      const names = r.records.map(rec => rec.get('name'));
      this._mageLeidenAvailable = names.includes('leiden_community_detection.get');
    } catch {
      this._mageLeidenAvailable = false;
    } finally {
      await session.close();
    }
    return this._mageLeidenAvailable;
  }

  // Generic graph (CoreComponent)
  async _leidenMage(namespace, minSize) {
    const session = this._session();
    try {
      const res = await session.run(`
        MATCH (n) WHERE n.namespace = $ns
          AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        OPTIONAL MATCH (n)-[r]-(m) WHERE m.namespace = $ns
          AND NOT labels(m)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        WITH collect(DISTINCT n) AS nodes, collect(DISTINCT r) AS rels
        CALL leiden_community_detection.get(nodes, rels, {
          resolution: 1.0, beta: 0.01, max_iterations: 100
        }) YIELD node, community_id
        RETURN node.id AS id, node.name AS name, labels(node)[0] AS label, community_id AS community
      `, { ns: namespace });
      return this._formatCommunities(res.records, minSize, 'leiden');
    } finally {
      await session.close();
    }
  }

  // ESEntity graph
  async _leidenMageES(namespace, minSize) {
    const session = this._session();
    try {
      const res = await session.run(`
        MATCH (n:ESEntity {namespace: $ns})
        OPTIONAL MATCH (n)-[r:ES_RELATED_TO]-(m:ESEntity {namespace: $ns})
        WITH collect(DISTINCT n) AS nodes, collect(DISTINCT r) AS rels
        CALL leiden_community_detection.get(nodes, rels, {
          resolution: 1.0, beta: 0.01, max_iterations: 100
        }) YIELD node, community_id
        RETURN node.id AS id, node.name AS name, node.type AS label, community_id AS community
      `, { ns: namespace });
      return this._formatCommunities(res.records, minSize, 'leiden');
    } finally {
      await session.close();
    }
  }

  // ─── MAGE Louvain ────────────────────────────────────────────

  async _hasLouvain() {
    if (process.env.GRAPH_DB_BACKEND === 'postgres-age') return false;
    if (this._mageLouvainAvailable !== null) return this._mageLouvainAvailable;
    const session = this._session();
    try {
      const r = await session.run('CALL mg.procedures() YIELD name RETURN name');
      const names = r.records.map(rec => rec.get('name'));
      this._mageLouvainAvailable = names.some(n => n.startsWith('community_detection'));
    } catch {
      this._mageLouvainAvailable = false;
    } finally {
      await session.close();
    }
    return this._mageLouvainAvailable;
  }

  // Generic graph (CoreComponent)
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

  // ESEntity graph
  async _louvainMageES(namespace, minSize) {
    const session = this._session();
    try {
      const res = await session.run(`
        MATCH (n:ESEntity {namespace: $ns})
        WITH collect(n) AS nodes
        CALL community_detection.louvain(nodes) YIELD node, community_id
        RETURN node.id AS id, node.name AS name, node.type AS label, community_id AS community
      `, { ns: namespace });
      return this._formatCommunities(res.records, minSize, 'louvain');
    } finally {
      await session.close();
    }
  }

  // ─── Label Propagation (JS) — generic graph ─────────────────

  async _labelPropagation(namespace, maxIterations, minSize) {
    const session = this._session();
    try {
      const nodesRes = await session.run(`
        MATCH (n) WHERE n.namespace = $ns
          AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        RETURN n.id AS id, n.name AS name, labels(n)[0] AS label
      `, { ns: namespace });
      const edgesRes = await session.run(`
        MATCH (a) WHERE a.namespace = $ns
        MATCH (a)-[r]-(b) WHERE b.namespace = $ns
        RETURN DISTINCT a.id AS src, b.id AS tgt
      `, { ns: namespace });
      return this._runLP(nodesRes.records, edgesRes.records, maxIterations, minSize);
    } finally {
      await session.close();
    }
  }

  // ─── Label Propagation (JS) — ESEntity graph ────────────────

  async _labelPropagationES(namespace, maxIterations, minSize) {
    const session = this._session();
    try {
      const nodesRes = await session.run(
        `MATCH (n:ESEntity {namespace: $ns}) RETURN n.id AS id, n.name AS name, n.type AS label`,
        { ns: namespace }
      );
      const edgesRes = await session.run(`
        MATCH (a:ESEntity {namespace: $ns})-[:ES_RELATED_TO]-(b:ESEntity {namespace: $ns})
        RETURN DISTINCT a.id AS src, b.id AS tgt
      `, { ns: namespace });
      return this._runLP(nodesRes.records, edgesRes.records, maxIterations, minSize);
    } finally {
      await session.close();
    }
  }

  // ─── Shared LP algorithm ─────────────────────────────────────

  _runLP(nodeRecords, edgeRecords, maxIterations, minSize) {
    const nodes = nodeRecords.map(r => ({ id: r.get('id'), name: r.get('name'), label: r.get('label') }));
    const adj   = new Map(nodes.map(n => [n.id, []]));

    for (const rec of edgeRecords) {
      const s = rec.get('src'), t = rec.get('tgt');
      if (adj.has(s) && adj.has(t)) {
        adj.get(s).push(t);
        adj.get(t).push(s);
      }
    }

    const community = new Map(nodes.map(n => [n.id, n.id]));

    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;
      const shuffled = [...nodes].sort(() => Math.random() - 0.5);
      for (const node of shuffled) {
        const neighbors = adj.get(node.id) || [];
        if (!neighbors.length) continue;
        const freq = new Map();
        for (const nb of neighbors) {
          const c = community.get(nb);
          freq.set(c, (freq.get(c) || 0) + 1);
        }
        let best = community.get(node.id), bestCount = 0;
        for (const [c, count] of freq) {
          if (count > bestCount || (count === bestCount && Math.random() > 0.5)) {
            best = c; bestCount = count;
          }
        }
        if (best !== community.get(node.id)) { community.set(node.id, best); changed = true; }
      }
      if (!changed) break;
    }

    const records = nodes.map(n => ({ id: n.id, name: n.name, label: n.label, community: community.get(n.id) }));
    return this._formatCommunities(records, minSize, 'label_propagation');
  }

  // ─── Helpers ─────────────────────────────────────────────────

  _formatCommunities(records, minSize, method) {
    const raw = Array.isArray(records) && typeof records[0]?.get === 'function'
      ? records.map(r => ({ id: r.get('id'), name: r.get('name'), label: r.get('label'), community: _val(r.get('community')) }))
      : records;

    const groups = new Map();
    for (const r of raw) {
      if (!groups.has(r.community)) groups.set(r.community, []);
      groups.get(r.community).push(r);
    }

    const clusters = [...groups.values()]
      .filter(g => g.length >= minSize)
      .sort((a, b) => b.length - a.length)
      .map((members, idx) => ({
        strategy:    'community',
        communityId: idx,
        nodes:       members.map(m => m.id),
        nodeDetails: members.map(m => ({ id: m.id, name: m.name, label: m.label })),
        nodeCount:   members.length,
      }));

    return { method, clusters, totalCommunities: groups.size, filteredCommunities: clusters.length, modularity: null };
  }
}

function _val(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') return v.toNumber();
  return v;
}

module.exports = { CommunityDetector };
