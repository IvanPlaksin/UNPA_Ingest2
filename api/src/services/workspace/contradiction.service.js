/**
 * WorkSpace Contradiction Detection Service (WS2-005)
 *
 * Detects logically/factually conflicting Draft nodes inside a WorkSpace.
 * Two drafts conflict when:
 *   1. they describe the same concept (high name/embedding similarity), AND
 *   2. they come from different sources, AND
 *   3. their property values differ.
 *
 * Each conflict is materialized as a `ContradictionNode` linked to both
 * Draft nodes, with classification (FACTUAL / TEMPORAL / LOGICAL / SCOPE
 * / CARDINALITY) and severity (INFO / WARNING / BLOCKING).
 *
 * Storage:
 *   (DraftNode)-[:HAS_CONTRADICTION]->(ContradictionNode)
 *
 * Idempotent: re-running detect against the same workspace will not create
 * duplicate contradictions for the same (entityIds, field) tuple.
 *
 * @module services/workspace/contradiction.service
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

const LOG_PREFIX = '[ContradictionService]';
const SIMILARITY_THRESHOLD = 0.75;

// Hybrid similarity weights (name vs embedding) — name still matters because
// embeddings sometimes treat unrelated entities with shared context as similar.
const NAME_WEIGHT = 0.4;
const EMBEDDING_WEIGHT = 0.6;

let _memgraph = null;
let _draftService = null;
let _qdrantService = null;
function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}
function drafts() {
  if (!_draftService) _draftService = require('./draft.service');
  return _draftService;
}
function qdrant() {
  if (!_qdrantService) _qdrantService = require('../qdrant.service');
  return _qdrantService;
}

// ──────────────────────────────────────────────────────────────────
// Pure helpers (exported for tests)
// ──────────────────────────────────────────────────────────────────

/** Iterative Levenshtein distance (matrix-free, O(min(a,b)) memory). */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  if (a.length > b.length) [a, b] = [b, a]; // swap so a is shorter

  const prev = new Array(a.length + 1);
  const curr = new Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,        // insertion
        prev[i] + 1,            // deletion
        prev[i - 1] + cost      // substitution
      );
    }
    for (let i = 0; i <= a.length; i++) prev[i] = curr[i];
  }
  return prev[a.length];
}

/** Normalized name similarity in [0..1]. Case-insensitive, ignores extra spaces. */
function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const x = a.toLowerCase().trim().replace(/\s+/g, ' ');
  const y = b.toLowerCase().trim().replace(/\s+/g, ' ');
  if (x === y) return 1;
  const dist = levenshtein(x, y);
  const maxLen = Math.max(x.length, y.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/** Cosine similarity between two equal-length numeric vectors. Returns 0 on bad input. */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Hybrid similarity: weighted name + embedding cosine.
 * If embeddings are absent (vecA or vecB null/empty), falls back to name only.
 */
function hybridSimilarity(nameA, nameB, vecA, vecB) {
  const nSim = nameSimilarity(nameA, nameB);
  const hasVecs = Array.isArray(vecA) && Array.isArray(vecB) && vecA.length > 0 && vecB.length > 0;
  if (!hasVecs) return nSim;
  const eSim = cosineSimilarity(vecA, vecB);
  // Clamp embedding sim to [0, 1] (cosine can produce negatives for opposite vectors)
  const eSimClamped = Math.max(0, Math.min(1, eSim));
  return nSim * NAME_WEIGHT + eSimClamped * EMBEDDING_WEIGHT;
}

/** Classify a value-conflict by inspecting the field name and value shapes. */
function classifyConflict(field, values) {
  const fname = (field || '').toLowerCase();

  // TEMPORAL — date/time/version fields
  if (/date|time|year|month|version|updated|created|expir/.test(fname)) {
    return 'TEMPORAL';
  }

  // CARDINALITY — array vs scalar mismatch, or different array length
  const allArrays = values.every(Array.isArray);
  const someArrays = values.some(Array.isArray);
  if (allArrays) {
    const lengths = new Set(values.map(v => v.length));
    if (lengths.size > 1) return 'CARDINALITY';
  } else if (someArrays) {
    return 'CARDINALITY';
  }

  // LOGICAL — boolean opposites
  const hasTrue = values.includes(true);
  const hasFalse = values.includes(false);
  if (hasTrue && hasFalse) return 'LOGICAL';

  // SCOPE — nested objects with structural differences
  if (values.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
    return 'SCOPE';
  }

  return 'FACTUAL';
}

/** Determine severity based on field name + classification. */
function determineSeverity(field, type) {
  const fname = (field || '').toLowerCase();
  if (/approval|required|mandatory|enforce|compliance|policy/.test(fname)) return 'BLOCKING';
  if (/max|min|limit|threshold|deadline|cap|quota/.test(fname))           return 'WARNING';
  if (type === 'LOGICAL')   return 'BLOCKING';
  if (type === 'TEMPORAL')  return 'WARNING';
  return 'INFO';
}

// ──────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────

class ContradictionService {

  /**
   * Scan all drafts in a workspace and create ContradictionNodes for any
   * conflicts. Idempotent — existing contradictions for the same
   * (entityIds, field) tuple are not duplicated.
   *
   * @param {string} workspaceId
   * @param {Object} [options]
   * @param {number} [options.similarityThreshold=0.75]
   * @param {string} [options.detectedBy='auto']
   * @returns {Promise<{created: Object[], skipped: number, stats: Object}>}
   */
  async detectContradictions(workspaceId, options = {}) {
    const threshold = options.similarityThreshold ?? SIMILARITY_THRESHOLD;
    const detectedBy = options.detectedBy || 'auto';
    // Allow caller to opt-out of embeddings explicitly
    const useEmbeddings = options.useEmbeddings !== false;

    // 1. Fetch all drafts with sourceId resolved via EXTRACTED_FROM edge
    const allDrafts = await drafts().listWithSource(workspaceId);
    if (allDrafts.length < 2) {
      return { created: [], skipped: 0, stats: { groups: 0, conflicts: 0 } };
    }

    // 1b. Prefetch embeddings for all drafts (one Qdrant call). Graceful fallback.
    let vectorMap = new Map();
    let embeddingsAvailable = false;
    if (useEmbeddings) {
      try {
        const draftIds = allDrafts.map(d => d.id).filter(Boolean);
        vectorMap = await qdrant().workspaceGetVectors(workspaceId, draftIds);
        embeddingsAvailable = vectorMap.size > 0;
        if (!embeddingsAvailable) {
          console.warn(`${LOG_PREFIX} No embeddings found for workspace ${workspaceId} — falling back to name-only similarity`);
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} Embedding prefetch failed: ${err.message} — falling back to name-only`);
      }
    }

    // 2. Group by similarity (only across different sources)
    const groups = this._groupBySimilarity(allDrafts, threshold, vectorMap);

    // 3. For each group, find property conflicts
    const created = [];
    let skipped = 0;
    let totalConflicts = 0;

    for (const group of groups) {
      const conflicts = this._findPropertyConflicts(group);
      totalConflicts += conflicts.length;

      for (const conflict of conflicts) {
        const entityIds = conflict.entries.map(e => e.draftId).sort();

        // De-dupe: skip if a contradiction with the same (entityIds, field) already exists
        const existsRes = await mg().runQuery(
          `MATCH (c:ContradictionNode {workspaceId: $wsId, field: $field})
           WHERE c.entityIdsKey = $key
           RETURN c LIMIT 1`,
          { wsId: workspaceId, field: conflict.field, key: entityIds.join('|') }
        );
        if (existsRes && existsRes.length > 0) {
          skipped++;
          continue;
        }

        const type = classifyConflict(conflict.field, conflict.entries.map(e => e.value));
        const severity = determineSeverity(conflict.field, type);

        const cnode = {
          id: uuidv4(),
          workspaceId,
          type,
          severity,
          field: conflict.field,
          values: JSON.stringify(conflict.entries.map(e => e.value)),
          entityIds: JSON.stringify(entityIds),
          entityIdsKey: entityIds.join('|'),
          entityNames: JSON.stringify(conflict.entries.map(e => e.draftName)),
          sourceIds: JSON.stringify([...new Set(conflict.entries.map(e => e.sourceId).filter(Boolean))]),
          description: this._buildDescription(conflict, type),
          status: 'OPEN',
          resolution: '',
          detectedAt: new Date().toISOString(),
          detectedBy
        };

        // Create node + HAS_CONTRADICTION edges from each draft
        await mg().runQuery(
          `CREATE (c:ContradictionNode {
            id: $id, workspaceId: $workspaceId,
            type: $type, severity: $severity,
            field: $field, values: $values,
            entityIds: $entityIds, entityIdsKey: $entityIdsKey,
            entityNames: $entityNames, sourceIds: $sourceIds,
            description: $description, status: $status,
            resolution: $resolution,
            detectedAt: $detectedAt, detectedBy: $detectedBy
          })
          WITH c
          UNWIND $entityIdList as draftId
          MATCH (d {id: draftId, workspaceId: $workspaceId})
          CREATE (d)-[:HAS_CONTRADICTION]->(c)`,
          { ...cnode, entityIdList: entityIds }
        );

        created.push(this._materialize(cnode));
      }
    }

    console.log(`${LOG_PREFIX} Detection complete for ${workspaceId}: ${created.length} new, ${skipped} skipped (groups: ${groups.length})`);

    return {
      created,
      skipped,
      stats: {
        groupsScanned: groups.length,
        totalConflicts,
        newContradictions: created.length,
        deduplicated: skipped
      }
    };
  }

  /**
   * List contradictions for a workspace.
   */
  async getContradictions(workspaceId, { status, severity, type, limit = 50, offset = 0 } = {}) {
    const conditions = ['c.workspaceId = $wsId'];
    const params = { wsId: workspaceId };

    if (status)   { conditions.push('c.status = $status');     params.status = status; }
    if (severity) { conditions.push('c.severity = $severity'); params.severity = severity; }
    if (type)     { conditions.push('c.type = $type');         params.type = type; }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const safeLimit  = parseInt(limit, 10) || 50;
    const safeOffset = parseInt(offset, 10) || 0;

    const countRes = await mg().runQuery(
      `MATCH (c:ContradictionNode) ${where} RETURN count(c) as total`,
      params
    );
    const totalRaw = countRes[0]?.total;
    const total = typeof totalRaw === 'object' && totalRaw.toNumber ? totalRaw.toNumber() : (totalRaw || 0);

    const result = await mg().runQuery(
      `MATCH (c:ContradictionNode) ${where}
       RETURN c
       ORDER BY c.detectedAt DESC
       SKIP ${safeOffset} LIMIT ${safeLimit}`,
      params
    );

    const items = (result || []).map(r => this._fromRecord(r));
    return { items, total };
  }

  async getContradiction(contradictionId) {
    const result = await mg().runQuery(
      `MATCH (c:ContradictionNode {id: $id}) RETURN c LIMIT 1`,
      { id: contradictionId }
    );
    if (!result || result.length === 0) return null;
    return this._fromRecord(result[0]);
  }

  /**
   * Resolve a contradiction with a chosen strategy.
   *
   * @param {string} contradictionId
   * @param {Object} resolution
   * @param {'USE_FIRST'|'USE_SECOND'|'USE_NEWER'|'MANUAL'|'ACCEPT_BOTH'} resolution.strategy
   * @param {*}      [resolution.resolvedValue]
   * @param {string} [resolution.rationale]
   * @param {string} [resolution.resolvedBy='user']
   * @returns {Promise<Object>}
   */
  async resolveContradiction(contradictionId, resolution) {
    if (!resolution || !resolution.strategy) {
      throw new Error('resolution.strategy is required');
    }
    const valid = ['USE_FIRST', 'USE_SECOND', 'USE_NEWER', 'MANUAL', 'ACCEPT_BOTH'];
    if (!valid.includes(resolution.strategy)) {
      throw new Error(`Invalid strategy: ${resolution.strategy}`);
    }

    const resolutionPayload = JSON.stringify({
      strategy: resolution.strategy,
      resolvedValue: resolution.resolvedValue ?? null,
      rationale: resolution.rationale || '',
      resolvedBy: resolution.resolvedBy || 'user',
      resolvedAt: new Date().toISOString()
    });

    const result = await mg().runQuery(
      `MATCH (c:ContradictionNode {id: $id})
       SET c.status = 'RESOLVED', c.resolution = $resolution
       RETURN c`,
      { id: contradictionId, resolution: resolutionPayload }
    );
    if (!result || result.length === 0) {
      throw new Error(`Contradiction not found: ${contradictionId}`);
    }
    return this._fromRecord(result[0]);
  }

  /**
   * Reopen a previously resolved contradiction.
   */
  async reopenContradiction(contradictionId) {
    const result = await mg().runQuery(
      `MATCH (c:ContradictionNode {id: $id})
       SET c.status = 'OPEN', c.resolution = ''
       RETURN c`,
      { id: contradictionId }
    );
    if (!result || result.length === 0) {
      throw new Error(`Contradiction not found: ${contradictionId}`);
    }
    return this._fromRecord(result[0]);
  }

  async deleteContradiction(contradictionId) {
    await mg().runQuery(
      `MATCH (c:ContradictionNode {id: $id}) DETACH DELETE c`,
      { id: contradictionId }
    );
  }

  /**
   * Aggregated stats for the workspace.
   */
  async getContradictionStats(workspaceId) {
    const rows = await mg().runQuery(
      `MATCH (c:ContradictionNode {workspaceId: $wsId})
       RETURN c.status as status, c.severity as severity, c.type as type`,
      { wsId: workspaceId }
    );

    const stats = {
      total: 0,
      byStatus: { OPEN: 0, RESOLVED: 0, DEFERRED: 0, ACCEPTED: 0 },
      bySeverity: { INFO: 0, WARNING: 0, BLOCKING: 0 },
      byType: { FACTUAL: 0, TEMPORAL: 0, LOGICAL: 0, SCOPE: 0, CARDINALITY: 0 }
    };
    for (const row of (rows || [])) {
      stats.total++;
      if (row.status   && stats.byStatus[row.status]   !== undefined) stats.byStatus[row.status]++;
      if (row.severity && stats.bySeverity[row.severity] !== undefined) stats.bySeverity[row.severity]++;
      if (row.type     && stats.byType[row.type]       !== undefined) stats.byType[row.type]++;
    }
    return stats;
  }

  // ──────────────────────────────────────────────────────────────
  // Internal
  // ──────────────────────────────────────────────────────────────

  _groupBySimilarity(allDrafts, threshold, vectorMap = new Map()) {
    const groups = [];
    const used = new Set();

    for (let i = 0; i < allDrafts.length; i++) {
      if (used.has(allDrafts[i].id)) continue;
      const seed = allDrafts[i];
      const seedVec = vectorMap.get(seed.id);
      const group = [seed];
      used.add(seed.id);

      for (let j = i + 1; j < allDrafts.length; j++) {
        if (used.has(allDrafts[j].id)) continue;
        const other = allDrafts[j];

        // Different sources required
        const seedSource = seed.sourceId || '';
        const otherSource = other.sourceId || '';
        if (seedSource && otherSource && seedSource === otherSource) continue;

        // Same draft type required (Customer entity vs Customer rule = not a contradiction)
        if (seed.type !== other.type) continue;

        const otherVec = vectorMap.get(other.id);
        const sim = hybridSimilarity(seed.name, other.name, seedVec, otherVec);
        if (sim >= threshold) {
          group.push(other);
          used.add(other.id);
        }
      }

      if (group.length > 1) groups.push(group);
    }
    return groups;
  }

  _findPropertyConflicts(group) {
    const fieldMap = new Map(); // field → [{value, draftId, draftName, sourceId}]

    for (const draft of group) {
      const content = draft.content || {};
      if (!content || typeof content !== 'object') continue;
      for (const [field, value] of Object.entries(content)) {
        if (value === undefined || value === null) continue;
        if (!fieldMap.has(field)) fieldMap.set(field, []);
        fieldMap.get(field).push({
          value,
          draftId: draft.id,
          draftName: draft.name,
          sourceId: draft.sourceId || ''
        });
      }
    }

    const conflicts = [];
    for (const [field, entries] of fieldMap) {
      if (entries.length < 2) continue;
      const uniqueSerialized = new Set(entries.map(e => JSON.stringify(e.value)));
      if (uniqueSerialized.size > 1) {
        conflicts.push({ field, entries });
      }
    }
    return conflicts;
  }

  _buildDescription(conflict, type) {
    const valuesStr = conflict.entries
      .map(e => `${e.draftName}=${JSON.stringify(e.value)}`)
      .join('; ');
    return `${type} conflict on field "${conflict.field}": ${valuesStr}`;
  }

  _fromRecord(record) {
    const node = record.c?.properties || record.c || record;
    return this._materialize(node);
  }

  _materialize(node) {
    const safeParse = (v, fb = null) => {
      if (v === undefined || v === null || v === '') return fb;
      if (typeof v !== 'string') return v;
      try { return JSON.parse(v); } catch { return v; }
    };
    return {
      id: node.id,
      workspaceId: node.workspaceId,
      type: node.type,
      severity: node.severity,
      field: node.field,
      values: safeParse(node.values, []),
      entityIds: safeParse(node.entityIds, []),
      entityNames: safeParse(node.entityNames, []),
      sourceIds: safeParse(node.sourceIds, []),
      description: node.description || '',
      status: node.status || 'OPEN',
      resolution: safeParse(node.resolution, null),
      detectedAt: node.detectedAt,
      detectedBy: node.detectedBy
    };
  }
}

const instance = new ContradictionService();

module.exports = instance;
module.exports.ContradictionService = ContradictionService;
module.exports.levenshtein = levenshtein;
module.exports.nameSimilarity = nameSimilarity;
module.exports.cosineSimilarity = cosineSimilarity;
module.exports.hybridSimilarity = hybridSimilarity;
module.exports.classifyConflict = classifyConflict;
module.exports.determineSeverity = determineSeverity;
module.exports.SIMILARITY_THRESHOLD = SIMILARITY_THRESHOLD;
module.exports.NAME_WEIGHT = NAME_WEIGHT;
module.exports.EMBEDDING_WEIGHT = EMBEDDING_WEIGHT;
