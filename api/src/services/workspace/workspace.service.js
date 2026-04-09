/**
 * WorkSpace Service
 *
 * Core CRUD operations for WorkSpace lifecycle management.
 * WorkSpace is an isolated sandbox for knowledge extraction.
 *
 * Isolation rules:
 * - WorkSpace can READ from Global KB (via ReadOnlyProxy)
 * - WorkSpace CANNOT WRITE to Global KB directly
 * - Write to Global KB only via Promotion with user confirmation
 * - WorkSpaces cannot read each other's data
 *
 * @module services/workspace/workspace.service
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');
const { WorkspaceStatus } = require('../../config/enums');
const { getStoragePaths } = require('../../config/namespace.config');

const LOG_PREFIX = '[WorkspaceService]';
const CACHE_PREFIX = 'workspace:cache:';
const WORKSPACE_CACHE_TTL = 300; // 5 minutes

// Valid status transitions (FSM)
const VALID_TRANSITIONS = {
  [WorkspaceStatus.CREATED]:    [WorkspaceStatus.PROFILING, WorkspaceStatus.ARCHIVED],
  [WorkspaceStatus.PROFILING]:  [WorkspaceStatus.READY, WorkspaceStatus.PAUSED, WorkspaceStatus.ARCHIVED],
  [WorkspaceStatus.READY]:      [WorkspaceStatus.EXTRACTING, WorkspaceStatus.REVIEW, WorkspaceStatus.ARCHIVED],
  [WorkspaceStatus.EXTRACTING]: [WorkspaceStatus.READY, WorkspaceStatus.PAUSED, WorkspaceStatus.REVIEW],
  [WorkspaceStatus.PAUSED]:     [WorkspaceStatus.EXTRACTING, WorkspaceStatus.READY, WorkspaceStatus.ARCHIVED],
  [WorkspaceStatus.REVIEW]:     [WorkspaceStatus.PROMOTED, WorkspaceStatus.READY, WorkspaceStatus.ARCHIVED],
  [WorkspaceStatus.PROMOTED]:   [WorkspaceStatus.READY, WorkspaceStatus.ARCHIVED],
  [WorkspaceStatus.ARCHIVED]:   [] // Terminal
};

// Lazy-loaded dependencies (avoid circular imports)
let _memgraph = null;
let _redis = null;
let _qdrant = null;

function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}

function redis() {
  if (!_redis) _redis = require('../redis.service');
  return _redis;
}

function qdrant() {
  if (!_qdrant) _qdrant = require('../qdrant.service');
  return _qdrant;
}

class WorkspaceService {

  // ==================== LIFECYCLE ====================

  /**
   * Create a new WorkSpace
   * @param {Object} params
   * @param {string} params.name - Display name
   * @param {string} [params.description] - Optional description
   * @param {string} params.createdBy - User ID
   * @param {string} [params.domain] - Knowledge domain
   * @param {string[]} [params.tags] - Tags for categorization
   * @returns {Promise<Object>} Created WorkSpace
   */
  async create({ name, description = '', createdBy, domain = '', tags = [] }) {
    if (!name || name.length < 3) {
      throw new Error('WorkSpace name must be at least 3 characters');
    }
    if (!createdBy) {
      throw new Error('createdBy is required');
    }

    const id = uuidv4();
    const namespace = `workspace:${id}`;
    const now = new Date().toISOString();

    const workspace = {
      id,
      name,
      description,
      status: WorkspaceStatus.CREATED,
      createdBy,
      createdAt: now,
      updatedAt: now,
      namespace,
      domain,
      tags: JSON.stringify(tags),
      sourceCount: 0,
      draftCount: 0,
      promotedCount: 0
    };

    // Create WorkSpace node in Memgraph
    const query = `
      CREATE (w:WorkSpace {
        id: $id,
        name: $name,
        description: $description,
        status: $status,
        createdBy: $createdBy,
        createdAt: $createdAt,
        updatedAt: $updatedAt,
        namespace: $namespace,
        domain: $domain,
        tags: $tags,
        sourceCount: $sourceCount,
        draftCount: $draftCount,
        promotedCount: $promotedCount
      })
      RETURN w
    `;

    await mg().runQuery(query, workspace);

    // Initialize isolated Qdrant collection for this workspace
    try {
      await qdrant().createWorkspaceCollection(id);
      console.log(`${LOG_PREFIX} Qdrant collection initialized for workspace ${id}`);
    } catch (err) {
      console.warn(`${LOG_PREFIX} Qdrant collection init deferred: ${err.message}`);
    }

    // Cache the workspace
    const result = this._toWorkspaceObject(workspace);
    await this._cacheWorkspace(result);

    console.log(`${LOG_PREFIX} Created workspace ${id} (${name}) by ${createdBy}`);
    return result;
  }

  /**
   * Get WorkSpace by ID
   * @param {string} workspaceId
   * @returns {Promise<Object|null>}
   */
  async get(workspaceId) {
    // Check cache first
    const cached = await this._getFromCache(workspaceId);
    if (cached) return cached;

    const result = await mg().runQuery(
      'MATCH (w:WorkSpace {id: $id}) RETURN w',
      { id: workspaceId }
    );

    if (!result || result.length === 0) return null;

    const workspace = this._recordToWorkspace(result[0]);
    await this._cacheWorkspace(workspace);
    return workspace;
  }

  /**
   * List WorkSpaces with filters
   * @param {Object} params
   * @param {string} [params.userId] - Filter by creator
   * @param {string} [params.status] - Filter by status
   * @param {string} [params.domain] - Filter by domain
   * @param {number} [params.limit=20]
   * @param {number} [params.offset=0]
   * @returns {Promise<{items: Object[], total: number}>}
   */
  async list({ userId, status, domain, limit = 20, offset = 0 } = {}) {
    const conditions = [];
    const params = {};

    if (userId) {
      conditions.push('w.createdBy = $userId');
      params.userId = userId;
    }
    if (status) {
      conditions.push('w.status = $status');
      params.status = status;
    }
    if (domain) {
      conditions.push('w.domain = $domain');
      params.domain = domain;
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await mg().runQuery(
      `MATCH (w:WorkSpace) ${whereClause} RETURN count(w) as total`,
      params
    );
    const total = countResult[0]?.total || 0;

    // Get paginated results (Memgraph: SKIP/LIMIT via interpolation to avoid type issues)
    const safeSkip = parseInt(offset, 10) || 0;
    const safeLimit = parseInt(limit, 10) || 20;
    const items = await mg().runQuery(
      `MATCH (w:WorkSpace) ${whereClause}
       RETURN w ORDER BY w.createdAt DESC
       SKIP ${safeSkip} LIMIT ${safeLimit}`,
      params
    );

    return {
      items: items.map(r => this._recordToWorkspace(r)),
      total
    };
  }

  /**
   * Update WorkSpace status with FSM validation
   * @param {string} workspaceId
   * @param {string} newStatus - WorkspaceStatus enum value
   * @param {string} [reason] - Optional reason for transition
   * @returns {Promise<Object>} Updated WorkSpace
   */
  async updateStatus(workspaceId, newStatus, reason = '') {
    const workspace = await this.get(workspaceId);
    if (!workspace) {
      throw new Error(`WorkSpace not found: ${workspaceId}`);
    }

    this._validateStatusTransition(workspace.status, newStatus);

    const now = new Date().toISOString();
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $id})
       SET w.status = $newStatus, w.updatedAt = $now
       RETURN w`,
      { id: workspaceId, newStatus, now }
    );

    if (!result || result.length === 0) {
      throw new Error(`Failed to update WorkSpace status: ${workspaceId}`);
    }

    const updated = this._recordToWorkspace(result[0]);
    await this._cacheWorkspace(updated);

    console.log(`${LOG_PREFIX} Status ${workspace.status} → ${newStatus} for ${workspaceId}${reason ? ` (${reason})` : ''}`);
    return updated;
  }

  /**
   * Update WorkSpace metadata (name, description, domain, tags)
   * @param {string} workspaceId
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async update(workspaceId, updates) {
    const allowedFields = ['name', 'description', 'domain', 'tags'];
    const setClauses = [];
    const params = { id: workspaceId };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        const value = field === 'tags' ? JSON.stringify(updates[field]) : updates[field];
        setClauses.push(`w.${field} = $${field}`);
        params[field] = value;
      }
    }

    if (setClauses.length === 0) {
      return this.get(workspaceId);
    }

    params.now = new Date().toISOString();
    setClauses.push('w.updatedAt = $now');

    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $id})
       SET ${setClauses.join(', ')}
       RETURN w`,
      params
    );

    if (!result || result.length === 0) {
      throw new Error(`WorkSpace not found: ${workspaceId}`);
    }

    const updated = this._recordToWorkspace(result[0]);
    await this._cacheWorkspace(updated);
    return updated;
  }

  /**
   * Archive WorkSpace (soft delete)
   * @param {string} workspaceId
   * @returns {Promise<Object>}
   */
  async archive(workspaceId) {
    return this.updateStatus(workspaceId, WorkspaceStatus.ARCHIVED, 'User requested archive');
  }

  /**
   * Permanently delete archived WorkSpace and all its data
   * @param {string} workspaceId
   * @returns {Promise<void>}
   */
  async delete(workspaceId) {
    const workspace = await this.get(workspaceId);
    if (!workspace) {
      throw new Error(`WorkSpace not found: ${workspaceId}`);
    }
    if (workspace.status !== WorkspaceStatus.ARCHIVED) {
      throw new Error(`Cannot delete WorkSpace in status ${workspace.status}. Archive it first.`);
    }

    // Delete all nodes connected to this workspace
    // Order: edges first, then child nodes, then workspace node
    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $id})
       OPTIONAL MATCH (w)-[r1]->(child)
       OPTIONAL MATCH (child)-[r2]->()
       DELETE r2, r1, child`,
      { id: workspaceId }
    );

    // Delete the workspace node itself
    await mg().runQuery(
      'MATCH (w:WorkSpace {id: $id}) DELETE w',
      { id: workspaceId }
    );

    // Delete Qdrant collection
    try {
      await qdrant().deleteWorkspaceCollection(workspaceId);
    } catch (err) {
      console.warn(`${LOG_PREFIX} Qdrant cleanup deferred: ${err.message}`);
    }

    // Clear Redis cache
    await this._invalidateCache(workspaceId);

    console.log(`${LOG_PREFIX} Permanently deleted workspace ${workspaceId}`);
  }

  // ==================== SOURCE MANAGEMENT ====================

  /**
   * Add source to WorkSpace
   * @param {string} workspaceId
   * @param {Object} source
   * @param {string} source.filename
   * @param {string} source.mimeType
   * @param {number} [source.sizeBytes]
   * @param {string} source.sourceType - FILE, DATABASE, API, FILESYSTEM
   * @param {string} [source.uri] - External URI
   * @returns {Promise<Object>} Created SourceReference
   */
  async addSource(workspaceId, { filename, mimeType, sizeBytes = 0, sourceType = 'FILE', uri = '' }) {
    const workspace = await this.get(workspaceId);
    if (!workspace) {
      throw new Error(`WorkSpace not found: ${workspaceId}`);
    }

    const sourceId = uuidv4();
    const now = new Date().toISOString();

    const params = {
      wsId: workspaceId,
      id: sourceId,
      workspaceId,
      filename,
      mimeType,
      sizeBytes,
      sourceType,
      uri,
      uploadedAt: now,
      status: 'PENDING'
    };

    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})
       CREATE (s:SourceReference {
         id: $id,
         workspaceId: $workspaceId,
         filename: $filename,
         mimeType: $mimeType,
         sizeBytes: $sizeBytes,
         sourceType: $sourceType,
         uri: $uri,
         uploadedAt: $uploadedAt,
         status: $status
       })
       CREATE (w)-[:HAS_SOURCE]->(s)
       SET w.sourceCount = w.sourceCount + 1, w.updatedAt = $uploadedAt
       RETURN s`,
      params
    );

    // Auto-transition to PROFILING if workspace is in CREATED status
    if (workspace.status === WorkspaceStatus.CREATED) {
      try {
        await this.updateStatus(workspaceId, WorkspaceStatus.PROFILING);
      } catch (err) {
        console.warn(`${LOG_PREFIX} Auto-transition to PROFILING failed: ${err.message}`);
      }
    }

    await this._invalidateCache(workspaceId);

    const source = result[0] ? this._extractNodeProps(result[0], 's') : params;

    // Auto-promote DATABASE/API sources into the v2 DataSource catalog so
    // they become reusable from the Form Builder. Failure here MUST NOT
    // break the source creation — log and continue.
    if (sourceType === 'DATABASE' || sourceType === 'API') {
      try {
        const wsDsService = require('./workspace-datasource.service');
        const result = await wsDsService.registerSourceAsDataSource(workspaceId, source.id);
        source.dataSourceGraphId = result.dataSourceGraphId;
        console.log(`${LOG_PREFIX} auto-promoted source ${source.id} → DataSource ${result.dataSourceGraphId}`);
      } catch (err) {
        console.warn(`${LOG_PREFIX} auto-promote to DataSource catalog failed for ${source.id}: ${err.message}`);
      }
    }

    console.log(`${LOG_PREFIX} Added source ${filename} (${sourceType}) to workspace ${workspaceId}`);
    return source;
  }

  /**
   * List sources in WorkSpace
   * @param {string} workspaceId
   * @returns {Promise<Object[]>}
   */
  async listSources(workspaceId) {
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $id})-[:HAS_SOURCE]->(s:SourceReference)
       RETURN s ORDER BY s.uploadedAt DESC`,
      { id: workspaceId }
    );
    return result.map(r => this._extractNodeProps(r, 's'));
  }

  /**
   * Get single source
   * @param {string} workspaceId
   * @param {string} sourceId
   * @returns {Promise<Object|null>}
   */
  async getSource(workspaceId, sourceId) {
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_SOURCE]->(s:SourceReference {id: $sourceId})
       RETURN s`,
      { wsId: workspaceId, sourceId }
    );
    return result.length > 0 ? this._extractNodeProps(result[0], 's') : null;
  }

  /**
   * Update source status
   * @param {string} workspaceId
   * @param {string} sourceId
   * @param {string} status - PENDING, PROFILED, PROCESSING, DONE, ERROR
   * @returns {Promise<Object>}
   */
  async updateSourceStatus(workspaceId, sourceId, status) {
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_SOURCE]->(s:SourceReference {id: $sourceId})
       SET s.status = $status
       RETURN s`,
      { wsId: workspaceId, sourceId, status }
    );
    if (!result || result.length === 0) {
      throw new Error(`Source ${sourceId} not found in workspace ${workspaceId}`);
    }
    return this._extractNodeProps(result[0], 's');
  }

  // ==================== STATISTICS ====================

  /**
   * Get draft count by status for WorkSpace
   * @param {string} workspaceId
   * @returns {Promise<Object>} { total, byStatus: {DRAFT: n, VALIDATED: n, ...} }
   */
  async getDraftStats(workspaceId) {
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $id})-[:CONTAINS_DRAFT]->(d)
       RETURN d.status as status, count(d) as count`,
      { id: workspaceId }
    );

    const byStatus = {};
    let total = 0;
    for (const row of result) {
      byStatus[row.status] = row.count;
      total += row.count;
    }

    return { total, byStatus };
  }

  /**
   * Get full statistics
   * @param {string} workspaceId
   * @returns {Promise<Object>}
   */
  async getStats(workspaceId) {
    const workspace = await this.get(workspaceId);
    if (!workspace) {
      throw new Error(`WorkSpace not found: ${workspaceId}`);
    }

    const draftStats = await this.getDraftStats(workspaceId);

    // Count sources by status
    const sourceResult = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $id})-[:HAS_SOURCE]->(s:SourceReference)
       RETURN s.status as status, count(s) as count`,
      { id: workspaceId }
    );
    const sourcesByStatus = {};
    for (const row of sourceResult) {
      sourcesByStatus[row.status] = row.count;
    }

    // Count KB references
    const kbRefResult = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $id})-[:REFERENCES_KB]->(r:KBReference)
       RETURN count(r) as count`,
      { id: workspaceId }
    );

    // Count promotions
    const promoResult = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $id})-[:HAS_PROMOTION]->(p:PromotionRecord)
       RETURN count(p) as count`,
      { id: workspaceId }
    );

    return {
      workspaceId,
      status: workspace.status,
      sources: {
        total: workspace.sourceCount,
        byStatus: sourcesByStatus
      },
      drafts: draftStats,
      kbReferences: kbRefResult[0]?.count || 0,
      promotions: promoResult[0]?.count || 0,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt
    };
  }

  // ==================== NAMESPACE HELPERS ====================

  /**
   * Get full namespace string for WorkSpace
   * @param {string} workspaceId
   * @returns {string}
   */
  getNamespace(workspaceId) {
    return `workspace:${workspaceId}`;
  }

  /**
   * Get Qdrant collection name for WorkSpace
   * @param {string} workspaceId
   * @returns {string}
   */
  getQdrantCollection(workspaceId) {
    const paths = getStoragePaths(`workspace:${workspaceId}`);
    return paths ? paths.qdrantCollection : `workspace_${workspaceId.replace(/-/g, '_')}`;
  }

  /**
   * Get Redis key prefix for WorkSpace
   * @param {string} workspaceId
   * @returns {string}
   */
  getRedisPrefix(workspaceId) {
    return `workspace:${workspaceId}:`;
  }

  // ==================== CLEANUP ====================

  /**
   * Archive stale workspaces (no activity for N days)
   * @param {number} olderThanDays
   * @returns {Promise<number>} Count of archived workspaces
   */
  async cleanupStaleWorkspaces(olderThanDays = 30) {
    const threshold = new Date(Date.now() - olderThanDays * 86400000).toISOString();

    const stale = await mg().runQuery(
      `MATCH (w:WorkSpace)
       WHERE w.updatedAt < $threshold
         AND w.status IN $activeStatuses
       RETURN w.id as id`,
      {
        threshold,
        activeStatuses: [
          WorkspaceStatus.CREATED,
          WorkspaceStatus.READY,
          WorkspaceStatus.PAUSED,
          WorkspaceStatus.REVIEW
        ]
      }
    );

    let archived = 0;
    for (const row of stale) {
      try {
        await this.updateStatus(row.id, WorkspaceStatus.ARCHIVED, `Stale: no activity for ${olderThanDays}+ days`);
        archived++;
      } catch (err) {
        console.warn(`${LOG_PREFIX} Failed to archive stale workspace ${row.id}: ${err.message}`);
      }
    }

    if (archived > 0) {
      console.log(`${LOG_PREFIX} Archived ${archived} stale workspaces`);
    }
    return archived;
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Validate status transition against FSM
   * @private
   */
  _validateStatusTransition(currentStatus, newStatus) {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed) {
      throw new Error(`Unknown workspace status: ${currentStatus}`);
    }
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${currentStatus} → ${newStatus}. ` +
        `Allowed: [${allowed.join(', ')}]`
      );
    }
  }

  /**
   * Convert raw params to workspace object (parse JSON fields)
   * @private
   */
  _toWorkspaceObject(raw) {
    return {
      ...raw,
      tags: typeof raw.tags === 'string' ? JSON.parse(raw.tags) : (raw.tags || [])
    };
  }

  /**
   * Convert Memgraph record to workspace object
   * @private
   */
  _recordToWorkspace(record) {
    const props = record.w?.properties || record.w || record;
    return this._toWorkspaceObject(props);
  }

  /**
   * Extract node properties from a Memgraph record by alias
   * @private
   */
  _extractNodeProps(record, alias) {
    const node = record[alias];
    return node?.properties || node || record;
  }

  /**
   * Cache workspace in Redis
   * @private
   */
  async _cacheWorkspace(workspace) {
    try {
      await redis().set(
        `${CACHE_PREFIX}${workspace.id}`,
        workspace,
        WORKSPACE_CACHE_TTL
      );
    } catch {
      // Cache is best-effort
    }
  }

  /**
   * Get workspace from cache
   * @private
   */
  async _getFromCache(workspaceId) {
    try {
      return await redis().get(`${CACHE_PREFIX}${workspaceId}`);
    } catch {
      return null;
    }
  }

  /**
   * Invalidate workspace cache
   * @private
   */
  async _invalidateCache(workspaceId) {
    try {
      await redis().del(`${CACHE_PREFIX}${workspaceId}`);
    } catch {
      // Cache is best-effort
    }
  }
}

// Singleton
let _instance = null;
function getWorkspaceService() {
  if (!_instance) _instance = new WorkspaceService();
  return _instance;
}

module.exports = getWorkspaceService();
module.exports.getWorkspaceService = getWorkspaceService;
module.exports.WorkspaceService = WorkspaceService;
