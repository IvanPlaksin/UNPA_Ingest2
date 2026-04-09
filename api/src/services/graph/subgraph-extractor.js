/**
 * SubGraphExtractor — creates a SubGraph node and copies cluster members
 * into a dedicated sub-namespace.
 *
 * Input:  cluster node IDs + metadata
 * Output: SubGraph node in Memgraph, internal nodes tagged with sub-namespace
 */

const { v4: uuidv4 } = require('uuid');
const memgraphService = require('../memgraph.service');

class SubGraphExtractor {
  constructor() {
    this.driver = memgraphService.driver;
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Extract a cluster into a named SubGraph.
   *
   * @param {{
   *   namespace: string,
   *   clusterNodeIds: string[],
   *   name: string,
   *   metadata?: { strategy?: string, coherenceScore?: number }
   * }} params
   * @returns {Promise<SubGraphExtractionResult>}
   */
  async extract(params) {
    const { namespace, clusterNodeIds, name, metadata = {} } = params;
    const session = this._session();
    const subgraphId = `subgraph-${uuidv4().slice(0, 8)}`;
    const subNamespace = `${namespace}:subgraph:${subgraphId}`;

    try {
      // ── 1. Verify cluster nodes exist ─────────────────────
      const verifyRes = await session.run(`
        MATCH (n) WHERE n.id IN $ids AND n.namespace = $ns
        RETURN count(n) AS found
      `, { ids: clusterNodeIds, ns: namespace });
      const found = _num(verifyRes.records[0]?.get('found'));

      if (found === 0) {
        throw new Error(`No nodes found for ids in namespace "${namespace}"`);
      }
      if (found < clusterNodeIds.length) {
        console.warn(`[SubGraphExtractor] Only ${found}/${clusterNodeIds.length} nodes found`);
      }

      // ── 2. Count internal edges (both ends inside cluster) ─
      const intEdgesRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND b.id IN $ids
          AND a.namespace = $ns AND b.namespace = $ns
        RETURN count(r) AS cnt
      `, { ids: clusterNodeIds, ns: namespace });
      const internalEdgeCount = _num(intEdgesRes.records[0]?.get('cnt'));

      // ── 3. Create SubGraph node ───────────────────────────
      await session.run(`
        CREATE (sg:SubGraph:KnowledgeQuantum {
          id: $id,
          name: $name,
          namespace: $ns,
          subNamespace: $subNs,
          nodeCount: $nodeCount,
          internalEdgeCount: $internalEdgeCount,
          strategy: $strategy,
          coherenceScore: $coherenceScore,
          status: 'extracted',
          createdAt: datetime()
        })
      `, {
        id: subgraphId,
        name,
        ns: namespace,
        subNs: subNamespace,
        nodeCount: found,
        internalEdgeCount,
        strategy: metadata.strategy || 'unknown',
        coherenceScore: metadata.coherenceScore || 0,
      });

      // ── 4. Tag internal nodes with sub-namespace ──────────
      // We don't move them — we add the subgraphId reference
      // so they remain queryable in the parent namespace too.
      await session.run(`
        MATCH (n) WHERE n.id IN $ids AND n.namespace = $ns
        SET n.subgraphId = $sgId,
            n.subNamespace = $subNs
      `, { ids: clusterNodeIds, ns: namespace, sgId: subgraphId, subNs: subNamespace });

      // ── 5. Link SubGraph → member nodes ───────────────────
      await session.run(`
        MATCH (sg:SubGraph {id: $sgId})
        MATCH (n) WHERE n.id IN $ids AND n.namespace = $ns
        CREATE (sg)-[:CONTAINS_MEMBER]->(n)
      `, { sgId: subgraphId, ids: clusterNodeIds, ns: namespace });

      return {
        subgraph: {
          id: subgraphId,
          name,
          namespace,
          subNamespace,
          nodeCount: found,
          internalEdgeCount,
        },
        clusterNodeIds,
        metadata,
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

module.exports = { SubGraphExtractor };
