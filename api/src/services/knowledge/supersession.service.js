'use strict';

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const now = () => new Date().toISOString();

function _toInt(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return v?.low ?? v?.toNumber?.() ?? 0;
}

class SupersessionService {

  /**
   * Create a SUPERSEDES relationship: newer document supersedes older one.
   * @param {string} newerId — ESEntity id of the newer (superseding) document
   * @param {string} olderId — ESEntity id of the older (superseded) document
   */
  async createSupersession(newerId, olderId, { reason, effectiveDate } = {}) {
    if (!newerId || !olderId) throw new Error('newerId and olderId are required');
    if (newerId === olderId) throw new Error('An entity cannot supersede itself');
    const ts = now();
    await mg().runQuery(
      `MATCH (n:ESEntity {id: $newerId}), (o:ESEntity {id: $olderId})
       MERGE (n)-[r:SUPERSEDES]->(o)
       SET r.reason        = $reason,
           r.effectiveDate = $effectiveDate,
           r.createdAt     = $ts`,
      { newerId, olderId, reason: reason || null, effectiveDate: effectiveDate || null, ts }
    );
    return { newerId, olderId, createdAt: ts };
  }

  /**
   * Remove a SUPERSEDES edge between two entities.
   */
  async removeSupersession(newerId, olderId) {
    await mg().runQuery(
      `MATCH (n:ESEntity {id: $newerId})-[r:SUPERSEDES]->(o:ESEntity {id: $olderId})
       DELETE r`,
      { newerId, olderId }
    );
    return { newerId, olderId };
  }

  /**
   * Get the full supersession chain for an entity:
   * - supersedes: documents this entity supersedes (older versions)
   * - supersededBy: documents that supersede this entity (newer versions)
   * - isInForce: true if nothing supersedes this entity
   */
  async getSupersessionChain(entityId) {
    const [supersedes, supersededBy] = await Promise.all([
      // outgoing: what this entity supersedes
      mg().runQuery(
        `MATCH (e:ESEntity {id: $id})-[:SUPERSEDES*1..20]->(prev:ESEntity)
         RETURN prev.id AS id, prev.name AS name, prev.type AS type,
                prev.documentSymbol AS documentSymbol, prev.effectiveDate AS effectiveDate,
                prev.isInForce AS isInForce`,
        { id: entityId }
      ),
      // incoming: what supersedes this entity
      mg().runQuery(
        `MATCH (newer:ESEntity)-[:SUPERSEDES*1..20]->(e:ESEntity {id: $id})
         RETURN newer.id AS id, newer.name AS name, newer.type AS type,
                newer.documentSymbol AS documentSymbol, newer.effectiveDate AS effectiveDate`,
        { id: entityId }
      ),
    ]);

    return {
      entityId,
      supersedes:    supersedes.map(r => ({
        id: r.id, name: r.name, type: r.type,
        documentSymbol: r.documentSymbol || null,
        effectiveDate:  r.effectiveDate  || null,
        isInForce:      r.isInForce      ?? null,
      })),
      supersededBy:  supersededBy.map(r => ({
        id: r.id, name: r.name, type: r.type,
        documentSymbol: r.documentSymbol || null,
        effectiveDate:  r.effectiveDate  || null,
      })),
      isInForce: supersededBy.length === 0,
    };
  }

  /**
   * Check if a document entity is currently in force (not superseded by anything).
   */
  async isInForce(entityId) {
    const rows = await mg().runQuery(
      `MATCH (newer:ESEntity)-[:SUPERSEDES]->(e:ESEntity {id: $id})
       RETURN newer.id AS newerId, newer.name AS newerName, newer.documentSymbol AS newerSymbol LIMIT 1`,
      { id: entityId }
    );
    if (rows.length === 0) return { entityId, isInForce: true };
    const r = rows[0];
    return {
      entityId,
      isInForce: false,
      supersededById:     r.newerId   || null,
      supersededByName:   r.newerName || null,
      supersededBySymbol: r.newerSymbol || null,
    };
  }

  /**
   * Find the current (most recent) version in a supersession chain.
   * Walks from entityId upwards through SUPERSEDED_BY chains.
   */
  async findCurrentVersion(entityId) {
    // Get all entities that supersede this one (directly or indirectly)
    // The current version is the one with no incoming SUPERSEDES at all
    const rows = await mg().runQuery(
      `MATCH (e:ESEntity {id: $id})
       OPTIONAL MATCH (newer:ESEntity)-[:SUPERSEDES*1..20]->(e)
       WITH newer
       WHERE newer IS NOT NULL
       WITH collect(newer) AS chain, e
       UNWIND (chain + [e]) AS candidate
       WITH DISTINCT candidate
       WHERE NOT EXISTS { MATCH ()-[:SUPERSEDES]->(candidate) }
       RETURN candidate.id AS id, candidate.name AS name, candidate.type AS type,
              candidate.documentSymbol AS documentSymbol
       LIMIT 1`,
      { id: entityId }
    );
    if (!rows.length) {
      // entityId itself might be current
      const self = await mg().runQuery(
        `MATCH (e:ESEntity {id: $id})
         WHERE NOT EXISTS { MATCH ()-[:SUPERSEDES]->(e) }
         RETURN e.id AS id, e.name AS name, e.type AS type, e.documentSymbol AS documentSymbol`,
        { id: entityId }
      );
      return self[0] ? { id: self[0].id, name: self[0].name, type: self[0].type, documentSymbol: self[0].documentSymbol, isSelf: true } : null;
    }
    return { id: rows[0].id, name: rows[0].name, type: rows[0].type, documentSymbol: rows[0].documentSymbol, isSelf: rows[0].id === entityId };
  }

  /**
   * Get all entities in the same supersession family (all versions, oldest to newest).
   */
  async getSupersessionFamily(entityId) {
    // Find the oldest ancestor, then walk forward
    const rows = await mg().runQuery(
      `MATCH (e:ESEntity {id: $id})
       OPTIONAL MATCH (e)-[:SUPERSEDES*1..20]->(ancestor:ESEntity)
       WITH e, collect(DISTINCT ancestor) AS ancestors
       UNWIND (ancestors + [e]) AS member
       WITH DISTINCT member
       OPTIONAL MATCH (newer)-[:SUPERSEDES]->(member)
       RETURN member.id AS id, member.name AS name, member.type AS type,
              member.documentSymbol AS documentSymbol, member.effectiveDate AS effectiveDate,
              newer IS NULL AS isCurrentVersion
       ORDER BY member.effectiveDate ASC`,
      { id: entityId }
    );
    return rows.map(r => ({
      id:               r.id,
      name:             r.name,
      type:             r.type,
      documentSymbol:   r.documentSymbol   || null,
      effectiveDate:    r.effectiveDate     || null,
      isCurrentVersion: r.isCurrentVersion  ?? false,
    }));
  }

  /**
   * Update document-specific attributes (documentSymbol, effectiveDate, etc.) on an ESEntity.
   */
  async updateDocumentAttributes(entityId, attrs = {}) {
    const { documentSymbol, effectiveDate, expirationDate, issuingAuthority, documentCategory, isInForce } = attrs;
    await mg().runQuery(
      `MATCH (e:ESEntity {id: $id})
       SET e.documentSymbol   = $documentSymbol,
           e.effectiveDate    = $effectiveDate,
           e.expirationDate   = $expirationDate,
           e.issuingAuthority = $issuingAuthority,
           e.documentCategory = $documentCategory,
           e.isInForce        = $isInForce`,
      {
        id: entityId,
        documentSymbol:   documentSymbol   || null,
        effectiveDate:    effectiveDate     || null,
        expirationDate:   expirationDate    || null,
        issuingAuthority: issuingAuthority  || null,
        documentCategory: documentCategory  || null,
        isInForce:        isInForce != null ? isInForce : null,
      }
    );
    return { entityId, ...attrs };
  }
}

const supersessionService = new SupersessionService();
module.exports = { supersessionService, SupersessionService };
