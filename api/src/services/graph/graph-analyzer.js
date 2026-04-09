/**
 * GraphAnalyzer — structural metrics for a namespace subgraph.
 *
 * Computes: node/edge counts, density, degree distribution, hub nodes,
 * connected components, bridge edges and average clustering coefficient.
 *
 * All queries go through the shared Memgraph driver (neo4j.service).
 */

const memgraphService = require('../memgraph.service');

class GraphAnalyzer {
  /** @param {{ namespace?: string }} [opts] */
  constructor(opts = {}) {
    this.driver = memgraphService.driver;
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Full structural analysis of a namespace subgraph.
   * @param {string} namespace
   * @param {{ bridgeLimit?: number, hubLimit?: number }} opts
   * @returns {Promise<import('./types').StructuralAnalysisResult>}
   */
  async analyze(namespace, opts = {}) {
    const { bridgeLimit = 500, hubLimit = 10 } = opts;
    const start = Date.now();
    const session = this._session();

    try {
      // ── 1. Basic counts ──────────────────────────────────────
      const basics = await session.run(`
        MATCH (n) WHERE n.namespace = $ns
          AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        WITH count(n) AS nc
        OPTIONAL MATCH (a)-[r]->(b)
          WHERE (a.namespace = $ns OR b.namespace = $ns)
          AND NOT labels(a)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
          AND NOT labels(b)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
          AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
        RETURN nc AS nodeCount, count(r) AS edgeCount
      `, { ns: namespace });

      const nodeCount = _num(basics.records[0]?.get('nodeCount'));
      const edgeCount = _num(basics.records[0]?.get('edgeCount'));
      const maxPossible = nodeCount * (nodeCount - 1);
      const density = maxPossible > 0 ? edgeCount / maxPossible : 0;

      // ── 2. Degree distribution + hubs ────────────────────────
      const degRes = await session.run(`
        MATCH (n) WHERE n.namespace = $ns
          AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        OPTIONAL MATCH (n)-[r]-()
          WHERE NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
        WITH n, count(r) AS deg
        RETURN n.id AS id, n.name AS name, labels(n)[0] AS label, deg
        ORDER BY deg DESC
      `, { ns: namespace });

      const degreeMap = new Map();     // degree → count
      const hubNodes = [];
      let totalDegree = 0;
      let maxDegree = 0;

      for (const rec of degRes.records) {
        const deg = _num(rec.get('deg'));
        totalDegree += deg;
        if (deg > maxDegree) maxDegree = deg;
        degreeMap.set(deg, (degreeMap.get(deg) || 0) + 1);

        if (hubNodes.length < hubLimit) {
          hubNodes.push({
            id: rec.get('id'),
            name: rec.get('name'),
            label: rec.get('label'),
            degree: deg,
          });
        }
      }

      const degreeDistribution = [...degreeMap.entries()]
        .map(([degree, count]) => ({ degree, count }))
        .sort((a, b) => a.degree - b.degree);

      const avgDegree = nodeCount > 0 ? totalDegree / nodeCount : 0;

      // ── 3. Connected components (iterative BFS in Cypher) ────
      const connectedComponents = await this._connectedComponents(session, namespace);

      // ── 4. Bridge edges (only when graph is small enough) ────
      let bridgeEdges;
      if (nodeCount <= bridgeLimit) {
        bridgeEdges = await this._bridgeEdges(session, namespace);
      }

      // ── 5. Average clustering coefficient ────────────────────
      const avgClusteringCoefficient = await this._avgClusteringCoeff(session, namespace);

      return {
        nodeCount,
        edgeCount,
        density: +density.toFixed(4),
        degreeDistribution,
        avgDegree: +avgDegree.toFixed(2),
        maxDegree,
        hubNodes,
        connectedComponents,
        bridgeEdges,
        avgClusteringCoefficient: +avgClusteringCoefficient.toFixed(4),
        namespace,
        analyzedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    } finally {
      await session.close();
    }
  }

  // ─── Private helpers ──────────────────────────────────────────

  /**
   * Finds connected components via iterative label propagation in JS
   * (Memgraph without MAGE has no built-in weakly_connected_components).
   */
  async _connectedComponents(session, namespace) {
    // Fetch adjacency list
    const nodesRes = await session.run(
      `MATCH (n) WHERE n.namespace = $ns
        AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
       RETURN n.id AS id`, { ns: namespace }
    );
    const edgesRes = await session.run(`
      MATCH (a)-[r]-(b)
      WHERE a.namespace = $ns AND b.namespace = $ns
        AND NOT labels(a)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        AND NOT labels(b)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
      RETURN DISTINCT a.id AS src, b.id AS tgt
    `, { ns: namespace });

    const ids = nodesRes.records.map(r => r.get('id'));
    const adj = new Map();
    for (const id of ids) adj.set(id, []);
    for (const rec of edgesRes.records) {
      const s = rec.get('src'), t = rec.get('tgt');
      if (adj.has(s)) adj.get(s).push(t);
      if (adj.has(t)) adj.get(t).push(s);
    }

    // BFS
    const visited = new Set();
    const sizes = [];
    for (const id of ids) {
      if (visited.has(id)) continue;
      const queue = [id];
      visited.add(id);
      let size = 0;
      while (queue.length) {
        const cur = queue.shift();
        size++;
        for (const nb of (adj.get(cur) || [])) {
          if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        }
      }
      sizes.push(size);
    }

    sizes.sort((a, b) => b - a);
    const total = ids.length || 1;

    return {
      count: sizes.length,
      sizes,
      largestComponentRatio: +(sizes[0] / total).toFixed(4),
    };
  }

  /**
   * Bridge edges — edges whose removal increases the number of components.
   * Only practical for small graphs; runs single-edge-removal in JS.
   */
  async _bridgeEdges(session, namespace) {
    const edgesRes = await session.run(`
      MATCH (a)-[r]->(b)
      WHERE (a.namespace = $ns OR b.namespace = $ns)
        AND NOT labels(a)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        AND NOT labels(b)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
      RETURN a.id AS src, b.id AS tgt, type(r) AS relType
    `, { ns: namespace });
    const nodesRes = await session.run(
      `MATCH (n) WHERE n.namespace = $ns
        AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
       RETURN n.id AS id`, { ns: namespace }
    );

    const ids = nodesRes.records.map(r => r.get('id'));
    const allEdges = edgesRes.records.map(r => ({
      source: r.get('src'), target: r.get('tgt'), type: r.get('relType'),
    }));

    // Baseline component count (undirected)
    const baseComponents = this._countComponentsJS(ids, allEdges);

    const bridges = [];
    for (let i = 0; i < allEdges.length; i++) {
      const without = allEdges.filter((_, idx) => idx !== i);
      if (this._countComponentsJS(ids, without) > baseComponents) {
        bridges.push(allEdges[i]);
      }
    }
    return bridges;
  }

  /** Count connected components given id list + edge list (undirected). */
  _countComponentsJS(ids, edges) {
    const adj = new Map();
    for (const id of ids) adj.set(id, []);
    for (const { source, target } of edges) {
      if (adj.has(source)) adj.get(source).push(target);
      if (adj.has(target)) adj.get(target).push(source);
    }
    const visited = new Set();
    let count = 0;
    for (const id of ids) {
      if (visited.has(id)) continue;
      count++;
      const queue = [id];
      visited.add(id);
      while (queue.length) {
        const cur = queue.shift();
        for (const nb of (adj.get(cur) || [])) {
          if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        }
      }
    }
    return count;
  }

  /**
   * Average local clustering coefficient.
   * For each node: C(v) = 2*triangles / (deg*(deg-1)).
   */
  async _avgClusteringCoeff(session, namespace) {
    // For each node, count triangles via common neighbors
    const res = await session.run(`
      MATCH (n) WHERE n.namespace = $ns
        AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
      OPTIONAL MATCH (n)-[r]-(m)
        WHERE NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
          AND NOT labels(m)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
      WITH n, collect(DISTINCT m) AS neighbors
      WITH n, neighbors, size(neighbors) AS deg
      WHERE deg >= 2
      UNWIND neighbors AS a
      UNWIND neighbors AS b
      WITH n, a, b, deg WHERE id(a) < id(b)
      OPTIONAL MATCH (a)--(b)
      WITH n, deg, count(CASE WHEN a IS NOT NULL AND b IS NOT NULL THEN 1 END) AS triangles
      WITH n, deg, triangles,
           CASE WHEN deg*(deg-1) > 0 THEN 2.0*triangles / (deg*(deg-1)) ELSE 0 END AS cc
      RETURN avg(cc) AS avgCC
    `, { ns: namespace });

    return _num(res.records[0]?.get('avgCC')) || 0;
  }
}

/** Safely convert Memgraph value to JS number. */
function _num(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') return v.toNumber();
  return Number(v) || 0;
}

module.exports = { GraphAnalyzer };
