'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg, _redis;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }
function redis() {
  if (!_redis) {
    const IORedis = require('ioredis');
    _redis = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      lazyConnect: true,
    });
  }
  return _redis;
}

const LOG = '[BatchOrchestrator]';
const BATCH_PROGRESS_TTL = 86400; // 24h

function now() { return new Date().toISOString(); }
function redisKey(batchId) { return `batch:progress:${batchId}`; }
function _n(v) { return typeof v === 'object' ? (v?.low ?? 0) : (v || 0); }

/**
 * BatchOrchestratorService
 *
 * Orchestrates mass extraction from a Source Catalog source:
 *   createBatch() → browse + plan documents
 *   startImport()  → download/create Document nodes, link to BatchJob
 *   startExtraction() → enqueue BullMQ jobs per document, track progress
 *
 * Progress is written to Redis `batch:progress:{batchId}` (TTL 24h)
 * and consumed by SSE endpoint.
 */
class BatchOrchestratorService {

  // ── Discovery ────────────────────────────────────────────────────────────

  /**
   * Browse a Source Catalog source and create a BatchJob.
   * Does NOT import documents yet.
   *
   * @param {string} sourceId         - Source Catalog source ID
   * @param {string} query            - Search query
   * @param {Object} filters          - { docType, dateFrom, dateTo, language }
   * @param {Object} opts             - { extractionDepth, maxDocuments, namespace }
   * @returns {Promise<BatchJob>}
   */
  async createBatch(sourceId, query = '', filters = {}, opts = {}) {
    const { sourceCatalogService } = require('../knowledge/source-catalog.service');

    console.log(`${LOG} Creating batch sourceId=${sourceId} query="${query}"`);

    // Browse to estimate document count (first page only)
    let totalEstimate = 0;
    let previewItems  = [];
    try {
      const browseResult = await sourceCatalogService.browse(sourceId, { query, page: 1, limit: 20 });
      totalEstimate = browseResult.total || browseResult.items?.length || 0;
      previewItems  = browseResult.items || [];
    } catch (e) {
      console.warn(`${LOG} Browse failed: ${e.message}`);
    }

    const batchId = uuidv4();
    const ts = now();
    const maxDocs = opts.maxDocuments || 0; // 0 = no limit

    await mg().runQuery(
      `CREATE (b:BatchJob {
         id: $id, sourceId: $sourceId, query: $query,
         filters: $filters, extractionDepth: $depth, namespace: $ns,
         maxDocuments: $maxDocs,
         totalDocuments: $total,
         processedDocuments: 0, successfulDocuments: 0, failedDocuments: 0,
         status: 'PENDING', createdAt: $ts, startedAt: null, completedAt: null
       })`,
      {
        id: batchId, sourceId, query,
        filters: JSON.stringify(filters),
        depth: opts.extractionDepth || 'STANDARD',
        ns:   opts.namespace || 'DEFAULT',
        maxDocs, total: totalEstimate, ts,
      }
    );

    await this._writeProgress(batchId, {
      status: 'PENDING', total: totalEstimate, processed: 0,
      successful: 0, failed: 0, preview: previewItems.slice(0, 5),
    });

    console.log(`${LOG} BatchJob created id=${batchId} total~${totalEstimate}`);
    return this.getBatch(batchId);
  }

  // ── Import Phase ─────────────────────────────────────────────────────────

  /**
   * Browse all pages and import documents from Source Catalog.
   * Creates Document nodes and links them to BatchJob via INCLUDES.
   */
  async startImport(batchId) {
    const batch = await this.getBatch(batchId);
    if (!batch) throw new Error(`BatchJob not found: ${batchId}`);
    if (!['PENDING', 'FAILED'].includes(batch.status)) {
      throw new Error(`Cannot import from status=${batch.status}`);
    }

    await this._updateBatchStatus(batchId, 'DISCOVERING');
    const { sourceCatalogService } = require('../knowledge/source-catalog.service');

    const maxDocs  = _n(batch.maxDocuments) || Infinity;
    const filters  = _safeParseJson(batch.filters);
    const query    = batch.query || '';
    const ns       = batch.namespace || 'DEFAULT';
    let   imported = 0;
    let   page     = 1;
    const imported_ids = [];

    console.log(`${LOG} [${batchId}] Starting import from sourceId=${batch.sourceId}`);

    try {
      while (imported < maxDocs) {
        const browseResult = await sourceCatalogService.browse(batch.sourceId, {
          query, page, limit: 20,
        });
        const items = browseResult.items || [];
        if (items.length === 0) break;

        await this._updateBatchStatus(batchId, 'IMPORTING');

        for (const item of items) {
          if (imported >= maxDocs) break;
          try {
            const doc = await sourceCatalogService.importDocument(batch.sourceId, {
              url:       item.url || item.pdfUrl,
              pdfUrl:    item.pdfUrl,
              title:     item.title,
              namespace: ns,
              meta:      item,
            });
            if (doc?.id) {
              await this._linkDocument(batchId, doc.id);
              imported_ids.push(doc.id);
              imported++;
            }
          } catch (e) {
            console.warn(`${LOG} [${batchId}] Import failed for item: ${e.message}`);
          }
        }

        if (!browseResult.hasMore && items.length < 20) break;
        page++;
      }
    } catch (e) {
      console.error(`${LOG} [${batchId}] Import error: ${e.message}`);
      await this._updateBatchStatus(batchId, 'FAILED');
      throw e;
    }

    // Update total count with actual imported count
    await mg().runQuery(
      `MATCH (b:BatchJob {id: $id}) SET b.totalDocuments = $total`,
      { id: batchId, total: imported }
    );

    console.log(`${LOG} [${batchId}] Import done: ${imported} documents`);
    return { batchId, importedCount: imported, documentIds: imported_ids };
  }

  // ── Extraction Phase ──────────────────────────────────────────────────────

  /**
   * Enqueue BullMQ extraction jobs for all PENDING documents in the batch.
   * @param {string} batchId
   * @param {Object} opts - { concurrency (informational), priorityOffset }
   */
  async startExtraction(batchId, opts = {}) {
    const batch = await this.getBatch(batchId);
    if (!batch) throw new Error(`BatchJob not found: ${batchId}`);
    if (!['IMPORTING', 'PENDING', 'FAILED'].includes(batch.status)) {
      throw new Error(`Cannot start extraction from status=${batch.status}`);
    }

    await this._updateBatchStatus(batchId, 'EXTRACTING');

    const { enqueueDocument } = require('./unified-queue');

    // Get all linked documents
    const rows = await mg().runQuery(
      `MATCH (b:BatchJob {id: $batchId})-[:INCLUDES {status: 'PENDING'}]->(d:Document)
       RETURN d.id AS docId`,
      { batchId }
    );

    if (rows.length === 0) {
      // All docs might already be linked without PENDING status — fetch all
      const allRows = await mg().runQuery(
        `MATCH (b:BatchJob {id: $batchId})-[:INCLUDES]->(d:Document)
         WHERE d.status <> 'COMPLETED'
         RETURN d.id AS docId`,
        { batchId }
      );
      if (allRows.length === 0) {
        await this._updateBatchStatus(batchId, 'COMPLETED');
        return { batchId, enqueuedCount: 0 };
      }
      rows.push(...allRows);
    }

    let enqueued = 0;
    for (const row of rows) {
      try {
        await enqueueDocument(row.docId, {
          extractionDepth: batch.extractionDepth || 'STANDARD',
          priority: 3, // lower priority than manual extraction
          batchId,     // passed to job data for tracking
        });
        await this._updateDocumentStatus(batchId, row.docId, 'EXTRACTING');
        enqueued++;
      } catch (e) {
        console.warn(`${LOG} [${batchId}] Enqueue failed for doc=${row.docId}: ${e.message}`);
      }
    }

    console.log(`${LOG} [${batchId}] Enqueued ${enqueued}/${rows.length} extraction jobs`);

    // Subscribe to unified-queue events to track completion
    this._trackBatchCompletion(batchId, rows.map(r => r.docId)).catch(() => {});

    return { batchId, enqueuedCount: enqueued, totalDocuments: rows.length };
  }

  // ── Full lifecycle shorthand ──────────────────────────────────────────────

  /**
   * Create batch, import, and start extraction in sequence.
   * Returns immediately after enqueuing — extraction runs in background.
   */
  async run(sourceId, query, filters, opts) {
    const batch = await this.createBatch(sourceId, query, filters, opts);
    await this.startImport(batch.id);
    await this.startExtraction(batch.id, opts);
    return this.getBatch(batch.id);
  }

  // ── Control ───────────────────────────────────────────────────────────────

  async cancelBatch(batchId) {
    const batch = await this.getBatch(batchId);
    if (!batch) throw new Error(`BatchJob not found: ${batchId}`);
    await this._updateBatchStatus(batchId, 'CANCELLED');
    return { batchId, cancelled: true };
  }

  async retryFailed(batchId) {
    const { enqueueDocument } = require('./unified-queue');
    const rows = await mg().runQuery(
      `MATCH (b:BatchJob {id: $batchId})-[:INCLUDES {status: 'FAILED'}]->(d:Document)
       RETURN d.id AS docId`,
      { batchId }
    );
    let enqueued = 0;
    for (const row of rows) {
      await enqueueDocument(row.docId, { batchId, priority: 3 }).catch(() => {});
      await this._updateDocumentStatus(batchId, row.docId, 'EXTRACTING').catch(() => {});
      enqueued++;
    }
    if (enqueued > 0) await this._updateBatchStatus(batchId, 'EXTRACTING');
    return { batchId, retriedCount: enqueued };
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  async getBatch(batchId) {
    const rows = await mg().runQuery(
      `MATCH (b:BatchJob {id: $id})
       RETURN b.id AS id, b.sourceId AS sourceId, b.query AS query,
              b.filters AS filters, b.extractionDepth AS extractionDepth,
              b.namespace AS namespace, b.maxDocuments AS maxDocuments,
              b.totalDocuments AS totalDocuments,
              b.processedDocuments AS processedDocuments,
              b.successfulDocuments AS successfulDocuments,
              b.failedDocuments AS failedDocuments,
              b.status AS status, b.createdAt AS createdAt,
              b.startedAt AS startedAt, b.completedAt AS completedAt,
              b.avgKqsScore AS avgKqsScore`,
      { id: batchId }
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id:                  r.id,
      sourceId:            r.sourceId,
      query:               r.query,
      filters:             _safeParseJson(r.filters),
      extractionDepth:     r.extractionDepth,
      namespace:           r.namespace,
      maxDocuments:        _n(r.maxDocuments),
      totalDocuments:      _n(r.totalDocuments),
      processedDocuments:  _n(r.processedDocuments),
      successfulDocuments: _n(r.successfulDocuments),
      failedDocuments:     _n(r.failedDocuments),
      status:              r.status,
      createdAt:           r.createdAt,
      startedAt:           r.startedAt || null,
      completedAt:         r.completedAt || null,
      avgKqsScore:         r.avgKqsScore || null,
    };
  }

  async getBatchProgress(batchId) {
    const cached = await redis().get(redisKey(batchId)).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fallback to DB */ }
    }
    const batch = await this.getBatch(batchId);
    if (!batch) return null;
    return {
      status:     batch.status,
      total:      batch.totalDocuments,
      processed:  batch.processedDocuments,
      successful: batch.successfulDocuments,
      failed:     batch.failedDocuments,
    };
  }

  async listBatches({ status = null, limit = 20 } = {}) {
    const conds = status ? ['b.status = $status'] : [];
    const p = status ? { status } : {};
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await mg().runQuery(
      `MATCH (b:BatchJob) ${where}
       RETURN b.id AS id, b.sourceId AS sourceId, b.query AS query,
              b.status AS status, b.totalDocuments AS total,
              b.processedDocuments AS processed, b.failedDocuments AS failed,
              b.createdAt AS createdAt, b.completedAt AS completedAt
       ORDER BY b.createdAt DESC LIMIT $limit`,
      { ...p, limit }
    );
    return rows.map(r => ({
      id: r.id, sourceId: r.sourceId, query: r.query, status: r.status,
      total: _n(r.total), processed: _n(r.processed), failed: _n(r.failed),
      createdAt: r.createdAt, completedAt: r.completedAt || null,
    }));
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  async _linkDocument(batchId, docId) {
    await mg().runQuery(
      `MATCH (b:BatchJob {id: $bId}), (d:Document {id: $dId})
       MERGE (b)-[r:INCLUDES]->(d)
       ON CREATE SET r.status = 'PENDING', r.linkedAt = $ts`,
      { bId: batchId, dId: docId, ts: now() }
    ).catch(() => {});
  }

  async _updateDocumentStatus(batchId, docId, status) {
    await mg().runQuery(
      `MATCH (b:BatchJob {id: $bId})-[r:INCLUDES]->(d:Document {id: $dId})
       SET r.status = $status, r.updatedAt = $ts`,
      { bId: batchId, dId: docId, status, ts: now() }
    ).catch(() => {});
  }

  async _updateBatchStatus(batchId, status) {
    const ts = now();
    const extra = status === 'EXTRACTING' ? ', b.startedAt = $ts' : '';
    const cmpExtra = status === 'COMPLETED' ? ', b.completedAt = $ts' : '';
    await mg().runQuery(
      `MATCH (b:BatchJob {id: $id}) SET b.status = $status, b.updatedAt = $ts ${extra}${cmpExtra}`,
      { id: batchId, status, ts }
    ).catch(() => {});

    const progress = await this.getBatchProgress(batchId);
    if (progress) {
      await this._writeProgress(batchId, { ...progress, status });
    }
  }

  async _writeProgress(batchId, data) {
    await redis().setex(redisKey(batchId), BATCH_PROGRESS_TTL, JSON.stringify({
      ...data, batchId, updatedAt: now(),
    })).catch(() => {});
  }

  /**
   * Listen to unified-queue events for documents in this batch.
   * Updates BatchJob counters and emits progress via Redis pub/sub.
   */
  async _trackBatchCompletion(batchId, docIds) {
    const { progressEmitter } = require('./unified-queue');
    const remaining = new Set(docIds);
    const ts = now();

    const handleComplete = async (event) => {
      const docId = event?.sourceId;
      if (!docId || !remaining.has(docId)) return;
      remaining.delete(docId);

      const isSuccess = event?.success !== false;
      const kqs = event?.postProcessResults?.calculateKQS?.score ?? null;

      await mg().runQuery(
        `MATCH (b:BatchJob {id: $bId})
         SET b.processedDocuments = b.processedDocuments + 1,
             ${isSuccess ? 'b.successfulDocuments = b.successfulDocuments + 1,' : 'b.failedDocuments = b.failedDocuments + 1,'}
             b.updatedAt = $ts`,
        { bId: batchId, ts: now() }
      ).catch(() => {});

      await this._updateDocumentStatus(batchId, docId, isSuccess ? 'COMPLETED' : 'FAILED').catch(() => {});

      const batch = await this.getBatch(batchId);
      if (batch) {
        const progressData = {
          status: remaining.size === 0 ? 'COMPLETED' : 'EXTRACTING',
          total: batch.totalDocuments,
          processed: _n(batch.processedDocuments),
          successful: _n(batch.successfulDocuments),
          failed: _n(batch.failedDocuments),
          lastDocumentId: docId,
          lastDocumentSuccess: isSuccess,
          lastDocumentKqs: kqs,
        };
        await this._writeProgress(batchId, progressData);

        // Publish for SSE consumers
        await redis().publish(`batch:events:${batchId}`, JSON.stringify({
          type: isSuccess ? 'document_completed' : 'document_failed',
          documentId: docId, kqsScore: kqs,
          processed: progressData.processed, total: progressData.total,
        })).catch(() => {});

        if (remaining.size === 0) {
          await this._updateBatchStatus(batchId, 'COMPLETED');
          await redis().publish(`batch:events:${batchId}`, JSON.stringify({
            type: 'completed',
            summary: progressData,
          })).catch(() => {});
          progressEmitter.removeListener('completed', handleComplete);
          progressEmitter.removeListener('failed',    handleComplete);
        }
      }
    };

    progressEmitter.on('completed', handleComplete);
    progressEmitter.on('failed',    handleComplete);
  }
}

function _safeParseJson(str) {
  if (!str || typeof str === 'object') return str || {};
  try { return JSON.parse(str); } catch { return {}; }
}

const batchOrchestratorService = new BatchOrchestratorService();
module.exports = { batchOrchestratorService, BatchOrchestratorService };
