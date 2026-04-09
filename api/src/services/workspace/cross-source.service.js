/**
 * WorkSpace Cross-Source Analysis Service (WS2-006)
 *
 * Answers higher-level questions about a workspace:
 *   - How well are sources covered by extraction?
 *   - Which entities are corroborated across sources?
 *   - How do sources relate (supersede, contradict, implement)?
 *   - Where are the gaps (orphan sources, isolated entities)?
 *
 * Output is read-only; this service does NOT mutate any drafts. Inferred
 * source relationships are returned, not persisted (Phase 3 may store them).
 *
 * @module services/workspace/cross-source.service
 */

'use strict';

const LOG_PREFIX = '[CrossSourceService]';
const SHARED_NAME_THRESHOLD = 0.85;

let _memgraph = null;
let _draftService = null;
let _sourceService = null;
let _contradictionService = null;
let _wsService = null;

function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}
function drafts() {
  if (!_draftService) _draftService = require('./draft.service');
  return _draftService;
}
function sources() {
  if (!_sourceService) _sourceService = require('./source.service');
  return _sourceService;
}
function contradictions() {
  if (!_contradictionService) _contradictionService = require('./contradiction.service');
  return _contradictionService;
}
function ws() {
  if (!_wsService) _wsService = require('./workspace.service');
  return _wsService;
}

const SCHEMA_TYPES = new Set(['DATABASE', 'database', 'sql', 'mssql']);
const DOCUMENT_TYPES = new Set(['FILE', 'file', 'pdf', 'docx', 'document']);

class CrossSourceService {

  // ────────────────────────────────────────────────────────────────
  // Internal: drafts with resolved sourceId via EXTRACTED_FROM edge
  // ────────────────────────────────────────────────────────────────

  /**
   * Fetch drafts with sourceId resolved via the EXTRACTED_FROM edge.
   * Wrapper around `drafts.listWithSource()` for consistency.
   */
  async _listDraftsWithSource(workspaceId) {
    return drafts().listWithSource(workspaceId);
  }

  // ────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────

  /**
   * Per-source coverage stats.
   * @param {string} workspaceId
   */
  async analyzeSourceCoverage(workspaceId) {
    const allSources = await sources().listSources(workspaceId);
    const allDrafts  = await this._listDraftsWithSource(workspaceId);

    const draftBySource = new Map();
    for (const d of allDrafts) {
      const sid = d.sourceId || '';
      if (!draftBySource.has(sid)) draftBySource.set(sid, []);
      draftBySource.get(sid).push(d);
    }

    // Build name index across all sources to detect shared entities per source
    const nameToSources = new Map();
    for (const d of allDrafts) {
      const key = (d.name || '').toLowerCase().trim();
      if (!key) continue;
      if (!nameToSources.has(key)) nameToSources.set(key, new Set());
      if (d.sourceId) nameToSources.get(key).add(d.sourceId);
    }

    const perSource = allSources.map(source => {
      const dList = draftBySource.get(source.id) || [];
      const entityCount = dList.length;
      let uniqueEntityCount = 0;
      let sharedEntityCount = 0;
      for (const d of dList) {
        const key = (d.name || '').toLowerCase().trim();
        if (!key) continue;
        const inSources = nameToSources.get(key) || new Set();
        if (inSources.size > 1) sharedEntityCount++;
        else uniqueEntityCount++;
      }

      // Coverage heuristic: entityCount > 0 → some extraction happened.
      // Use status or extractionMetadata if present, otherwise estimate.
      const status = source.status || 'PENDING';
      const indexed = ['INDEXED', 'EXTRACTED', 'COMPLETED'].includes(status) ? 1 : 0;
      const extracted = entityCount > 0 ? 1 : 0;
      const graphed = sharedEntityCount > 0 ? 1 : 0;

      const topEntities = [...dList]
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, 5)
        .map(d => ({
          id: d.id,
          name: d.name,
          type: d.type,
          confidence: d.confidence
        }));

      return {
        sourceId: source.id,
        sourceName: source.filename || source.name || source.id,
        sourceType: source.sourceType,
        status,
        entityCount,
        uniqueEntityCount,
        sharedEntityCount,
        coverage: { indexed, extracted, graphed },
        topEntities
      };
    });

    return {
      sources: perSource,
      summary: {
        totalSources: allSources.length,
        sourcesWithEntities: perSource.filter(s => s.entityCount > 0).length,
        orphanSources: perSource.filter(s => s.entityCount === 0).length,
        totalEntities: allDrafts.length
      }
    };
  }

  /**
   * Entities present in 2+ sources.
   * @param {string} workspaceId
   * @param {Object} [options]
   * @param {number} [options.minSources=2]
   * @param {number} [options.limit=50]
   */
  async findSharedEntities(workspaceId, options = {}) {
    const minSources = options.minSources ?? 2;
    const limit = options.limit ?? 50;

    const allDrafts  = await this._listDraftsWithSource(workspaceId);
    const allSources = await sources().listSources(workspaceId);
    const sourceById = new Map(allSources.map(s => [s.id, s]));

    // Group by normalized (name + type) to avoid mixing entity Customer vs rule Customer
    const groups = new Map();
    for (const d of allDrafts) {
      if (!d.sourceId) continue;
      const key = `${(d.name || '').toLowerCase().trim()}::${d.type}`;
      if (!key.startsWith('::')) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(d);
      }
    }

    // Pull contradictions once for fast lookup
    const allContradictions = (await contradictions().getContradictions(workspaceId, { limit: 1000 }))?.items || [];
    const contradictedDraftIds = new Set();
    for (const c of allContradictions) {
      for (const eid of (c.entityIds || [])) contradictedDraftIds.add(eid);
    }

    const entities = [];
    for (const [key, drs] of groups) {
      const sourceIds = new Set(drs.map(d => d.sourceId).filter(Boolean));
      if (sourceIds.size < minSources) continue;

      const hasContradiction = drs.some(d => contradictedDraftIds.has(d.id));
      const corroborationScore = Math.min(sourceIds.size / 5, 1);

      entities.push({
        name: drs[0].name,
        type: drs[0].type,
        sources: drs.map(d => ({
          sourceId: d.sourceId,
          sourceName: sourceById.get(d.sourceId)?.filename || d.sourceId,
          draftId: d.id,
          confidence: d.confidence
        })),
        sourceCount: sourceIds.size,
        hasContradiction,
        corroborationScore
      });
    }

    // Sort: most corroborated first, then by sourceCount
    entities.sort((a, b) => b.sourceCount - a.sourceCount || b.corroborationScore - a.corroborationScore);

    const stats = {
      total: entities.length,
      avgSourceCount: entities.length > 0
        ? Number((entities.reduce((s, e) => s + e.sourceCount, 0) / entities.length).toFixed(2))
        : 0
    };

    return { entities: entities.slice(0, limit), stats };
  }

  /**
   * Infer relationships between sources (not persisted).
   */
  async inferSourceRelationships(workspaceId) {
    const allSources = await sources().listSources(workspaceId);
    const allDrafts  = await this._listDraftsWithSource(workspaceId);
    const cList = (await contradictions().getContradictions(workspaceId, { limit: 1000 }))?.items || [];

    const draftsBySource = new Map();
    for (const d of allDrafts) {
      if (!d.sourceId) continue;
      if (!draftsBySource.has(d.sourceId)) draftsBySource.set(d.sourceId, []);
      draftsBySource.get(d.sourceId).push(d);
    }

    // Pre-compute name sets per source for overlap counts
    const nameSetBySource = new Map();
    for (const [sid, ds] of draftsBySource) {
      nameSetBySource.set(sid, new Set(ds.map(d => (d.name || '').toLowerCase().trim()).filter(Boolean)));
    }

    const relationships = [];

    for (let i = 0; i < allSources.length; i++) {
      for (let j = i + 1; j < allSources.length; j++) {
        const s1 = allSources[i];
        const s2 = allSources[j];

        // Shared entity count
        const set1 = nameSetBySource.get(s1.id) || new Set();
        const set2 = nameSetBySource.get(s2.id) || new Set();
        let shared = 0;
        for (const name of set1) if (set2.has(name)) shared++;
        if (shared === 0 && set1.size > 0 && set2.size > 0) continue;

        // Contradicts: any contradiction whose sourceIds includes both
        const hasContradiction = cList.some(c => {
          const sids = c.sourceIds || [];
          return sids.includes(s1.id) && sids.includes(s2.id);
        });

        if (hasContradiction) {
          relationships.push({
            sourceId: s1.id,
            targetId: s2.id,
            sourceName: s1.filename || s1.id,
            targetName: s2.filename || s2.id,
            type: 'CONTRADICTS',
            confidence: 0.9,
            evidence: 'Sources have conflicting values for shared entities'
          });
        }

        // Supersession by date if known
        const d1 = this._parseDate(s1.uploadedAt || s1.createdAt);
        const d2 = this._parseDate(s2.uploadedAt || s2.createdAt);
        if (d1 && d2 && shared >= 3 && Math.abs(d1 - d2) > 30 * 24 * 60 * 60 * 1000) {
          const newer = d1 > d2 ? s1 : s2;
          const older = d1 > d2 ? s2 : s1;
          relationships.push({
            sourceId: newer.id,
            targetId: older.id,
            sourceName: newer.filename || newer.id,
            targetName: older.filename || older.id,
            type: 'SUPERSEDES',
            confidence: 0.7,
            evidence: `${shared} shared entities, "${newer.filename || newer.id}" is newer`
          });
        }

        // Implementation: schema source vs document source with high overlap
        const isS1Schema = SCHEMA_TYPES.has(s1.sourceType);
        const isS2Doc    = DOCUMENT_TYPES.has(s2.sourceType);
        const isS2Schema = SCHEMA_TYPES.has(s2.sourceType);
        const isS1Doc    = DOCUMENT_TYPES.has(s1.sourceType);

        if (isS1Schema && isS2Doc && shared > 0 && set2.size > 0) {
          const overlap = shared / set2.size;
          if (overlap >= 0.5) {
            relationships.push({
              sourceId: s1.id, targetId: s2.id,
              sourceName: s1.filename || s1.id,
              targetName: s2.filename || s2.id,
              type: 'IMPLEMENTS',
              confidence: Number(overlap.toFixed(2)),
              evidence: `Schema entities match ${Math.round(overlap * 100)}% of document entities`
            });
          }
        } else if (isS2Schema && isS1Doc && shared > 0 && set1.size > 0) {
          const overlap = shared / set1.size;
          if (overlap >= 0.5) {
            relationships.push({
              sourceId: s2.id, targetId: s1.id,
              sourceName: s2.filename || s2.id,
              targetName: s1.filename || s1.id,
              type: 'IMPLEMENTS',
              confidence: Number(overlap.toFixed(2)),
              evidence: `Schema entities match ${Math.round(overlap * 100)}% of document entities`
            });
          }
        }

        // RELATED_TO fallback if any shared but no other classifications recorded for this pair
        const alreadyRecorded = relationships.some(r =>
          (r.sourceId === s1.id && r.targetId === s2.id) ||
          (r.sourceId === s2.id && r.targetId === s1.id)
        );
        if (!alreadyRecorded && shared > 0) {
          relationships.push({
            sourceId: s1.id,
            targetId: s2.id,
            sourceName: s1.filename || s1.id,
            targetName: s2.filename || s2.id,
            type: 'RELATED_TO',
            confidence: Math.min(shared / 10, 0.8),
            evidence: `${shared} shared entities`
          });
        }
      }
    }

    return { relationships };
  }

  /**
   * Suggest gaps in the workspace.
   */
  async suggestMissingLinks(workspaceId, options = {}) {
    const allDrafts  = await this._listDraftsWithSource(workspaceId);
    const allSources = await sources().listSources(workspaceId);

    // Isolated entities — drafts without any incoming/outgoing edge to other drafts
    const edgeRows = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(s)
       MATCH (w)-[:CONTAINS_DRAFT]->(t)
       MATCH (s)-[r]->(t)
       WHERE type(r) <> 'CONTAINS_DRAFT' AND type(r) <> 'EXTRACTED_FROM'
         AND type(r) <> 'HAS_CONTRADICTION'
       RETURN s.id as sourceId, t.id as targetId`,
      { wsId: workspaceId }
    );
    const connected = new Set();
    for (const e of (edgeRows || [])) {
      connected.add(e.sourceId);
      connected.add(e.targetId);
    }

    const isolatedEntities = allDrafts
      .filter(d => !connected.has(d.id))
      .map(d => ({ id: d.id, name: d.name, type: d.type, sourceId: d.sourceId }));

    // Potential links — pairs of drafts with similar names but no direct edge
    const potentialLinks = [];
    const seen = new Set();
    for (let i = 0; i < allDrafts.length; i++) {
      for (let j = i + 1; j < allDrafts.length; j++) {
        const a = allDrafts[i];
        const b = allDrafts[j];
        if (a.type !== b.type) continue;
        if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) continue;

        const sim = this._nameSimilarity(a.name, b.name);
        if (sim < SHARED_NAME_THRESHOLD) continue;

        const key = [a.id, b.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);

        potentialLinks.push({
          entity1: { id: a.id, name: a.name },
          entity2: { id: b.id, name: b.name },
          similarity: Number(sim.toFixed(3)),
          reason: sim === 1 ? 'Identical names' : 'High name similarity'
        });
      }
    }
    potentialLinks.sort((a, b) => b.similarity - a.similarity);

    // Orphan sources
    const draftSourceIds = new Set(allDrafts.map(d => d.sourceId).filter(Boolean));
    const orphanSources = allSources
      .filter(s => !draftSourceIds.has(s.id))
      .map(s => ({ id: s.id, name: s.filename || s.name || s.id, sourceType: s.sourceType, status: s.status }));

    // Optional: merge GNN-based link predictions (WS3-007). Disabled by default
    // to preserve the existing test surface; UI / explicit callers can opt in.
    let mergedLinks = potentialLinks;
    let gnnStats = null;
    if (options.includeGnn === true) {
      try {
        const linkPredictor = require('./link-predictor.service');
        const gnn = await linkPredictor.predictLinks(workspaceId, {
          threshold: options.gnnThreshold ?? 0.7,
          limit: options.limit ?? 50
        });
        gnnStats = gnn?.stats || null;

        // De-dupe vs name-based
        const existingKeys = new Set(potentialLinks.map(l => [l.entity1.id, l.entity2.id].sort().join('|')));
        const gnnLinks = (gnn?.predictions || [])
          .filter(p => !existingKeys.has([p.source.id, p.target.id].sort().join('|')))
          .map(p => ({
            entity1: { id: p.source.id, name: p.source.name },
            entity2: { id: p.target.id, name: p.target.name },
            similarity: Number((p.probability ?? 0).toFixed(3)),
            reason: `GNN ${p.method} (${p.suggestedType})`,
            source: 'gnn'
          }));
        mergedLinks = [...potentialLinks, ...gnnLinks].sort((a, b) => b.similarity - a.similarity);
      } catch (err) {
        console.warn(`[CrossSourceService] GNN merge failed: ${err.message}`);
      }
    }

    return {
      isolatedEntities,
      potentialLinks: mergedLinks.slice(0, options.limit ?? 50),
      orphanSources,
      gnnStats
    };
  }

  /**
   * Full analysis report — health score + everything above.
   */
  async generateAnalysisReport(workspaceId) {
    const workspace = await ws().get(workspaceId);
    if (!workspace) throw new Error(`WorkSpace not found: ${workspaceId}`);

    const [coverage, sharedEntitiesResult, relationshipsResult, suggestions, contradictionStats] = await Promise.all([
      this.analyzeSourceCoverage(workspaceId),
      this.findSharedEntities(workspaceId),
      this.inferSourceRelationships(workspaceId),
      this.suggestMissingLinks(workspaceId),
      contradictions().getContradictionStats(workspaceId)
    ]);

    const totalEntities = coverage.summary.totalEntities;
    const totalSources  = coverage.summary.totalSources;
    const orphanSources = coverage.summary.orphanSources;
    const isolatedEntities = suggestions.isolatedEntities.length;
    const sharedEntities = sharedEntitiesResult.entities.length;
    const unresolvedContradictions = contradictionStats.byStatus.OPEN || 0;

    // Health score
    let score = 100;
    const issues = [];
    const recommendations = [];

    if (totalSources > 0) {
      const orphanRatio = orphanSources / totalSources;
      if (orphanRatio > 0.2) {
        score -= 20;
        issues.push(`${Math.round(orphanRatio * 100)}% sources have no extracted entities`);
        recommendations.push('Run extraction on remaining sources');
      }
    }

    if (contradictionStats.total > 0) {
      const unresolvedRatio = unresolvedContradictions / contradictionStats.total;
      if (unresolvedRatio > 0.5) {
        score -= 15;
        issues.push(`${unresolvedContradictions} unresolved contradictions`);
        recommendations.push('Resolve blocking contradictions before promotion');
      }
    }

    if (totalEntities > 0) {
      const isolatedRatio = isolatedEntities / totalEntities;
      if (isolatedRatio > 0.3) {
        score -= 10;
        issues.push(`${Math.round(isolatedRatio * 100)}% entities have no connections`);
        recommendations.push('Review isolated entities and add relationships');
      }

      const corroboratedRatio = sharedEntities / totalEntities;
      if (corroboratedRatio > 0.5) {
        score = Math.min(score + 10, 100);
      }
    }

    // Blocking contradictions = automatic deduction
    if ((contradictionStats.bySeverity.BLOCKING || 0) > 0) {
      score -= 15;
      issues.push(`${contradictionStats.bySeverity.BLOCKING} BLOCKING contradictions`);
      recommendations.push('BLOCKING contradictions must be resolved before promotion');
    }

    score = Math.max(0, Math.min(100, score));

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        status: workspace.status,
        domain: workspace.domain
      },
      sources: {
        total: totalSources,
        coverage: coverage.sources,
        summary: coverage.summary
      },
      entities: {
        total: totalEntities,
        shared: sharedEntitiesResult.entities,
        sharedStats: sharedEntitiesResult.stats,
        isolated: suggestions.isolatedEntities
      },
      relationships: relationshipsResult.relationships,
      contradictions: {
        total: contradictionStats.total,
        unresolved: unresolvedContradictions,
        byStatus: contradictionStats.byStatus,
        bySeverity: contradictionStats.bySeverity,
        byType: contradictionStats.byType
      },
      suggestions,
      health: { score, issues, recommendations }
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────

  _parseDate(value) {
    if (!value) return null;
    const t = Date.parse(value);
    return isNaN(t) ? null : t;
  }

  _nameSimilarity(a, b) {
    // Reuse contradiction.service helper for consistency
    const { nameSimilarity } = require('./contradiction.service');
    return nameSimilarity(a, b);
  }
}

const instance = new CrossSourceService();
module.exports = instance;
module.exports.CrossSourceService = CrossSourceService;
