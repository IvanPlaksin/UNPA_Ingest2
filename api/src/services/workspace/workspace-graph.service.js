/**
 * WorkSpace Graph Service (WS2-004)
 *
 * Provides whole-graph read/write operations on a WorkSpace's draft graph,
 * formatted for the visual canvas (ReactFlow). Used by GET/PUT
 * /api/v1/workspaces/:id/graph.
 *
 * Format conversion:
 *   Memgraph DraftEntity / DraftEdge       ⇄    ReactFlow nodes/edges
 *
 * Save semantics (PUT):
 *   - Upsert nodes by id
 *   - Upsert edges by source+target+type
 *   - Delete nodes/edges that are missing from the payload (canvas truth)
 *   - Position is persisted on each node
 *
 * @module services/workspace/workspace-graph.service
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

const LOG_PREFIX = '[WorkspaceGraphService]';

let _memgraph = null;
let _draftService = null;
let _graphVersionService = null;

function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}
function drafts() {
  if (!_draftService) _draftService = require('./draft.service');
  return _draftService;
}
function graphVersion() {
  if (!_graphVersionService) _graphVersionService = require('./graph-version.service');
  return _graphVersionService;
}

class WorkspaceGraphService {

  /**
   * Read the workspace draft graph in ReactFlow format.
   * @param {string} workspaceId
   * @returns {Promise<{nodes: Array, edges: Array}>}
   */
  async getGraph(workspaceId) {
    if (!workspaceId) throw new Error('workspaceId is required');

    // Nodes (any draft label)
    const nodeRows = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d)
       RETURN d, labels(d) as labels`,
      { wsId: workspaceId }
    );

    const nodes = (nodeRows || []).map(row => {
      const props = row.d?.properties || row.d || {};
      const labels = Array.isArray(row.labels) ? row.labels : [];
      const label = labels.find(l => l && l !== 'DraftKnowledgeObject') || labels[0] || 'DraftNode';

      let content = {};
      try {
        content = typeof props.content === 'string' ? JSON.parse(props.content || '{}') : (props.content || {});
      } catch { content = {}; }

      return {
        id: props.id,
        type: 'workspaceDraft', // single React Flow node renderer; data.draftType drives appearance
        position: {
          x: typeof props.positionX === 'number' ? props.positionX : 0,
          y: typeof props.positionY === 'number' ? props.positionY : 0
        },
        data: {
          label: props.name || '(unnamed)',
          draftType: props.type,
          draftLabel: label,
          status: props.status,
          confidence: typeof props.confidence === 'number' ? props.confidence : parseFloat(props.confidence) || 0,
          knowledgeFamily: props.knowledgeFamily,
          description: props.description || '',
          properties: content,
          sourceId: props.sourceId || ''
        }
      };
    });

    // Edges between drafts of this workspace, excluding structural edges
    const edgeRows = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(s)
       MATCH (w)-[:CONTAINS_DRAFT]->(t)
       MATCH (s)-[r]->(t)
       WHERE type(r) <> 'CONTAINS_DRAFT' AND type(r) <> 'EXTRACTED_FROM'
       RETURN s.id as sourceId, t.id as targetId, type(r) as relType, properties(r) as props, id(r) as internalId`,
      { wsId: workspaceId }
    );

    const edges = (edgeRows || []).map(row => {
      const props = row.props || {};
      return {
        id: props.id || `${row.sourceId}->${row.targetId}:${row.relType}:${row.internalId}`,
        source: row.sourceId,
        target: row.targetId,
        type: 'smoothstep',
        label: row.relType,
        data: {
          relationType: row.relType,
          confidence: typeof props.confidence === 'number' ? props.confidence : parseFloat(props.confidence) || 0,
          properties: props
        }
      };
    });

    return { nodes, edges };
  }

  /**
   * Replace the workspace draft graph from a ReactFlow payload.
   * Upserts nodes/edges present in the payload, deletes the rest.
   *
   * @param {string} workspaceId
   * @param {Object} payload
   * @param {Array} payload.nodes ReactFlow nodes
   * @param {Array} payload.edges ReactFlow edges
   * @param {Object} [opts]
   * @param {boolean} [opts.createCheckpoint=false]
   * @param {string}  [opts.checkpointNote='Canvas save']
   * @param {string}  [opts.userId='canvas']
   * @returns {Promise<Object>}
   */
  async saveGraph(workspaceId, payload, opts = {}) {
    if (!workspaceId) throw new Error('workspaceId is required');
    const { nodes = [], edges = [] } = payload || {};
    const { createCheckpoint = false, checkpointNote = 'Canvas save', userId = 'canvas' } = opts;

    // 1. Snapshot current state for diffing
    const current = await this.getGraph(workspaceId);
    const currentNodeIds = new Set(current.nodes.map(n => n.id));
    const currentEdgeIds = new Set(current.edges.map(e => e.id));

    const incomingNodeIds = new Set();
    const incomingEdgeIds = new Set();

    let createdNodes = 0;
    let updatedNodes = 0;
    let createdEdges = 0;
    let deletedNodes = 0;
    let deletedEdges = 0;

    // 2. Upsert nodes
    for (const n of nodes) {
      if (!n || !n.id) continue;
      incomingNodeIds.add(n.id);
      const draftType = n.data?.draftType || 'entity';
      const position = n.position || { x: 0, y: 0 };

      if (currentNodeIds.has(n.id)) {
        // Update existing
        const updates = {
          name: n.data?.label,
          description: n.data?.description,
          confidence: n.data?.confidence,
          position
        };
        if (n.data?.properties && typeof n.data.properties === 'object') {
          updates.content = n.data.properties;
        }
        try {
          await drafts().update(workspaceId, n.id, updates);
          updatedNodes++;
        } catch (err) {
          console.warn(`${LOG_PREFIX} update node ${n.id} failed: ${err.message}`);
        }
      } else {
        // Create new — drafts.create generates its own id, so we keep id mapping
        // by writing position separately after creation.
        try {
          const created = await drafts().create(workspaceId, {
            type: draftType,
            name: n.data?.label || 'New node',
            description: n.data?.description || '',
            content: n.data?.properties || {},
            confidence: typeof n.data?.confidence === 'number' ? n.data.confidence : 0.5,
            extractedBy: userId
          });
          // Persist position on the new draft + update the incoming id mapping for edges
          await drafts().update(workspaceId, created.id, { position });
          // Replace any edge endpoints referring to the temp id
          for (const e of edges) {
            if (e.source === n.id) e.source = created.id;
            if (e.target === n.id) e.target = created.id;
          }
          createdNodes++;
          incomingNodeIds.delete(n.id);
          incomingNodeIds.add(created.id);
        } catch (err) {
          console.warn(`${LOG_PREFIX} create node ${n.id} failed: ${err.message}`);
        }
      }
    }

    // 3. Delete nodes that disappeared from canvas
    for (const id of currentNodeIds) {
      if (!incomingNodeIds.has(id)) {
        try {
          await drafts().delete(workspaceId, id);
          deletedNodes++;
        } catch (err) {
          console.warn(`${LOG_PREFIX} delete node ${id} failed: ${err.message}`);
        }
      }
    }

    // 4. Recompute edges. Strategy: rebuild edge set fully (delete-then-create)
    //    Safer than diff because edge ids are unstable across renames/moves.
    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(s)
       MATCH (w)-[:CONTAINS_DRAFT]->(t)
       MATCH (s)-[r]->(t)
       WHERE type(r) <> 'CONTAINS_DRAFT' AND type(r) <> 'EXTRACTED_FROM'
       DELETE r`,
      { wsId: workspaceId }
    );
    deletedEdges = current.edges.length;

    for (const e of edges) {
      if (!e || !e.source || !e.target) continue;
      const relType = this._sanitizeRelType(e.label || e.data?.relationType || 'RELATES_TO');
      const confidence = typeof e.data?.confidence === 'number' ? e.data.confidence : 0.8;
      const id = e.id && !e.id.includes('->') ? e.id : uuidv4();
      try {
        await mg().runQuery(
          `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(s {id: $sourceId})
           MATCH (w)-[:CONTAINS_DRAFT]->(t {id: $targetId})
           CREATE (s)-[r:${relType} {
             id: $id,
             confidence: $confidence,
             createdAt: $now
           }]->(t)`,
          {
            wsId: workspaceId,
            sourceId: e.source,
            targetId: e.target,
            id,
            confidence,
            now: new Date().toISOString()
          }
        );
        incomingEdgeIds.add(id);
        createdEdges++;
      } catch (err) {
        console.warn(`${LOG_PREFIX} create edge ${e.source}->${e.target} failed: ${err.message}`);
      }
    }

    // 5. Optional checkpoint
    let versionId = null;
    if (createCheckpoint) {
      try {
        const v = await graphVersion().createVersion(workspaceId, {
          note: checkpointNote,
          createdBy: userId
        });
        versionId = v.id;
      } catch (err) {
        console.warn(`${LOG_PREFIX} checkpoint failed: ${err.message}`);
      }
    }

    console.log(`${LOG_PREFIX} Saved graph for ${workspaceId}: +${createdNodes}/${updatedNodes}/-${deletedNodes} nodes, +${createdEdges}/-${deletedEdges} edges`);

    return {
      success: true,
      stats: {
        createdNodes,
        updatedNodes,
        deletedNodes,
        createdEdges,
        deletedEdges
      },
      versionId
    };
  }

  _sanitizeRelType(type) {
    if (typeof type !== 'string') return 'RELATES_TO';
    const safe = type.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
    return safe.length > 0 ? safe : 'RELATES_TO';
  }
}

const instance = new WorkspaceGraphService();
module.exports = instance;
module.exports.WorkspaceGraphService = WorkspaceGraphService;
