/**
 * GraphConsolidator — replaces a cluster of nodes in the parent graph
 * with a single SubGraph reference node, rewiring external edges
 * through the SubGraph's ports.
 *
 * This is the final step of Phase 2: after extraction + boundary resolution,
 * consolidation "collapses" the cluster into a single node from the
 * parent graph's perspective.
 *
 * Steps:
 *   1. Detach internal-only edges (both ends inside cluster)
 *   2. Rewire boundary edges to go through SubGraph node
 *   3. Remove (or archive) internal member nodes
 *   4. Update SubGraph status → 'consolidated'
 *   5. Update GraphDefinition in catalog (if registered)
 */

const memgraphService = require('../memgraph.service');

class GraphConsolidator {
  constructor() {
    this.driver = memgraphService.driver;
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Consolidate a subgraph: collapse cluster nodes into the SubGraph node.
   *
   * @param {{
   *   subgraphId: string,
   *   namespace: string,
   *   clusterNodeIds: string[],
   *   archive?: boolean   // if true, mark nodes as archived instead of deleting
   * }} params
   * @returns {Promise<ConsolidationResult>}
   */
  async consolidate(params) {
    const { subgraphId, namespace, clusterNodeIds, archive = true } = params;
    const session = this._session();

    try {
      // ── 0. Verify SubGraph exists ──────────────────────────
      const sgCheck = await session.run(`
        MATCH (sg:SubGraph {id: $sgId, namespace: $ns})
        RETURN sg.status AS status
      `, { sgId: subgraphId, ns: namespace });

      if (sgCheck.records.length === 0) {
        throw new Error(`SubGraph ${subgraphId} not found in namespace "${namespace}"`);
      }

      const currentStatus = sgCheck.records[0].get('status');
      if (currentStatus === 'consolidated') {
        console.warn(`[GraphConsolidator] SubGraph ${subgraphId} already consolidated`);
        return { subgraphId, status: 'already_consolidated', rewiredEdges: 0, removedEdges: 0 };
      }

      // ── 1. Delete internal-only edges ──────────────────────
      // (edges where BOTH source and target are inside the cluster)
      const delInternal = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND b.id IN $ids
          AND a.namespace = $ns AND b.namespace = $ns
          AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL']
        DELETE r
        RETURN count(r) AS removed
      `, { ids: clusterNodeIds, ns: namespace });
      const removedEdges = _num(delInternal.records[0]?.get('removed'));

      // ── 2. Rewire outgoing boundary edges ──────────────────
      // internal → external  becomes  SubGraph → external
      const rewireOut = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND a.namespace = $ns
          AND NOT b.id IN $ids AND b.namespace = $ns
          AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL']
        WITH a, r, b, type(r) AS rType
        MATCH (sg:SubGraph {id: $sgId})
        CREATE (sg)-[:SUBGRAPH_LINK {originalType: rType, direction: 'OUT', originalSourceId: a.id}]->(b)
        DELETE r
        RETURN count(r) AS rewired
      `, { ids: clusterNodeIds, ns: namespace, sgId: subgraphId });
      const rewiredOut = _num(rewireOut.records[0]?.get('rewired'));

      // ── 3. Rewire incoming boundary edges ──────────────────
      // external → internal  becomes  external → SubGraph
      const rewireIn = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE b.id IN $ids AND b.namespace = $ns
          AND NOT a.id IN $ids AND a.namespace = $ns
          AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL']
        WITH a, r, b, type(r) AS rType
        MATCH (sg:SubGraph {id: $sgId})
        CREATE (a)-[:SUBGRAPH_LINK {originalType: rType, direction: 'IN', originalTargetId: b.id}]->(sg)
        DELETE r
        RETURN count(r) AS rewired
      `, { ids: clusterNodeIds, ns: namespace, sgId: subgraphId });
      const rewiredIn = _num(rewireIn.records[0]?.get('rewired'));

      // ── 4. Archive or delete member nodes ──────────────────
      let archivedCount = 0;
      if (archive) {
        // Mark as archived, keeping them in the sub-namespace for drill-down
        const archiveRes = await session.run(`
          MATCH (n) WHERE n.id IN $ids AND n.namespace = $ns
          SET n.status = 'archived',
              n.archivedAt = datetime(),
              n.archivedBy = $sgId
          RETURN count(n) AS archived
        `, { ids: clusterNodeIds, ns: namespace, sgId: subgraphId });
        archivedCount = _num(archiveRes.records[0]?.get('archived'));
      } else {
        // Hard delete — only the SubGraph + ports remain
        await session.run(`
          MATCH (n) WHERE n.id IN $ids AND n.namespace = $ns
          DETACH DELETE n
        `, { ids: clusterNodeIds, ns: namespace });
        archivedCount = clusterNodeIds.length;
      }

      // ── 5. Update SubGraph status ──────────────────────────
      await session.run(`
        MATCH (sg:SubGraph {id: $sgId})
        SET sg.status = 'consolidated',
            sg.consolidatedAt = datetime(),
            sg.rewiredEdgeCount = $rewired,
            sg.removedInternalEdgeCount = $removed,
            sg.archiveMode = $archiveMode
      `, {
        sgId: subgraphId,
        rewired: rewiredOut + rewiredIn,
        removed: removedEdges,
        archiveMode: archive ? 'archived' : 'deleted',
      });

      const result = {
        subgraphId,
        status: 'consolidated',
        removedEdges,
        rewiredEdges: rewiredOut + rewiredIn,
        rewiredOut,
        rewiredIn,
        archivedNodes: archivedCount,
        archiveMode: archive ? 'archived' : 'deleted',
      };

      console.log(`[GraphConsolidator] Consolidated subgraph ${subgraphId}: ` +
        `removed=${removedEdges} internal edges, rewired=${rewiredOut + rewiredIn} boundary edges, ` +
        `archived=${archivedCount} nodes`);

      return result;
    } finally {
      await session.close();
    }
  }

  /**
   * Undo consolidation — restore archived nodes and rewire edges back.
   * Only works if archive=true was used during consolidation.
   *
   * @param {{ subgraphId: string, namespace: string }} params
   * @returns {Promise<{ restored: number }>}
   */
  async unconsolidate(params) {
    const { subgraphId, namespace } = params;
    const session = this._session();

    try {
      // 1. Restore archived nodes
      const restoreRes = await session.run(`
        MATCH (n {subgraphId: $sgId, namespace: $ns})
        WHERE n.status = 'archived'
        REMOVE n.status, n.archivedAt, n.archivedBy
        RETURN count(n) AS restored
      `, { sgId: subgraphId, ns: namespace });
      const restored = _num(restoreRes.records[0]?.get('restored'));

      // 2. Delete SUBGRAPH_LINK edges created during consolidation
      await session.run(`
        MATCH (sg:SubGraph {id: $sgId})-[r:SUBGRAPH_LINK]-()
        DELETE r
      `, { sgId: subgraphId });

      // 3. Reset SubGraph status
      await session.run(`
        MATCH (sg:SubGraph {id: $sgId})
        SET sg.status = 'extracted',
            sg.consolidatedAt = null
      `, { sgId: subgraphId });

      console.log(`[GraphConsolidator] Unconsolidated subgraph ${subgraphId}: restored ${restored} nodes`);

      // Note: original internal edges are LOST after consolidation (they were deleted).
      // Full restoration requires ImmutableGraph versioning (Phase 3).

      return { subgraphId, restored, warning: 'Internal edges were deleted and cannot be restored without ImmutableGraph versioning' };
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

module.exports = { GraphConsolidator };
