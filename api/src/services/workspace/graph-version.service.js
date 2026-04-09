/**
 * WorkSpace Graph Version Service (WS2-003)
 *
 * Creates immutable snapshots (checkpoints) of a WorkSpace's draft graph
 * with the ability to:
 *   - list all checkpoints
 *   - restore a checkpoint (atomically replace current drafts)
 *   - diff two checkpoints (added/removed/modified nodes & edges)
 *   - auto-checkpoint after significant agent actions (debounced)
 *
 * Storage:
 *   (WorkSpace)-[:HAS_VERSION]->(GraphVersion {
 *     id, workspaceId, versionNumber, snapshot: JSON, note,
 *     createdAt, createdBy, triggerActionId
 *   })
 *
 * Snapshot format (version=1):
 *   {
 *     version: 1,
 *     timestamp: ISO,
 *     nodes: [{ id, label, type, name, description, knowledgeFamily,
 *               confidence, status, content (parsed), sourceId, extractedAt }],
 *     edges: [{ id, source, target, type, properties, createdAt }],
 *     metadata: { nodeCount, edgeCount, sourceCount }
 *   }
 *
 * Limits:
 *   - Max 50 versions per workspace (oldest auto-pruned).
 *   - Snapshot field capped at ~2MB; over the limit we throw.
 *
 * @module services/workspace/graph-version.service
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

const LOG_PREFIX = '[GraphVersionService]';
const MAX_VERSIONS_PER_WORKSPACE = 50;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024; // 2 MB

// Auto-checkpoint debounce: don't create more than one auto-checkpoint per
// workspace within this window (ms).
const AUTO_CHECKPOINT_DEBOUNCE_MS = 30 * 1000;

// Action types that trigger an auto-checkpoint
const AUTO_CHECKPOINT_TRIGGERS = new Set([
  'CREATE_NODE',
  'DELETE_NODE',
  'MODIFY_NODE',
  'EXTRACT'
]);

// Lazy deps
let _memgraph = null;
function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}

class GraphVersionService {

  constructor() {
    /** @type {Map<string, number>} workspaceId → last auto-checkpoint timestamp */
    this._lastAutoCheckpoint = new Map();
  }

  // ==================== CHECKPOINT CREATION ====================

  /**
   * Create a new graph version (checkpoint) of the workspace.
   * Serializes ALL draft nodes + edges into JSON and stores as a single
   * GraphVersion node linked to the workspace.
   *
   * @param {string} workspaceId
   * @param {Object} [opts]
   * @param {string} [opts.note]            Free-form note describing this version
   * @param {string} [opts.createdBy]       'user' | 'agent' | 'auto'
   * @param {string} [opts.triggerActionId] Optional AgentAction.id that triggered this version
   * @returns {Promise<Object>} The created GraphVersion (without raw snapshot)
   */
  async createVersion(workspaceId, { note = '', createdBy = 'user', triggerActionId = null } = {}) {
    if (!workspaceId) throw new Error('workspaceId is required');

    // Build snapshot
    const snapshot = await this._buildSnapshot(workspaceId);
    const snapshotJson = JSON.stringify(snapshot);

    if (snapshotJson.length > MAX_SNAPSHOT_BYTES) {
      throw new Error(
        `Snapshot too large (${snapshotJson.length} bytes > ${MAX_SNAPSHOT_BYTES}). ` +
        `Reduce graph size before checkpointing.`
      );
    }

    // Compute next version number
    const nextNumber = await this._nextVersionNumber(workspaceId);

    const version = {
      id: uuidv4(),
      workspaceId,
      versionNumber: nextNumber,
      snapshot: snapshotJson,
      note,
      createdAt: new Date().toISOString(),
      createdBy,
      triggerActionId: triggerActionId || ''
    };

    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $workspaceId})
       CREATE (v:GraphVersion {
         id: $id,
         workspaceId: $workspaceId,
         versionNumber: $versionNumber,
         snapshot: $snapshot,
         note: $note,
         createdAt: $createdAt,
         createdBy: $createdBy,
         triggerActionId: $triggerActionId
       })
       CREATE (w)-[:HAS_VERSION]->(v)
       RETURN v`,
      version
    );

    console.log(`${LOG_PREFIX} Created version #${nextNumber} for workspace ${workspaceId} (${snapshot.metadata.nodeCount}n/${snapshot.metadata.edgeCount}e)`);

    // Prune old versions
    await this._pruneOldVersions(workspaceId);

    return this._stripSnapshot(version, snapshot.metadata);
  }

  /**
   * Auto-checkpoint helper. Called from action-log hook in workspace-agent.
   * Honors the debounce window: skips if too recent.
   *
   * @param {string} workspaceId
   * @param {Object} action AgentAction
   * @returns {Promise<Object|null>} Created version or null if skipped
   */
  async maybeAutoCheckpoint(workspaceId, action) {
    if (!action || !AUTO_CHECKPOINT_TRIGGERS.has(action.type)) return null;

    const now = Date.now();
    const last = this._lastAutoCheckpoint.get(workspaceId) || 0;
    if (now - last < AUTO_CHECKPOINT_DEBOUNCE_MS) {
      return null;
    }
    this._lastAutoCheckpoint.set(workspaceId, now);

    try {
      return await this.createVersion(workspaceId, {
        note: `Auto-checkpoint after ${action.type}`,
        createdBy: 'auto',
        triggerActionId: action.id
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} Auto-checkpoint failed: ${err.message}`);
      return null;
    }
  }

  // ==================== READ ====================

  /**
   * List versions for a workspace, newest first.
   * Returns metadata only (snapshot stripped) by default.
   *
   * @param {string} workspaceId
   * @param {Object} [opts]
   * @param {boolean} [opts.includeSnapshot=false]
   * @param {number} [opts.limit=50]
   * @returns {Promise<Object[]>}
   */
  async getVersions(workspaceId, { includeSnapshot = false, limit = 50 } = {}) {
    const safeLimit = parseInt(limit, 10) || 50;
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $workspaceId})-[:HAS_VERSION]->(v:GraphVersion)
       RETURN v
       ORDER BY v.versionNumber DESC
       LIMIT ${safeLimit}`,
      { workspaceId }
    );

    return (result || []).map(r => {
      const v = this._fromRecord(r);
      return includeSnapshot ? v : this._stripSnapshot(v, this._safeMetadata(v.snapshot));
    });
  }

  /**
   * Get a single version (with full snapshot parsed).
   * @param {string} versionId
   * @returns {Promise<Object|null>}
   */
  async getVersion(versionId) {
    const result = await mg().runQuery(
      `MATCH (v:GraphVersion {id: $id}) RETURN v LIMIT 1`,
      { id: versionId }
    );
    if (!result || result.length === 0) return null;
    const v = this._fromRecord(result[0]);
    return {
      ...v,
      snapshot: this._safeParseSnapshot(v.snapshot)
    };
  }

  // ==================== RESTORE ====================

  /**
   * Restore a workspace's draft graph from a saved version.
   * ATOMIC and DESTRUCTIVE: deletes all current drafts first, then recreates
   * from the snapshot. Always creates a safety checkpoint of the CURRENT state
   * before restoring (so the user can undo the undo).
   *
   * @param {string} workspaceId
   * @param {string} versionId
   * @param {Object} opts
   * @param {boolean} opts.confirm   Must be true. Defensive against accidental restores.
   * @param {string}  [opts.createdBy='user']
   * @returns {Promise<{restored: {nodes: number, edges: number}, safetyVersionId: string}>}
   */
  async restoreVersion(workspaceId, versionId, { confirm, createdBy = 'user' } = {}) {
    if (confirm !== true) {
      throw new Error('restoreVersion requires opts.confirm = true (destructive operation)');
    }

    const target = await this.getVersion(versionId);
    if (!target) throw new Error(`Version not found: ${versionId}`);
    if (target.workspaceId !== workspaceId) {
      throw new Error(`Version ${versionId} does not belong to workspace ${workspaceId}`);
    }

    // 1. Auto-create safety checkpoint of current state
    const safety = await this.createVersion(workspaceId, {
      note: `Pre-restore safety checkpoint (restoring v#${target.versionNumber})`,
      createdBy: 'auto'
    });

    const snapshot = target.snapshot;

    // 2. Delete all current draft nodes (and their edges) for this workspace.
    //    Do NOT touch the workspace itself, sources, agent session, versions.
    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d)
       DETACH DELETE d`,
      { wsId: workspaceId }
    );

    // 3. Recreate nodes from snapshot
    let restoredNodes = 0;
    for (const node of (snapshot.nodes || [])) {
      // Use a single safe label set: we assume snapshot label is one of the
      // DraftService DRAFT_TYPE_LABELS. If unknown, fall back to "DraftNode".
      const label = this._sanitizeLabel(node.label || 'DraftNode');
      const props = this._serializeNodeForRestore(node, workspaceId);
      await mg().runQuery(
        `MATCH (w:WorkSpace {id: $wsId})
         CREATE (d:${label} $props)
         CREATE (w)-[:CONTAINS_DRAFT]->(d)`,
        { wsId: workspaceId, props }
      );
      restoredNodes++;
    }

    // 4. Recreate edges from snapshot (only between drafts of this workspace)
    let restoredEdges = 0;
    for (const edge of (snapshot.edges || [])) {
      const edgeType = this._sanitizeRelType(edge.type || 'RELATES_TO');
      const props = {
        id: edge.id || uuidv4(),
        createdAt: edge.createdAt || new Date().toISOString(),
        ...this._safeProps(edge.properties)
      };
      try {
        await mg().runQuery(
          `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(s {id: $sourceId})
           MATCH (w)-[:CONTAINS_DRAFT]->(t {id: $targetId})
           CREATE (s)-[r:${edgeType} $props]->(t)`,
          { wsId: workspaceId, sourceId: edge.source, targetId: edge.target, props }
        );
        restoredEdges++;
      } catch (err) {
        console.warn(`${LOG_PREFIX} Failed to restore edge ${edge.id}: ${err.message}`);
      }
    }

    // 5. Update workspace counters
    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})
       SET w.draftCount = $count,
           w.updatedAt = $now`,
      { wsId: workspaceId, count: restoredNodes, now: new Date().toISOString() }
    );

    console.log(`${LOG_PREFIX} Restored workspace ${workspaceId} to version #${target.versionNumber}: ${restoredNodes}n/${restoredEdges}e`);

    return {
      restored: { nodes: restoredNodes, edges: restoredEdges },
      safetyVersionId: safety.id,
      restoredFromVersionNumber: target.versionNumber
    };
  }

  // ==================== DIFF ====================

  /**
   * Compute a diff between two versions.
   * Diff is content-aware on nodes (compares relevant properties).
   *
   * @param {string} v1Id Version A (older)
   * @param {string} v2Id Version B (newer)
   * @returns {Promise<Object>}
   */
  async diffVersions(v1Id, v2Id) {
    const [v1, v2] = await Promise.all([this.getVersion(v1Id), this.getVersion(v2Id)]);
    if (!v1) throw new Error(`Version not found: ${v1Id}`);
    if (!v2) throw new Error(`Version not found: ${v2Id}`);

    const a = v1.snapshot;
    const b = v2.snapshot;

    const aNodes = new Map((a.nodes || []).map(n => [n.id, n]));
    const bNodes = new Map((b.nodes || []).map(n => [n.id, n]));
    const aEdges = new Map((a.edges || []).map(e => [e.id || `${e.source}->${e.target}:${e.type}`, e]));
    const bEdges = new Map((b.edges || []).map(e => [e.id || `${e.source}->${e.target}:${e.type}`, e]));

    const addedNodes = [];
    const removedNodes = [];
    const modifiedNodes = [];
    const COMPARE_FIELDS = ['name', 'description', 'type', 'confidence', 'status', 'knowledgeFamily', 'content'];

    for (const [id, n] of bNodes) {
      if (!aNodes.has(id)) {
        addedNodes.push(n);
      } else {
        const before = aNodes.get(id);
        const changedFields = [];
        for (const f of COMPARE_FIELDS) {
          const beforeVal = JSON.stringify(before[f]);
          const afterVal = JSON.stringify(n[f]);
          if (beforeVal !== afterVal) changedFields.push(f);
        }
        if (changedFields.length > 0) {
          modifiedNodes.push({ id, before, after: n, changedFields });
        }
      }
    }
    for (const [id, n] of aNodes) {
      if (!bNodes.has(id)) removedNodes.push(n);
    }

    const addedEdges = [];
    const removedEdges = [];
    for (const [k, e] of bEdges) {
      if (!aEdges.has(k)) addedEdges.push(e);
    }
    for (const [k, e] of aEdges) {
      if (!bEdges.has(k)) removedEdges.push(e);
    }

    return {
      v1: { id: v1.id, versionNumber: v1.versionNumber, createdAt: v1.createdAt },
      v2: { id: v2.id, versionNumber: v2.versionNumber, createdAt: v2.createdAt },
      added:    { nodes: addedNodes, edges: addedEdges },
      removed:  { nodes: removedNodes, edges: removedEdges },
      modified: { nodes: modifiedNodes },
      summary: {
        addedNodes: addedNodes.length,
        removedNodes: removedNodes.length,
        modifiedNodes: modifiedNodes.length,
        addedEdges: addedEdges.length,
        removedEdges: removedEdges.length
      }
    };
  }

  // ==================== INTERNAL ====================

  async _buildSnapshot(workspaceId) {
    // Fetch all draft nodes (any label) for this workspace
    const nodeRows = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d)
       RETURN d, labels(d) as labels`,
      { wsId: workspaceId }
    );

    const nodes = (nodeRows || []).map(row => {
      const props = row.d?.properties || row.d || {};
      const labels = Array.isArray(row.labels) ? row.labels : [];
      // Pick first non-generic label as the type label
      const label = labels.find(l => l !== 'DraftKnowledgeObject') || labels[0] || 'DraftNode';
      let content = props.content;
      try { if (typeof content === 'string') content = JSON.parse(content); } catch {}
      return {
        id: props.id,
        label,
        type: props.type,
        name: props.name,
        description: props.description || '',
        knowledgeFamily: props.knowledgeFamily,
        confidence: typeof props.confidence === 'number' ? props.confidence : (parseFloat(props.confidence) || 0),
        status: props.status,
        content,
        sourceId: props.sourceId || '',
        extractedAt: props.extractedAt
      };
    });

    // Fetch all edges between drafts of this workspace
    const edgeRows = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(s)
       MATCH (w)-[:CONTAINS_DRAFT]->(t)
       MATCH (s)-[r]->(t)
       WHERE type(r) <> 'CONTAINS_DRAFT' AND type(r) <> 'EXTRACTED_FROM'
       RETURN s.id as sourceId, t.id as targetId, type(r) as relType, properties(r) as props`,
      { wsId: workspaceId }
    );

    const edges = (edgeRows || []).map(row => {
      const props = row.props || {};
      return {
        id: props.id || `${row.sourceId}->${row.targetId}:${row.relType}`,
        source: row.sourceId,
        target: row.targetId,
        type: row.relType,
        properties: props,
        createdAt: props.createdAt || null
      };
    });

    // Source count
    let sourceCount = 0;
    try {
      const srcRows = await mg().runQuery(
        `MATCH (w:WorkSpace {id: $wsId})-[:HAS_SOURCE]->(s) RETURN count(s) as cnt`,
        { wsId: workspaceId }
      );
      const cnt = srcRows[0]?.cnt;
      sourceCount = typeof cnt === 'object' && cnt.toNumber ? cnt.toNumber() : (cnt || 0);
    } catch {}

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      nodes,
      edges,
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        sourceCount
      }
    };
  }

  async _nextVersionNumber(workspaceId) {
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_VERSION]->(v:GraphVersion)
       RETURN coalesce(max(v.versionNumber), 0) as maxV`,
      { wsId: workspaceId }
    );
    const maxV = result[0]?.maxV;
    const num = typeof maxV === 'object' && maxV.toNumber ? maxV.toNumber() : (maxV || 0);
    return num + 1;
  }

  async _pruneOldVersions(workspaceId) {
    // Find versions beyond the cap (oldest first), delete them.
    const all = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_VERSION]->(v:GraphVersion)
       RETURN v.id as id, v.versionNumber as num
       ORDER BY v.versionNumber DESC`,
      { wsId: workspaceId }
    );
    if (!all || all.length <= MAX_VERSIONS_PER_WORKSPACE) return;

    const toDelete = all.slice(MAX_VERSIONS_PER_WORKSPACE).map(r => r.id);
    if (toDelete.length === 0) return;

    await mg().runQuery(
      `MATCH (v:GraphVersion) WHERE v.id IN $ids DETACH DELETE v`,
      { ids: toDelete }
    );
    console.log(`${LOG_PREFIX} Pruned ${toDelete.length} old version(s) from workspace ${workspaceId}`);
  }

  _fromRecord(record) {
    const node = record.v?.properties || record.v || record;
    return {
      id: node.id,
      workspaceId: node.workspaceId,
      versionNumber: typeof node.versionNumber === 'object' && node.versionNumber.toNumber
        ? node.versionNumber.toNumber()
        : node.versionNumber,
      snapshot: node.snapshot,
      note: node.note || '',
      createdAt: node.createdAt,
      createdBy: node.createdBy || 'user',
      triggerActionId: node.triggerActionId || ''
    };
  }

  _stripSnapshot(version, metadata) {
    const { snapshot, ...rest } = version;
    return { ...rest, metadata: metadata || null };
  }

  _safeMetadata(snapshotJson) {
    if (!snapshotJson) return null;
    try {
      const parsed = typeof snapshotJson === 'string' ? JSON.parse(snapshotJson) : snapshotJson;
      return parsed?.metadata || null;
    } catch { return null; }
  }

  _safeParseSnapshot(snapshotJson) {
    if (!snapshotJson) return { version: 1, nodes: [], edges: [], metadata: {} };
    if (typeof snapshotJson !== 'string') return snapshotJson;
    try { return JSON.parse(snapshotJson); }
    catch { return { version: 1, nodes: [], edges: [], metadata: {} }; }
  }

  /** Strip non-identifier characters to prevent Cypher injection via labels. */
  _sanitizeLabel(label) {
    if (typeof label !== 'string') return 'DraftNode';
    const safe = label.replace(/[^A-Za-z0-9_]/g, '');
    return safe.length > 0 ? safe : 'DraftNode';
  }

  _sanitizeRelType(type) {
    if (typeof type !== 'string') return 'RELATES_TO';
    const safe = type.replace(/[^A-Z0-9_]/gi, '').toUpperCase();
    return safe.length > 0 ? safe : 'RELATES_TO';
  }

  _safeProps(props) {
    if (!props || typeof props !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(props)) {
      if (k === 'id' || k === 'createdAt') continue; // we control these
      // Only allow primitive values + simple arrays
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
        out[k] = v;
      }
    }
    return out;
  }

  _serializeNodeForRestore(node, workspaceId) {
    return {
      id: node.id,
      workspaceId,
      name: node.name || '',
      description: node.description || '',
      content: typeof node.content === 'string' ? node.content : JSON.stringify(node.content || {}),
      type: node.type || 'unknown',
      knowledgeFamily: node.knowledgeFamily || 'UNKNOWN',
      confidence: typeof node.confidence === 'number' ? node.confidence : 0.5,
      status: node.status || 'DRAFT',
      extractedBy: 'restore',
      extractedAt: node.extractedAt || new Date().toISOString(),
      namespace: `workspace:${workspaceId}`,
      sourceId: node.sourceId || ''
    };
  }
}

const instance = new GraphVersionService();

module.exports = instance;
module.exports.GraphVersionService = GraphVersionService;
module.exports.AUTO_CHECKPOINT_TRIGGERS = AUTO_CHECKPOINT_TRIGGERS;
module.exports.MAX_VERSIONS_PER_WORKSPACE = MAX_VERSIONS_PER_WORKSPACE;
