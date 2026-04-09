/**
 * SubgraphAdapter — bridges subgraph consolidation operations
 * to the ImmutableGraph versioning model.
 *
 * Creates ConsolidationCheckpoint nodes in Memgraph following
 * the ImmutableGraph data patterns (bi-temporal, audit trail).
 *
 * NOTE: Currently writes directly to Memgraph since
 * ImmutableGraphService is not yet wired into the application.
 * When wired up, this adapter can delegate to ImmutableGraphService
 * for full hash chain and temporal query support.
 *
 * Transaction pattern: Application-level Saga with compensating actions.
 */

import { v4 as uuidv4 } from 'uuid';

// We use the shared Memgraph driver directly
// eslint-disable-next-line @typescript-eslint/no-var-requires
const memgraphService = require('../../memgraph.service');

// ── Types ──────────────────────────────────────────────

export interface ConsolidationTransaction {
  transactionId: string;
  checkpointId: string;
  subgraphId: string;
  namespace: string;
  status: 'PENDING' | 'COMMITTED' | 'ROLLED_BACK';
  startedAt: string;  // ISO datetime

  /** Edge snapshots for rollback */
  internalEdges: EdgeSnapshot[];
  /** IDs of nodes that were archived */
  archivedNodeIds: string[];
}

export interface EdgeSnapshot {
  sourceId: string;
  targetId: string;
  relType: string;
  properties: Record<string, unknown>;
}

export interface ConsolidationResult {
  subgraphId: string;
  status: string;
  removedEdges: number;
  rewiredEdges: number;
  rewiredOut: number;
  rewiredIn: number;
  archivedNodes: number;
  checkpointId: string;
  transactionId: string;
}

export interface RollbackResult {
  subgraphId: string;
  restoredEdges: number;
  restoredNodes: number;
  checkpointId: string;
}

// Infrastructure edge types to exclude from snapshots/operations
const INFRA_EDGE_TYPES = [
  'CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO',
  'CONNECTS_INTERNAL', 'SUBGRAPH_LINK',
];

// ── SubgraphAdapter ────────────────────────────────────

export class SubgraphAdapter {
  private driver: any;

  constructor() {
    this.driver = memgraphService.driver;
  }

  private _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Begin a consolidation transaction:
   * 1. Snapshot all internal edges
   * 2. Create ConsolidationCheckpoint node
   * 3. Return transaction handle for commit/rollback
   */
  async beginConsolidation(
    subgraphId: string,
    namespace: string,
    clusterNodeIds: string[],
  ): Promise<ConsolidationTransaction> {
    const session = this._session();
    const transactionId = `tx-${uuidv4().slice(0, 8)}`;
    const checkpointId = `checkpoint-${subgraphId}-${uuidv4().slice(0, 8)}`;

    try {
      // ── 1. Snapshot internal edges ─────────────────────
      const edgeRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND b.id IN $ids
          AND a.namespace = $ns AND b.namespace = $ns
          AND NOT type(r) IN $infraTypes
        RETURN a.id AS src, b.id AS tgt, type(r) AS relType,
               properties(r) AS props
      `, { ids: clusterNodeIds, ns: namespace, infraTypes: INFRA_EDGE_TYPES });

      const internalEdges: EdgeSnapshot[] = edgeRes.records.map((rec: any) => ({
        sourceId: rec.get('src'),
        targetId: rec.get('tgt'),
        relType: rec.get('relType'),
        properties: rec.get('props') || {},
      }));

      // ── 2. Create checkpoint node ──────────────────────
      await session.run(`
        CREATE (cp:ConsolidationCheckpoint:MetaNode {
          id: $cpId,
          transactionId: $txId,
          subgraphId: $sgId,
          namespace: $ns,
          status: 'PENDING',
          edgeSnapshotJson: $edgeJson,
          clusterNodeIdsJson: $nodeIdsJson,
          edgeCount: $edgeCount,
          nodeCount: $nodeCount,
          changeReason: 'Subgraph consolidation checkpoint',
          changedBy: 'SubgraphAdapter',
          changeSource: 'SUBGRAPH_CONSOLIDATION',
          createdAt: datetime()
        })
      `, {
        cpId: checkpointId,
        txId: transactionId,
        sgId: subgraphId,
        ns: namespace,
        edgeJson: JSON.stringify(internalEdges),
        nodeIdsJson: JSON.stringify(clusterNodeIds),
        edgeCount: internalEdges.length,
        nodeCount: clusterNodeIds.length,
      });

      const transaction: ConsolidationTransaction = {
        transactionId,
        checkpointId,
        subgraphId,
        namespace,
        status: 'PENDING',
        startedAt: new Date().toISOString(),
        internalEdges,
        archivedNodeIds: [],
      };

      console.log(`[SubgraphAdapter] Checkpoint created: ${checkpointId} — ${internalEdges.length} edges snapshotted`);
      return transaction;
    } finally {
      await session.close();
    }
  }

  /**
   * Commit the consolidation transaction:
   * 1. Delete internal edges (already snapshotted)
   * 2. Rewire boundary edges to SubGraph
   * 3. Archive member nodes
   * 4. Update SubGraph and checkpoint status
   */
  async commitConsolidation(tx: ConsolidationTransaction): Promise<ConsolidationResult> {
    if (tx.status !== 'PENDING') {
      throw new Error(`Cannot commit transaction in status "${tx.status}"`);
    }

    const session = this._session();
    const clusterNodeIds = JSON.parse(
      (await this._getCheckpointProp(session, tx.checkpointId, 'clusterNodeIdsJson')) || '[]'
    );

    try {
      // ── 1. Delete internal-only edges ──────────────────
      const delRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND b.id IN $ids
          AND a.namespace = $ns AND b.namespace = $ns
          AND NOT type(r) IN $infraTypes
        DELETE r
        RETURN count(r) AS removed
      `, { ids: clusterNodeIds, ns: tx.namespace, infraTypes: INFRA_EDGE_TYPES });
      const removedEdges = _num(delRes.records[0]?.get('removed'));

      // ── 2. Rewire outgoing boundary edges ──────────────
      const rewireOutRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND a.namespace = $ns
          AND NOT b.id IN $ids AND b.namespace = $ns
          AND NOT type(r) IN $infraTypes
        WITH a, r, b, type(r) AS rType
        MATCH (sg:SubGraph {id: $sgId})
        CREATE (sg)-[:SUBGRAPH_LINK {originalType: rType, direction: 'OUT', originalSourceId: a.id}]->(b)
        DELETE r
        RETURN count(r) AS rewired
      `, { ids: clusterNodeIds, ns: tx.namespace, sgId: tx.subgraphId, infraTypes: INFRA_EDGE_TYPES });
      const rewiredOut = _num(rewireOutRes.records[0]?.get('rewired'));

      // ── 3. Rewire incoming boundary edges ──────────────
      const rewireInRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE b.id IN $ids AND b.namespace = $ns
          AND NOT a.id IN $ids AND a.namespace = $ns
          AND NOT type(r) IN $infraTypes
        WITH a, r, b, type(r) AS rType
        MATCH (sg:SubGraph {id: $sgId})
        CREATE (a)-[:SUBGRAPH_LINK {originalType: rType, direction: 'IN', originalTargetId: b.id}]->(sg)
        DELETE r
        RETURN count(r) AS rewired
      `, { ids: clusterNodeIds, ns: tx.namespace, sgId: tx.subgraphId, infraTypes: INFRA_EDGE_TYPES });
      const rewiredIn = _num(rewireInRes.records[0]?.get('rewired'));

      // ── 4. Archive member nodes ────────────────────────
      const archiveRes = await session.run(`
        MATCH (n) WHERE n.id IN $ids AND n.namespace = $ns
        SET n.status = 'archived',
            n.archivedAt = datetime(),
            n.archivedBy = $sgId
        RETURN count(n) AS archived
      `, { ids: clusterNodeIds, ns: tx.namespace, sgId: tx.subgraphId });
      const archivedNodes = _num(archiveRes.records[0]?.get('archived'));

      tx.archivedNodeIds = clusterNodeIds;

      // ── 5. Update SubGraph status ──────────────────────
      await session.run(`
        MATCH (sg:SubGraph {id: $sgId})
        SET sg.status = 'consolidated',
            sg.consolidatedAt = datetime(),
            sg.checkpointId = $cpId,
            sg.transactionId = $txId,
            sg.rewiredEdgeCount = $rewired,
            sg.removedInternalEdgeCount = $removed
      `, {
        sgId: tx.subgraphId,
        cpId: tx.checkpointId,
        txId: tx.transactionId,
        rewired: rewiredOut + rewiredIn,
        removed: removedEdges,
      });

      // ── 6. Update checkpoint status ────────────────────
      await session.run(`
        MATCH (cp:ConsolidationCheckpoint {id: $cpId})
        SET cp.status = 'COMMITTED',
            cp.committedAt = datetime(),
            cp.removedEdges = $removed,
            cp.rewiredEdges = $rewired,
            cp.archivedNodes = $archived
      `, {
        cpId: tx.checkpointId,
        removed: removedEdges,
        rewired: rewiredOut + rewiredIn,
        archived: archivedNodes,
      });

      tx.status = 'COMMITTED';

      console.log(`[SubgraphAdapter] Committed: ${tx.transactionId} — removed=${removedEdges}, rewired=${rewiredOut + rewiredIn}, archived=${archivedNodes}`);

      return {
        subgraphId: tx.subgraphId,
        status: 'consolidated',
        removedEdges,
        rewiredEdges: rewiredOut + rewiredIn,
        rewiredOut,
        rewiredIn,
        archivedNodes,
        checkpointId: tx.checkpointId,
        transactionId: tx.transactionId,
      };
    } catch (error) {
      // Auto-rollback on error
      console.error(`[SubgraphAdapter] Commit failed, rolling back: ${(error as Error).message}`);
      await this.rollbackConsolidation(tx);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Rollback a consolidation transaction:
   * 1. Restore internal edges from snapshot
   * 2. Unarchive member nodes
   * 3. Remove SUBGRAPH_LINK edges
   * 4. Reset SubGraph status
   * 5. Update checkpoint status
   */
  async rollbackConsolidation(tx: ConsolidationTransaction): Promise<RollbackResult> {
    const session = this._session();

    try {
      // ── 1. Restore internal edges from snapshot ────────
      let restoredEdges = 0;
      for (const edge of tx.internalEdges) {
        try {
          // Create edge back using Cypher (dynamic rel type)
          const relType = edge.relType.replace(/[^a-zA-Z0-9_]/g, '_');
          await session.run(`
            MATCH (a {id: $src, namespace: $ns})
            MATCH (b {id: $tgt, namespace: $ns})
            CREATE (a)-[:${relType}]->(b)
          `, { src: edge.sourceId, tgt: edge.targetId, ns: tx.namespace });
          restoredEdges++;
        } catch (e) {
          console.warn(`[SubgraphAdapter] Failed to restore edge ${edge.sourceId}->${edge.targetId}: ${(e as Error).message}`);
        }
      }

      // ── 2. Unarchive member nodes ──────────────────────
      let restoredNodes = 0;
      if (tx.archivedNodeIds.length > 0) {
        const restoreRes = await session.run(`
          MATCH (n) WHERE n.id IN $ids AND n.namespace = $ns
            AND n.status = 'archived'
          REMOVE n.status, n.archivedAt, n.archivedBy
          RETURN count(n) AS restored
        `, { ids: tx.archivedNodeIds, ns: tx.namespace });
        restoredNodes = _num(restoreRes.records[0]?.get('restored'));
      }

      // ── 3. Remove SUBGRAPH_LINK edges ──────────────────
      await session.run(`
        MATCH (sg:SubGraph {id: $sgId})-[r:SUBGRAPH_LINK]-()
        DELETE r
      `, { sgId: tx.subgraphId });

      // ── 4. Reset SubGraph status ───────────────────────
      await session.run(`
        MATCH (sg:SubGraph {id: $sgId})
        SET sg.status = 'extracted',
            sg.consolidatedAt = null
      `, { sgId: tx.subgraphId });

      // ── 5. Update checkpoint status ────────────────────
      await session.run(`
        MATCH (cp:ConsolidationCheckpoint {id: $cpId})
        SET cp.status = 'ROLLED_BACK',
            cp.rolledBackAt = datetime(),
            cp.restoredEdges = $restoredEdges,
            cp.restoredNodes = $restoredNodes
      `, {
        cpId: tx.checkpointId,
        restoredEdges,
        restoredNodes,
      });

      tx.status = 'ROLLED_BACK';

      console.log(`[SubgraphAdapter] Rolled back: ${tx.transactionId} — restored ${restoredEdges} edges, ${restoredNodes} nodes`);

      return {
        subgraphId: tx.subgraphId,
        restoredEdges,
        restoredNodes,
        checkpointId: tx.checkpointId,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Rollback from a checkpoint ID (for recovery scenarios).
   * Reads transaction data from the checkpoint node.
   */
  async rollbackFromCheckpoint(checkpointId: string): Promise<RollbackResult> {
    const session = this._session();

    try {
      // Read checkpoint
      const cpRes = await session.run(`
        MATCH (cp:ConsolidationCheckpoint {id: $cpId})
        RETURN cp.transactionId AS txId, cp.subgraphId AS sgId,
               cp.namespace AS ns, cp.status AS status,
               cp.edgeSnapshotJson AS edgeJson,
               cp.clusterNodeIdsJson AS nodeIdsJson
      `, { cpId: checkpointId });

      if (cpRes.records.length === 0) {
        throw new Error(`Checkpoint ${checkpointId} not found`);
      }

      const rec = cpRes.records[0];
      const status = rec.get('status');

      if (status === 'ROLLED_BACK') {
        throw new Error(`Checkpoint ${checkpointId} already rolled back`);
      }

      const tx: ConsolidationTransaction = {
        transactionId: rec.get('txId'),
        checkpointId,
        subgraphId: rec.get('sgId'),
        namespace: rec.get('ns'),
        status: 'COMMITTED', // treat as committed for rollback
        startedAt: '',
        internalEdges: JSON.parse(rec.get('edgeJson') || '[]'),
        archivedNodeIds: JSON.parse(rec.get('nodeIdsJson') || '[]'),
      };

      return this.rollbackConsolidation(tx);
    } finally {
      await session.close();
    }
  }

  /**
   * List all checkpoints for a namespace.
   */
  async listCheckpoints(namespace: string): Promise<Array<{
    id: string; subgraphId: string; status: string; edgeCount: number;
  }>> {
    const session = this._session();
    try {
      const res = await session.run(`
        MATCH (cp:ConsolidationCheckpoint {namespace: $ns})
        RETURN cp.id AS id, cp.subgraphId AS sgId, cp.status AS status,
               cp.edgeCount AS edgeCount
        ORDER BY cp.createdAt DESC
      `, { ns: namespace });

      return res.records.map((r: any) => ({
        id: r.get('id'),
        subgraphId: r.get('sgId'),
        status: r.get('status'),
        edgeCount: _num(r.get('edgeCount')),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Recover any PENDING transactions (call at startup).
   */
  async recoverPendingTransactions(): Promise<number> {
    const session = this._session();
    try {
      const res = await session.run(`
        MATCH (cp:ConsolidationCheckpoint {status: 'PENDING'})
        RETURN cp.id AS cpId
      `);

      let recovered = 0;
      for (const rec of res.records) {
        const cpId = rec.get('cpId');
        console.warn(`[SubgraphAdapter] Recovering pending checkpoint: ${cpId}`);
        try {
          await this.rollbackFromCheckpoint(cpId);
          recovered++;
        } catch (e) {
          console.error(`[SubgraphAdapter] Recovery failed for ${cpId}: ${(e as Error).message}`);
        }
      }

      if (recovered > 0) {
        console.log(`[SubgraphAdapter] Recovered ${recovered} pending transactions`);
      }
      return recovered;
    } finally {
      await session.close();
    }
  }

  // ── Private helpers ────────────────────────────────────

  private async _getCheckpointProp(session: any, cpId: string, prop: string): Promise<string> {
    const res = await session.run(`
      MATCH (cp:ConsolidationCheckpoint {id: $cpId})
      RETURN cp.${prop} AS val
    `, { cpId });
    return res.records[0]?.get('val') || '';
  }
}

function _num(v: any): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') return v.toNumber();
  return Number(v) || 0;
}
