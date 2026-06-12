'use strict';

let _qdrant, _mg;
function qdrant() { if (!_qdrant) _qdrant = require('../qdrant.service'); return _qdrant; }
function mg()     { if (!_mg)     _mg     = require('../memgraph.service'); return _mg; }

const LOG = '[VectorReconciliation]';
const VECTOR_COLLECTIONS = ['entities', 'canonical', 'doc_chunks'];

/**
 * VectorGraphReconciliationJob
 *
 * Nightly or on-demand job that detects and repairs drift between Memgraph and Qdrant.
 *
 * Checks:
 *   1. Orphan points — Qdrant point has no matching Memgraph node → delete
 *   2. Missing vectors — Memgraph node has vectorId but point gone → re-embed
 *   3. Stats — report drift count per collection
 */
class VectorGraphReconciliationJob {

  async run({ dryRun = false, collections = VECTOR_COLLECTIONS } = {}) {
    const report = {
      startedAt:     new Date().toISOString(),
      dryRun,
      collections:   {},
      totalOrphans:  0,
      totalMissing:  0,
      totalRepaired: 0,
    };

    console.log(`${LOG} Starting reconciliation (dryRun=${dryRun})`);

    for (const col of collections) {
      const colReport = await this._reconcileCollection(col, dryRun);
      report.collections[col]  = colReport;
      report.totalOrphans      += colReport.orphans;
      report.totalMissing      += colReport.missing;
      report.totalRepaired     += colReport.repaired;
    }

    report.completedAt = new Date().toISOString();
    console.log(`${LOG} Done — orphans: ${report.totalOrphans}, missing: ${report.totalMissing}, repaired: ${report.totalRepaired}`);
    return report;
  }

  async _reconcileCollection(collection, dryRun) {
    const result = { collection, orphans: 0, missing: 0, repaired: 0, errors: [] };

    const client = qdrant().client;
    if (!client) {
      result.errors.push('Qdrant client unavailable');
      return result;
    }

    // Check collection exists
    const exists = await client.getCollection(collection).then(() => true).catch(() => false);
    if (!exists) return result;

    // Scroll all points from Qdrant
    const qdrantIds = new Set();
    let offset = null;
    while (true) {
      try {
        const scrollRes = await client.scroll(collection, {
          limit: 200, offset, with_payload: true, with_vector: false,
        });
        for (const p of (scrollRes.points || [])) {
          qdrantIds.add(String(p.id));
        }
        offset = scrollRes.next_page_offset;
        if (!offset) break;
      } catch (e) {
        result.errors.push(`scroll failed: ${e.message}`);
        break;
      }
    }

    if (qdrantIds.size === 0) return result;

    // Fetch Memgraph nodes for these IDs
    const idArr = [...qdrantIds];
    const existing = new Set();
    try {
      const rows = await mg().runQuery(
        `UNWIND $ids AS id MATCH (n {id: id}) RETURN n.id AS id`,
        { ids: idArr }
      );
      for (const r of rows) existing.add(String(r.id));
    } catch (e) {
      result.errors.push(`Memgraph lookup failed: ${e.message}`);
      return result;
    }

    // 1. Orphan points — in Qdrant but no Memgraph node
    const orphanIds = idArr.filter(id => !existing.has(id));
    result.orphans = orphanIds.length;
    if (orphanIds.length > 0) {
      console.log(`${LOG} [${collection}] ${orphanIds.length} orphan points`);
      if (!dryRun) {
        try {
          await client.delete(collection, { points: orphanIds });
          result.repaired += orphanIds.length;
        } catch (e) {
          result.errors.push(`delete orphans failed: ${e.message}`);
        }
      }
    }

    // 2. Missing vectors — Memgraph nodes that think they have a vector but it's gone
    try {
      const withVectors = await mg().runQuery(
        `MATCH (n) WHERE n.vectorId IS NOT NULL AND n.vectorCollection = $col
         RETURN n.id AS id, n.vectorId AS vectorId`,
        { col: collection }
      );

      const missingIds = withVectors
        .filter(r => !qdrantIds.has(String(r.vectorId || r.id)))
        .map(r => r.id);

      result.missing = missingIds.length;

      if (missingIds.length > 0) {
        console.log(`${LOG} [${collection}] ${missingIds.length} nodes with broken vectorId`);
        if (!dryRun) {
          // Clear stale vectorId — next extraction run will re-embed
          await mg().runQuery(
            `UNWIND $ids AS id MATCH (n {id: id})
             REMOVE n.vectorId, n.vectorCollection, n.vectorIndexedAt`,
            { ids: missingIds }
          ).catch(e => result.errors.push(`clear vectorId failed: ${e.message}`));
          result.repaired += missingIds.length;
        }
      }
    } catch (e) {
      result.errors.push(`missing check failed: ${e.message}`);
    }

    return result;
  }
}

const vectorGraphReconciliationJob = new VectorGraphReconciliationJob();
module.exports = { vectorGraphReconciliationJob, VectorGraphReconciliationJob };
