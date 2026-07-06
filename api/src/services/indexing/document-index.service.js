'use strict';
/**
 * DocumentIndexService — always-on background worker that proactively harvests
 * document METADATA from every catalog source into the local SourceDocument
 * index (never downloading the files themselves).
 *
 * Design (modeled on es-ingestion.agent + StartupManager scheduled jobs):
 *   - tick-based: each tick harvests ONE page of ONE source, so work is spread
 *     over time, naturally throttled, pausable and restart-safe.
 *   - per-source cursor persisted on the SourceCatalog node (indexCursor /
 *     indexStatus / indexTotal / lastIndexedAt) → resumes after restart.
 *   - policy: API families (rest-api/dspace/invenio/opendatasoft/oai-pmh) are
 *     harvested DEEP (recent-first, capped); scraper families (url-catalog/
 *     rss-feed/ods/oios) SHALLOW (first pages only).
 *   - full per-document enrichment during harvest where the adapter supports it
 *     (bounded concurrency + politeness delay + backoff on 429/503/WAF-202).
 *   - only item.url / item.pdfUrl are stored; the file is never fetched.
 */

const EventEmitter = require('events');

const { sourceCatalogService }           = require('../knowledge/source-catalog.service');
const { sourceCatalogEnrichmentService } = require('../knowledge/source-catalog-enrichment.service');
const { resolveAdapter }                 = require('../knowledge/source-adapters/registry');
const { normalizeSymbol }                = require('../knowledge/source-adapters/lib/parse');
const sync = require('./document-index.sync');
const { probeSourceTotal } = require('./document-index.count-probe');
const telemetry = require('./document-index.telemetry');
const errorPolicy = require('./document-index.error-policy');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const LOG = '[DocIndexer]';

// Adapter families harvested deep vs shallow.
const DEEP_FAMILIES = new Set(['rest-api', 'dspace', 'invenio', 'opendatasoft', 'oai-pmh']);

// ── config ────────────────────────────────────────────────────

function envInt(name, def) { const v = parseInt(process.env[name], 10); return Number.isFinite(v) ? v : def; }
function envBool(name, def) { const v = process.env[name]; return v == null ? def : v !== 'false'; }

const CFG = {
  concurrency:     envInt('DOCUMENT_INDEXER_CONCURRENCY', 10),       // sources harvested in parallel (workers)
  dispatchMs:      envInt('DOCUMENT_INDEXER_DISPATCH_MS', 1500),     // how often free slots are refilled
  perSourceDelayMs:envInt('DOCUMENT_INDEXER_PER_SOURCE_DELAY_MS', 1500), // min gap between pages of the SAME source
  tickMs:          envInt('DOCUMENT_INDEXER_TICK_MS', 4000),         // legacy fallback dispatch interval
  pageSize:        envInt('DOCUMENT_INDEXER_PAGE_SIZE', 50),
  // Depth cap for DEEP (API) sources. 0 = unlimited (full harvest until the
  // source is exhausted). Large repos (World Bank ~561K, UNESCO ~285K, WHO ~43K)
  // are only fully covered with no cap; set a positive value to bound harvest.
  maxDeepDocs:     envInt('DOCUMENT_INDEXER_MAX_DEEP_DOCS', 0),
  maxShallowPages: envInt('DOCUMENT_INDEXER_MAX_SHALLOW_PAGES', 3),
  enrich:          envBool('DOCUMENT_INDEXER_ENRICH', true),
  enrichConc:      envInt('DOCUMENT_INDEXER_ENRICH_CONCURRENCY', 4),
  // Resolve the direct file link for items whose search result lacks a pdfUrl
  // (e.g. DSpace bitstreams). Metadata API calls only — never downloads the file.
  resolveDownload: envBool('DOCUMENT_INDEXER_RESOLVE_DOWNLOAD', true),
  semantic:        envBool('DOCUMENT_INDEXER_SEMANTIC', false),
  refreshMs:       envInt('DOCUMENT_INDEXER_REFRESH_MS', 6 * 60 * 60 * 1000), // re-check completed sources every 6h
  sourceReloadMs:  envInt('DOCUMENT_INDEXER_SOURCE_RELOAD_MS', 5 * 60 * 1000),
  backoffBaseMs:   envInt('DOCUMENT_INDEXER_BACKOFF_MS', 60 * 1000),
  // Periodic document-count refresh: recount a source's total and trigger a
  // re-index when it has grown (new documents appeared).
  countRefreshMs:  envInt('DOCUMENT_INDEXER_COUNT_REFRESH_MS', 2 * 60 * 1000),      // one source recounted every N ms
  countStaleMs:    envInt('DOCUMENT_INDEXER_COUNT_STALE_MS', 12 * 60 * 60 * 1000),  // recount when the stored total is older than this
  // Circuit breaker: if a source accumulates too many errors within a window,
  // quarantine it (skip harvesting) for a cooldown and move on to other sources.
  cbWindowMs:      envInt('DOCUMENT_INDEXER_CB_WINDOW_MS', 60 * 1000),              // error-rate window
  cbThreshold:     envInt('DOCUMENT_INDEXER_CB_THRESHOLD', 5),                      // errors in window → trip
  cbCooldownMs:    envInt('DOCUMENT_INDEXER_CB_COOLDOWN_MS', 5 * 60 * 1000),        // base pause (doubles per repeat trip)
  cbMaxCooldownMs: envInt('DOCUMENT_INDEXER_CB_MAX_COOLDOWN_MS', 60 * 60 * 1000),   // cooldown cap
};

// ── helpers ───────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isRateLimited(err) {
  const m = (err && err.message || '').toLowerCase();
  const status = err?.response?.status;
  return status === 429 || status === 503 || status === 202 || /rate.?limit|too many requests|waf|challenge/.test(m);
}

// Auth/forbidden (401/403): the adapter is blocked or needs credentials.
// Retrying immediately is pointless and hammers the remote — back off instead.
function isBlocked(err) {
  const status = err?.response?.status;
  return status === 401 || status === 403;
}

function httpStatusOf(err) { return err?.response?.status ?? null; }

function canonicalKeyFor(item) {
  if (item.symbol) {
    const s = normalizeSymbol(item.symbol);
    if (s) return `sym:${s.toUpperCase()}`;
  }
  const u = item.pdfUrl || item.url || '';
  if (!u) return '';
  try {
    const parsed = new URL(u);
    return `url:${(parsed.host + parsed.pathname).toLowerCase().replace(/\/+$/, '')}`;
  } catch {
    return `url:${u.toLowerCase()}`;
  }
}

// Bounded-concurrency map.
async function pool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = await fn(items[idx], idx); }
      catch (e) { results[idx] = { error: e }; }
    }
  });
  await Promise.all(workers);
  return results;
}

// ── service ───────────────────────────────────────────────────

class DocumentIndexService {
  constructor(logger) {
    this.log = logger || console;
    this.state = 'IDLE';               // IDLE | RUNNING | PAUSED | STOPPED
    this.progressEmitter = new EventEmitter();
    this.progressEmitter.setMaxListeners(100);

    this._dispatching = false;
    this._sources = [];
    this._ptr = 0;
    this._sourcesLoadedAt = 0;
    this.concurrency = CFG.concurrency; // mutable worker count (adjustable at runtime)
    this._backoff = new Map();          // sourceId → resumeAtMs
    this._circuit = new Map();          // sourceId → { fails[], openUntil, trips, lastReason, name }
    this._active = new Set();           // sourceIds currently being harvested (parallel slots)
    this._activeInfo = new Map();       // sourceId → { sourceId, name, page }
    this._lastHarvest = new Map();      // sourceId → ts of last page harvest (per-source politeness)

    this.stats = {
      startedAt: null, ticks: 0, docsIndexed: 0, newNodes: 0, docsEnriched: 0, errors: 0,
      current: null, lastError: null, lastTickAt: null,
    };
  }

  // ── lifecycle ──

  schedule(intervalMs = CFG.dispatchMs) {
    this.state = 'RUNNING';
    this.stats.startedAt = new Date().toISOString();
    this._emit('index:global', { type: 'started', at: this.stats.startedAt, concurrency: CFG.concurrency });
    // Dispatcher: keeps up to CFG.concurrency sources harvesting in parallel.
    this._handle = setInterval(() => this._dispatch(), intervalMs);
    // Periodic document-count refresh (one source per tick, staleness-gated).
    this._countHandle = setInterval(() => this._safeRefreshTick(), CFG.countRefreshMs);
    return this._handle;
  }

  start()  { if (this.state !== 'RUNNING') { this.state = 'RUNNING'; if (!this.stats.startedAt) this.stats.startedAt = new Date().toISOString(); this._emit('index:global', { type: 'started' }); } return this.getStatus(); }
  pause()  { if (this.state === 'RUNNING') { this.state = 'PAUSED'; this._emit('index:global', { type: 'paused' }); } return this.getStatus(); }
  resume() { if (this.state === 'PAUSED')  { this.state = 'RUNNING'; this._emit('index:global', { type: 'resumed' }); } return this.getStatus(); }

  stop() {
    this.state = 'STOPPED';
    if (this._handle) clearInterval(this._handle);
    if (this._countHandle) clearInterval(this._countHandle);
    this._handle = null;
    this._countHandle = null;
    this._emit('index:global', { type: 'stopped' });
    return this.getStatus();
  }

  getStatus() {
    const active = [...this._activeInfo.values()];
    const now = Date.now();
    return {
      state: this.state,
      config: { ...CFG, concurrency: this.concurrency },
      stats: {
        ...this.stats,
        active,                          // sources harvesting in parallel right now
        activeCount: active.length,
        concurrency: this.concurrency,
        current: active[0] || this.stats.current || null, // back-compat single field
      },
      sourcesTracked: this._sources.length,
      backoff: [...this._backoff.entries()].map(([id, until]) => ({ sourceId: id, until })),
      circuit: [...this._circuit.entries()]
        .filter(([, c]) => c.openUntil > now)
        .map(([id, c]) => ({ sourceId: id, name: c.name, openUntil: c.openUntil, reason: c.lastReason, trips: c.trips })),
    };
  }

  // ── worker count (runtime-adjustable) ──

  /** Set the number of parallel harvest workers; takes effect on the next tick. */
  setConcurrency(n) {
    const v = Math.max(1, Math.min(64, parseInt(n, 10) || 0));
    this.concurrency = v;
    this._logMsg('info', `concurrency set to ${v} workers`);
    this._emit('index:global', { type: 'concurrency-changed', concurrency: v });
    return v;
  }

  subscribe(cb) {
    this.progressEmitter.on('index:global', cb);
    this.progressEmitter.on('index:source', cb);
    return () => {
      this.progressEmitter.off('index:global', cb);
      this.progressEmitter.off('index:source', cb);
    };
  }

  _emit(event, payload) { try { this.progressEmitter.emit(event, { event, ...payload }); } catch {} }

  // ── parallel dispatcher ──

  /**
   * Fill free slots so that up to CFG.concurrency sources are harvested in
   * parallel. Each slot runs one page of a distinct source, then frees itself.
   */
  async _dispatch() {
    if (this.state !== 'RUNNING' || this._dispatching) return;
    this._dispatching = true;
    try {
      await this._reloadSources();
      if (!this._sources.length) return;

      while (this._active.size < this.concurrency) {
        const src = this._pickNextSource();      // skips active/backoff/complete/too-recent
        if (!src) break;                          // nothing eligible right now
        this._active.add(src.id);
        this._activeInfo.set(src.id, { sourceId: src.id, name: src.name, page: null });
        // Fire-and-forget: the slot frees when this source's page finishes.
        this._harvestSourcePage(src)
          .catch(e => {
            this.stats.errors++; this.stats.lastError = `${src.name}: ${e.message}`;
            this._logMsg('error', `harvest ${src.name} failed: ${e.message}`);
            const _en = telemetry.recordError({ sourceId: src.id, sourceName: src.name, phase: 'harvest', status: httpStatusOf(e), message: e.message, detail: e.stack });
            this._noteFailure(src.id, src.name, _en.category);
          })
          .finally(() => {
            this._active.delete(src.id);
            this._activeInfo.delete(src.id);
            this._lastHarvest.set(src.id, Date.now());
          });
      }
    } catch (e) {
      this.stats.errors++; this.stats.lastError = e.message;
      telemetry.recordError({ phase: 'dispatch', message: e.message, detail: e.stack });
    } finally {
      this._dispatching = false;
    }
  }

  async _reloadSources() {
    const now = Date.now();
    if (this._sources.length && now - this._sourcesLoadedAt < CFG.sourceReloadMs) return;
    const all = await sourceCatalogService.list({});
    this._sources = all.filter(s => s.enabled !== false);
    this._sourcesLoadedAt = now;
  }

  _pickNextSource() {
    // Breadth-first: give never-harvested ('pending') sources priority so large
    // in-progress deep sources (World Bank, UNESCO…) don't monopolize all
    // concurrency slots and starve sources that still have brand-new documents.
    return this._pick(src => (src.indexStatus || 'pending') === 'pending')
        || this._pick(() => true);
  }

  /** Round-robin pick of the next eligible source matching `prefer`. */
  _pick(prefer) {
    const now = Date.now();
    const n = this._sources.length;
    for (let k = 0; k < n; k++) {
      const src = this._sources[(this._ptr + k) % n];
      if (this._active.has(src.id)) continue;                  // already harvesting in another slot
      if (this._circuitOpen(src.id)) continue;                 // quarantined by the circuit breaker
      const backoffUntil = this._backoff.get(src.id) || 0;
      if (backoffUntil > now) continue;
      // Per-source politeness: don't hit the SAME source's next page too soon.
      const lastAt = this._lastHarvest.get(src.id) || 0;
      if (now - lastAt < CFG.perSourceDelayMs) continue;

      const status = src.indexStatus || 'pending';
      // Completed sources are not re-harvested blindly; the periodic count
      // refresh re-opens them (→ pending) only when new documents appear.
      if (status === 'complete') continue;

      if (!prefer(src)) continue;

      this._ptr = (this._ptr + k + 1) % n;
      return src;
    }
    return null;
  }

  /** Harvest ONE page of a single source (runs inside a parallel slot). */
  async _harvestSourcePage(cached) {
    this.stats.ticks++;
    this.stats.lastTickAt = new Date().toISOString();

    // Fresh copy (cursor may have advanced since the list snapshot).
    const source = await sourceCatalogService.get(cached.id);
    if (!source || source.enabled === false) return;

    const adapter = resolveAdapter(source);
    const family = adapter.constructor.family;
    const deep = DEEP_FAMILIES.has(family);

    // dueForRefresh (completed) sources restart at page 1 to catch new docs.
    const status = source.indexStatus || 'pending';
    let cursor = status === 'complete' ? 0 : await this._getCursor(source.id);

    // Self-heal wasteful re-scan: for DEEP (stable-paginated, append-mostly)
    // sources whose cursor sits below the already-collected frontier — e.g. the
    // cursor was reset to 0 by a prior "grew" count-refresh while thousands of
    // docs were already indexed — fast-forward to the frontier so we harvest NEW
    // documents instead of re-walking already-indexed pages (which produced
    // 0 new nodes and made the processed counter appear stuck).
    if (deep && status !== 'complete') {
      const have = await this._docCount(source.id);
      let frontier = Math.floor(have / CFG.pageSize);
      // Never fast-forward past the OpenDataSoft 10k-offset ceiling (→ HTTP 400).
      if (family === 'opendatasoft') frontier = Math.min(frontier, Math.floor(10000 / CFG.pageSize) - 1);
      if (frontier > cursor) {
        this._logMsg('info', `${source.name}: fast-forward cursor ${cursor} → ${frontier} (skip re-scan of ${have} indexed docs)`);
        cursor = frontier;
      }
    }

    const page = cursor + 1;

    // Depth caps. maxDeepDocs=0 means unlimited (harvest until the source is
    // exhausted by an empty page); a positive value bounds deep harvest.
    if (!deep && page > CFG.maxShallowPages) { await this._markComplete(source.id, null); return; }
    if (deep && CFG.maxDeepDocs > 0 && cursor * CFG.pageSize >= CFG.maxDeepDocs) { await this._markComplete(source.id, null); return; }
    // OpenDataSoft enforces a hard offset ceiling of 10,000 rows — requesting
    // beyond it returns HTTP 400. Treat that as the end of the source.
    if (family === 'opendatasoft' && cursor * CFG.pageSize >= 10000) { await this._markComplete(source.id, null); return; }

    const info = this._activeInfo.get(source.id);
    if (info) { info.page = page; info.family = family; }
    this._emit('index:source', { type: 'page-start', sourceId: source.id, name: source.name, page });

    // ── harvest one page ──
    // No explicit sort: each adapter uses its own default order (hard-coding a
    // field like 'date' breaks sources with different sort vocabularies, e.g.
    // DSpace wants 'dc.date.issued'). Deep sources are covered up to the cap.
    let result;
    try {
      result = await adapter.search({ query: '', page, limit: CFG.pageSize });
    } catch (err) {
      this.stats.errors++;
      this.stats.lastError = `${source.name}: ${err.message}`;
      if (isRateLimited(err) || isBlocked(err)) this._applyBackoff(source.id);
      const _entry = telemetry.recordError({
        sourceId: source.id, sourceName: source.name, phase: 'harvest',
        status: httpStatusOf(err), message: err.message,
        detail: `page ${page} · family ${family}${err.stack ? '\n' + err.stack : ''}`,
      });
      this._noteFailure(source.id, source.name, _entry.category);
      this._emit('index:source', { type: 'page-error', sourceId: source.id, page, error: err.message });
      return;
    }

    // Only the exact API total is trusted as the source's document count.
    const exactTotal = result.totalExact ? result.total : null;

    const raw = result.results || [];
    // An empty page means we've reached the end of this source.
    if (!raw.length) { await this._markComplete(source.id, exactTotal); return; }

    const items = raw.filter(it => it.url || it.pdfUrl);
    // How many of this page's docs are genuinely new (vs re-scanned duplicates).
    // Cheap indexed lookup on ≤pageSize urls; makes "new docs/min" observable so
    // a source stuck re-scanning already-harvested pages is visible on the chart.
    let newNodes = 0;
    if (items.length) {
      const urls = items.map(it => it.url).filter(Boolean);
      const existing = await this._countExisting(source.id, urls);
      newNodes = Math.max(0, items.length - existing);
      // Persist metadata (reuse the catalog cache writer — no file download).
      await sourceCatalogService._saveSourceDocuments(source.id, items).catch(() => {});
    }

    // Full enrichment where supported (bounded concurrency); skip docs already
    // enriched so re-harvest / refresh passes stay cheap and idempotent.
    let enrichedCount = 0;
    const canEnrich = CFG.enrich && adapter.supports && adapter.supports('enrich');
    let enrichedMap = new Map();
    if (canEnrich && items.length) {
      const already = await this._alreadyEnriched(source.id, items);
      const toEnrich = items.filter(it => !already.has(it.url));
      const outcomes = await pool(toEnrich, CFG.enrichConc, async (item) => {
        try {
          const en = await sourceCatalogEnrichmentService.enrichAndSave(source, item);
          return en;
        } catch (e) {
          if (isRateLimited(e) || isBlocked(e)) this._applyBackoff(source.id);
          telemetry.recordWarn({ sourceId: source.id, sourceName: source.name, phase: 'enrich', status: httpStatusOf(e), message: e.message });
          return null;
        }
      });
      outcomes.forEach((en, idx) => { if (en && !en.error) { enrichedCount++; enrichedMap.set(toEnrich[idx].url || toEnrich[idx].id, en); } });
    }

    // Resolve the direct download link where the search result lacks one
    // (metadata API only — the file itself is never fetched).
    const resolvedMap = new Map();
    if (CFG.resolveDownload && adapter.supports && adapter.supports('download')) {
      const needing = items.filter(it => !it.pdfUrl && it.url);
      if (needing.length) {
        await pool(needing, CFG.enrichConc, async (item) => {
          try {
            const dl = await adapter.resolveDownload(item);
            if (dl?.downloadUrl) resolvedMap.set(item.url || item.id, dl.downloadUrl);
          } catch (e) {
            if (isRateLimited(e) || isBlocked(e)) this._applyBackoff(source.id);
            telemetry.recordWarn({ sourceId: source.id, sourceName: source.name, phase: 'download', status: httpStatusOf(e), message: e.message });
          }
        });
      }
    }

    // Mark index state + canonicalKey + resolved download link on each doc.
    await this._markIndexed(source.id, items, resolvedMap);

    // Optional semantic upsert.
    if (CFG.semantic) {
      try {
        const docs = items.map(it => {
          const en = enrichedMap.get(it.url || it.id);
          return {
            id: this._docId(source.id, it), sourceId: source.id, sourceName: source.name,
            title: it.title, symbol: it.symbol, date: it.date, fileType: it.fileType,
            languages: it.languages || [], url: it.url, pdfUrl: it.pdfUrl,
            description: it.description, abstract: en?.abstract || '',
            subjects: en?.subjects || [], canonicalKey: canonicalKeyFor(it),
            enrichStatus: en ? 'enriched' : 'indexed',
          };
        });
        await sync.upsertDocs(docs, { embed: true });
      } catch (e) { this._logMsg('warn', `semantic upsert failed: ${e.message}`); }
    }

    // Advance cursor / completion — driven by the adapter's page-fullness hasMore
    // (a full page implies more), NOT by an unreliable total.
    const hasMore = result.hasMore === true;
    if (hasMore) await this._setCursor(source.id, page, exactTotal);
    else await this._markComplete(source.id, exactTotal);

    this._noteSuccess(source.id);          // a clean page closes the circuit
    this.stats.docsIndexed += items.length;
    this.stats.docsEnriched += enrichedCount;
    this.stats.newNodes = (this.stats.newNodes || 0) + newNodes;
    telemetry.recordThroughput({ processed: items.length, newNodes, enriched: enrichedCount });
    this._emit('index:source', {
      type: 'page-done', sourceId: source.id, name: source.name, page,
      indexed: items.length, newNodes, enriched: enrichedCount, total: result.total, hasMore,
    });
  }

  // ── backoff ──

  _applyBackoff(sourceId) {
    const prev = this._backoff.get(sourceId) || 0;
    const factor = prev > Date.now() ? 2 : 1;
    const until = Date.now() + CFG.backoffBaseMs * factor;
    this._backoff.set(sourceId, until);
    this._logMsg('warn', `backoff ${sourceId} until ${new Date(until).toISOString()}`);
    const info = this._activeInfo.get(sourceId);
    telemetry.recordWarn({ sourceId, sourceName: info?.name, phase: 'backoff', message: `backoff until ${new Date(until).toISOString()}` });
  }

  // ── circuit breaker (error-spike → quarantine source) ──

  _circuitOpen(sourceId) {
    const c = this._circuit.get(sourceId);
    return !!c && c.openUntil > Date.now();
  }

  /** Record a failure for a source; trip the breaker on a spike or hard error. */
  _noteFailure(sourceId, sourceName, category) {
    if (!sourceId) return;
    const now = Date.now();
    let c = this._circuit.get(sourceId);
    if (!c) { c = { fails: [], openUntil: 0, trips: 0, lastReason: null, name: sourceName }; this._circuit.set(sourceId, c); }
    if (sourceName) c.name = sourceName;
    if (c.openUntil > now) return;                       // already open — nothing to do
    c.fails.push(now);
    c.fails = c.fails.filter(t => t >= now - CFG.cbWindowMs);
    // Non-transient categories trip immediately (retrying won't help); otherwise
    // trip once the error count in the window crosses the threshold.
    const cat = errorPolicy.CATEGORIES[category];
    const hardTrip = cat && cat.transient === false;
    if (c.fails.length >= CFG.cbThreshold || hardTrip) this._openCircuit(sourceId, category);
  }

  _openCircuit(sourceId, category) {
    const c = this._circuit.get(sourceId);
    if (!c) return;
    c.trips++;
    let cool = Math.min(CFG.cbCooldownMs * Math.pow(2, c.trips - 1), CFG.cbMaxCooldownMs);
    if (category === 'CONFIG_MISSING') cool = CFG.cbMaxCooldownMs; // config error: pause long
    c.openUntil = Date.now() + cool;
    c.lastReason = category || 'error-spike';
    c.fails = [];
    this._logMsg('warn', `circuit OPEN ${c.name || sourceId} (${c.lastReason}, trip ${c.trips}) — paused ${Math.round(cool / 1000)}s`);
    telemetry.recordWarn({ sourceId, sourceName: c.name, phase: 'circuit',
      message: `circuit opened (${c.lastReason}, trip ${c.trips}) — paused ${Math.round(cool / 1000)}s` });
    this._emit('index:source', { type: 'circuit-open', sourceId, name: c.name, reason: c.lastReason, trips: c.trips, openUntil: c.openUntil });
    // Let the incident engine raise/escalate a problem for this source.
    try { require('./document-index.incidents').onCircuitOpen({ sourceId, sourceName: c.name, category: c.lastReason, trips: c.trips, openUntil: c.openUntil }); } catch { /* engine optional */ }
  }

  _noteSuccess(sourceId) {
    const c = this._circuit.get(sourceId);
    if (!c) return;
    const wasTripped = c.trips > 0 || c.openUntil > 0;
    c.fails = [];
    if (c.openUntil <= Date.now()) { c.openUntil = 0; c.trips = 0; c.lastReason = null; } // half-open success → close
    if (wasTripped) { try { require('./document-index.incidents').onSourceRecovered(sourceId); } catch { /* optional */ } }
  }

  /** Manually quarantine a source (used by admin / AI actions). */
  pauseSource(sourceId, ms, reason = 'manual') {
    let c = this._circuit.get(sourceId);
    if (!c) { c = { fails: [], openUntil: 0, trips: 0, lastReason: null, name: null }; this._circuit.set(sourceId, c); }
    c.openUntil = Date.now() + Math.max(1000, parseInt(ms, 10) || CFG.cbCooldownMs);
    c.lastReason = reason;
    this._emit('index:source', { type: 'circuit-open', sourceId, name: c.name, reason, openUntil: c.openUntil });
    return { sourceId, openUntil: c.openUntil, reason };
  }

  /** Lift a quarantine / backoff for a source (used by admin / AI actions). */
  resumeSource(sourceId) {
    this._circuit.delete(sourceId);
    this._backoff.delete(sourceId);
    this._sourcesLoadedAt = 0;
    this._emit('index:source', { type: 'circuit-close', sourceId });
    return { sourceId, resumed: true };
  }

  // ── persistence ──

  _docId(sourceId, item) {
    const { v5: uuidv5 } = require('uuid');
    const NS = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    return uuidv5(`${sourceId}::${item.url || item.id}`, NS);
  }

  async _getCursor(sourceId) {
    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id}) RETURN s.indexCursor as cursor`, { id: sourceId }
    ).catch(() => []);
    return Number(rows[0]?.cursor) || 0;
  }

  async _setCursor(sourceId, cursor, total) {
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.indexCursor = $cursor, s.indexStatus = 'indexing',
           s.indexTotal = $total, s.lastIndexedAt = $now`,
      { id: sourceId, cursor, total: total != null ? Number(total) : null, now: new Date().toISOString() }
    ).catch(() => {});
  }

  async _markComplete(sourceId, exactTotal) {
    // Reaching the end by exhaustive paging IS the count probe: the source's
    // total = the exact API total when known, else the distinct docs harvested.
    let total = exactTotal, method = 'api';
    if (total == null) {
      const rows = await mg().runQuery(
        `MATCH (:SourceCatalog {id: $id})-[:HAS_DOCUMENT]->(d:SourceDocument) RETURN count(d) as c`,
        { id: sourceId }
      ).catch(() => []);
      total = Number(rows[0]?.c) || 0;
      method = 'probe';
    }
    const now = new Date().toISOString();
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.indexCursor = 0, s.indexStatus = 'complete',
           s.indexTotal = $total, s.indexTotalMethod = $method, s.indexTotalAt = $now,
           s.lastIndexedAt = $now`,
      { id: sourceId, total: Number(total), method, now }
    ).catch(() => {});
    this._emit('index:source', { type: 'source-complete', sourceId, total, method });
  }

  /** Persist a recounted total on a source (without touching harvest status). */
  async _saveTotal(sourceId, total, method) {
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.indexTotal = $total, s.indexTotalMethod = $method, s.indexTotalAt = $now`,
      { id: sourceId, total: total != null ? Number(total) : null, method, now: new Date().toISOString() }
    ).catch(() => {});
  }

  /** URLs among `items` whose SourceDocument is already enriched (to skip re-enrich). */
  async _alreadyEnriched(sourceId, items) {
    const urls = items.map(it => it.url).filter(Boolean);
    if (!urls.length) return new Set();
    const rows = await mg().runQuery(
      `MATCH (:SourceCatalog {id: $id})-[:HAS_DOCUMENT]->(d:SourceDocument)
       WHERE d.url IN $urls AND d.enrichStatus IN ['enriched','full']
       RETURN collect(d.url) as urls`,
      { id: sourceId, urls }
    ).catch(() => []);
    return new Set(rows[0]?.urls || []);
  }

  /** Total SourceDocument nodes already collected for a source (the frontier). */
  async _docCount(sourceId) {
    const rows = await mg().runQuery(
      `MATCH (:SourceCatalog {id: $id})-[:HAS_DOCUMENT]->(d:SourceDocument) RETURN count(d) as c`,
      { id: sourceId }
    ).catch(() => []);
    return Number(rows[0]?.c) || 0;
  }

  /** How many of `urls` already exist as SourceDocument nodes for this source. */
  async _countExisting(sourceId, urls) {
    if (!urls || !urls.length) return 0;
    const rows = await mg().runQuery(
      `UNWIND $urls AS u
       MATCH (d:SourceDocument {sourceId: $sourceId, url: u})
       RETURN count(d) as c`,
      { sourceId, urls }
    ).catch(() => []);
    return Number(rows[0]?.c) || 0;
  }

  async _markIndexed(sourceId, items, resolvedMap = new Map()) {
    const now = new Date().toISOString();
    const rows = items
      .filter(it => it.url)
      .map(it => ({
        url: it.url,
        canonicalKey: canonicalKeyFor(it),
        // Best direct download link: search pdfUrl → resolved bitstream → record page.
        downloadUrl: it.pdfUrl || resolvedMap.get(it.url || it.id) || it.url || '',
      }));
    if (!rows.length) return;
    await mg().runQuery(
      `UNWIND $rows AS row
       MATCH (d:SourceDocument {sourceId: $sourceId, url: row.url})
       SET d.canonicalKey = row.canonicalKey,
           d.downloadUrl = row.downloadUrl,
           d.indexedAt = $now,
           d.indexStatus = CASE WHEN d.enrichStatus IN ['enriched','full'] THEN 'enriched' ELSE 'indexed' END`,
      { rows, sourceId, now }
    ).catch((e) => this._logMsg('warn', `_markIndexed: ${e.message}`));
  }

  // ── count refresh (sequential-paging probe → total → trigger re-index) ──

  async _safeRefreshTick() {
    if (this.state !== 'RUNNING' || this._refreshBusy) return;
    this._refreshBusy = true;
    try { await this._refreshTick(); }
    catch (e) {
      this._logMsg('warn', `count refresh failed: ${e.message}`);
      telemetry.recordWarn({ phase: 'refresh', message: `count refresh failed: ${e.message}` });
    }
    finally { this._refreshBusy = false; }
  }

  /** Recount the source whose stored total is stalest (staleness-gated). */
  async _refreshTick() {
    await this._reloadSources();
    if (!this._sources.length) return;
    const now = Date.now();
    let best = null, bestAt = Infinity;
    for (const s of this._sources) {
      if (this._active.has(s.id)) continue;                   // don't recount a source being harvested
      if ((this._backoff.get(s.id) || 0) > now) continue;
      if (s.indexStatus === 'indexing' || s.indexStatus === 'pending') continue; // let the harvester finish first
      const at = s.indexTotalAt ? Date.parse(s.indexTotalAt) : 0;
      if (now - at < CFG.countStaleMs) continue;              // still fresh
      if (at < bestAt) { bestAt = at; best = s; }
    }
    if (best) await this.refreshCount(best.id);
  }

  /**
   * Probe a source's current document count by sequential paging, store it on
   * the source model, and re-open the source for indexing if it has grown.
   */
  async refreshCount(sourceId) {
    const source = await sourceCatalogService.get(sourceId);
    if (!source || source.enabled === false) return null;

    const prevTotal = source.indexTotal;
    this.stats.recounting = { sourceId, name: source.name };
    let res;
    try {
      res = await probeSourceTotal(source, {});
    } finally {
      this.stats.recounting = null;
    }

    await this._saveTotal(sourceId, res.total, res.method);

    const grew = prevTotal != null && Number.isFinite(res.total) && res.total > prevTotal;
    if (grew && source.indexStatus === 'complete') {
      // New documents appeared → re-open for the harvester.
      await mg().runQuery(
        `MATCH (s:SourceCatalog {id: $id}) SET s.indexStatus = 'pending', s.indexCursor = 0`,
        { id: sourceId }
      ).catch(() => {});
      this._sourcesLoadedAt = 0; // force reload so it gets picked up
    }

    this._emit('index:source', {
      type: 'count-refreshed', sourceId, name: source.name,
      total: res.total, method: res.method, prevTotal, grew,
      exhausted: res.exhausted, capped: res.capped,
    });
    this._logMsg('info',
      `recount ${source.name}: total=${res.total} (${res.method})${grew ? ` grew from ${prevTotal} → re-indexing` : ''}`);
    return { ...res, prevTotal, grew };
  }

  // ── control ──

  /** Public on-demand count probe (used by the API / MCP). */
  async probeSource(sourceId) {
    return this.refreshCount(sourceId);
  }

  async reindexSource(sourceId, { purgeVectors = false } = {}) {
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.indexCursor = 0, s.indexStatus = 'pending', s.lastIndexedAt = null`,
      { id: sourceId }
    );
    this._backoff.delete(sourceId);
    if (purgeVectors && CFG.semantic) await sync.deleteBySource(sourceId).catch(() => {});
    this._sourcesLoadedAt = 0; // force reload
    this._emit('index:source', { type: 'reindex-requested', sourceId });
    return { reindex: sourceId };
  }

  _logMsg(level, msg) {
    const fn = this.log[level] || this.log.log || console.log;
    fn.call(this.log, `${LOG} ${msg}`);
  }
}

// ── singleton ─────────────────────────────────────────────────

let _instance = null;
function getDocumentIndexService(logger) {
  if (!_instance) _instance = new DocumentIndexService(logger);
  return _instance;
}

module.exports = { DocumentIndexService, getDocumentIndexService };
