'use strict';
/**
 * DocumentProcessingService
 *
 * Orchestrates the UN document lifecycle:
 *   upload → classify (UN types + epistemic layer) → extract → KQS
 *
 * Stores Document nodes in Memgraph with full status FSM:
 *   UPLOADED → CLASSIFYING → CLASSIFIED | NEEDS_REVIEW → EXTRACTING → COMPLETED | FAILED
 *
 * Storage: Artefacts/Documents/{namespace}/{docId}_{filename}
 */

const { v4: uuidv4 } = require('uuid');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOG_PREFIX = '[DocumentProcessing]';

const DOC_STATUSES = ['UPLOADED', 'CLASSIFYING', 'CLASSIFIED', 'NEEDS_REVIEW', 'EXTRACTING', 'COMPLETED', 'FAILED'];
// Aligned with the lowest classifier rule threshold (0.55).
// Documents that pass their rule threshold go to CLASSIFIED; lower ones go to NEEDS_REVIEW.
const REVIEW_CONFIDENCE_THRESHOLD = 0.55;

const ARTEFACTS_ROOT = path.resolve(process.cwd(), 'Artefacts', 'Documents');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }
let _neo4j = null;
function neo4j() { if (!_neo4j) _neo4j = require('neo4j-driver'); return _neo4j; }
let _symbolParser = null;
function symbolParser() { if (!_symbolParser) _symbolParser = require('./source-adapters/lib/symbol-parser'); return _symbolParser; }

/**
 * Resolve the best UN-symbol candidate for a document, trying the provenance
 * symbol first, then a symbol-like title, then the (often symbol-named) file.
 * Returns the parsed symbol whose organ was recognized, or null.
 */
function resolveParsedSymbol(candidates = []) {
  for (const c of candidates) {
    if (!c) continue;
    try {
      const p = symbolParser().parseUNSymbol(c);
      if (p && p.organ) return p;
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Flatten a parsed UN symbol into the Document-node component property set.
 * Always returns the full key set (nulls when unparseable) so Cypher params
 * stay stable. Integer components are wrapped as neo4j ints for Memgraph.
 */
function symbolComponents(parsed) {
  const asInt = v => (v == null ? null : neo4j().int(v));
  const blank = {
    organCode: null, seriesCode: null, subBody: null,
    sessionNumber: null, documentNumber: null, documentYear: null,
    baseSymbol: null, suffixType: null, suffixNumber: null
  };
  if (!parsed || !parsed.organ) return blank;
  return {
    organCode:      parsed.organ || null,
    seriesCode:     parsed.series || null,
    subBody:        parsed.subBody || null,
    sessionNumber:  asInt(parsed.session),
    documentNumber: asInt(parsed.number),
    documentYear:   asInt(parsed.year),
    baseSymbol:     parsed.baseSymbol || null,
    suffixType:     parsed.suffixType || null,
    suffixNumber:   asInt(parsed.suffixNumber)
  };
}

class DocumentProcessingService {

  // ─── Upload ───────────────────────────────────────────────────────────────

  /**
   * Store uploaded file and create a Document node in Memgraph.
   * Triggers auto-classification immediately (async, non-blocking for the caller).
   *
   * @param {Buffer}  fileBuffer
   * @param {string}  originalname
   * @param {string}  mimetype
   * @param {string}  namespace
   * @returns {{ documentId, filename, status, namespace }}
   */
  /**
   * @param {Buffer}  fileBuffer
   * @param {string}  originalname
   * @param {string}  mimetype
   * @param {string}  namespace
   * @param {object}  [provenance]
   * @param {string}  [provenance.sourceUrl]        — direct download / source page URL
   * @param {string}  [provenance.sourceRepository] — ODS | OIOS | JIU | POLICY_PORTAL | MANUAL
   * @param {string}  [provenance.unSymbol]         — e.g. "A/69/517", "ST/SGB/2024/1"
   * @param {string}  [provenance.documentTitle]    — official title
   * @param {string}  [provenance.publishedDate]    — ISO date string
   */
  async uploadDocument(fileBuffer, originalname, mimetype, namespace = 'DEFAULT', provenance = {}) {
    const docId    = uuidv4();
    const now      = new Date().toISOString();
    const sha256   = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const safeFile = originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const nsDir    = path.join(ARTEFACTS_ROOT, namespace);
    fs.mkdirSync(nsDir, { recursive: true });
    const storagePath = path.join(nsDir, `${docId}_${safeFile}`);
    fs.writeFileSync(storagePath, fileBuffer);

    const sc = symbolComponents(resolveParsedSymbol([provenance.unSymbol, originalname]));
    await mg().runQuery(
      `CREATE (d:Document {
         id: $id, filename: $fn, originalname: $orig,
         mimetype: $mime, fileSize: $sz,
         contentHash: $hash, storagePath: $sp,
         namespace: $ns, status: 'UPLOADED',
         documentType: null, epistemicLayer: null,
         normativeWeight: null, classificationConfidence: null,
         classificationOverridden: false, overrideReason: null,
         kqsScore: null, extractedNodeIds: [],
         sourceUrl: $srcUrl, sourceRepository: $srcRepo,
         unSymbol: $sym, documentTitle: $title,
         publishedDate: $pubDate, accessedAt: $now,
         organCode: $organCode, seriesCode: $seriesCode, subBody: $subBody,
         sessionNumber: $sessionNumber, documentNumber: $documentNumber,
         documentYear: $documentYear, baseSymbol: $baseSymbol,
         suffixType: $suffixType, suffixNumber: $suffixNumber,
         uploadedAt: $now, updatedAt: $now
       }) RETURN d.id`,
      {
        id: docId, fn: safeFile, orig: originalname,
        mime: mimetype, sz: neo4j().int(fileBuffer.length),
        hash: sha256, sp: storagePath, ns: namespace, now,
        srcUrl:  provenance.sourceUrl        || null,
        srcRepo: provenance.sourceRepository || null,
        sym:     provenance.unSymbol         || null,
        title:   provenance.documentTitle    || null,
        pubDate: provenance.publishedDate    || null,
        ...sc
      }
    );

    // Fire-and-forget classification
    this._classifyAsync(docId).catch(e =>
      console.error(LOG_PREFIX, 'Auto-classify error for', docId, e.message)
    );

    return { documentId: docId, filename: originalname, status: 'UPLOADED', namespace };
  }

  // ─── Classification ───────────────────────────────────────────────────────

  /**
   * Run UN document classification and update the Document node.
   */
  async classifyDocument(docId) {
    const doc = await this._loadDoc(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);

    await this._setStatus(docId, 'CLASSIFYING');

    const text = await this._readDocumentText(doc.storagePath);
    const result = await require('./document-classifier').classify(
      text,
      {
        document_title: doc.documentTitle || doc.unSymbol || doc.originalname,
        un_symbol:      doc.unSymbol || null,
        filename:       doc.originalname,
      }
    );

    const status = result.confidence >= REVIEW_CONFIDENCE_THRESHOLD ? 'CLASSIFIED' : 'NEEDS_REVIEW';
    const layer  = result.epistemicLayer || null;
    const weight = result.normativeWeight != null ? result.normativeWeight : null;

    const now = new Date().toISOString();
    // Resolve the best symbol candidate (provenance symbol → title → filename)
    // and persist its components. Backfill unSymbol only when currently missing.
    const parsedSymbol = resolveParsedSymbol([doc.unSymbol, doc.documentTitle, doc.originalname]);
    const sc = symbolComponents(parsedSymbol);
    const unSymbolBackfill = doc.unSymbol || (parsedSymbol ? parsedSymbol.normalized : null);
    await mg().runQuery(
      `MATCH (d:Document {id: $id})
       SET d.status                      = $status,
           d.documentType                = $docType,
           d.epistemicLayer              = $layer,
           d.normativeWeight             = $weight,
           d.classificationConfidence    = $conf,
           d.classificationSignals       = $signals,
           d.classificationAlternatives  = $alts,
           d.unSymbol                    = coalesce(d.unSymbol, $unSymbolBackfill),
           d.organCode                   = $organCode,
           d.seriesCode                  = $seriesCode,
           d.subBody                     = $subBody,
           d.sessionNumber               = $sessionNumber,
           d.documentNumber              = $documentNumber,
           d.documentYear                = $documentYear,
           d.baseSymbol                  = $baseSymbol,
           d.suffixType                  = $suffixType,
           d.suffixNumber                = $suffixNumber,
           d.classifiedAt                = $now,
           d.updatedAt                   = $now`,
      {
        id: docId, status,
        docType:  result.document_type_id || null,
        layer,
        weight:   weight,
        conf:     result.confidence || 0,
        signals:  JSON.stringify(result.signals || []),
        alts:     JSON.stringify(result.alternatives || []),
        unSymbolBackfill,
        now,
        ...sc
      }
    );

    return { documentId: docId, status, classification: result };
  }

  /**
   * Override classification manually.
   */
  async overrideClassification(docId, typeCode, reason = '') {
    // Fetch type metadata from Memgraph
    const types = await mg().runQuery(
      `MATCH (dt:DocumentType {id: $id})
       RETURN dt.id as id, dt.epistemicLayer as layer, dt.normativeWeight as weight`,
      { id: typeCode }
    );
    const meta = types[0] || {};

    // Auto-register new document type if it doesn't exist in the knowledge base
    if (!types.length) {
      console.log(LOG_PREFIX, `Auto-registering new document type: ${typeCode}`);
      await mg().runQuery(
        `MERGE (dt:DocumentType {id: $id})
         ON CREATE SET dt.name        = $name,
                       dt.description = $desc,
                       dt.namespace   = 'USER_DEFINED',
                       dt.version     = '1.0.0',
                       dt.createdAt   = $now`,
        {
          id:   typeCode,
          name: typeCode.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          desc: `User-defined document type, auto-registered during classification override.`,
          now:  new Date().toISOString(),
        }
      ).catch(e => console.warn(LOG_PREFIX, 'Auto-register doc type error:', e.message));
    }

    await mg().runQuery(
      `MATCH (d:Document {id: $id})
       SET d.documentType            = $docType,
           d.epistemicLayer          = $layer,
           d.normativeWeight         = $weight,
           d.status                  = 'CLASSIFIED',
           d.classificationOverridden = true,
           d.overrideReason          = $reason,
           d.updatedAt               = $now`,
      {
        id: docId,
        docType: typeCode,
        layer:   meta.layer || null,
        weight:  meta.weight != null ? meta.weight : null,
        reason,
        now: new Date().toISOString()
      }
    );

    return { documentId: docId, status: 'CLASSIFIED', documentType: typeCode, overridden: true };
  }

  // ─── Extraction ───────────────────────────────────────────────────────────

  /**
   * Trigger extraction pipeline for a classified document.
   * Queues a BullMQ job; returns jobId immediately.
   */
  async extractDocument(docId, options = {}) {
    let doc = await this._loadDoc(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);

    // force=true resets stuck EXTRACTING/FAILED/EXTRACTION_FAILED/COMPLETED back to CLASSIFIED
    if (options.force && ['EXTRACTING', 'FAILED', 'EXTRACTION_FAILED', 'COMPLETED'].includes(doc.status)) {
      await this._setStatus(docId, 'CLASSIFIED');
      doc = await this._loadDoc(docId);
    }

    if (!['CLASSIFIED', 'NEEDS_REVIEW'].includes(doc.status)) {
      throw new Error(`Document must be CLASSIFIED before extraction (current: ${doc.status})`);
    }

    await this._setStatus(docId, 'EXTRACTING');

    // Enqueue via unified BullMQ queue (returns real jobId)
    const { enqueueDocument } = require('../extraction/unified-queue');
    const { jobId } = await enqueueDocument(docId, {
      model: options.model,
      force: options.force,
    });

    return { documentId: docId, status: 'EXTRACTING', jobId };
  }

  /**
   * Re-queue all documents that need reprocessing:
   *   - status FAILED or EXTRACTION_FAILED
   *   - status CLASSIFIED with aiExtractedAt set (stuck: extraction ran but never completed)
   *
   * For stuck CLASSIFIED docs, clears aiExtractedAt so the ingestion agent stops skipping them.
   * Uses force=true to reset status before enqueuing.
   *
   * @param {{ namespace?: string, model?: string }} options
   * @returns {{ queued: Array, errors: Array, total: number }}
   */
  async reprocessFailedDocuments(options = {}) {
    const nsFilter = options.namespace ? 'AND d.namespace = $ns' : '';
    const params   = options.namespace ? { ns: options.namespace } : {};

    const rows = await mg().runQuery(
      `MATCH (d:Document)
       WHERE (
         d.status IN ['FAILED', 'EXTRACTION_FAILED']
         OR (d.status IN ['CLASSIFIED', 'NEEDS_REVIEW'] AND d.aiExtractedAt IS NOT NULL)
       ) ${nsFilter}
       RETURN d.id AS id, d.originalname AS name, d.status AS status, d.namespace AS namespace
       ORDER BY d.updatedAt ASC`,
      params
    );

    const queued = [];
    const errors = [];
    const now    = new Date().toISOString();

    for (const row of rows) {
      try {
        // Clear aiExtractedAt so the ingestion agent won't skip this doc in future runs
        if (['CLASSIFIED', 'NEEDS_REVIEW'].includes(row.status)) {
          await mg().runQuery(
            `MATCH (d:Document {id: $id}) SET d.aiExtractedAt = null, d.updatedAt = $now`,
            { id: row.id, now }
          );
        }
        const result = await this.extractDocument(row.id, { force: true, model: options.model });
        queued.push({ documentId: row.id, name: row.name, namespace: row.namespace, jobId: result.jobId, previousStatus: row.status });
      } catch (err) {
        errors.push({ documentId: row.id, name: row.name, namespace: row.namespace, error: err.message });
      }
    }

    return { total: rows.length, queued, errors };
  }

  // ─── Structure Analysis ───────────────────────────────────────────────────

  /**
   * Analyze the logical structure of a document and save to Memgraph.
   * Returns the structure object.
   */
  async analyzeDocumentStructure(docId) {
    const doc = await this._loadDoc(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);

    const text = await this._readDocumentText(doc.storagePath);
    const { documentStructureService } = require('./document-structure.service');
    const structure = documentStructureService.analyzeStructure(text, doc.documentType);

    const now = new Date().toISOString();
    await mg().runQuery(
      `MATCH (d:Document {id: $id})
       SET d.documentStructure = $structure, d.structureAnalyzedAt = $now, d.updatedAt = $now`,
      { id: docId, structure: JSON.stringify(structure), now }
    );

    return structure;
  }

  // ─── Status & List ────────────────────────────────────────────────────────

  async getDocumentStatus(docId) {
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $id})
       RETURN d.id as id, d.filename as filename, d.originalname as originalname,
              d.status as status, d.namespace as namespace,
              d.documentType as documentType, d.epistemicLayer as epistemicLayer,
              d.normativeWeight as normativeWeight,
              d.classificationConfidence as classificationConfidence,
              d.classificationOverridden as classificationOverridden,
              d.classificationAlternatives as classificationAlternatives,
              d.classificationSignals as classificationSignals,
              d.kqsScore as kqsScore,
              d.extractedNodeIds as extractedNodeIds,
              d.fileSize as fileSize, d.uploadedAt as uploadedAt, d.updatedAt as updatedAt,
              d.aiExtractedAt as aiExtractedAt, d.extractedAt as extractedAt,
              d.extractionError as extractionError,
              d.sourceUrl as sourceUrl, d.sourceRepository as sourceRepository,
              d.unSymbol as unSymbol, d.documentTitle as documentTitle,
              d.publishedDate as publishedDate,
              d.marcData as marcData, d.metaRefreshedAt as metaRefreshedAt,
              d.documentStructure as documentStructure, d.structureAnalyzedAt as structureAnalyzedAt`,
      { id: docId }
    );
    if (!rows.length) return null;
    return this._formatDoc(rows[0]);
  }

  async listDocuments({ namespace, status, layer, since, limit = 50, offset = 0 } = {}) {
    let cypher = `MATCH (d:Document)`;
    const conditions = [];
    const params = { limit: neo4j().int(limit), offset: neo4j().int(offset) };

    if (namespace) { conditions.push('d.namespace = $ns');   params.ns = namespace; }
    if (status)    { conditions.push('d.status = $status');  params.status = status; }
    if (layer)     { conditions.push('d.epistemicLayer = $layer'); params.layer = layer; }
    if (since)     { conditions.push('d.uploadedAt >= $since'); params.since = since; }

    if (conditions.length) cypher += ` WHERE ${conditions.join(' AND ')}`;
    cypher += ` RETURN d.id as id, d.filename as filename, d.originalname as originalname,
                       d.status as status, d.namespace as namespace,
                       d.documentType as documentType, d.epistemicLayer as epistemicLayer,
                       d.normativeWeight as normativeWeight,
                       d.classificationConfidence as classificationConfidence,
                       d.classificationOverridden as classificationOverridden,
                       d.kqsScore as kqsScore,
                       d.fileSize as fileSize, d.uploadedAt as uploadedAt, d.updatedAt as updatedAt,
                       d.aiExtractedAt as aiExtractedAt, d.extractedAt as extractedAt,
                       d.extractionError as extractionError,
                       d.sourceUrl as sourceUrl, d.sourceRepository as sourceRepository,
                       d.unSymbol as unSymbol, d.documentTitle as documentTitle,
                       d.publishedDate as publishedDate
                ORDER BY d.uploadedAt DESC
                SKIP $offset LIMIT $limit`;

    const rows = await mg().runQuery(cypher, params);
    return rows.map(r => this._formatDoc(r));
  }

  async getStats(namespace) {
    const params = {};
    let filter = '';
    if (namespace) { filter = 'WHERE d.namespace = $ns'; params.ns = namespace; }

    const rows = await mg().runQuery(
      `MATCH (d:Document) ${filter}
       RETURN d.status as status, count(d) as count
       ORDER BY count DESC`,
      params
    );
    const byStatus = rows.map(r => ({ status: r.status, count: r.count }));
    const total = byStatus.reduce((s, r) => s + Number(r.count), 0);
    return { total, byStatus };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  async _classifyAsync(docId) {
    try { await this.classifyDocument(docId); }
    catch (e) {
      await this._setStatus(docId, 'FAILED');
      console.error(LOG_PREFIX, 'Classification failed for', docId, e.message);
    }
  }

  async _extractInline(docId, doc) {
    try {
      const { documentExtractionService } = require('./document-extraction.service');
      await documentExtractionService.extractDocument(docId);
    } catch (e) {
      await this._setStatus(docId, 'FAILED');
      throw e;
    }
  }

  async _readDocumentText(storagePath) {
    try {
      const buf = fs.readFileSync(storagePath);
      const ext = path.extname(storagePath).toLowerCase();

      if (ext === '.pdf') {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buf, { max: 0 }); // max:0 = all pages
        return data.text || '';
      }

      if (ext === '.docx' || ext === '.doc') {
        const mammoth = require('mammoth');
        const { value } = await mammoth.extractRawText({ buffer: buf });
        return value || '';
      }

      // Plain text / txt / csv / xml — read as UTF-8
      return buf.toString('utf-8');
    } catch (e) {
      console.warn(LOG_PREFIX, '_readDocumentText error for', storagePath, e.message);
      return '';
    }
  }

  async _setStatus(docId, status) {
    await mg().runQuery(
      `MATCH (d:Document {id: $id}) SET d.status = $status, d.updatedAt = $now`,
      { id: docId, status, now: new Date().toISOString() }
    );
  }

  async _loadDoc(docId) {
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $id})
       RETURN d.id as id, d.storagePath as storagePath, d.originalname as originalname,
              d.status as status, d.namespace as namespace,
              d.epistemicLayer as epistemicLayer, d.documentType as documentType,
              d.documentTitle as documentTitle, d.unSymbol as unSymbol`,
      { id: docId }
    );
    return rows[0] || null;
  }

  _formatDoc(r) {
    let alts = [], signals = [], marc = null, structure = null;
    try { alts       = JSON.parse(r.classificationAlternatives || '[]'); } catch { alts = []; }
    try { signals    = JSON.parse(r.classificationSignals || '[]'); }     catch { signals = []; }
    try { marc       = JSON.parse(r.marcData || 'null'); }                catch { marc = null; }
    try { structure  = JSON.parse(r.documentStructure || 'null'); }       catch { structure = null; }
    return {
      id:                        r.id,
      filename:                  r.filename,
      originalname:              r.originalname,
      status:                    r.status,
      namespace:                 r.namespace,
      documentType:              r.documentType,
      epistemicLayer:            r.epistemicLayer,
      normativeWeight:           r.normativeWeight,
      classificationConfidence:  r.classificationConfidence,
      classificationOverridden:  r.classificationOverridden,
      classificationAlternatives: alts,
      classificationSignals:     signals,
      kqsScore:                  r.kqsScore,
      fileSize:                  r.fileSize,
      uploadedAt:                r.uploadedAt,
      updatedAt:                 r.updatedAt,
      aiExtractedAt:             r.aiExtractedAt    || null,
      extractedAt:               r.extractedAt      || null,
      extractionError:           r.extractionError  || null,
      sourceUrl:                 r.sourceUrl        || null,
      sourceRepository:          r.sourceRepository || null,
      unSymbol:                  r.unSymbol         || null,
      documentTitle:             r.documentTitle    || null,
      publishedDate:             r.publishedDate    || null,
      marcData:                  marc,
      metaRefreshedAt:           r.metaRefreshedAt     || null,
      documentStructure:         structure,
      structureAnalyzedAt:       r.structureAnalyzedAt || null,
    };
  }
}

const documentProcessingService = new DocumentProcessingService();
module.exports = { documentProcessingService, DocumentProcessingService, DOC_STATUSES };
