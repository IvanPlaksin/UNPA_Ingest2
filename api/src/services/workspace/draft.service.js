/**
 * Draft Node Service
 *
 * CRUD operations for draft knowledge objects within a WorkSpace.
 * Drafts are isolated, mutable knowledge awaiting promotion to Global KB.
 *
 * Supports all 14 Draft* node types from workspace schema.
 *
 * @module services/workspace/draft.service
 */

'use strict';

const crypto = require('crypto');
const neo4j = require('neo4j-driver');
const { v4: uuidv4 } = require('uuid');
const { DraftKnowledgeStatus } = require('../../config/enums');

const LOG_PREFIX = '[DraftService]';

// Draft node type → Memgraph label mapping
const DRAFT_TYPE_LABELS = {
  entity:       'DraftEntity',
  relationship: 'DraftRelationship',
  business_rule:'DraftBusinessRule',
  schema:       'DraftSchema',
  workflow:     'DraftWorkflow',
  calculation:  'DraftCalculation',
  concept:      'DraftConcept',
  policy:       'DraftPolicy',
  decision:     'DraftDecision',
  requirement:  'DraftRequirement',
  anomaly:      'DraftAnomaly',
  api_contract: 'DraftAPIContract'
};

// Knowledge family grouping
const TYPE_TO_FAMILY = {
  entity: 'STRUCTURAL', relationship: 'STRUCTURAL', schema: 'STRUCTURAL', api_contract: 'STRUCTURAL',
  business_rule: 'BEHAVIORAL', workflow: 'BEHAVIORAL', calculation: 'BEHAVIORAL',
  concept: 'SEMANTIC', policy: 'OPERATIONAL',
  decision: 'CONTEXTUAL', requirement: 'CONTEXTUAL', anomaly: 'CONTEXTUAL'
};

// DraftKnowledgeStatus FSM
const DRAFT_STATUS_TRANSITIONS = {
  [DraftKnowledgeStatus.DRAFT]:            [DraftKnowledgeStatus.VALIDATED, DraftKnowledgeStatus.REJECTED],
  [DraftKnowledgeStatus.VALIDATED]:        [DraftKnowledgeStatus.READY_TO_PROMOTE, DraftKnowledgeStatus.DRAFT, DraftKnowledgeStatus.REJECTED],
  [DraftKnowledgeStatus.READY_TO_PROMOTE]: [DraftKnowledgeStatus.PROMOTED, DraftKnowledgeStatus.CONFLICT, DraftKnowledgeStatus.VALIDATED],
  [DraftKnowledgeStatus.CONFLICT]:         [DraftKnowledgeStatus.MERGED, DraftKnowledgeStatus.REJECTED, DraftKnowledgeStatus.READY_TO_PROMOTE],
  [DraftKnowledgeStatus.MERGED]:           [DraftKnowledgeStatus.PROMOTED],
  [DraftKnowledgeStatus.PROMOTED]:         [], // Terminal
  [DraftKnowledgeStatus.REJECTED]:         []  // Terminal
};

// Allowed labels for safe Cypher (prevent injection)
const ALLOWED_DRAFT_LABELS = new Set(Object.values(DRAFT_TYPE_LABELS));

// Lazy-loaded dependencies
let _memgraph = null;
let _qdrant = null;
let _tei = null;

function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}

function qdrant() {
  if (!_qdrant) _qdrant = require('../qdrant.service');
  return _qdrant;
}

function tei() {
  if (!_tei) _tei = require('../tei.service');
  return _tei;
}

class DraftService {

  // ==================== CRUD ====================

  /**
   * Create a draft knowledge object
   * @param {string} workspaceId
   * @param {Object} draft
   * @param {string} draft.type - One of DRAFT_TYPE_LABELS keys
   * @param {string} draft.name - Display name
   * @param {string} [draft.description] - Description
   * @param {Object} draft.content - Type-specific structured content
   * @param {string} [draft.sourceId] - SourceReference ID
   * @param {number} [draft.confidence=0.8] - Extraction confidence 0-1
   * @param {string} [draft.extractedBy] - Agent/executor ID
   * @returns {Promise<Object>} Created draft node
   */
  async create(workspaceId, { type, name, description = '', content = {}, sourceId, confidence = 0.8, extractedBy = 'system' }) {
    const label = this._getLabelForType(type);
    const id = uuidv4();
    const now = new Date().toISOString();
    const contentHash = this._computeContentHash(type, content);
    const family = TYPE_TO_FAMILY[type] || 'UNKNOWN';

    const params = {
      wsId: workspaceId,
      id,
      workspaceId,
      name,
      description,
      content: JSON.stringify(content),
      contentHash,
      type,
      knowledgeFamily: family,
      confidence,
      status: DraftKnowledgeStatus.DRAFT,
      extractedBy,
      extractedAt: now,
      namespace: `workspace:${workspaceId}`,
      sourceId: sourceId || ''
    };

    // Create node + edges in single transaction
    let query = `
      MATCH (w:WorkSpace {id: $wsId})
      CREATE (d:${label} {
        id: $id,
        workspaceId: $workspaceId,
        name: $name,
        description: $description,
        content: $content,
        contentHash: $contentHash,
        type: $type,
        knowledgeFamily: $knowledgeFamily,
        confidence: $confidence,
        status: $status,
        extractedBy: $extractedBy,
        extractedAt: $extractedAt,
        namespace: $namespace
      })
      CREATE (w)-[:CONTAINS_DRAFT]->(d)
    `;

    // Link to source if provided
    if (sourceId) {
      query += `
      WITH d
      MATCH (s:SourceReference {id: $sourceId, workspaceId: $wsId})
      CREATE (d)-[:EXTRACTED_FROM]->(s)
      `;
    }

    query += `
      WITH d
      MATCH (w2:WorkSpace {id: $wsId})
      SET w2.draftCount = w2.draftCount + 1, w2.updatedAt = $extractedAt
      RETURN d
    `;

    const result = await mg().runQuery(query, params);

    // Generate and store embedding asynchronously
    this._indexInQdrant(workspaceId, id, type, family, name, description, content, DraftKnowledgeStatus.DRAFT).catch(err => {
      console.warn(`${LOG_PREFIX} Embedding indexing deferred for ${id}: ${err.message}`);
    });

    const draft = this._buildDraftObject(params);
    console.log(`${LOG_PREFIX} Created ${label} "${name}" in workspace ${workspaceId}`);
    return draft;
  }

  /**
   * List all drafts in a workspace with sourceId resolved via the
   * EXTRACTED_FROM edge. The standard `list()` method does NOT populate
   * sourceId because the schema stores source linkage as an edge, not a
   * property. Use this when downstream logic depends on the source.
   *
   * @param {string} workspaceId
   * @returns {Promise<Object[]>}
   */
  async listWithSource(workspaceId) {
    const rows = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d)
       OPTIONAL MATCH (d)-[:EXTRACTED_FROM]->(s:SourceReference)
       RETURN d, s.id as srcId`,
      { wsId: workspaceId }
    );
    return (rows || []).map(row => {
      const props = row.d?.properties || row.d || {};
      let content = {};
      try {
        content = typeof props.content === 'string' ? JSON.parse(props.content || '{}') : (props.content || {});
      } catch { content = {}; }
      return {
        ...props,
        content,
        confidence: typeof props.confidence === 'number' ? props.confidence : parseFloat(props.confidence) || 0,
        sourceId: row.srcId || ''
      };
    });
  }

  /**
   * Get draft by ID
   * @param {string} workspaceId
   * @param {string} draftId
   * @returns {Promise<Object|null>}
   */
  async get(workspaceId, draftId) {
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d {id: $draftId})
       RETURN d`,
      { wsId: workspaceId, draftId }
    );

    if (!result || result.length === 0) return null;
    return this._recordToDraft(result[0]);
  }

  /**
   * Update draft
   * @param {string} workspaceId
   * @param {string} draftId
   * @param {Object} updates - Partial update
   * @returns {Promise<Object>}
   */
  async update(workspaceId, draftId, updates) {
    const current = await this.get(workspaceId, draftId);
    if (!current) {
      throw new Error(`Draft ${draftId} not found in workspace ${workspaceId}`);
    }

    const setClauses = [];
    const params = { wsId: workspaceId, draftId };

    // Handle content update (recompute hash)
    if (updates.content !== undefined) {
      const content = typeof updates.content === 'string' ? updates.content : JSON.stringify(updates.content);
      const contentObj = typeof updates.content === 'string' ? JSON.parse(updates.content) : updates.content;
      setClauses.push('d.content = $content');
      params.content = content;
      const newHash = this._computeContentHash(current.type, contentObj);
      setClauses.push('d.contentHash = $contentHash');
      params.contentHash = newHash;
    }

    // Handle status update with FSM validation
    if (updates.status !== undefined) {
      if (!this.validateStatusTransition(current.status, updates.status)) {
        throw new Error(
          `Invalid draft status transition: ${current.status} → ${updates.status}. ` +
          `Allowed: [${(DRAFT_STATUS_TRANSITIONS[current.status] || []).join(', ')}]`
        );
      }
      setClauses.push('d.status = $status');
      params.status = updates.status;
    }

    // Simple fields
    for (const field of ['name', 'description', 'confidence']) {
      if (updates[field] !== undefined) {
        setClauses.push(`d.${field} = $${field}`);
        params[field] = updates[field];
      }
    }

    // Position (x, y) for canvas placement
    if (updates.position && typeof updates.position === 'object') {
      if (typeof updates.position.x === 'number') {
        setClauses.push('d.positionX = $positionX');
        params.positionX = updates.position.x;
      }
      if (typeof updates.position.y === 'number') {
        setClauses.push('d.positionY = $positionY');
        params.positionY = updates.position.y;
      }
    }

    if (setClauses.length === 0) {
      return current;
    }

    params.now = new Date().toISOString();
    setClauses.push('d.updatedAt = $now');

    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d {id: $draftId})
       SET ${setClauses.join(', ')}
       RETURN d`,
      params
    );

    if (!result || result.length === 0) {
      throw new Error(`Failed to update draft ${draftId}`);
    }

    // Re-index if content changed
    if (updates.content !== undefined) {
      const contentObj = typeof updates.content === 'string' ? JSON.parse(updates.content) : updates.content;
      this._indexInQdrant(
        workspaceId, draftId, current.type, current.knowledgeFamily,
        updates.name || current.name, updates.description || current.description,
        contentObj, updates.status || current.status
      ).catch(err => {
        console.warn(`${LOG_PREFIX} Re-indexing deferred for ${draftId}: ${err.message}`);
      });
    }

    return this._recordToDraft(result[0]);
  }

  /**
   * Delete draft
   * @param {string} workspaceId
   * @param {string} draftId
   * @returns {Promise<void>}
   */
  async delete(workspaceId, draftId) {
    // Delete edges and node
    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d {id: $draftId})
       OPTIONAL MATCH (d)-[r]-()
       DELETE r, d
       WITH w
       SET w.draftCount = CASE WHEN w.draftCount > 0 THEN w.draftCount - 1 ELSE 0 END,
           w.updatedAt = $now`,
      { wsId: workspaceId, draftId, now: new Date().toISOString() }
    );

    // Remove from Qdrant
    try {
      await qdrant().workspaceDeletePoints(workspaceId, [draftId]);
    } catch (err) {
      console.warn(`${LOG_PREFIX} Qdrant delete deferred for ${draftId}: ${err.message}`);
    }
  }

  /**
   * List drafts with filters
   * @param {string} workspaceId
   * @param {Object} options
   * @returns {Promise<{items: Object[], total: number}>}
   */
  async list(workspaceId, { type, status, sourceId, knowledgeFamily, limit = 50, offset = 0 } = {}) {
    const conditions = ['w.id = $wsId'];
    const params = { wsId: workspaceId };

    if (type) {
      conditions.push('d.type = $type');
      params.type = type;
    }
    if (status) {
      conditions.push('d.status = $status');
      params.status = status;
    }
    if (knowledgeFamily) {
      conditions.push('d.knowledgeFamily = $knowledgeFamily');
      params.knowledgeFamily = knowledgeFamily;
    }
    if (sourceId) {
      // Additional MATCH for source filtering
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count
    const countResult = await mg().runQuery(
      `MATCH (w:WorkSpace)-[:CONTAINS_DRAFT]->(d) ${whereClause} RETURN count(d) as total`,
      params
    );
    const total = countResult[0]?.total || 0;

    // Paginated fetch (Memgraph: SKIP/LIMIT via interpolation to avoid type issues)
    const safeSkip = parseInt(offset, 10) || 0;
    const safeLimit = parseInt(limit, 10) || 20;
    const items = await mg().runQuery(
      `MATCH (w:WorkSpace)-[:CONTAINS_DRAFT]->(d) ${whereClause}
       RETURN d ORDER BY d.extractedAt DESC
       SKIP ${safeSkip} LIMIT ${safeLimit}`,
      params
    );

    return {
      items: items.map(r => this._recordToDraft(r)),
      total
    };
  }

  // ==================== BULK OPERATIONS ====================

  /**
   * Create multiple drafts in batch
   * @param {string} workspaceId
   * @param {Array<Object>} drafts - Array of draft objects (same format as create())
   * @returns {Promise<Object[]>} Created drafts
   */
  async createBatch(workspaceId, drafts) {
    if (!drafts || drafts.length === 0) return [];

    const results = [];
    // Process in chunks to avoid transaction size limits
    const CHUNK_SIZE = 50;

    for (let i = 0; i < drafts.length; i += CHUNK_SIZE) {
      const chunk = drafts.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(draft => this.create(workspaceId, draft).catch(err => {
          console.warn(`${LOG_PREFIX} Batch create error: ${err.message}`);
          return null;
        }))
      );
      results.push(...chunkResults.filter(Boolean));
    }

    console.log(`${LOG_PREFIX} Batch created ${results.length}/${drafts.length} drafts in workspace ${workspaceId}`);
    return results;
  }

  /**
   * Update status for multiple drafts
   * @param {string} workspaceId
   * @param {string[]} draftIds
   * @param {string} newStatus
   * @returns {Promise<number>} Count of updated
   */
  async updateStatusBatch(workspaceId, draftIds, newStatus) {
    if (!draftIds || draftIds.length === 0) return 0;

    // Validate that the target status exists
    if (!Object.values(DraftKnowledgeStatus).includes(newStatus)) {
      throw new Error(`Invalid draft status: ${newStatus}`);
    }

    const now = new Date().toISOString();
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d)
       WHERE d.id IN $draftIds
       SET d.status = $newStatus, d.updatedAt = $now
       RETURN count(d) as updated`,
      { wsId: workspaceId, draftIds, newStatus, now }
    );

    const updated = result[0]?.updated || 0;
    console.log(`${LOG_PREFIX} Batch status update: ${updated} drafts → ${newStatus}`);
    return updated;
  }

  // ==================== RELATIONSHIPS ====================

  /**
   * Create edge between drafts or draft→KBReference
   * @param {string} workspaceId
   * @param {Object} edge
   * @returns {Promise<Object>}
   */
  async createEdge(workspaceId, { sourceId, targetId, edgeType = 'RELATES_TO', confidence = 0.8, properties = {} }) {
    const now = new Date().toISOString();

    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(source {id: $sourceId})
       MATCH (target {id: $targetId, workspaceId: $wsId})
       CREATE (source)-[r:DRAFT_RELATES_TO {
         type: $edgeType,
         confidence: $confidence,
         createdAt: $now,
         properties: $props
       }]->(target)
       RETURN source.id as sourceId, target.id as targetId, type(r) as rel, r.type as edgeType`,
      {
        wsId: workspaceId,
        sourceId,
        targetId,
        edgeType,
        confidence,
        now,
        props: JSON.stringify(properties)
      }
    );

    if (!result || result.length === 0) {
      throw new Error(`Could not create edge: source ${sourceId} or target ${targetId} not found in workspace ${workspaceId}`);
    }

    return {
      sourceId,
      targetId,
      edgeType,
      confidence,
      createdAt: now
    };
  }

  /**
   * Get edges for a draft
   * @param {string} workspaceId
   * @param {string} draftId
   * @param {Object} options
   * @param {string} [options.direction='both'] - 'in' | 'out' | 'both'
   * @returns {Promise<Object[]>}
   */
  async getEdges(workspaceId, draftId, { direction = 'both' } = {}) {
    let pattern;
    switch (direction) {
      case 'out':
        pattern = '(d)-[r:DRAFT_RELATES_TO]->(target)';
        break;
      case 'in':
        pattern = '(source)-[r:DRAFT_RELATES_TO]->(d)';
        break;
      default:
        pattern = '(d)-[r:DRAFT_RELATES_TO]-(other)';
    }

    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d {id: $draftId})
       MATCH ${pattern}
       RETURN r, startNode(r).id as sourceId, endNode(r).id as targetId`,
      { wsId: workspaceId, draftId }
    );

    return result.map(row => {
      const rel = row.r?.properties || row.r || {};
      return {
        sourceId: row.sourceId,
        targetId: row.targetId,
        edgeType: rel.type || 'RELATES_TO',
        confidence: rel.confidence || 0,
        createdAt: rel.createdAt,
        properties: rel.properties ? JSON.parse(rel.properties) : {}
      };
    });
  }

  /**
   * Delete edge
   * @param {string} workspaceId
   * @param {string} sourceId
   * @param {string} targetId
   * @param {string} [edgeType]
   * @returns {Promise<void>}
   */
  async deleteEdge(workspaceId, sourceId, targetId, edgeType) {
    let typeFilter = '';
    const params = { wsId: workspaceId, sourceId, targetId };

    if (edgeType) {
      typeFilter = 'AND r.type = $edgeType';
      params.edgeType = edgeType;
    }

    await mg().runQuery(
      `MATCH (source {id: $sourceId, workspaceId: $wsId})-[r:DRAFT_RELATES_TO]->(target {id: $targetId})
       WHERE 1=1 ${typeFilter}
       DELETE r`,
      params
    );
  }

  // ==================== SEARCH ====================

  /**
   * Semantic search within workspace drafts
   * @param {string} workspaceId
   * @param {number[]} vector - Query embedding
   * @param {Object} options
   * @returns {Promise<Array<{draft: Object, score: number}>>}
   */
  async searchByEmbedding(workspaceId, vector, { type, status, limit = 10, threshold = 0.7 } = {}) {
    const qdrantResults = await qdrant().workspaceSearch(workspaceId, vector, {
      limit,
      type,
      status,
      scoreThreshold: threshold
    });

    if (qdrantResults.length === 0) return [];

    // Fetch full nodes from Memgraph
    const draftIds = qdrantResults.map(r => r.payload?.draftNodeId || r.id);
    const scoreMap = new Map(qdrantResults.map(r => [r.payload?.draftNodeId || r.id, r.score]));

    const nodes = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d)
       WHERE d.id IN $draftIds
       RETURN d`,
      { wsId: workspaceId, draftIds }
    );

    return nodes.map(r => {
      const draft = this._recordToDraft(r);
      return {
        draft,
        score: scoreMap.get(draft.id) || 0
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Text search (generates embedding then searches)
   * @param {string} workspaceId
   * @param {string} query - Natural language query
   * @param {Object} options
   * @returns {Promise<Array<{draft: Object, score: number}>>}
   */
  async searchByText(workspaceId, query, options = {}) {
    try {
      const vector = await tei().getEmbedding(query);
      return this.searchByEmbedding(workspaceId, vector, options);
    } catch (err) {
      console.warn(`${LOG_PREFIX} TEI embedding failed, falling back to empty results: ${err.message}`);
      return [];
    }
  }

  /**
   * Find similar drafts to a given draft
   * @param {string} workspaceId
   * @param {string} draftId
   * @param {Object} options
   * @returns {Promise<Array<{draft: Object, score: number}>>}
   */
  async findSimilar(workspaceId, draftId, options = {}) {
    // Get draft's embedding from Qdrant via scroll
    try {
      const info = await qdrant().client.retrieve(
        `workspace_${workspaceId.replace(/-/g, '_')}`,
        { ids: [draftId], with_vector: true }
      );

      if (!info || info.length === 0 || !info[0].vector) {
        return [];
      }

      const results = await this.searchByEmbedding(workspaceId, info[0].vector, {
        ...options,
        limit: (options.limit || 10) + 1
      });

      // Exclude self
      return results.filter(r => r.draft.id !== draftId).slice(0, options.limit || 10);
    } catch (err) {
      console.warn(`${LOG_PREFIX} findSimilar failed for ${draftId}: ${err.message}`);
      return [];
    }
  }

  // ==================== VALIDATION ====================

  /**
   * Validate status transition
   * @param {string} currentStatus
   * @param {string} newStatus
   * @returns {boolean}
   */
  validateStatusTransition(currentStatus, newStatus) {
    const allowed = DRAFT_STATUS_TRANSITIONS[currentStatus] || [];
    return allowed.includes(newStatus);
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Compute content hash (SHA-256 of canonical JSON)
   * @private
   */
  _computeContentHash(type, content) {
    const canonical = JSON.stringify({ type, ...content }, Object.keys({ type, ...content }).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  }

  /**
   * Get label for type (with validation)
   * @private
   */
  _getLabelForType(type) {
    const label = DRAFT_TYPE_LABELS[type];
    if (!label) {
      throw new Error(`Unknown draft type: ${type}. Valid: ${Object.keys(DRAFT_TYPE_LABELS).join(', ')}`);
    }
    if (!ALLOWED_DRAFT_LABELS.has(label)) {
      throw new Error(`Label not in allowed set: ${label}`);
    }
    return label;
  }

  /**
   * Index a draft node in Qdrant workspace collection
   * @private
   */
  async _indexInQdrant(workspaceId, draftId, type, family, name, description, content, status) {
    const textParts = [name];
    if (description) textParts.push(description);

    // Add key content fields to embedding text
    if (content) {
      const contentObj = typeof content === 'string' ? JSON.parse(content) : content;
      for (const key of ['condition', 'action', 'formula', 'definition', 'context', 'rationale']) {
        if (contentObj[key]) textParts.push(`${key}: ${contentObj[key]}`);
      }
    }

    const text = textParts.join('. ');
    const vector = await tei().getEmbedding(text);

    await qdrant().workspaceUpsert(workspaceId, [{
      id: draftId,
      vector,
      payload: {
        draftNodeId: draftId,
        type,
        knowledgeFamily: family,
        name,
        status,
        sourceId: ''
      }
    }]);
  }

  /**
   * Build draft object from params
   * @private
   */
  _buildDraftObject(params) {
    return {
      id: params.id,
      workspaceId: params.workspaceId,
      name: params.name,
      description: params.description,
      type: params.type,
      knowledgeFamily: params.knowledgeFamily,
      content: typeof params.content === 'string' ? JSON.parse(params.content) : params.content,
      contentHash: params.contentHash,
      confidence: params.confidence,
      status: params.status,
      extractedBy: params.extractedBy,
      extractedAt: params.extractedAt,
      namespace: params.namespace
    };
  }

  /**
   * Convert Memgraph record to draft object
   * @private
   */
  _recordToDraft(record) {
    const props = record.d?.properties || record.d || record;
    return {
      ...props,
      content: typeof props.content === 'string' ? JSON.parse(props.content) : (props.content || {}),
      confidence: typeof props.confidence === 'number' ? props.confidence : parseFloat(props.confidence) || 0
    };
  }
}

// Singleton
let _instance = null;
function getDraftService() {
  if (!_instance) _instance = new DraftService();
  return _instance;
}

module.exports = getDraftService();
module.exports.getDraftService = getDraftService;
module.exports.DraftService = DraftService;
module.exports.DRAFT_TYPE_LABELS = DRAFT_TYPE_LABELS;
module.exports.TYPE_TO_FAMILY = TYPE_TO_FAMILY;
