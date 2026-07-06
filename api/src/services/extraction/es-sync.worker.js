'use strict';

/**
 * ES Sync Worker
 *
 * Syncs AI-extracted EntityMention nodes into the Entity Store (ESEntity/ES_RELATED_TO)
 * after each successful extraction run. Called inline from unified-queue.js after
 * extraction completes, and also available standalone for re-sync.
 *
 * Flow per document:
 *   1. importFromDocument(docId, { namespace }) — upsert ESEntity nodes, import relationships
 *   2. Materialize edge costs on newly added edges (lightweight: per-doc filter)
 *   3. Return sync stats
 */

const { v4: uuidv4 } = require('uuid');

let _entityStoreService = null;
let _edgeWeightService  = null;

function entityStore() {
  if (!_entityStoreService) {
    _entityStoreService = require('../knowledge/entity-store.service').entityStoreService;
  }
  return _entityStoreService;
}

function edgeWeight() {
  if (!_edgeWeightService) {
    _edgeWeightService = require('../knowledge/edge-weight.service');
  }
  return _edgeWeightService;
}

/**
 * Sync a single document's extraction results into the Entity Store.
 * @param {string} docId       - Document ID
 * @param {object} options
 * @param {string} options.namespace - ES namespace (default: 'DEFAULT')
 * @returns {Promise<{docId, imported, linked, skipped, relCount, error}>}
 */
async function syncDocument(docId, { namespace = 'DEFAULT' } = {}) {
  const start = Date.now();
  console.log(`[ESSync] Starting sync for doc=${docId} namespace=${namespace}`);

  try {
    const importResult = await entityStore().importFromDocument(docId, { namespace });

    console.log(
      `[ESSync] doc=${docId} created=${importResult.created} linked=${importResult.linked} ` +
      `skipped=${importResult.skipped} refsLinked=${importResult.refsLinked ?? 0} ` +
      `elapsed=${Date.now() - start}ms`
    );

    return {
      docId,
      success:    true,
      created:    importResult.created    || 0,
      linked:     importResult.linked     || 0,
      skipped:    importResult.skipped    || 0,
      total:      importResult.total      || 0,
      refsLinked: importResult.refsLinked || 0,
      docEntityId: importResult.docEntityId || null,
      elapsedMs:  Date.now() - start,
    };
  } catch (err) {
    console.error(`[ESSync] doc=${docId} FAILED: ${err.message}`);
    return { docId, success: false, error: err.message, elapsedMs: Date.now() - start };
  }
}

/**
 * Recalculate edge costs for all ES_RELATED_TO edges (runs after batch of docs).
 * Lightweight — only updates cost property, does not fetch topology.
 */
async function recalculateEdgeCosts(includeDegree = false) {
  try {
    const stats = await edgeWeight().recalculateAllEdgeCosts(includeDegree);
    console.log(
      `[ESSync] Edge costs recalculated: updated=${stats.updated} ` +
      `min=${stats.min.toFixed(3)} max=${stats.max.toFixed(3)} avg=${stats.avg.toFixed(3)}`
    );
    return stats;
  } catch (err) {
    console.error(`[ESSync] Edge cost recalculation failed: ${err.message}`);
    return { updated: 0, error: err.message };
  }
}

/**
 * Sync a batch of documents and recalculate edge costs at the end.
 * @param {string[]} docIds
 * @param {object}  options
 * @returns {Promise<{results, edgeCostStats, totalCreated, totalLinked, totalFailed}>}
 */
async function syncBatch(docIds, { namespace = 'DEFAULT', recalcEdgeCosts = true } = {}) {
  console.log(`[ESSync] Batch sync: ${docIds.length} docs namespace=${namespace}`);

  const results = [];
  for (const docId of docIds) {
    results.push(await syncDocument(docId, { namespace }));
  }

  const succeeded  = results.filter(r => r.success);
  const failed     = results.filter(r => !r.success);
  const totalCreated = succeeded.reduce((s, r) => s + (r.created  || 0), 0);
  const totalLinked  = succeeded.reduce((s, r) => s + (r.linked   || 0), 0);
  const totalSkipped = succeeded.reduce((s, r) => s + (r.skipped  || 0), 0);

  let edgeCostStats = null;
  if (recalcEdgeCosts && succeeded.length > 0) {
    edgeCostStats = await recalculateEdgeCosts(false);
  }

  return {
    results,
    edgeCostStats,
    totalDocs:    docIds.length,
    totalSuccess: succeeded.length,
    totalFailed:  failed.length,
    totalCreated,
    totalLinked,
    totalSkipped,
    failedDocIds: failed.map(r => r.docId),
  };
}

module.exports = { syncDocument, syncBatch, recalculateEdgeCosts };
