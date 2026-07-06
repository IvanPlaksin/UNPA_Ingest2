'use strict';

/**
 * ES Ingestion Agent
 *
 * Finds unprocessed Document nodes and processes them through the extraction
 * pipeline + ES sync in batches of N. Handles AI rate limits with exponential
 * backoff. Reports each batch to Claude chat 8b097e47-…
 *
 * State machine:  IDLE → RUNNING → PAUSED → RUNNING | STOPPED → IDLE
 */

const { spawn }         = require('child_process');
const path              = require('path');
const { EventEmitter }  = require('events');

const REPORT_CHAT_ID       = '8b097e47-ee14-47c9-928d-67fa4e21200c';
const BATCH_SIZE           = 5;
const JOB_POLL_INTERVAL_MS = 8000;
const JOB_TIMEOUT_MS       = 900000; // 15 min
const LOG_MAX              = 300;    // circular log buffer size

const RATE_LIMIT_BACKOFF   = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];
const DAILY_LIMIT_PAUSE_MS = 4 * 60 * 60_000;
const EMPTY_POLL_MS        = 30_000; // poll interval when queue is empty

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// ─── Log buffer ───────────────────────────────────────────────────────────────

const _logBuffer = [];          // { ts, level, msg }[]
const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(50);

function log(level, msg) {
  const entry = { ts: new Date().toISOString(), level, msg };
  _logBuffer.push(entry);
  if (_logBuffer.length > LOG_MAX) _logBuffer.shift();
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    `[ESIngestionAgent] ${msg}`
  );
  logEmitter.emit('entry', entry);
}

const logInfo  = msg => log('info',  msg);
const logWarn  = msg => log('warn',  msg);
const logError = msg => log('error', msg);

// ─── Lazy dependencies ────────────────────────────────────────────────────────

let _mg = null, _queue = null;
function mg()    { if (!_mg)    _mg    = require('../services/memgraph.service');            return _mg; }
function queue() { if (!_queue) _queue = require('../services/extraction/unified-queue');    return _queue; }

// ─── DOCUMENTREF auto-download state ─────────────────────────────────────────

// Tracks ref names currently being downloaded (prevents duplicate simultaneous downloads)
const _downloadingRefs = new Set();
// Tracks download failure counts per ref name; after 2 failures, skip for the session
const _failedDocRefs   = new Map();
// Guards against concurrent downloadMissingDocRefs() calls
let _downloadingBatch = false;

// UN document symbol pattern: starts with 1-3 uppercase letters, has a slash, ends with digits
// Matches: A/69/414, S/RES/2744(2024), A/RES/69/262, E/2021/8, ST/ESA/SER.E/178
// Rejects freeform text like "resolution 2744 (2024)" or "Institute's 2010-2012 strategic plan"
const UN_SYMBOL_RE = /^[A-Z][A-Z0-9.]{0,5}\/[\w/()\-. ]+\d+[\w/()\-. ]*$/;

function isUnDocumentSymbol(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 5 || trimmed.length > 80) return false;
  return UN_SYMBOL_RE.test(trimmed);
}

// ─── Agent state ──────────────────────────────────────────────────────────────

let _state          = 'IDLE';
let _stopRequested  = false;
let _pauseRequested = false;
let _rateLimitCount = 0;
let _config         = { namespace: 'DEFAULT', batchSize: BATCH_SIZE, methodology: 'M2C' };
let _runLoopPromise = null;

const _stats = {
  totalBatches: 0, totalDocs: 0, totalSuccess: 0, totalFailed: 0,
  totalESCreated: 0, totalESLinked: 0,
  activeSlots: 0, waitingDocs: 0,
  startedAt: null, lastBatchAt: null, lastError: null,
};

// ─── Claude-chat report (fire-and-forget via claude.exe subprocess) ───────────

function findClaudeBin() {
  const c = [
    process.env.CLAUDE_CODE_PATH,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'AnthropicClaude', 'claude.exe') : null,
    'claude',
  ].filter(Boolean);
  for (const p of c) {
    if (p === 'claude') return p;
    try { if (require('fs').existsSync(p)) return p; } catch {}
  }
  return null;
}

async function sendChatReport(message) {
  const bin = findClaudeBin();
  if (!bin) { logWarn('claude.exe not found — skipping chat report'); return; }

  const prompt = [
    `Use the project-knowledge MCP server tool "send_message_to_chat" with exactly these parameters:`,
    `  conversationId: "${REPORT_CHAT_ID}"`,
    `  message: ${JSON.stringify(message)}`,
    `  maxTokens: 50`,
    `  provider: "claude"`,
    `Call the tool once, then stop. Do not add commentary.`,
  ].join('\n');

  return new Promise(resolve => {
    let proc;
    try {
      proc = spawn(bin, [
        '--print', '--output-format', 'stream-json', '--input-format', 'text',
        '--no-session-persistence', '--max-turns', '1', '--dangerously-skip-permissions',
        '--model', 'claude-haiku-4-5-20251001',
      ], { env: { ...process.env }, cwd: PROJECT_ROOT, windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    } catch { resolve(); return; }
    const timer = setTimeout(() => { proc.kill('SIGTERM'); resolve(); }, 60000);
    proc.on('close', () => { clearTimeout(timer); resolve(); });
    proc.on('error', () => { clearTimeout(timer); resolve(); });
    proc.stderr.on('data', () => {});
    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();
  }).catch(() => {});
}

// ─── Document discovery ───────────────────────────────────────────────────────

async function findUnprocessedDocs(limit = 50) {
  // NOTE: Memgraph does not accept parameterised LIMIT — use interpolation
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const rows = await mg().runQuery(
    `MATCH (d:Document)
     WHERE d.aiExtractedAt IS NULL
       AND d.storagePath IS NOT NULL
       AND NOT (d.status IN ['COMPLETED', 'EXTRACTING', 'EXTRACTION_FAILED'])
     RETURN d.id AS id, d.documentTitle AS title, d.unSymbol AS symbol,
            d.documentType AS docType, d.createdAt AS createdAt
     ORDER BY d.createdAt ASC
     LIMIT ${safeLimit}`,
    {}
  );
  return rows.map(r => ({
    id:      r.id,
    title:   r.title  || r.id,
    symbol:  r.symbol || null,
    docType: r.docType || null,
  }));
}

/**
 * Secondary document source: find Documents referenced by pending DOCUMENTREF ESEntities
 * (no ES_RELATED_TO → Document edge) that haven't been extracted yet.
 * These are missed by findUnprocessedDocs() because:
 *  - their aiExtractedAt may be set (previously extracted poorly)
 *  - their status may be EXTRACTION_FAILED (agent skips those)
 */
async function findDocRefCandidates(limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  try {
    const rows = await mg().runQuery(
      `MATCH (ref:ESEntity {type: 'DOCUMENTREF'})
       WHERE NOT (ref)-[:ES_RELATED_TO]->(:ESEntity {type: 'DOCUMENT'})
       WITH DISTINCT ref.name AS refName
       LIMIT 300
       MATCH (d:Document)
       WHERE d.storagePath IS NOT NULL
         AND d.uploadedAt IS NOT NULL
         AND d.status <> 'EXTRACTING'
         AND d.status <> 'COMPLETED'
         AND (
           d.unSymbol = refName
           OR toLower(d.unSymbol) = toLower(refName)
           OR (d.unSymbol IS NOT NULL AND toLower(d.unSymbol) CONTAINS toLower(refName) AND size(refName) >= 5)
         )
       RETURN DISTINCT d.id AS id, d.documentTitle AS title, d.unSymbol AS symbol,
              d.documentType AS docType, d.status AS status, d.createdAt AS createdAt
       ORDER BY d.createdAt ASC
       LIMIT ${safeLimit}`,
      {}
    );
    return rows.filter(r => r.id).map(r => ({
      id: r.id, title: r.title || r.id, symbol: r.symbol || null, docType: r.docType || null, status: r.status,
    }));
  } catch (e) {
    logWarn(`findDocRefCandidates error: ${e.message}`);
    return [];
  }
}

/**
 * Find DOCUMENTREF ESEntities that have no corresponding Document node at all.
 * These need to be downloaded from the source before they can be extracted.
 */
async function findPendingDocRefs(limit = 10) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 200));
  try {
    const rows = await mg().runQuery(
      `MATCH (ref:ESEntity {type: 'DOCUMENTREF'})
       WHERE ref.provenanceDocId IS NOT NULL
         AND ref.name IS NOT NULL
         AND NOT (ref)-[:ES_RELATED_TO]->(:ESEntity {type: 'DOCUMENT'})
       WITH DISTINCT ref.name AS refName, ref.provenanceDocId AS sourceDocId
       MATCH (src:Document {id: sourceDocId})
       WITH refName, src.namespace AS namespace,
            src.sourceRepository AS sourceRepository, src.sourceUrl AS sourceUrl
       OPTIONAL MATCH (existing:Document)
       WHERE existing.unSymbol = refName OR toLower(existing.unSymbol) = toLower(refName)
       WITH refName, namespace, sourceRepository, sourceUrl, collect(existing.id) AS existingDocs
       WHERE size(existingDocs) = 0
       RETURN DISTINCT refName, namespace, sourceRepository, sourceUrl
       LIMIT ${safeLimit}`,
      {}
    );
    return rows
      .filter(r => r.refName && isUnDocumentSymbol(r.refName))
      .map(r => ({
        refName:          r.refName,
        namespace:        r.namespace || 'DEFAULT',
        sourceRepository: r.sourceRepository || null,
        sourceUrl:        r.sourceUrl || null,
      }));
  } catch (e) {
    logWarn(`findPendingDocRefs error: ${e.message}`);
    return [];
  }
}

/**
 * Attempt to download a buffer from a URL, returning null if the response is not a PDF.
 */
async function _fetchPdfBuffer(url, httpsAgent) {
  const axios = require('axios');
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 90000,
    maxRedirects: 10,
    httpsAgent,
    headers: { 'User-Agent': 'Mozilla/5.0 UNPA-Ingest/1.0' },
    maxContentLength: 50 * 1024 * 1024,
  });
  const contentType = (response.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) return null;
  const buf = Buffer.from(response.data);
  return buf.length >= 1024 ? buf : null;
}

/**
 * Resolve a UN document symbol to a direct PDF URL via the Digital Library search API.
 * Returns null when no PDF link can be found.
 */
async function _resolveViaDigitalLibrary(symbol, httpsAgent) {
  const axios = require('axios');
  const dlUrl = `https://digitallibrary.un.org/search?p=${encodeURIComponent(symbol)}&of=recjson&action_search=Search&rg=5&jrec=1&ln=e`;
  let resp;
  try {
    resp = await axios.get(dlUrl, {
      timeout: 25000,
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) UNPA/1.0',
        'Accept': 'application/json',
      },
    });
  } catch { return null; }

  if (!resp.data || typeof resp.data !== 'object') return null;
  const hits = resp.data?.hits?.hits || [];

  for (const h of hits) {
    const files = h?._source?.files || [];
    const recid = h?._id || h?._source?.recid;

    if (files.length > 0 && recid) {
      const enPdf = files.find(f => {
        const n = (f.full_name || f.name || '').toUpperCase();
        return n.includes('-EN.') && n.endsWith('.PDF');
      }) || files.find(f => (f.full_name || f.name || '').toLowerCase().endsWith('.pdf'));

      if (enPdf) {
        const fname = enPdf.full_name || enPdf.name;
        return `https://digitallibrary.un.org/record/${recid}/files/${encodeURIComponent(fname)}`;
      }
    }

    // The url field may directly point to a PDF
    const hitUrl = String(h?._source?.url?.[0]?.value || h?._source?.url || '');
    if (hitUrl && (hitUrl.toLowerCase().endsWith('.pdf') || hitUrl.includes('/files/'))) {
      return hitUrl;
    }
  }
  return null;
}

/**
 * Download a UN document by symbol and create a Document node.
 *
 * Download priority:
 *  1. documents.un.org/api/symbol/access  — ODS REST API (direct PDF, no WAF)
 *  2. Digital Library search API          — resolves recid → files → PDF link
 *
 * Returns the new documentId on success, null on failure.
 */
async function downloadDocRefDocument(refName, namespace) {
  const https      = require('https');
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  // ── 1. ODS symbol access API ─────────────────────────────────────────────────
  // The docs.un.org SPA uses this endpoint internally to serve PDFs.
  const odsApiUrl = `https://documents.un.org/api/symbol/access?s=${encodeURIComponent(refName)}&l=en&t=pdf`;
  const sourceUrl = `https://docs.un.org/en/${refName}`;

  logInfo(`Downloading DOCUMENTREF "${refName}" via ODS API`);

  let buffer = null;
  try {
    buffer = await _fetchPdfBuffer(odsApiUrl, httpsAgent);
  } catch (e) {
    logWarn(`ODS API fetch failed for "${refName}": ${e.message}`);
  }

  // ── 2. Fall back to Digital Library search ───────────────────────────────────
  if (!buffer) {
    const dlPdfUrl = await _resolveViaDigitalLibrary(refName, httpsAgent);
    if (dlPdfUrl) {
      logInfo(`DOCUMENTREF "${refName}": resolved via DL → ${dlPdfUrl}`);
      try {
        buffer = await _fetchPdfBuffer(dlPdfUrl, httpsAgent);
      } catch (e) {
        logWarn(`DL PDF fetch failed for "${refName}": ${e.message}`);
      }
    }
  }

  if (!buffer) {
    logWarn(`DOCUMENTREF "${refName}": could not obtain a PDF from any source`);
    return null;
  }

  const filename = refName.replace(/\//g, '_').replace(/[^a-zA-Z0-9._()-]/g, '_') + '.pdf';
  try {
    const { documentProcessingService } = require('../services/knowledge/document-processing.service');
    const result = await documentProcessingService.uploadDocument(
      buffer, filename, 'application/pdf',
      namespace || 'DEFAULT',
      {
        sourceUrl,
        documentTitle:    refName,
        unSymbol:         refName,
        sourceRepository: 'ODS',
      }
    );
    const docId = result?.documentId || null;
    if (docId) logInfo(`✓ DOCUMENTREF "${refName}" → Document ${docId} (${buffer.length} bytes)`);
    return docId;
  } catch (e) {
    logWarn(`DOCUMENTREF "${refName}": uploadDocument failed: ${e.message}`);
    return null;
  }
}

/**
 * Check for DOCUMENTREF ESEntities whose target document doesn't exist and download them.
 * Fires up to 3 downloads in parallel (background, non-blocking).
 * After 2 failed attempts per symbol in this session, stops retrying that symbol.
 */
async function downloadMissingDocRefs() {
  if (_downloadingBatch) return;
  _downloadingBatch = true;
  try {
    const DOWNLOAD_BATCH  = 3;
    const MAX_ATTEMPTS    = 2;
    // Fetch a large buffer — most rows will be filtered out by isUnDocumentSymbol
    // (free-text references, prefixed "Resolution X", EB docs, etc.)
    const fetchLimit = Math.max(100, (DOWNLOAD_BATCH + _downloadingRefs.size + _failedDocRefs.size) * 30);
    const refs = await findPendingDocRefs(fetchLimit);
    const toDownload = refs
      .filter(r => !_downloadingRefs.has(r.refName))
      .filter(r => (_failedDocRefs.get(r.refName) || 0) < MAX_ATTEMPTS)
      .slice(0, DOWNLOAD_BATCH);

    if (toDownload.length === 0) return;

    logInfo(`DOCUMENTREF auto-download: ${toDownload.length} UN document(s) to fetch`);
    for (const ref of toDownload) {
      _downloadingRefs.add(ref.refName);
      downloadDocRefDocument(ref.refName, ref.namespace)
        .then(docId => {
          if (!docId) _failedDocRefs.set(ref.refName, (_failedDocRefs.get(ref.refName) || 0) + 1);
        })
        .catch(e => {
          logWarn(`downloadDocRefDocument "${ref.refName}": ${e.message}`);
          _failedDocRefs.set(ref.refName, (_failedDocRefs.get(ref.refName) || 0) + 1);
        })
        .finally(() => _downloadingRefs.delete(ref.refName));
    }
  } finally {
    _downloadingBatch = false;
  }
}

async function getTotalUnprocessed() {
  try {
    const rows = await mg().runQuery(
      `MATCH (d:Document)
       WHERE d.storagePath IS NOT NULL
         AND NOT (d.status IN ['COMPLETED', 'EXTRACTING', 'EXTRACTION_FAILED'])
       RETURN count(d) AS cnt`, {}
    );
    const v = rows[0]?.cnt;
    return typeof v === 'object' ? (v?.low ?? 0) : (v ?? 0);
  } catch { return null; }
}

async function getESStats() {
  try {
    const { entityStoreService } = require('../services/knowledge/entity-store.service');
    return await entityStoreService.getStats();
  } catch { return {}; }
}

// ─── Rate-limit helpers ───────────────────────────────────────────────────────

function isRateLimitError(e) {
  const m = (e?.message || e?.failedReason || '').toLowerCase();
  return m.includes('rate limit') || m.includes('ratelimit') ||
         m.includes('429') || m.includes('overloaded') || m.includes('quota exceeded');
}
function isDailyLimitError(e) {
  const m = (e?.message || e?.failedReason || '').toLowerCase();
  return m.includes('daily') && (m.includes('limit') || m.includes('quota'));
}
function isPaymentError(e) {
  const m = (e?.message || e?.failedReason || '').toLowerCase();
  return m.includes('credit balance is too low') ||
         m.includes('insufficient credits') ||
         m.includes('plans & billing') ||
         m.includes('payment required');
}

// ─── Sliding-window run loop ──────────────────────────────────────────────────
//
// Maintains exactly `batchSize` active extraction jobs at all times.
// When any job completes (success or failure) the next available document
// is immediately enqueued — no waiting for the full batch to finish.

async function runLoop() {
  const { namespace, batchSize, methodology } = _config;
  Object.assign(_stats, {
    totalBatches: 0, totalDocs: 0, totalSuccess: 0, totalFailed: 0,
    totalESCreated: 0, totalESLinked: 0,
    startedAt: new Date().toISOString(), lastBatchAt: null, lastError: null,
    activeSlots: 0, waitingDocs: 0,
  });
  _rateLimitCount = 0;

  // docId → jobId  (docs currently in BullMQ — active)
  const _inFlight = new Map();
  // jobId → docId  (reverse lookup for completion events)
  const _jobToDoc = new Map();
  // docId → display name (symbol or short title)
  const _docNames = new Map();
  // ── Waiting queue ──────────────────────────────────────────────────────────
  // Local in-memory list of documents staged for processing. Populated in bulk
  // by populateWaitingQueue(); fillSlots() moves items from here to Active jobs.
  const _waitingQueue = [];        // { id, title, symbol, docType, status? }[]
  const _waitingSet   = new Set(); // O(1) dedup guard
  let _populatingQueue = false;
  // guard against concurrent fillSlots calls
  let _filling = false;
  // track how many docs were processed so we know when to send "batch done" report
  let _reportedAtTotal = 0;

  const total = await getTotalUnprocessed();
  logInfo(`Started (sliding-window) — namespace=${namespace} slots=${batchSize} pending=${total ?? '?'}`);
  sendChatReport(`🚀 ES Ingestion Agent started\nNamespace: ${namespace} | Slots: ${batchSize} | Pending: ${total ?? '?'} docs`);

  // ── Waiting queue populator ───────────────────────────────────────────────
  // Queries Memgraph for all pending documents and adds them to _waitingQueue.
  // Called once on start and when the waiting queue runs dry during idle.
  async function populateWaitingQueue() {
    if (_populatingQueue) return;
    _populatingQueue = true;
    try {
      const REFILL_BATCH = 200;

      // Primary: regular unprocessed documents
      let docs = [];
      try {
        docs = await findUnprocessedDocs(REFILL_BATCH);
      } catch (e) {
        logWarn(`populateWaitingQueue/findUnprocessedDocs: ${e.message}`);
      }

      // Secondary: documents that are referenced by pending DOCUMENTREF ESEntities
      // but were excluded from the primary query (EXTRACTION_FAILED, etc.)
      let docRefDocs = [];
      try {
        docRefDocs = await findDocRefCandidates(REFILL_BATCH);
      } catch (e) {
        logWarn(`populateWaitingQueue/findDocRefCandidates: ${e.message}`);
      }

      // Merge: primary first, then any DocRef candidates not already included
      const all = [...docs];
      for (const d of docRefDocs) {
        if (!all.some(a => a.id === d.id)) all.push(d);
      }

      let added = 0;
      for (const doc of all) {
        if (_waitingSet.has(doc.id) || _inFlight.has(doc.id)) continue;
        _waitingQueue.push(doc);
        _waitingSet.add(doc.id);
        added++;
      }
      _stats.waitingDocs = _waitingQueue.length;
      if (added > 0) {
        logInfo(`Waiting queue: +${added} docs staged (total waiting: ${_waitingQueue.length})`);
      }
    } finally {
      _populatingQueue = false;
    }
  }

  // ── Slot replenisher ──────────────────────────────────────────────────────
  // Moves documents from _waitingQueue → BullMQ (Active jobs) to fill free slots.
  // Never queries Memgraph directly — that is populateWaitingQueue's job.
  async function fillSlots() {
    if (_filling || _stopRequested) return;
    _filling = true;
    try {
      const slotsNeeded = batchSize - _inFlight.size;
      if (slotsNeeded <= 0) return;

      // Pull candidates from waiting queue — skip any that raced to _inFlight already
      const toProcess = [];
      while (toProcess.length < slotsNeeded && _waitingQueue.length > 0) {
        const doc = _waitingQueue.shift();
        _waitingSet.delete(doc.id);
        if (_inFlight.has(doc.id)) continue; // already active (race guard)
        toProcess.push(doc);
      }
      _stats.waitingDocs = _waitingQueue.length;

      if (toProcess.length === 0) return; // waiting queue is empty — caller will repopulate

      // Reset EXTRACTION_FAILED DocRef candidates so they can re-enter BullMQ
      const toReset = toProcess.filter(d => d.status === 'EXTRACTION_FAILED');
      if (toReset.length > 0) {
        const now = new Date().toISOString();
        await mg().runQuery(
          `UNWIND $ids AS docId
           MATCH (d:Document {id: docId})
           SET d.status = 'CLASSIFIED', d.aiExtractedAt = null, d.updatedAt = $now`,
          { ids: toReset.map(d => d.id), now }
        ).catch(e => logWarn(`DocRef candidate reset failed: ${e.message}`));
      }

      for (const doc of toProcess) {
        if (_stopRequested) break;
        const docName = doc.symbol || (doc.title && doc.title !== doc.id ? doc.title.slice(0, 40) : null) || doc.id.slice(0, 8);
        _inFlight.set(doc.id, null); // reserve slot immediately
        _docNames.set(doc.id, docName);
        _stats.activeSlots = _inFlight.size;
        try {
          const enqResult = methodology && methodology !== 'standard'
            ? await queue().enqueueMethodology(doc.id, methodology, { esNamespace: namespace })
            : await queue().enqueueDocument(doc.id, { esNamespace: namespace });
          const { jobId } = enqResult;
          _inFlight.set(doc.id, jobId);
          _jobToDoc.set(jobId, doc.id);
          logInfo(`→ ${docName} [${doc.docType || '?'}] job=${jobId} [${_inFlight.size}/${batchSize} active | ${_waitingQueue.length} waiting]`);
        } catch (e) {
          _inFlight.delete(doc.id);
          _docNames.delete(doc.id);
          _stats.activeSlots = _inFlight.size;
          logWarn(`enqueue failed ${docName}: ${e.message}`);
        }
      }
      _stats.totalBatches++;
      _stats.lastBatchAt = new Date().toISOString();
    } finally {
      _filling = false;
    }
  }

  // ── Completion handler ────────────────────────────────────────────────────
  const { progressEmitter } = queue();

  const onProgress = async (payload) => {
    if (payload.phase !== 'completed' && payload.phase !== 'failed') return;

    const docId = _jobToDoc.get(payload.jobId);
    if (!docId) return; // not our job

    const docName = _docNames.get(docId) || docId.slice(0, 8);
    _inFlight.delete(docId);
    _jobToDoc.delete(payload.jobId);
    _docNames.delete(docId);
    _stats.totalDocs++;
    _stats.activeSlots = _inFlight.size;

    if (payload.phase === 'completed') {
      _stats.totalSuccess++;
      const es  = payload.result?.esSync || {};
      _stats.totalESCreated += es.created || 0;
      _stats.totalESLinked  += es.linked  || 0;

      // ── Rich per-step summary ──────────────────────────────────────────────
      const r   = payload.result || {};
      const ps  = r.stats || {};
      const kqs = r.postProcessResults?.calculateKQS?.score;
      const durS   = ps.durationMs ? `${(ps.durationMs / 1000).toFixed(1)}s` : '?';
      const kqsStr = kqs != null ? ` KQS:${kqs.toFixed(2)}` : '';

      logInfo(
        `✓ ${docName} | ` +
        `ent:${ps.entitiesExtracted ?? 0} rel:${ps.relationsFound ?? 0} vec:${ps.vectorsIndexed ?? 0}${kqsStr} | ` +
        `${durS} | ES +${es.created ?? 0}/${es.linked ?? 0} [${_inFlight.size}/${batchSize}]`
      );

      // Sanity checks — these should never fire now that embed step is fatal
      if ((ps.vectorsIndexed ?? 0) === 0 && (ps.entitiesExtracted ?? 0) > 0) {
        logWarn(`  ⚠ ${docName} — vectorsIndexed=0 despite ${ps.entitiesExtracted} entities. TEI service may be slow.`);
      }
      if ((es.created ?? 0) === 0 && (es.linked ?? 0) === 0 && (ps.entitiesExtracted ?? 0) > 0 && (es.skipped ?? 0) === 0) {
        logWarn(`  ⚠ ${docName} — Entity Store: nothing created or linked. Check entity-store service.`);
      }

      const STEP_SHORT = {
        'load-source':        'load',
        'ocr-scan':           'ocr',
        'chunk-text':         'chunk',
        'extract-entities':   'extract',
        'extract-relations':  'rel',
        'deduplicate':        'dedup',
        'persist-graph':      'graph',
        'embed-and-index':    'embed',
        'post-process':       'post',
        'store-result':       'store',
      };
      const stepParts = (r.steps || [])
        .filter(st => st.status !== 'pending')
        .map(st => {
          const label = STEP_SHORT[st.name] || st.name.slice(0, 6);
          const d     = st.duration != null ? `${(st.duration / 1000).toFixed(1)}s` : '';
          const mark  = st.status === 'failed' ? '✗' : st.status === 'skipped' ? '~' : '';
          return `${mark}${label}${d ? ':' + d : ''}`;
        });
      if (stepParts.length > 0) {
        logInfo(`  └─ ${stepParts.join(' · ')}`);
      }
    } else {
      _stats.totalFailed++;
      const errMsg = payload.error || 'unknown';
      logWarn(`✗ ${docName} failed [${_inFlight.size}/${batchSize}]: ${errMsg}`);
      _stats.lastError = errMsg;

      if (/tei|null vector|qdrant|embed/i.test(errMsg)) {
        logWarn(`  ↑ Vector indexing failure — check TEI at ${process.env.TEI_URL || 'localhost:8081'} and Qdrant at ${process.env.QDRANT_URL || 'localhost:6333'}`);
      }

      if (isPaymentError({ message: errMsg })) {
        logError(`Anthropic API credit balance exhausted — stopping agent. Add credits or switch to M2C.`);
        sendChatReport(`❌ Anthropic API credits exhausted — agent stopped.\nError: ${errMsg.slice(0, 200)}\nSwitch methodology to M2C (Claude Code) or add credits to continue.`);
        _stopRequested = true;
      } else if (isRateLimitError({ message: errMsg })) {
        _rateLimitCount++;
        const backoffMs = RATE_LIMIT_BACKOFF[Math.min(_rateLimitCount - 1, RATE_LIMIT_BACKOFF.length - 1)];
        logWarn(`Rate limit #${_rateLimitCount} — backing off ${Math.round(backoffMs / 1000)}s`);
        sendChatReport(`⚠️ Rate limit (attempt ${_rateLimitCount}). Backoff ${Math.round(backoffMs / 1000)}s`);
        _state = 'PAUSED';
        await new Promise(r => setTimeout(r, backoffMs));
        if (!_stopRequested) { _state = 'RUNNING'; _rateLimitCount = 0; }
      } else if (isDailyLimitError({ message: errMsg })) {
        const resumeAt = new Date(Date.now() + DAILY_LIMIT_PAUSE_MS).toISOString();
        logWarn(`Daily limit hit — pausing 4h until ${resumeAt}`);
        sendChatReport(`⏸ Daily AI limit reached. Resuming at ${resumeAt}`);
        _state = 'PAUSED';
        await new Promise(r => setTimeout(r, DAILY_LIMIT_PAUSE_MS));
        if (!_stopRequested) { _state = 'RUNNING'; _rateLimitCount = 0; }
      }
    }

    // Refill the freed slot immediately from the waiting queue.
    // If the waiting queue is empty, repopulate it first (new docs may have arrived).
    if (!_stopRequested && _state !== 'PAUSED') {
      if (_waitingQueue.length === 0) {
        await populateWaitingQueue();
        downloadMissingDocRefs().catch(e => logWarn(`downloadMissingDocRefs: ${e.message}`));
      }
      await fillSlots();
    }
  };

  progressEmitter.on('global', onProgress);

  // ── Initial fill ──────────────────────────────────────────────────────────
  // Populate the waiting queue first, then kick off DOCUMENTREF downloads,
  // then move the first batch from Waiting → Active.
  await populateWaitingQueue();
  downloadMissingDocRefs().catch(e => logWarn(`downloadMissingDocRefs: ${e.message}`));
  await fillSlots();

  if (_inFlight.size === 0) {
    logInfo(`Queue empty — ${_waitingQueue.length} waiting, watching for new documents (polling every 30s). Use Stop to exit.`);
  }

  // ── Wait loop ─────────────────────────────────────────────────────────────
  // Runs until Stop is requested. Actual work happens in onProgress callbacks
  // (job completion → fillSlots → pull from _waitingQueue → Active).
  // Periodic idle ticks: repopulate waiting queue and kick off DocRef downloads.
  const IDLE_CHECK_MS = 3000;

  while (!_stopRequested) {
    // Pause handling
    if (_pauseRequested) {
      _state = 'PAUSED';
      logInfo('Paused by user request');
      while (_pauseRequested && !_stopRequested) {
        await new Promise(r => setTimeout(r, 1000));
      }
      if (_stopRequested) break;
      _state = 'RUNNING';
      logInfo('Resumed — refilling slots');
      await populateWaitingQueue();
      await fillSlots();
    }

    await new Promise(r => setTimeout(r, IDLE_CHECK_MS));

    // Stall guard: if slots are free, try to fill them from the waiting queue
    if (_inFlight.size < batchSize && !_stopRequested && !_pauseRequested) {
      // Waiting queue is empty → repopulate from Memgraph + kick DocRef downloads
      if (_waitingQueue.length === 0) {
        await populateWaitingQueue();
        downloadMissingDocRefs().catch(e => logWarn(`downloadMissingDocRefs: ${e.message}`));
      }
      await fillSlots();

      // Both active and waiting queues are empty — nothing left to process right now
      if (_inFlight.size === 0 && _waitingQueue.length === 0) {
        // Send "batch done" report once after processing a set of documents
        if (_stats.totalDocs > _reportedAtTotal) {
          const esStats = await getESStats();
          logInfo(`Batch complete — ✓${_stats.totalSuccess} ✗${_stats.totalFailed} | ES entities: ${esStats.totalEntities ?? '?'}`);
          sendChatReport(
            `✅ Batch complete\n` +
            `Docs: ${_stats.totalDocs} (✓${_stats.totalSuccess} ✗${_stats.totalFailed})\n` +
            `ES created: ${_stats.totalESCreated} | linked: ${_stats.totalESLinked} | entities total: ${esStats.totalEntities ?? '?'}\n` +
            `Watching for new documents...`
          );
          _reportedAtTotal = _stats.totalDocs;
        }
        // Sleep longer when both queues are empty to avoid busy-polling
        await new Promise(r => setTimeout(r, EMPTY_POLL_MS));
      }
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  progressEmitter.off('global', onProgress);
  _inFlight.clear();
  _jobToDoc.clear();
  _waitingQueue.length = 0;
  _waitingSet.clear();
  _stats.activeSlots = 0;
  _stats.waitingDocs = 0;

  if (_stats.totalDocs > 0) {
    const esStats = await getESStats();
    logInfo(`Stopped — ✓${_stats.totalSuccess} ✗${_stats.totalFailed} | ES entities: ${esStats.totalEntities ?? '?'}`);
    sendChatReport(
      `🛑 ES Ingestion Agent stopped\n` +
      `Docs: ${_stats.totalDocs} (✓${_stats.totalSuccess} ✗${_stats.totalFailed})\n` +
      `ES created: ${_stats.totalESCreated} | linked: ${_stats.totalESLinked} | entities total: ${esStats.totalEntities ?? '?'}`
    );
  }

  _state = 'STOPPED';
  _stopRequested = _pauseRequested = false;
  logInfo(`Loop ended — state: STOPPED`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function start(options = {}) {
  if (_state === 'RUNNING' || _state === 'PAUSED') {
    throw new Error(`Agent is already ${_state}`);
  }
  _config = {
    namespace:   options.namespace   || 'DEFAULT',
    batchSize:   Math.min(options.batchSize || BATCH_SIZE, 50),
    methodology: options.methodology || 'M2C',
  };
  _stopRequested = false;
  _pauseRequested = false;
  _state = 'RUNNING';

  // Set desired concurrency BEFORE initQueue so the worker is created with the right value.
  // setConcurrency also updates a running worker if initQueue already ran.
  try {
    await queue().setConcurrency(_config.batchSize); // recreates worker if concurrency changed
    await queue().initQueue();                       // no-op if already init'd; creates with _desiredConcurrency
    logInfo(`Worker concurrency: ${queue().getConcurrency()}`);
  } catch (e) {
    logWarn(`Could not set worker concurrency: ${e.message}`);
  }

  _runLoopPromise = runLoop().catch(err => {
    logError(`Fatal loop error: ${err.message}`);
    _state = 'STOPPED';
  });
  return { started: true, config: _config };
}

async function stop() {
  if (_state === 'IDLE' || _state === 'STOPPED') return { stopped: true };
  _stopRequested  = true;
  _pauseRequested = false;
  logInfo('Stop requested');
  return { stopping: true };
}

function pause() {
  if (_state !== 'RUNNING') return { paused: false, reason: `Not running (state=${_state})` };
  _pauseRequested = true;
  logInfo('Pause requested');
  return { pausing: true };
}

function resume() {
  if (_state !== 'PAUSED') return { resumed: false, reason: `Not paused (state=${_state})` };
  _pauseRequested = false;
  logInfo('Resume requested');
  return { resuming: true };
}

function getStatus() {
  return { state: _state, config: _config, stats: { ..._stats }, rateLimitCount: _rateLimitCount };
}

function getLogs(limit = 100) {
  const n = Math.min(limit, LOG_MAX);
  return _logBuffer.slice(-n);
}

module.exports = { start, stop, pause, resume, getStatus, getLogs, logEmitter };
