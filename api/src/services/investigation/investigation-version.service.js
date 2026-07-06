'use strict';

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

/**
 * InvestigationVersionService
 *
 * Two version types:
 *   EVIDENTIARY — cut after any KB-touching primitive; pins Sigillum KB snapshot.
 *   LOGICAL     — explicit user checkpoint; inherits kbSnapshotId from ancestor.
 *
 * Version chain: parentVersionId forms a linear DAG (append-only).
 * Artifacts are also append-only — associated by versionId (created-in version).
 */
class InvestigationVersionService {
  constructor(memgraph, sigillumService) {
    this._mg = memgraph;
    this._sigillum = sigillumService;
  }

  // ─── Cut EVIDENTIARY version ───────────────────────────────────────────────

  async cutEvidentiary({ sessionId, message = '', createdBy = 'system', entityIds = [], sigillumBranchId = null }) {
    const parentVersionId = await this._getLatestVersionId(sessionId);
    const versionId = uuidv4();
    const createdAt = new Date().toISOString();

    let kbSnapshotId = null;
    if (this._sigillum && entityIds.length > 0) {
      try {
        const { snapshot } = await this._sigillum.createPartialSnapshot({
          branchId: sigillumBranchId || await this._getOrCreateInvestigationBranch(),
          entityIds,
          message: `investigation-evidence:${sessionId}:${versionId}`,
          createdBy,
        });
        kbSnapshotId = snapshot.snapshotId;
      } catch (err) {
        console.warn('[Investigation] KB snapshot pinning failed:', err.message);
      }
    }

    await this._createVersion({ versionId, sessionId, type: 'EVIDENTIARY', message, kbSnapshotId, parentVersionId, createdAt, createdBy });
    return this._buildVersionResult({ versionId, sessionId, type: 'EVIDENTIARY', message, kbSnapshotId, parentVersionId, createdAt, createdBy });
  }

  // ─── Cut LOGICAL version (user checkpoint) ────────────────────────────────

  async cutLogical({ sessionId, message = 'checkpoint', createdBy = 'system' }) {
    const parentVersionId = await this._getLatestVersionId(sessionId);
    const versionId = uuidv4();
    const createdAt = new Date().toISOString();
    const kbSnapshotId = await this._getNearestEvidentiarySnapshot(sessionId);

    await this._createVersion({ versionId, sessionId, type: 'LOGICAL', message, kbSnapshotId, parentVersionId, createdAt, createdBy });
    return this._buildVersionResult({ versionId, sessionId, type: 'LOGICAL', message, kbSnapshotId, parentVersionId, createdAt, createdBy });
  }

  // ─── Get current (latest) version ─────────────────────────────────────────

  async getCurrent(sessionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (v:InvestigationVersion { sessionId: $sessionId })
       RETURN v ORDER BY v.createdAt DESC LIMIT 1`,
      { sessionId }
    );
    return rows.length > 0 ? this._map(rows[0].v) : null;
  }

  // ─── List all versions with artifact counts ────────────────────────────────

  async list(sessionId, limit = 100, offset = 0) {
    // NOTE: Memgraph doesn't support full OPTIONAL MATCH with count in single pass cleanly,
    // so we load versions then counts separately.
    const rows = await this._mg.queryWithNamespace(
      `MATCH (v:InvestigationVersion { sessionId: $sessionId })
       RETURN v ORDER BY v.createdAt ASC
       SKIP $offset LIMIT $limit`,
      { sessionId, limit: neo4j.int(limit), offset: neo4j.int(offset) }
    );
    const versions = rows.map(r => this._map(r.v));

    // Enrich with artifact counts per version
    if (versions.length > 0) {
      const versionIds = versions.map(v => v.versionId);
      const countRows = await this._mg.queryWithNamespace(
        `MATCH (a:InvestigationArtifact { sessionId: $sessionId })
         WHERE a.versionId IN $versionIds
         RETURN a.versionId AS versionId, count(a) AS cnt`,
        { sessionId, versionIds }
      ).catch(() => []);

      const countMap = new Map(
        countRows.map(r => [r.versionId, typeof r.cnt === 'object' ? (r.cnt?.low ?? 0) : (r.cnt || 0)])
      );
      versions.forEach(v => { v.artifactCount = countMap.get(v.versionId) || 0; });
    }

    return versions;
  }

  async findById(versionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (v:InvestigationVersion { versionId: $versionId }) RETURN v`,
      { versionId }
    );
    return rows.length > 0 ? this._map(rows[0].v) : null;
  }

  // ─── Semantic diff between two versions ───────────────────────────────────
  // Artifacts are append-only: "added" = created between vA and vB by createdAt.
  // "removed" = created before vB but after vA (if vA > vB, unlikely in practice).

  async diff(versionIdA, versionIdB) {
    const [vA, vB] = await Promise.all([this.findById(versionIdA), this.findById(versionIdB)]);
    if (!vA || !vB) throw new Error(`Version not found: ${!vA ? versionIdA : versionIdB}`);

    const [artifactsAtA, artifactsAtB] = await Promise.all([
      this._getArtifactsUpTo(vA.sessionId, vA.createdAt),
      this._getArtifactsUpTo(vB.sessionId, vB.createdAt),
    ]);

    const setA = new Map(artifactsAtA.map(a => [a.artifactId, a]));
    const setB = new Map(artifactsAtB.map(a => [a.artifactId, a]));

    const added   = [...setB.values()].filter(a => !setA.has(a.artifactId));
    const removed = [...setA.values()].filter(a => !setB.has(a.artifactId));

    // Evidence diff — flatten all evidence entity IDs from artifacts
    const noEvidence = '__no-evidence__';
    const evidenceA = new Set(artifactsAtA.flatMap(a => (a.evidenceEntityIds || []).filter(e => e !== noEvidence)));
    const evidenceB = new Set(artifactsAtB.flatMap(a => (a.evidenceEntityIds || []).filter(e => e !== noEvidence)));

    const newSources     = [...evidenceB].filter(e => !evidenceA.has(e));
    const droppedSources = [...evidenceA].filter(e => !evidenceB.has(e));

    const mayContainDrift = !!(vA.kbSnapshotId && vB.kbSnapshotId && vA.kbSnapshotId !== vB.kbSnapshotId);

    return {
      fromVersion: vA,
      toVersion: vB,
      artifacts: {
        added:    added.map(a => ({ artifactId: a.artifactId, primitiveType: a.primitiveType, summary: _summarizeArtifact(a) })),
        removed:  removed.map(a => ({ artifactId: a.artifactId, primitiveType: a.primitiveType, summary: _summarizeArtifact(a) })),
        modified: [], // append-only model — artifacts are never modified in-place
      },
      evidence: {
        newSources:     newSources.map(e => ({ entityId: e })),
        droppedSources: droppedSources.map(e => ({ entityId: e })),
      },
      summary: {
        artifactsAdded:      added.length,
        artifactsRemoved:    removed.length,
        artifactsModified:   0,
        newEvidenceCount:    newSources.length,
        droppedEvidenceCount:droppedSources.length,
        mayContainDrift,
      },
      mayContainDrift,
    };
  }

  // ─── State snapshot at a specific version (read-only view) ────────────────

  async getStateAtVersion(sessionId, versionId) {
    const version = await this.findById(versionId);
    if (!version) throw new Error(`Version not found: ${versionId}`);
    if (version.sessionId !== sessionId) throw new Error('Version does not belong to this session');

    const artifacts = await this._getArtifactsUpTo(sessionId, version.createdAt);
    const steps     = await this._getStepsUpTo(sessionId, version.createdAt);

    return {
      versionId: version.versionId,
      type:      version.type,
      createdAt: version.createdAt,
      message:   version.message,
      kbSnapshotId: version.kbSnapshotId,
      artifacts,
      steps,
      artifactCount: artifacts.length,
      stepCount:     steps.length,
    };
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  async _getArtifactsUpTo(sessionId, createdAtCutoff) {
    // Get all artifacts whose associated version was created at or before the cutoff
    const rows = await this._mg.queryWithNamespace(
      `MATCH (a:InvestigationArtifact { sessionId: $sessionId })
       MATCH (v:InvestigationVersion { versionId: a.versionId })
       WHERE v.createdAt <= $cutoff
       RETURN a ORDER BY a.createdAt ASC`,
      { sessionId, cutoff: createdAtCutoff }
    );
    return rows.map(r => this._mapArtifact(r.a));
  }

  async _getStepsUpTo(sessionId, createdAtCutoff) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationStep { sessionId: $sessionId })
       WHERE s.createdAt <= $cutoff
       RETURN s ORDER BY s.createdAt ASC`,
      { sessionId, cutoff: createdAtCutoff }
    );
    return rows.map(r => this._mapStep(r.s));
  }

  async _createVersion({ versionId, sessionId, type, message, kbSnapshotId, parentVersionId, createdAt, createdBy }) {
    await this._mg.queryWithNamespace(
      `CREATE (v:InvestigationVersion {
         versionId: $versionId,
         sessionId: $sessionId,
         type: $type,
         message: $message,
         kbSnapshotId: $kbSnapshotId,
         parentVersionId: $parentVersionId,
         createdAt: $createdAt,
         createdBy: $createdBy
       })`,
      { versionId, sessionId, type, message, kbSnapshotId, parentVersionId, createdAt, createdBy }
    );

    if (parentVersionId) {
      await this._mg.queryWithNamespace(
        `MATCH (v:InvestigationVersion { versionId: $versionId })
         MATCH (parent:InvestigationVersion { versionId: $parentVersionId })
         CREATE (v)-[:VERSION_INHERITS]->(parent)`,
        { versionId, parentVersionId }
      );
    }

    if (kbSnapshotId) {
      await this._mg.queryWithNamespace(
        `MATCH (v:InvestigationVersion { versionId: $versionId })
         MATCH (snap:SnapshotRecord { snapshotId: $kbSnapshotId })
         CREATE (v)-[:VERSION_PINNED_TO]->(snap)`,
        { versionId, kbSnapshotId }
      ).catch(() => {}); // Snapshot node may not exist
    }
  }

  async _getLatestVersionId(sessionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (v:InvestigationVersion { sessionId: $sessionId })
       RETURN v.versionId AS versionId ORDER BY v.createdAt DESC LIMIT 1`,
      { sessionId }
    );
    return rows.length > 0 ? rows[0].versionId : null;
  }

  async _getNearestEvidentiarySnapshot(sessionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (v:InvestigationVersion { sessionId: $sessionId, type: 'EVIDENTIARY' })
       WHERE v.kbSnapshotId IS NOT NULL
       RETURN v.kbSnapshotId AS kbSnapshotId ORDER BY v.createdAt DESC LIMIT 1`,
      { sessionId }
    );
    return rows.length > 0 ? rows[0].kbSnapshotId : null;
  }

  async _getOrCreateInvestigationBranch() {
    if (!this._sigillum) return null;
    try {
      const existing = await this._sigillum.getBranchByName('investigation-evidence');
      if (existing) return existing.branchId;
      const created = await this._sigillum.createBranch({ name: 'investigation-evidence', createdBy: 'investigation' });
      return created.branchId;
    } catch { return null; }
  }

  _buildVersionResult(v) {
    return { versionId: v.versionId, sessionId: v.sessionId, type: v.type, message: v.message, kbSnapshotId: v.kbSnapshotId, parentVersionId: v.parentVersionId, createdAt: v.createdAt, createdBy: v.createdBy };
  }

  _map(node) {
    const p = node.properties || node;
    return { versionId: p.versionId, sessionId: p.sessionId, type: p.type, message: p.message || '', kbSnapshotId: p.kbSnapshotId || null, parentVersionId: p.parentVersionId || null, createdAt: p.createdAt, createdBy: p.createdBy };
  }

  _mapArtifact(node) {
    const p = node.properties || node;
    let content;
    try { content = JSON.parse(p.content || '{}'); } catch { content = {}; }
    return { artifactId: p.artifactId, sessionId: p.sessionId, versionId: p.versionId, primitiveType: p.primitiveType, content, createdAt: p.createdAt, evidenceEntityIds: [] };
  }

  _mapStep(node) {
    const p = node.properties || node;
    return { stepId: p.stepId, sessionId: p.sessionId, primitiveType: p.primitiveType, status: p.status, createdAt: p.createdAt };
  }
}

function _summarizeArtifact(a) {
  switch (a.primitiveType) {
    case 'LOCATE':    return `Locate: "${a.content?.query || '?'}"`;
    case 'CONNECT':   return `Connect: ${(a.content?.fromEntityId || '?').slice(0, 10)} → ${(a.content?.toEntityId || '?').slice(0, 10)}`;
    case 'EXPAND':    return `Expand depth ${a.content?.depth || '?'}, ${a.content?.nodeCount || 0} nodes`;
    case 'SYNTHESIZE':return `Synthesis: ${a.content?.narrative?.slice(0, 60) || '…'}`;
    default:          return a.primitiveType;
  }
}

let _instance = null;
function getInvestigationVersionService() {
  if (!_instance) {
    const mg = require('../memgraph.service');
    let sigillum = null;
    try { sigillum = require('../sigillum/sigillum.service').getSigillumService(); } catch {}
    _instance = new InvestigationVersionService(mg, sigillum);
  }
  return _instance;
}

module.exports = { InvestigationVersionService, getInvestigationVersionService };
