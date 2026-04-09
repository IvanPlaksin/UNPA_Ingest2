/**
 * WorkSpace Action Log Service (WS2-002)
 *
 * Logs every meaningful action the agent performs inside a WorkSpace,
 * with snapshots for potential rollback. Each action is linked to:
 *   - the WorkSpaceAgentSession that produced it
 *   - the ChatMessage that triggered it (when known)
 *
 * Storage:
 *   (WorkSpaceAgentSession)-[:HAS_ACTION]->(AgentAction)
 *   (AgentAction)-[:TRIGGERED_BY]->(WorkSpaceChatMessage)   // optional
 *
 * Action types:
 *   CREATE_NODE | MODIFY_NODE | DELETE_NODE
 *   CREATE_EDGE | DELETE_EDGE
 *   ANALYZE | EXTRACT | LINK_KB | VALIDATE
 *   BLOCKED   // tool call rejected by whitelist
 *   OTHER
 *
 * @module services/workspace/action-log.service
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

const LOG_PREFIX = '[ActionLogService]';

let _memgraph = null;
function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}

// ──────────────────────────────────────────────────────────────────
// Action type mapping
// ──────────────────────────────────────────────────────────────────

/**
 * Map an MCP tool name (already sanitized: dots → underscores)
 * to a coarse action type for the timeline UI.
 *
 * Unknown tools fall through to OTHER.
 */
function mapToolToActionType(toolName) {
  if (!toolName) return 'OTHER';
  const t = toolName.toLowerCase();

  if (/^(workspace_create_draft|workspace_create_node|graph_create_node)/.test(t)) return 'CREATE_NODE';
  if (/^(workspace_update_draft|workspace_update_node|graph_update_node)/.test(t)) return 'MODIFY_NODE';
  if (/^(workspace_delete_draft|workspace_delete_node|graph_delete_node)/.test(t)) return 'DELETE_NODE';

  if (/^(workspace_create_edge|graph_create_edge)/.test(t)) return 'CREATE_EDGE';
  if (/^(workspace_delete_edge|graph_delete_edge)/.test(t)) return 'DELETE_EDGE';

  if (/^(workspace_extract|workspace_start_extraction|extraction_)/.test(t)) return 'EXTRACT';
  if (/^(workspace_analyze|graph_analyze|analyze_)/.test(t)) return 'ANALYZE';
  if (/^(workspace_validate|graph_validate)/.test(t)) return 'VALIDATE';

  // Read-only KB / search → LINK_KB (the agent is gathering linkable context)
  if (/^(workspace_kb_|kb_search|kb_get|graph_neighbors|graph_query|graph_find_path|catalog_search|catalog_find)/.test(t)) {
    return 'LINK_KB';
  }

  return 'OTHER';
}

/**
 * Heuristic: extract IDs likely affected by this tool call from its input.
 * Look at common keys.
 */
function extractAffectedIds(input) {
  if (!input || typeof input !== 'object') return [];
  const out = [];
  const keys = ['id', 'nodeId', 'draftId', 'edgeId', 'sourceId', 'entityId'];
  for (const k of keys) {
    if (typeof input[k] === 'string') out.push(input[k]);
  }
  if (Array.isArray(input.nodeIds)) out.push(...input.nodeIds.filter(x => typeof x === 'string'));
  if (Array.isArray(input.ids)) out.push(...input.ids.filter(x => typeof x === 'string'));
  return out;
}

/**
 * Build a short human-readable description of the action.
 */
function generateDescription(toolName, input) {
  if (!toolName) return 'unknown action';
  const ids = extractAffectedIds(input);
  const idHint = ids.length > 0 ? ` [${ids.slice(0, 3).join(', ')}${ids.length > 3 ? '…' : ''}]` : '';
  return `${toolName}${idHint}`;
}

const REVERSIBLE_TYPES = new Set(['CREATE_NODE', 'CREATE_EDGE', 'MODIFY_NODE']);

// ──────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────

class ActionLogService {

  /**
   * Persist a single action.
   * @param {Object} params
   * @param {string} params.workspaceId
   * @param {string} params.sessionId
   * @param {string} params.toolName        Sanitized tool name (dots → underscores)
   * @param {Object} [params.toolInput]     Input args passed to the tool
   * @param {string} [params.type]          Override the auto-mapped type
   * @param {string} [params.description]   Override the auto-generated description
   * @param {Object} [params.snapshotBefore]
   * @param {Object} [params.snapshotAfter]
   * @param {string[]} [params.affectedNodeIds]
   * @param {string} [params.messageId]     ChatMessage that triggered this action
   * @param {string} [params.motivation]    Free-text motivation (optional)
   * @returns {Promise<Object>} The created action
   */
  async logAction(params) {
    const {
      workspaceId, sessionId,
      toolName, toolInput = {},
      type, description,
      snapshotBefore = null, snapshotAfter = null,
      affectedNodeIds, messageId = null, motivation = ''
    } = params;

    if (!workspaceId) throw new Error('workspaceId is required');
    if (!sessionId)   throw new Error('sessionId is required');

    const actionType = type || mapToolToActionType(toolName);
    const desc       = description || generateDescription(toolName, toolInput);
    const ids        = Array.isArray(affectedNodeIds) ? affectedNodeIds : extractAffectedIds(toolInput);

    const action = {
      id: uuidv4(),
      workspaceId,
      sessionId,
      type: actionType,
      toolName: toolName || '',
      toolInput: JSON.stringify(toolInput || {}),
      description: desc,
      affectedNodeIds: JSON.stringify(ids),
      motivation: motivation || '',
      reversible: REVERSIBLE_TYPES.has(actionType),
      snapshotBefore: snapshotBefore ? JSON.stringify(snapshotBefore) : '',
      snapshotAfter: snapshotAfter ? JSON.stringify(snapshotAfter) : '',
      ts: new Date().toISOString()
    };

    // Cap snapshot strings (Memgraph string limits + readability)
    const MAX_SNAPSHOT = 8000;
    if (action.snapshotBefore.length > MAX_SNAPSHOT) action.snapshotBefore = action.snapshotBefore.slice(0, MAX_SNAPSHOT) + '…';
    if (action.snapshotAfter.length  > MAX_SNAPSHOT) action.snapshotAfter  = action.snapshotAfter.slice(0, MAX_SNAPSHOT) + '…';

    const cypher = `
      MATCH (s:WorkSpaceAgentSession {id: $sessionId})
      CREATE (a:AgentAction {
        id: $id,
        workspaceId: $workspaceId,
        sessionId: $sessionId,
        type: $type,
        toolName: $toolName,
        toolInput: $toolInput,
        description: $description,
        affectedNodeIds: $affectedNodeIds,
        motivation: $motivation,
        reversible: $reversible,
        snapshotBefore: $snapshotBefore,
        snapshotAfter: $snapshotAfter,
        ts: $ts
      })
      CREATE (s)-[:HAS_ACTION]->(a)
      ${messageId ? `
        WITH a
        MATCH (m:WorkSpaceChatMessage {id: $messageId})
        CREATE (a)-[:TRIGGERED_BY]->(m)
      ` : ''}
      RETURN a
    `;

    const queryParams = { ...action };
    if (messageId) queryParams.messageId = messageId;

    await mg().runQuery(cypher, queryParams);

    return this._materialize(action);
  }

  /**
   * List actions for a workspace, newest first.
   * @param {string} workspaceId
   * @param {Object} [opts]
   * @param {number} [opts.limit=50]
   * @param {number} [opts.offset=0]
   * @param {string} [opts.type]      Filter by action type
   * @returns {Promise<{items: Object[], total: number}>}
   */
  async getActions(workspaceId, opts = {}) {
    const { limit = 50, offset = 0, type } = opts;
    const safeLimit  = parseInt(limit, 10) || 50;
    const safeOffset = parseInt(offset, 10) || 0;

    const params = { workspaceId };
    let typeFilter = '';
    if (type) {
      typeFilter = ' AND a.type = $type';
      params.type = type;
    }

    const countResult = await mg().runQuery(
      `MATCH (a:AgentAction)
       WHERE a.workspaceId = $workspaceId${typeFilter}
       RETURN count(a) as total`,
      params
    );
    const total = countResult[0]?.total || 0;

    const result = await mg().runQuery(
      `MATCH (a:AgentAction)
       WHERE a.workspaceId = $workspaceId${typeFilter}
       RETURN a
       ORDER BY a.ts DESC
       SKIP ${safeOffset} LIMIT ${safeLimit}`,
      params
    );

    const items = (result || []).map(r => this._fromRecord(r));
    return { items, total: typeof total === 'object' && total.toNumber ? total.toNumber() : total };
  }

  /**
   * Get a single action by its ID.
   */
  async getActionById(actionId) {
    const result = await mg().runQuery(
      `MATCH (a:AgentAction {id: $id}) RETURN a LIMIT 1`,
      { id: actionId }
    );
    if (!result || result.length === 0) return null;
    return this._fromRecord(result[0]);
  }

  // ──────────────────────────────────────────────────────────────
  // Internal
  // ──────────────────────────────────────────────────────────────

  _fromRecord(record) {
    const node = record.a?.properties || record.a || record;
    return this._materialize(node);
  }

  _materialize(node) {
    return {
      id: node.id,
      workspaceId: node.workspaceId,
      sessionId: node.sessionId,
      type: node.type,
      toolName: node.toolName || '',
      toolInput: this._safeParse(node.toolInput),
      description: node.description || '',
      affectedNodeIds: this._safeParse(node.affectedNodeIds, []),
      motivation: node.motivation || '',
      reversible: node.reversible === true || node.reversible === 'true',
      snapshotBefore: this._safeParse(node.snapshotBefore),
      snapshotAfter: this._safeParse(node.snapshotAfter),
      ts: node.ts
    };
  }

  _safeParse(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  }
}

const instance = new ActionLogService();

module.exports = instance;
module.exports.ActionLogService = ActionLogService;
module.exports.mapToolToActionType = mapToolToActionType;
module.exports.extractAffectedIds = extractAffectedIds;
module.exports.generateDescription = generateDescription;
