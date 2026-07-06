'use strict';

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

class InvestigationSessionService {
  constructor(memgraph) {
    this._mg = memgraph;
  }

  // ─── Create ────────────────────────────────────────────────────────────────

  async create({ name, description = '', parentSessionId = null, createdBy = 'system' }) {
    const sessionId = uuidv4();
    const createdAt = new Date().toISOString();

    await this._mg.queryWithNamespace(
      `CREATE (s:InvestigationSession {
         sessionId: $sessionId,
         name: $name,
         description: $description,
         status: 'ACTIVE',
         parentSessionId: $parentSessionId,
         createdBy: $createdBy,
         createdAt: $createdAt,
         closedAt: null
       })`,
      { sessionId, name, description, parentSessionId, createdBy, createdAt }
    );

    if (parentSessionId) {
      await this._mg.queryWithNamespace(
        `MATCH (child:InvestigationSession { sessionId: $sessionId })
         MATCH (parent:InvestigationSession { sessionId: $parentSessionId })
         CREATE (child)-[:SESSION_PARENT]->(parent)`,
        { sessionId, parentSessionId }
      );
    }

    return { sessionId, name, description, status: 'ACTIVE', parentSessionId, createdBy, createdAt };
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  async findById(sessionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationSession { sessionId: $sessionId }) RETURN s`,
      { sessionId }
    );
    return rows.length > 0 ? this._map(rows[0].s) : null;
  }

  async list({ status = null, createdBy = null, parentSessionId = undefined, limit = 50, offset = 0 } = {}) {
    let where = [];
    const params = { limit: neo4j.int(limit), offset: neo4j.int(offset) };

    if (status) { where.push('s.status = $status'); params.status = status; }
    if (createdBy) { where.push('s.createdBy = $createdBy'); params.createdBy = createdBy; }
    // undefined = don't filter; null = root sessions only
    if (parentSessionId === null) {
      where.push('s.parentSessionId IS NULL');
    } else if (parentSessionId !== undefined) {
      where.push('s.parentSessionId = $parentSessionId');
      params.parentSessionId = parentSessionId;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationSession) ${whereClause}
       RETURN s ORDER BY s.createdAt DESC
       SKIP $offset LIMIT $limit`,
      params
    );
    return rows.map(r => this._map(r.s));
  }

  async listSubsessions(parentSessionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationSession { parentSessionId: $parentSessionId })
       RETURN s ORDER BY s.createdAt ASC`,
      { parentSessionId }
    );
    const sessions = rows.map(r => this._map(r.s));

    // Enrich with artifact counts
    if (sessions.length > 0) {
      const sessionIds = sessions.map(s => s.sessionId);
      const countRows = await this._mg.queryWithNamespace(
        `MATCH (a:InvestigationArtifact) WHERE a.sessionId IN $sessionIds
         RETURN a.sessionId AS sessionId, count(a) AS cnt`,
        { sessionIds }
      ).catch(() => []);
      const countMap = new Map(
        countRows.map(r => [r.sessionId, typeof r.cnt === 'object' ? (r.cnt?.low ?? 0) : (r.cnt || 0)])
      );
      sessions.forEach(s => { s.artifactCount = countMap.get(s.sessionId) || 0; });
    }

    return sessions;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(sessionId, { name, description }) {
    const sets = [];
    const params = { sessionId };
    if (name !== undefined) { sets.push('s.name = $name'); params.name = name; }
    if (description !== undefined) { sets.push('s.description = $description'); params.description = description; }
    if (sets.length === 0) return this.findById(sessionId);

    await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationSession { sessionId: $sessionId }) SET ${sets.join(', ')}`,
      params
    );
    return this.findById(sessionId);
  }

  async close(sessionId) {
    const closedAt = new Date().toISOString();
    await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationSession { sessionId: $sessionId })
       SET s.status = 'CLOSED', s.closedAt = $closedAt`,
      { sessionId, closedAt }
    );
    return this.findById(sessionId);
  }

  async archive(sessionId) {
    await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationSession { sessionId: $sessionId })
       SET s.status = 'ARCHIVED'`,
      { sessionId }
    );
    return this.findById(sessionId);
  }

  // ─── Confluence: import subsession result subgraph into parent ─────────────
  // Full two-phase process:
  //   1. Export subsession's own artifacts (evidence closure)
  //   2. Transplant each to parent session via ARTIFACT_IN_SESSION edge
  //   3. Cut EVIDENTIARY version in parent (new KB evidence acquired)
  //   4. Mark subsession as MERGED

  async confluenceSubsession(parentSessionId, subsessionId) {
    const subsession = await this.findById(subsessionId);
    if (!subsession) throw new Error(`Subsession not found: ${subsessionId}`);
    if (subsession.parentSessionId !== parentSessionId) {
      throw new Error('Session is not a direct subsession of the given parent');
    }
    if (subsession.status === 'MERGED') {
      throw new Error('Subsession is already merged');
    }

    // Lazy load artifact service and version service to avoid circular deps
    const artifactSvc = require('./investigation-artifact.service').getInvestigationArtifactService();
    const versionSvc  = require('./investigation-version.service').getInvestigationVersionService();

    // 1. Get subsession's own artifacts (not already transplanted from elsewhere)
    const ownArtifacts = await artifactSvc.listOwnArtifacts(subsessionId);

    // 2. Collect evidence closure from subsession artifacts
    const evidenceClosure = new Set();
    for (const artifact of ownArtifacts) {
      const evidenceIds = await artifactSvc.getEvidenceIds(artifact.artifactId).catch(() => []);
      evidenceIds.filter(id => id && id !== '__no-evidence__').forEach(id => evidenceClosure.add(id));
    }

    // 3. Transplant artifacts to parent session
    const transplanted = [];
    for (const artifact of ownArtifacts) {
      try {
        await artifactSvc.transplant(artifact.artifactId, parentSessionId, { sourceSubsessionId: subsessionId });
        transplanted.push(artifact.artifactId);
      } catch (err) {
        console.warn('[Confluence] Transplant failed for', artifact.artifactId, err.message);
      }
    }

    // 4. Cut evidentiary version in parent (new evidence acquired from subsession)
    let newVersion = null;
    if (transplanted.length > 0) {
      try {
        newVersion = await versionSvc.cutEvidentiary({
          sessionId: parentSessionId,
          message: `Confluence: ${subsession.name}`,
          entityIds: Array.from(evidenceClosure),
        });
      } catch (err) {
        console.warn('[Confluence] Version cut failed:', err.message);
      }
    }

    // 5. Mark subsession as MERGED
    await this.markMerged(subsessionId);

    return {
      transplanted: transplanted.length,
      artifactIds: transplanted,
      evidenceCount: evidenceClosure.size,
      newVersionId: newVersion?.versionId || null,
    };
  }

  async markMerged(sessionId) {
    const mergedAt = new Date().toISOString();
    await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationSession { sessionId: $sessionId })
       SET s.status = 'MERGED', s.mergedAt = $mergedAt`,
      { sessionId, mergedAt }
    );
    return this.findById(sessionId);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  _map(node) {
    const p = node.properties || node;
    return {
      sessionId: p.sessionId,
      name: p.name,
      description: p.description || '',
      status: p.status,
      parentSessionId: p.parentSessionId || null,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
      closedAt: p.closedAt || null,
      mergedAt: p.mergedAt || null,
    };
  }
}

let _instance = null;
function getInvestigationSessionService() {
  if (!_instance) {
    const mg = require('../memgraph.service');
    _instance = new InvestigationSessionService(mg);
  }
  return _instance;
}

module.exports = { InvestigationSessionService, getInvestigationSessionService };
