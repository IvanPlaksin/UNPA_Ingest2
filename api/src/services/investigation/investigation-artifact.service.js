'use strict';

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

// Primitive types that touch the KB (trigger evidentiary versioning)
const KB_TOUCHING_PRIMITIVES = new Set([
  'LOCATE', 'CONNECT', 'EXPAND', 'PROFILE', 'MATRIX', 'STRUCTURE', 'TIMELINE', 'RESOLVE',
]);

// Primitive types that do NOT touch the KB (no evidentiary version)
const NON_EVIDENTIAL_PRIMITIVES = new Set(['SYNTHESIZE', 'TEXT']);

const ALL_PRIMITIVE_TYPES = new Set([...KB_TOUCHING_PRIMITIVES, ...NON_EVIDENTIAL_PRIMITIVES]);

/**
 * InvestigationArtifactService
 *
 * Manages immutable computed results (artifacts) produced by investigative steps.
 *
 * Provenance invariant: every artifact MUST have ≥1 EVIDENCED_BY edge to a KB Entity node.
 * Synthesize artifacts reference the evidence nodes of earlier artifacts in the session.
 *
 * Artifact content schema (by primitiveType):
 *   LOCATE    — { query, results: [{entityId, name, type, namespace, score, snippet}], facets }
 *   CONNECT   — { fromEntityId, toEntityId, paths: [...], structuralAnalysis, interpretation }
 *   EXPAND    — { entityId, depth, nodes: [...], edges: [...] }
 *   PROFILE   — { entityId, details: {...}, relationships: [...], provenance: [...] }
 *   MATRIX    — { entityIds, questions: [{questionId, text}], answers: [{questionId, entityId, content, evidenceEntityIds}] }
 *   STRUCTURE — { entityIds, metrics: [{entityId, betweenness, closeness, degree, ...}], bridges: [...] }
 *   TIMELINE  — { entityIds, events: [{entityId, date, eventType, description, evidenceEntityIds}] }
 *   RESOLVE   — { candidates: [{entityId, matchScore, conflicts: [...]}] }
 *   SYNTHESIZE — { narrative: string, claimsWithEvidence: [{claim, evidenceEntityIds}] }
 */
class InvestigationArtifactService {
  constructor(memgraph) {
    this._mg = memgraph;
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  /**
   * Save a new artifact.
   * evidenceEntityIds: KB entity IDs this artifact is grounded on (provenance).
   * Throws if primitiveType is invalid or evidenceEntityIds is empty.
   */
  /**
   * Save a new artifact with status = COMMITTED (backwards-compatible internal flow).
   * Used by agent processMessage, refresh endpoint, confluence, etc.
   * cutEvidentiary is called by the caller before this.
   */
  async save({ sessionId, versionId, stepId, primitiveType, content, evidenceEntityIds = [] }) {
    if (!ALL_PRIMITIVE_TYPES.has(primitiveType)) {
      throw new Error(`Unknown primitiveType: ${primitiveType}`);
    }
    if (!evidenceEntityIds || evidenceEntityIds.length === 0) {
      throw new Error(`Artifact must have at least one evidenceEntityId (provenance invariant)`);
    }
    return this._createArtifact({
      sessionId, versionId, stepId, primitiveType, content,
      evidenceEntityIds, status: 'COMMITTED', producedBy: 'TOOL',
    });
  }

  /**
   * Save a new artifact with status = PROPOSED (Tool Dialog / AI proposal flow).
   * Does NOT call cutEvidentiary. A version is only cut when commit() is called.
   *
   * @param {object} opts
   * @param {string} opts.sessionId
   * @param {string} opts.versionId   — current version at time of run
   * @param {string} opts.stepId      — optional step id
   * @param {string} opts.primitiveType
   * @param {object} opts.content
   * @param {string[]} opts.evidenceEntityIds
   * @param {string} opts.producedBy  — 'TOOL' | 'AI'
   * @param {string} opts.revisionOf  — optional: artifactId this revises
   */
  async saveProposed({ sessionId, versionId, stepId = null, primitiveType, content, evidenceEntityIds = [], producedBy = 'TOOL', revisionOf = null }) {
    if (!ALL_PRIMITIVE_TYPES.has(primitiveType)) {
      throw new Error(`Unknown primitiveType: ${primitiveType}`);
    }

    let revisionNumber = 1;
    if (revisionOf) {
      const original = await this.findById(revisionOf);
      revisionNumber = (original?.revisionNumber || 1) + 1;
    }

    const artifact = await this._createArtifact({
      sessionId, versionId, stepId, primitiveType, content,
      // TEXT/SYNTHESIZE may legitimately have no KB evidence — skip __no-evidence__ placeholder
      evidenceEntityIds: (evidenceEntityIds.length > 0 || NON_EVIDENTIAL_PRIMITIVES.has(primitiveType))
        ? evidenceEntityIds
        : ['__no-evidence__'],
      status: 'PROPOSED', producedBy, revisionOf, revisionNumber,
    });

    if (revisionOf) {
      await this._mg.queryWithNamespace(
        `MATCH (new:InvestigationArtifact { artifactId: $newId })
         MATCH (orig:InvestigationArtifact { artifactId: $origId })
         MERGE (new)-[:REVISION_OF]->(orig)`,
        { newId: artifact.artifactId, origId: revisionOf }
      );
    }

    return artifact;
  }

  /**
   * Commit a PROPOSED artifact → COMMITTED.
   * Calls cutEvidentiary with the artifact's evidence entity IDs.
   * Returns { artifact, newVersion }.
   */
  async commit(artifactId, { versionService }) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { artifactId: $artifactId }) RETURN a`,
      { artifactId }
    );
    if (!rows.length) throw new Error(`Artifact not found: ${artifactId}`);
    const artifact = this._map(rows[0].a);
    if (artifact.status === 'COMMITTED') throw new Error('Artifact already committed');

    const evidenceIds = await this._getEvidenceIds(artifactId);
    const realIds = evidenceIds.filter(id => id && id !== '__no-evidence__');

    const ts = new Date().toISOString();
    await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { artifactId: $artifactId })
       SET a.status = 'COMMITTED', a.committedAt = $ts`,
      { artifactId, ts }
    );

    let newVersion = null;
    if (versionService) {
      if (KB_TOUCHING_PRIMITIVES.has(artifact.primitiveType) && realIds.length > 0) {
        // KB-touching artifact with real evidence → evidentiary version
        newVersion = await versionService.cutEvidentiary({
          sessionId: artifact.sessionId,
          message: `commit:${artifact.primitiveType.toLowerCase()}`,
          entityIds: realIds,
        });
      } else if (NON_EVIDENTIAL_PRIMITIVES.has(artifact.primitiveType)) {
        // TEXT / SYNTHESIZE → logical checkpoint version
        const label = artifact.primitiveType === 'TEXT'
          ? `note:${(artifact.content?.title || 'note').slice(0, 60)}`
          : `commit:synthesize`;
        newVersion = await versionService.cutLogical({
          sessionId: artifact.sessionId,
          message: label,
        });
      }

      if (newVersion) {
        await this._mg.queryWithNamespace(
          `MATCH (a:InvestigationArtifact { artifactId: $artifactId })
           SET a.versionId = $versionId`,
          { artifactId, versionId: newVersion.versionId }
        );
      }
    }

    return { artifact: { ...artifact, status: 'COMMITTED', committedAt: ts }, newVersion };
  }

  /**
   * Discard a PROPOSED artifact — permanently delete it.
   * Only allowed for status = 'PROPOSED'.
   */
  async discard(artifactId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { artifactId: $artifactId }) RETURN a`,
      { artifactId }
    );
    if (!rows.length) throw new Error(`Artifact not found: ${artifactId}`);
    const artifact = this._map(rows[0].a);
    if (artifact.status === 'COMMITTED') throw new Error('Cannot discard a committed artifact');

    await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { artifactId: $artifactId }) DETACH DELETE a`,
      { artifactId }
    );
    return { artifactId, discarded: true };
  }

  /**
   * Merge a partial patch into an existing artifact's content JSON.
   * Used for caching computed values (e.g. aiSummary) without creating a new revision.
   */
  async patchContent(artifactId, patch) {
    const artifact = await this.findById(artifactId);
    if (!artifact) throw new Error(`Artifact not found: ${artifactId}`);
    const merged = { ...(artifact.content || {}), ...patch };
    await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { artifactId: $artifactId }) SET a.content = $contentJson`,
      { artifactId, contentJson: JSON.stringify(merged) }
    );
  }

  /**
   * Revise a COMMITTED artifact by creating a new PROPOSED revision.
   * The original artifact is NOT affected. REVISION_OF edge links new → original.
   */
  async revise(originalArtifactId, { content, evidenceEntityIds, stepId = null }) {
    const original = await this.findById(originalArtifactId);
    if (!original) throw new Error(`Artifact not found: ${originalArtifactId}`);

    return this.saveProposed({
      sessionId: original.sessionId,
      versionId: original.versionId,
      stepId,
      primitiveType: original.primitiveType,
      content,
      evidenceEntityIds: evidenceEntityIds || original.evidenceEntityIds || [],
      producedBy: 'TOOL',
      revisionOf: originalArtifactId,
    });
  }

  // ─── Internal create ────────────────────────────────────────────────────────

  async _createArtifact({ sessionId, versionId, stepId, primitiveType, content, evidenceEntityIds, status, producedBy, revisionOf = null, revisionNumber = 1 }) {
    const artifactId = uuidv4();
    const createdAt = new Date().toISOString();
    const contentJson = JSON.stringify(content);

    await this._mg.queryWithNamespace(
      `CREATE (a:InvestigationArtifact {
         artifactId: $artifactId,
         sessionId: $sessionId,
         versionId: $versionId,
         stepId: $stepId,
         primitiveType: $primitiveType,
         content: $contentJson,
         status: $status,
         producedBy: $producedBy,
         revisionOf: $revisionOf,
         revisionNumber: $revisionNumber,
         createdAt: $createdAt
       })`,
      { artifactId, sessionId, versionId, stepId: stepId || null, primitiveType, contentJson,
        status, producedBy, revisionOf: revisionOf || null, revisionNumber, createdAt }
    );

    await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { artifactId: $artifactId })
       MATCH (s:InvestigationSession { sessionId: $sessionId })
       CREATE (a)-[:ARTIFACT_IN_SESSION]->(s)`,
      { artifactId, sessionId }
    );

    if (evidenceEntityIds && evidenceEntityIds.length > 0) {
      await this._mg.queryWithNamespace(
        `MATCH (a:InvestigationArtifact { artifactId: $artifactId })
         UNWIND $evidenceEntityIds AS eid
         MATCH (e:Entity { entityId: eid })
         MERGE (a)-[:EVIDENCED_BY]->(e)`,
        { artifactId, evidenceEntityIds }
      );
    }

    return { artifactId, sessionId, versionId, stepId: stepId || null, primitiveType, content,
             evidenceEntityIds, status, producedBy, revisionOf: revisionOf || null, revisionNumber, createdAt };
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  async findById(artifactId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { artifactId: $artifactId }) RETURN a`,
      { artifactId }
    );
    if (rows.length === 0) return null;
    const artifact = this._map(rows[0].a);
    artifact.evidenceEntityIds = await this._getEvidenceIds(artifactId);
    return artifact;
  }

  // List only COMMITTED artifacts visible in the session (for AI context — excludes drafts).
  async listCommitted(sessionId, opts = {}) {
    return this.listBySession(sessionId, { ...opts, status: 'COMMITTED' });
  }

  // List all artifacts visible in a session — including transplanted ones from subsessions.
  // Queries via ARTIFACT_IN_SESSION edge so transplanted artifacts appear in the parent.
  async listBySession(sessionId, { versionId = null, primitiveType = null, status = null, limit = 100, offset = 0 } = {}) {
    const conditions = [];
    const params = { sessionId, limit: neo4j.int(limit), offset: neo4j.int(offset) };
    if (versionId)     { conditions.push('a.versionId = $versionId');         params.versionId = versionId; }
    if (primitiveType) { conditions.push('a.primitiveType = $primitiveType'); params.primitiveType = primitiveType; }
    if (status)        { conditions.push('a.status = $status');               params.status = status; }
    const extra = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const rows = await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact)-[:ARTIFACT_IN_SESSION]->(s:InvestigationSession { sessionId: $sessionId })
       WHERE 1=1 ${extra}
       OPTIONAL MATCH (a)-[:EVIDENCED_BY]->(e:Entity)
       WITH a, COLLECT(e.entityId) AS evidenceEntityIds
       ORDER BY a.createdAt ASC
       SKIP $offset LIMIT $limit
       RETURN a, evidenceEntityIds`,
      params
    );
    return rows.map(r => ({ ...this._map(r.a), evidenceEntityIds: r.evidenceEntityIds || [] }));
  }

  // List only artifacts originally created in this session (no transplants).
  // Used by confluenceSubsession to know what to export.
  async listOwnArtifacts(sessionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { sessionId: $sessionId })
       RETURN a ORDER BY a.createdAt ASC`,
      { sessionId }
    );
    return rows.map(r => this._map(r.a));
  }

  // Transplant: make an artifact from a subsession visible in a parent session.
  // Adds ARTIFACT_IN_SESSION edge + marks the artifact with transplant metadata.
  async transplant(artifactId, targetSessionId, meta = {}) {
    const transplantedAt = new Date().toISOString();
    await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { artifactId: $artifactId })
       MATCH (s:InvestigationSession { sessionId: $targetSessionId })
       MERGE (a)-[:ARTIFACT_IN_SESSION { transplanted: true, sourceSubsessionId: $sourceSubsessionId, transplantedAt: $transplantedAt }]->(s)
       SET a.transplantedTo = $targetSessionId,
           a.sourceSubsessionId = $sourceSubsessionId,
           a.transplantedAt = $transplantedAt`,
      { artifactId, targetSessionId, sourceSubsessionId: meta.sourceSubsessionId || null, transplantedAt }
    );
    return { artifactId, targetSessionId, transplantedAt };
  }

  // Public alias for evidence IDs
  async getEvidenceIds(artifactId) {
    return this._getEvidenceIds(artifactId);
  }

  // Returns evidence entity IDs for an artifact
  async getEvidence(artifactId) {
    return this._getEvidenceIds(artifactId);
  }

  // ─── Drift Detection ───────────────────────────────────────────────────────

  /**
   * Detect KB drift for all artifacts in the session.
   *
   * Simplified approach (primary):
   *   For each artifact, check if any evidenced Entity or ESEntity node
   *   has been updated after the artifact's createdAt timestamp.
   *
   * Enhanced approach (secondary, when Sigillum is available + version has snapshot):
   *   Compare pinned KB snapshot to HEAD using Sigillum diffSnapshots.
   *
   * Returns { hasDrift, driftedArtifacts, checkedAt }
   */
  async detectDrift(sessionId, versionId, sigillumService = null) {
    const artifacts = await this.listBySession(sessionId);
    if (artifacts.length === 0) return { hasDrift: false, driftedArtifacts: [], checkedAt: new Date().toISOString() };

    const driftedArtifacts = [];

    for (const artifact of artifacts) {
      if (artifact.supersededBy) continue; // already replaced, skip
      const evidenceIds = await this._getEvidenceIds(artifact.artifactId);
      const realIds = evidenceIds.filter(id => id && id !== '__no-evidence__');
      if (realIds.length === 0) continue;

      const changes = await this._detectEntityChanges(realIds, artifact.createdAt);
      if (changes.length > 0) {
        driftedArtifacts.push({
          artifactId: artifact.artifactId,
          primitiveType: artifact.primitiveType,
          affectedEntityIds: changes.map(c => c.entityId),
          affectedEntities: changes,
          severity: changes.some(c => c.changeType === 'DELETED') ? 'HIGH' : 'MODERATE',
        });
      }
    }

    // Enhanced: Sigillum snapshot comparison (bonus layer if available)
    if (sigillumService && driftedArtifacts.length === 0 && versionId) {
      try {
        const versionRows = await this._mg.queryWithNamespace(
          `MATCH (v:InvestigationVersion { versionId: $versionId }) RETURN v.kbSnapshotId AS kbSnapshotId`,
          { versionId }
        );
        const kbSnapshotId = versionRows[0]?.kbSnapshotId;
        if (kbSnapshotId) {
          const branch = await sigillumService.getBranchByName('investigation-evidence').catch(() => null);
          const headSnapshotId = branch?.headSnapshotId;
          if (headSnapshotId && headSnapshotId !== kbSnapshotId) {
            const diff = await sigillumService.diffSnapshots(kbSnapshotId, headSnapshotId).catch(() => null);
            if (diff) {
              const changedIds = new Set([...Object.keys(diff.modified || {}), ...Object.keys(diff.removed || {})]);
              for (const artifact of artifacts) {
                if (artifact.supersededBy || driftedArtifacts.some(d => d.artifactId === artifact.artifactId)) continue;
                const evidenceIds = await this._getEvidenceIds(artifact.artifactId);
                const affected = evidenceIds.filter(id => changedIds.has(id));
                if (affected.length > 0) {
                  driftedArtifacts.push({
                    artifactId: artifact.artifactId,
                    primitiveType: artifact.primitiveType,
                    affectedEntityIds: affected,
                    affectedEntities: affected.map(id => ({ entityId: id, changeType: diff.removed?.[id] ? 'DELETED' : 'MODIFIED' })),
                    severity: affected.some(id => diff.removed?.[id]) ? 'HIGH' : 'MODERATE',
                  });
                }
              }
            }
          }
        }
      } catch { /* non-blocking */ }
    }

    return { hasDrift: driftedArtifacts.length > 0, driftedArtifacts, checkedAt: new Date().toISOString() };
  }

  async _detectEntityChanges(entityIds, afterTimestamp) {
    const changes = [];
    // Check Entity nodes
    try {
      const rows = await this._mg.queryWithNamespace(
        `MATCH (e:Entity) WHERE e.entityId IN $ids AND e.updatedAt IS NOT NULL AND e.updatedAt > $ts
         RETURN e.entityId AS entityId, 'MODIFIED' AS changeType, e.updatedAt AS updatedAt`,
        { ids: entityIds, ts: afterTimestamp }
      );
      changes.push(...rows.map(r => ({ entityId: r.entityId, changeType: r.changeType, updatedAt: r.updatedAt })));
    } catch {}
    // Check ESEntity nodes (may use different id field)
    try {
      const rows = await this._mg.queryWithNamespace(
        `MATCH (e:ESEntity) WHERE e.id IN $ids AND e.updatedAt IS NOT NULL AND e.updatedAt > $ts
         RETURN e.id AS entityId, 'MODIFIED' AS changeType, e.updatedAt AS updatedAt`,
        { ids: entityIds, ts: afterTimestamp }
      );
      const existing = new Set(changes.map(c => c.entityId));
      changes.push(...rows.filter(r => !existing.has(r.entityId)).map(r => ({ entityId: r.entityId, changeType: r.changeType, updatedAt: r.updatedAt })));
    } catch {}
    return changes;
  }

  // ─── Supersede ─────────────────────────────────────────────────────────────

  async markSuperseded(oldArtifactId, newArtifactId) {
    const supersededAt = new Date().toISOString();
    await this._mg.queryWithNamespace(
      `MATCH (old:InvestigationArtifact { artifactId: $oldArtifactId })
       MATCH (new:InvestigationArtifact { artifactId: $newArtifactId })
       SET old.supersededBy = $newArtifactId, old.supersededAt = $supersededAt
       MERGE (old)-[:SUPERSEDED_BY]->(new)`,
      { oldArtifactId, newArtifactId, supersededAt }
    );
  }

  // ─── Static helpers ────────────────────────────────────────────────────────

  static isKbTouching(primitiveType) {
    return KB_TOUCHING_PRIMITIVES.has(primitiveType);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  async _getEvidenceIds(artifactId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { artifactId: $artifactId })-[:EVIDENCED_BY]->(e:Entity)
       RETURN e.entityId AS entityId`,
      { artifactId }
    );
    return rows.map(r => r.entityId);
  }

  _map(node) {
    const p = node.properties || node;
    let content;
    try { content = JSON.parse(p.content || '{}'); } catch { content = {}; }
    return {
      artifactId: p.artifactId,
      sessionId: p.sessionId,
      versionId: p.versionId,
      stepId: p.stepId || null,
      primitiveType: p.primitiveType,
      content,
      createdAt: p.createdAt,
      // Status model
      status: p.status || 'COMMITTED',       // legacy artifacts default to COMMITTED
      producedBy: p.producedBy || 'TOOL',
      revisionOf: p.revisionOf || null,
      revisionNumber: p.revisionNumber ? (typeof p.revisionNumber === 'object' ? (p.revisionNumber.low ?? 1) : p.revisionNumber) : 1,
      committedAt: p.committedAt || null,
      // Transplant provenance
      sourceSubsessionId: p.sourceSubsessionId || null,
      transplantedTo: p.transplantedTo || null,
      isTransplanted: !!(p.sourceSubsessionId),
      // Supersede chain
      supersededBy: p.supersededBy || null,
      supersededAt: p.supersededAt || null,
    };
  }
}

let _instance = null;
function getInvestigationArtifactService() {
  if (!_instance) {
    const mg = require('../memgraph.service');
    _instance = new InvestigationArtifactService(mg);
  }
  return _instance;
}

module.exports = {
  InvestigationArtifactService,
  getInvestigationArtifactService,
  KB_TOUCHING_PRIMITIVES,
  NON_EVIDENTIAL_PRIMITIVES,
  ALL_PRIMITIVE_TYPES,
};
