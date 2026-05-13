/**
 * GraphAnalyzer — structural metrics for a namespace subgraph.
 *
 * AGE-compatible: namespace-wide OPTIONAL MATCH degree scans require
 * N×(edge_table_count) index lookups and reliably exceed the 30s timeout
 * for non-trivial namespaces. This version computes only what AGE can
 * answer quickly without that scan: nodeCount, edgeCount, density.
 * Expensive operations (degree distribution, clustering coefficient,
 * bridge detection) are omitted.
 */

const memgraphService = require('../memgraph.service');

class GraphAnalyzer {
  constructor(opts = {}) {
    this.driver = memgraphService.driver;
    this._service = memgraphService;
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Returns node count, edge count and derived density.
   * On AGE backend: uses direct SQL (bypasses Cypher full-table-scan).
   * On Memgraph: uses Cypher count queries.
   * Hub/component/bridge metrics are zeroed.
   */
  async analyze(namespace, opts = {}) {
    const start = Date.now();

    // AGE fast path: direct SQL avoids Cypher's union-scan of all vertex tables
    if (typeof this._service.countNodesByNamespace === 'function') {
      const [nodeCount, edgeCount] = await Promise.all([
        this._service.countNodesByNamespace(namespace),
        this._service.countEdgesByNamespace(namespace),
      ]);
      const maxPossible = nodeCount * (nodeCount - 1);
      const density = maxPossible > 0 ? edgeCount / maxPossible : 0;
      return {
        nodeCount,
        edgeCount,
        density: +density.toFixed(4),
        degreeDistribution: [],
        avgDegree: nodeCount > 0 ? +(edgeCount * 2 / nodeCount).toFixed(2) : 0,
        maxDegree: 0,
        hubNodes: [],
        connectedComponents: { count: 1, sizes: [nodeCount], largestComponentRatio: 1 },
        bridgeEdges: [],
        orphanNodes: [],
        avgClusteringCoefficient: 0,
        namespace,
        analyzedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    }

    // Memgraph / standard Cypher path
    const session = this._session();
    try {
      const [nodeRes, edgeRes] = await Promise.all([
        session.run(
          `MATCH (n) WHERE n.namespace = $ns RETURN count(n) AS nodeCount`,
          { ns: namespace }
        ),
        session.run(
          `MATCH (a) WHERE a.namespace = $ns
           MATCH (a)-[rel]->(b) WHERE b.namespace = $ns
           RETURN count(rel) AS edgeCount`,
          { ns: namespace }
        ),
      ]);

      const nodeCount = _num(nodeRes.records[0]?.get('nodeCount'));
      const edgeCount = _num(edgeRes.records[0]?.get('edgeCount'));
      const maxPossible = nodeCount * (nodeCount - 1);
      const density = maxPossible > 0 ? edgeCount / maxPossible : 0;

      return {
        nodeCount,
        edgeCount,
        density: +density.toFixed(4),
        degreeDistribution: [],
        avgDegree: nodeCount > 0 ? +(edgeCount * 2 / nodeCount).toFixed(2) : 0,
        maxDegree: 0,
        hubNodes: [],
        connectedComponents: { count: 1, sizes: [nodeCount], largestComponentRatio: 1 },
        bridgeEdges: [],
        orphanNodes: [],
        avgClusteringCoefficient: 0,
        namespace,
        analyzedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      };
    } finally {
      await session.close();
    }
  }
}

function _num(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') return v.toNumber();
  return Number(v) || 0;
}

module.exports = { GraphAnalyzer };
