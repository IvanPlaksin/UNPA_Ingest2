'use strict';
/**
 * ValidityService
 *
 * Computes a document's in-force status from its temporal fields and
 * supersession/revocation edges. The status is a derived, cacheable summary of
 * "is this document currently authoritative?":
 *
 *   IN_FORCE   — currently valid
 *   PENDING    — adopted but entry-into-force is in the future
 *   SUPERSEDED — a later document supersedes/amends it
 *   TERMINATED — explicitly revoked, or past its termination date
 *   EXPIRED    — past its expiry / mandate-end date
 *   UNKNOWN    — document not found
 *
 * Pure read + a single SET; safe to call repeatedly. Because dates pass with
 * time, statuses should be refreshed periodically (refreshAll / cron).
 */

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const NOW = () => new Date();
const past   = (d) => d && !isNaN(Date.parse(d)) && new Date(d) < NOW();
const future = (d) => d && !isNaN(Date.parse(d)) && new Date(d) > NOW();

class ValidityService {

  async getDocumentWithTemporal(documentId) {
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $id})
       RETURN d.id AS id, d.isSuperseded AS isSuperseded,
              d.expiryDate AS expiryDate, d.terminationDate AS terminationDate,
              d.mandateEndDate AS mandateEndDate, d.entryIntoForceDate AS entryIntoForceDate,
              d.organCode AS organCode, d.seriesCode AS seriesCode`,
      { id: documentId }
    ).catch(() => []);
    return rows[0] || null;
  }

  /** Does another document supersede/amend/revoke this one? Returns the relType or null. */
  async incomingSupersessionType(documentId) {
    const rows = await mg().runQuery(
      `MATCH (:Document)-[r:SUPERSEDES]->(d:Document {id: $id})
       RETURN r.relType AS relType
       ORDER BY r.extractedAt DESC LIMIT 1`,
      { id: documentId }
    ).catch(() => []);
    return rows[0]?.relType || null;
  }

  /**
   * Compute the in-force status for a document.
   * @returns {'IN_FORCE'|'PENDING'|'SUPERSEDED'|'TERMINATED'|'EXPIRED'|'UNKNOWN'}
   */
  async computeInForceStatus(documentId) {
    const doc = await this.getDocumentWithTemporal(documentId);
    if (!doc) return 'UNKNOWN';

    // 1. Supersession / revocation via graph edges (authoritative).
    const relType = await this.incomingSupersessionType(documentId);
    if (relType === 'REVOKES') return 'TERMINATED';
    if (relType) return 'SUPERSEDED';                 // SUPERSEDES/AMENDS/EXTENDS/...
    if (doc.isSuperseded) return 'SUPERSEDED';        // flag fallback

    // 2. Explicit termination.
    if (past(doc.terminationDate)) return 'TERMINATED';

    // 3. Expiry / mandate end.
    if (past(doc.expiryDate)) return 'EXPIRED';
    if (past(doc.mandateEndDate)) return 'EXPIRED';

    // 4. Not yet in force.
    if (future(doc.entryIntoForceDate)) return 'PENDING';

    return 'IN_FORCE';
  }

  /** Compute and persist inForceStatus on the Document node. Returns the status. */
  async updateDocumentStatus(documentId) {
    const status = await this.computeInForceStatus(documentId);
    if (status === 'UNKNOWN') return status;
    await mg().runQuery(
      `MATCH (d:Document {id: $id})
       SET d.inForceStatus = $status, d.inForceStatusComputedAt = $now`,
      { id: documentId, status, now: new Date().toISOString() }
    ).catch(() => {});
    return status;
  }

  /** Recompute statuses for a set of documents (or all with temporal signals). */
  async refreshAll({ limit = 5000 } = {}) {
    const neo4j = require('neo4j-driver');
    const rows = await mg().runQuery(
      `MATCH (d:Document)
       WHERE d.expiryDate IS NOT NULL OR d.terminationDate IS NOT NULL
          OR d.mandateEndDate IS NOT NULL OR d.entryIntoForceDate IS NOT NULL
          OR d.isSuperseded = true
          OR (d)<-[:SUPERSEDES]-(:Document)
       RETURN d.id AS id LIMIT $limit`,
      { limit: neo4j.int(limit) }
    ).catch(() => []);
    const counts = {};
    for (const r of rows) {
      const s = await this.updateDocumentStatus(r.id);
      counts[s] = (counts[s] || 0) + 1;
    }
    return { processed: rows.length, counts };
  }
}

module.exports = { validityService: new ValidityService(), ValidityService };
