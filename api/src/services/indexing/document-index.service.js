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
const durable = require('./document-index.state');
const ratings = require('./document-index.ratings');
const quota = require('./document-index.quota');
const { DateRangeHarvester } = require('./document-index.daterange');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const LOG = '[DocIndexer]';

// Adapter families harvested deep vs shallow.
const DEEP_FAMILIES = new Set(['rest-api', 'dspace', 'invenio', 'opendatasoft', 'oai-pmh']);

// ── config ────────────────────────────────────────────────────

function envInt(name, def) { const v = parseInt(process.env[name], 10); return Number.isFinite(v) ? v : def; }
function envBool(name, def) { const v = process.env[name]; return v == null ? def : v !== 'false'; }

const CFG = {
  concurrency:     envInt('DOCUMENT_INDEXER_CONCURRENCY', 50),       // total in-flight page-tasks (worker pool size)
  dispatchMs:      envInt('DOCUMENT_INDEXER_DISPATCH_MS', 1500),     // safety-net refill interval (slots also refill instantly on free)
  perSourceDelayMs:envInt('DOCUMENT_INDEXER_PER_SOURCE_DELAY_MS', 1500), // min gap between pages of the SAME source
  perSourceStaggerMs: envInt('DOCUMENT_INDEXER_PER_SOURCE_STAGGER_MS', 300), // stagger between parallel page-starts of one source
  // Adaptive per-source page parallelism: a big source (World Bank 561K, ODS, FAO
  // 150K) generates many page-tasks so the pool can stay saturated even when few
  // sources are eligible. The cap grows on clean pages and collapses to 1 on any
  // rate-limit/block, so we approach the configured worker count only as fast as
  // each remote tolerates (adaptive-to-concurrency).
  maxPerSource:    envInt('DOCUMENT_INDEXER_MAX_PER_SOURCE', 8),
  // A DEEP source that returns full pages of ALREADY-indexed docs (remote wraps/
  // clamps offset instead of returning empty) is exhausted after this many
  // consecutive zero-new pages — prevents the endless re-scan loop.
  zeroNewLimit:    envInt('DOCUMENT_INDEXER_ZERO_NEW_LIMIT', 3),
  // Quarantine cooldown for non-transient (needs-fix) sources — long, so a
  // permanently-broken source is retried only rarely (self-heal) instead of
  // every hour. Survives restart via the durable state store.
  needsFixCooldownMs: envInt('DOCUMENT_INDEXER_NEEDS_FIX_COOLDOWN_MS', 6 * 60 * 60 * 1000),
  // A 'partial' source (API yields fewer docs than its accurate known total —
  // WAF/offset/access limit) is re-opened for another harvest attempt this often.
  partialRetryMs:  envInt('DOCUMENT_INDEXER_PARTIAL_RETRY_MS', 6 * 60 * 60 * 1000),
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
    this.concurrency = CFG.concurrency; // mutable worker-pool size (adjustable at runtime)
    this._fails = new Map();            // sourceId → number[] (transient error-rate window; not persisted)
    this._active = new Set();           // in-flight page-task keys "sourceId#page" (pool occupancy = size)
    this._activeInfo = new Map();       // taskKey → { sourceId, name, page, family }
    this._srcRun = new Map();           // sourceId → { seeded, deep, family, nextPage, maxDonePage, inflight, cap, zeroNew, exhausted, lastStartAt }

    this.stats = {
      startedAt: null, ticks: 0, docsIndexed: 0, newNodes: 0, docsEnriched: 0, errors: 0,
      current: null, lastError: null, lastTickAt: null,
    };

    // Separate harvester for Invenio/ODS full-corpus date-range sources (recjson
    // d1/d2 release-date windows). Runs its own throttle-safe loop, isolated from
    // the main numeric/token page pool. See document-index.daterange.js.
    this._dateRange = new DateRangeHarvester(this);
  }

  // ── lifecycle ──

  schedule(intervalMs = CFG.dispatchMs) {
    this.state = 'RUNNING';
    this.stats.startedAt = new Date().toISOString();
    this._emit('index:global', { type: 'started', at: this.stats.startedAt, concurrency: CFG.concurrency });
    // Safety-net dispatcher: slots also refill INSTANTLY when a page finishes
    // (see _harvestSourcePage .finally → _dispatch), so this interval only
    // guarantees forward progress if the pool ever fully drains.
    this._handle = setInterval(() => this._dispatch(), intervalMs);
    // Periodic document-count refresh (one source per tick, staleness-gated).
    this._countHandle = setInterval(() => this._safeRefreshTick(), CFG.countRefreshMs);
    // Date-range harvester (Invenio/ODS full-corpus) runs its own loop.
    this._dateRange.start();
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
    if (this._dateRange) this._dateRange.stop();
    this._emit('index:global', { type: 'stopped' });
    return this.getStatus();
  }

  getStatus() {
    const now = Date.now();
    const quarantined = durable.listQuarantined();
    const rangeWindows = this._dateRange ? this._dateRange.activeWindows() : [];
    // Merge the date-range harvester's in-flight windows into the pool's active
    // list so the dashboard shows them as sources under processing (they run in
    // a separate loop but ARE live harvest work).
    const active = [...this._activeInfo.values(), ...rangeWindows];
    return {
      state: this.state,
      config: { ...CFG, concurrency: this.concurrency },
      stats: {
        ...this.stats,
        active,                          // in-flight page-tasks right now (main pool + date-range)
        activeCount: active.length,
        concurrency: this.concurrency,
        poolFill: this.concurrency ? Math.round((active.length / this.concurrency) * 100) : 0,
        current: active[0] || this.stats.current || null, // back-compat single field
        // Date-range (full-corpus) harvester: active publication windows + totals.
        dateRange: this._dateRange
          ? { activeWindows: rangeWindows, ...this._dateRange.stats }
          : null,
      },
      sourcesTracked: this._sources.length,
      backoff: quarantined.filter(q => (q.openUntil || 0) > now && q.mode === 'auto')
        .map(q => ({ sourceId: q.sourceId, until: q.openUntil })),
      circuit: quarantined
        .map(q => ({ sourceId: q.sourceId, name: q.name, openUntil: q.openUntil, reason: q.reason, trips: q.trips, mode: q.mode })),
      // Sources parked for manual attention (won't be harvested until fixed).
      needsIntervention: durable.listQuarantined('needs_fix'),
      // Per-source efficiency ratings + pool quotas (fast sources get more slots).
      ratings: ratings.list(CFG.maxPerSource),
    };
  }

  /** Per-source efficiency ratings + quota allocation (for the API / dashboard). */
  getRatings() { return ratings.list(CFG.maxPerSource); }

  // ── worker count (runtime-adjustable) ──

  /**
   * Set the number of parallel harvest workers; takes effect on the next tick.
   * No upper cap — the user may request an arbitrary worker count (only floored
   * at 1). The adaptive per-source parallelism + rate-limit backoff still protect
   * individual remotes from being hammered.
   */
  setConcurrency(n) {
    const v = Math.max(1, parseInt(n, 10) || 1);
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

  // ── adaptive page-level dispatcher ──

  /**
   * Keep the worker pool saturated to `this.concurrency` IN-FLIGHT PAGE-TASKS.
   *
   * Work unit is a PAGE, not a source: a large source (World Bank 561K, ODS, FAO
   * 150K) yields many page-tasks, so the pool stays full even when only a handful
   * of sources are eligible. Each source runs up to an ADAPTIVE per-source cap
   * (grows on clean pages, collapses to 1 on any rate-limit/block) so we approach
   * the configured worker count only as fast as each remote tolerates. A finished
   * page refills its slot INSTANTLY (see the .finally below) — a continuous queue,
   * not batch dispatch.
   */
  async _dispatch() {
    if (this.state !== 'RUNNING' || this._dispatching) return;
    this._dispatching = true;
    try {
      await this._reloadSources();
      if (!this._sources.length) return;

      // Recompute pool-share quotas for the currently-active sources (cheap;
      // once per dispatch cycle). Each source's slot budget = round(share × pool).
      this._quotaShares = quota.computeShares(this._activeSourcesForQuota());

      let guard = 0;
      while (this._active.size < this.concurrency && guard++ < this.concurrency * 4) {
        const task = await this._pickTask();     // async: seeds per-source run state
        if (!task) break;                          // nothing eligible right now
        const { src, page, run } = task;
        const key = `${src.id}#${page}`;
        run.inflight++;
        run.lastStartAt = Date.now();
        this._active.add(key);
        this._activeInfo.set(key, { sourceId: src.id, name: src.name, page, family: run.family });
        // Fire-and-forget: the slot frees the instant this page finishes, then
        // immediately pulls the next queued task (continuous, one-in-one-out).
        this._harvestSourcePage(src, page, run)
          .catch(e => {
            this.stats.errors++; this.stats.lastError = `${src.name}: ${e.message}`;
            this._logMsg('error', `harvest ${src.name} p${page} failed: ${e.message}`);
            const _en = telemetry.recordError({ sourceId: src.id, sourceName: src.name, phase: 'harvest', status: httpStatusOf(e), message: e.message, detail: e.stack });
            this._noteFailure(src.id, src.name, _en.category);
          })
          .finally(() => {
            run.inflight = Math.max(0, run.inflight - 1);
            this._active.delete(key);
            this._activeInfo.delete(key);
            if (this.state === 'RUNNING') setImmediate(() => this._dispatch());
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

  /**
   * ACTIVE sources for quota purposes: enabled + still has work (status
   * pending/indexing, not quarantined). Each carries its live efficiency score +
   * wall-clock docs/min so the quota policy (auto mode) can weight by efficiency.
   */
  _activeSourcesForQuota() {
    const now = Date.now();
    const out = [];
    for (const s of this._sources) {
      if (s.config && s.config.harvestMode === 'date-range') continue; // separate harvester
      const st = s.indexStatus || 'pending';
      if (st === 'complete' || st === 'partial') continue;   // no remaining work / parked
      if (this._circuitOpen(s.id)) continue;                 // quarantined
      const r = ratings.scoreFor(s.id);
      const rate = ratings.recentRate(s.id);
      out.push({
        id: s.id, name: s.name,
        efficiency: r.score != null ? r.score : 50,           // neutral for unrated
        docsPerMin: rate.processedPerMin,
      });
    }
    return out;
  }

  /** Pool-share quota snapshot for the API / dashboard (mode, per-source shares). */
  getQuotaSnapshot() {
    return quota.snapshot(this._activeSourcesForQuota(), this.concurrency);
  }

  /** True if any token-paged (OAI) source OTHER than `exceptId` has a page in flight. */
  _anyOtherTokenInflight(exceptId) {
    for (const [id, run] of this._srcRun) {
      if (id === exceptId) continue;
      if (run.tokenMode && run.inflight > 0) return true;
    }
    return false;
  }

  /**
   * Pick the next (source, page) task. Breadth-first: never-harvested ('pending')
   * sources get priority so a big in-progress deep source can't starve sources
   * with brand-new documents. Returns null when nothing is eligible.
   */
  async _pickTask() {
    return (await this._pickBy(src => (src.indexStatus || 'pending') === 'pending'))
        || (await this._pickBy(() => true));
  }

  async _pickBy(prefer) {
    const now = Date.now();
    const n = this._sources.length;
    for (let k = 0; k < n; k++) {
      const src = this._sources[(this._ptr + k) % n];
      if (src.config && src.config.harvestMode === 'date-range') continue; // owned by date-range harvester
      if (this._circuitOpen(src.id)) continue;                 // quarantined (source-level)
      if (this._backoffUntil(src.id) > now) continue;          // transient backoff
      const st = src.indexStatus || 'pending';
      if (st === 'complete' || st === 'partial') continue;     // done / access-limited (partial re-opened by _refreshTick)
      if (!prefer(src)) continue;

      const run = await this._ensureSrcRun(src);
      if (run.exhausted) continue;                             // reached end / re-scan loop
      // SERIALIZE token-paged (OAI) sources GLOBALLY: they share one heavily
      // throttled endpoint (/oai2d), so running several concurrently makes them
      // mutually throttle and stall (0 progress). Only one OAI walker at a time.
      if (run.tokenMode && this._anyOtherTokenInflight(src.id)) continue;
      // Per-source pool QUOTA by efficiency rating: fast/productive sources get
      // many parallel slots, slow/stalled ones are capped at 1 so they can never
      // clog the pool. Unrated (new) sources get a small exploration quota.
      // Token-paged (OAI) sources are strictly sequential → 1 slot. Others get a
      // slot budget = round(share × pool) from the pool-share quota policy.
      const slots = run.tokenMode ? 1 : Math.max(1, quota.slotsFor(src.id, this.concurrency, this._quotaShares || new Map()));
      run.cap = slots;                                        // surfaced in status for observability
      if (run.inflight >= slots) continue;
      // Stagger parallel page-starts of the SAME source so we don't burst a remote.
      if (run.inflight > 0 && now - (run.lastStartAt || 0) < CFG.perSourceStaggerMs) continue;

      this._ptr = (this._ptr + k + 1) % n;
      const page = run.nextPage++;
      return { src, page, run };
    }
    return null;
  }

  /**
   * Lazily seed per-source run state: starting page (cursor + deep frontier
   * fast-forward) and adaptive cap. Reset via `_srcRun.delete(id)` when a source
   * is reindexed or a count-refresh re-opens it.
   */
  async _ensureSrcRun(src) {
    let run = this._srcRun.get(src.id);
    if (run && run.seeded) return run;

    const adapter = resolveAdapter(src);
    const family = adapter.constructor.family;
    const deep = DEEP_FAMILIES.has(family);
    const status = src.indexStatus || 'pending';

    // ── TOKEN-paged sources (OAI-PMH resumptionToken) ──
    // Paging is opaque + strictly sequential (each page needs the previous
    // token), so there is no numeric cursor/frontier/knownTotal boundary — we walk
    // tokens until the feed is exhausted (no nextToken).
    if (adapter.supports && adapter.supports('resumptionPaging')) {
      const token = status === 'complete' ? null : await this._getCursorToken(src.id);
      // Incremental checkpoint: when starting a FRESH walk (no live token), resume
      // from the last successfully-harvested datestamp so we don't re-walk the feed.
      const lastDatestamp = await this._getLastDatestamp(src.id);
      // Accurate known total (Invenio of=hb count) is NOT used to bound the walk —
      // the token walk goes until the feed is exhausted — but it lets us tell a
      // genuine completion from a PARTIAL one (feed subset << true corpus).
      const knownTotal = (src.indexTotalMethod === 'api' && Number.isFinite(Number(src.indexTotal)))
        ? Number(src.indexTotal) : null;
      run = {
        seeded: true, deep: true, family, tokenMode: true, token: token || null,
        fromDate: token ? null : (lastDatestamp || null), maxDatestamp: lastDatestamp || null,
        knownTotal, nextPage: (run && run.nextPage) || 1, maxDonePage: 0,
        inflight: (run && run.inflight) || 0, cap: 1, zeroNew: 0, exhausted: false,
        lastStartAt: (run && run.lastStartAt) || 0,
      };
      this._srcRun.set(src.id, run);
      return run;
    }

    let cursor = status === 'complete' ? 0 : await this._getCursor(src.id);

    // Self-heal wasteful re-scan: fast-forward a DEEP source's cursor to the
    // already-collected frontier so we harvest NEW pages, not re-walk indexed ones.
    if (deep && status !== 'complete') {
      const have = await this._docCount(src.id);
      let frontier = Math.floor(have / CFG.pageSize);
      if (family === 'opendatasoft') frontier = Math.min(frontier, Math.floor(10000 / CFG.pageSize) - 1);
      if (frontier > cursor) {
        this._logMsg('info', `${src.name}: fast-forward cursor ${cursor} → ${frontier} (skip re-scan of ${have} indexed docs)`);
        cursor = frontier;
      }
    }

    // Accurate known total (exact API/hit count) bounds the harvest so we stop at
    // the real last page instead of drifting into an API's offset-wrap zone.
    const knownTotal = (src.indexTotalMethod === 'api' && Number.isFinite(Number(src.indexTotal)))
      ? Number(src.indexTotal) : null;

    run = {
      seeded: true, deep, family, knownTotal,
      nextPage: cursor + 1, maxDonePage: cursor,
      inflight: (run && run.inflight) || 0,
      cap: (run && run.cap) || 1,             // start conservative; ramps on clean pages
      zeroNew: 0, exhausted: false, lastStartAt: (run && run.lastStartAt) || 0,
    };
    this._srcRun.set(src.id, run);
    return run;
  }

  /**
   * Terminate a source's harvest (idempotent). If we have an accurate known total
   * and have collected well under it, this is NOT a real completion — the API
   * simply won't yield more right now (WAF/offset-wrap/access limit): mark it
   * 'partial' (honest coverage, retried later) instead of a false 'complete'.
   */
  async _finishSource(source, run, exactTotal) {
    if (run.exhausted) return;
    run.exhausted = true;                     // stop assigning new pages; in-flight pages will no-op their writes
    const known = run.knownTotal;
    if (known && known > 0) {
      const have = await this._docCount(source.id);
      if (have < known * 0.9) { await this._markPartial(source.id, known, have); return; }
    }
    await this._markComplete(source.id, exactTotal);
  }

  /** Harvest ONE page of a source at the given page number (runs in a pool slot). */
  async _harvestSourcePage(source, page, run) {
    this.stats.ticks++;
    this.stats.lastTickAt = new Date().toISOString();
    if (!source || source.enabled === false || run.exhausted) return;

    const adapter = resolveAdapter(source);
    const family = run.family;
    const deep = run.deep;
    const tokenMode = run.tokenMode === true;
    const cursor = page - 1;

    // Depth caps (numeric-paged sources only).
    if (!tokenMode) {
      if (!deep && page > CFG.maxShallowPages) { await this._finishSource(source, run, null); return; }
      if (deep && CFG.maxDeepDocs > 0 && cursor * CFG.pageSize >= CFG.maxDeepDocs) { await this._finishSource(source, run, null); return; }
      if (family === 'opendatasoft' && cursor * CFG.pageSize >= 10000) { await this._finishSource(source, run, null); return; }
    }

    const info = this._activeInfo.get(`${source.id}#${page}`);
    if (info) { info.page = page; info.family = family; }
    this._emit('index:source', { type: 'page-start', sourceId: source.id, name: source.name, page });

    // ── harvest one page ──
    const pageStart = Date.now();      // slot-occupancy latency → efficiency rating
    let result;
    try {
      result = tokenMode
        ? await adapter.search({ resumptionToken: run.token, fromDate: run.token ? null : run.fromDate, limit: CFG.pageSize })
        : await adapter.search({ query: '', page, limit: CFG.pageSize });
    } catch (err) {
      const status = httpStatusOf(err);
      ratings.record(source.id, { name: source.name, latencyMs: Date.now() - pageStart, processed: 0, newNodes: 0, ok: false });
      // OAI resumptionToken expired → restart the walk from the beginning (NOT a
      // failure, and NOT end-of-feed). Dedup on re-walk is handled by MERGE.
      if (tokenMode && err.oaiError === 'badResumptionToken') {
        // Token expired → restart the walk, but RESUME from the last harvested
        // datestamp (incremental `from=`) rather than re-walking the whole feed.
        run.token = null;
        run.fromDate = run.maxDatestamp || run.fromDate || null;
        this._logMsg('info', `${source.name}: OAI token expired — resuming from datestamp ${run.fromDate || '(start)'}`);
        await this._setCursorToken(source.id, null, run.maxDatestamp);
        return;
      }
      // 400/416 deep in paging = the remote's max offset/result window (World
      // Bank ~100k, OpenDataSoft 10k). It is the end of reachable pagination,
      // NOT a failure — complete the source instead of tripping the breaker.
      if ((status === 400 || status === 416) && page > 1) {
        this._logMsg('info', `${source.name}: pagination ceiling at page ${page} (HTTP ${status}) — marking complete`);
        await this._finishSource(source, run, null);
        return;
      }
      this.stats.errors++;
      this.stats.lastError = `${source.name}: ${err.message}`;
      if (isRateLimited(err) || isBlocked(err)) { this._applyBackoff(source.id); run.cap = 1; }
      const _entry = telemetry.recordError({
        sourceId: source.id, sourceName: source.name, phase: 'harvest',
        status, message: err.message,
        detail: `page ${page} · family ${family}${err.stack ? '\n' + err.stack : ''}`,
      });
      this._noteFailure(source.id, source.name, _entry.category);
      this._emit('index:source', { type: 'page-error', sourceId: source.id, page, error: err.message });
      return;
    }

    const exactTotal = result.totalExact ? result.total : null;

    // Token-paged: advance the resumptionToken immediately (paging is sequential
    // and driven by the token, not by page-fullness). A page with no scope-matching
    // records is NORMAL — only an absent nextToken means the feed is exhausted.
    if (tokenMode) {
      run.token = result.nextToken || null;
      run.fromDate = null;                                  // token now drives paging
      if (result.maxDatestamp && (!run.maxDatestamp || result.maxDatestamp > run.maxDatestamp)) run.maxDatestamp = result.maxDatestamp;
      // Persist token + the incremental datestamp checkpoint (survives restart).
      await this._setCursorToken(source.id, run.token, run.maxDatestamp);
    }

    const raw = result.results || [];
    if (!raw.length) {
      if (tokenMode) {
        if (result.hasMore) { ratings.record(source.id, { name: source.name, latencyMs: Date.now() - pageStart, processed: 0, newNodes: 0, ok: true }); return; }
        await this._finishSource(source, run, exactTotal); return;
      }
      // Numeric-paged: an empty page means we've reached the end of this source.
      await this._finishSource(source, run, exactTotal); return;
    }

    const items = raw.filter(it => it.url || it.pdfUrl);
    // How many of this page's docs are genuinely NEW (vs re-scanned duplicates).
    let newNodes = 0;
    if (items.length) {
      const urls = items.map(it => it.url).filter(Boolean);
      const existing = await this._countExisting(source.id, urls);
      newNodes = Math.max(0, items.length - existing);
      await sourceCatalogService._saveSourceDocuments(source.id, items).catch(() => {});
    }

    // Re-scan-loop guard: some remotes (UN ODS/UNDL Invenio) do NOT return an
    // empty page past their result set — they wrap/clamp the offset and re-serve
    // already-indexed records forever (full page → hasMore stays true → cursor
    // climbs without bound, 0 new docs). Terminate a DEEP source after N
    // consecutive all-duplicate pages. `_finishSource` decides complete vs
    // 'partial' based on the accurate known total (partial when we're far short).
    // (Token-paged sources are exempt: a 0-new page is normal — the token drives
    // termination, not page-fullness.)
    if (!tokenMode && deep && items.length && newNodes === 0) {
      run.zeroNew++;
      if (run.zeroNew >= CFG.zeroNewLimit) {
        this._logMsg('info', `${source.name}: ${run.zeroNew} consecutive zero-new pages at p${page} — API yielding no more`);
        this._noteSuccess(source.id);
        await this._finishSource(source, run, exactTotal);
        return;
      }
    } else if (newNodes > 0) {
      run.zeroNew = 0;
    }

    // Full enrichment where supported (bounded concurrency); skip already-enriched
    // AND per-document-quarantined docs (repeatedly-failing individual documents
    // are parked so the rest of the source keeps flowing — self-heal via cooldown).
    let enrichedCount = 0;
    const canEnrich = CFG.enrich && adapter.supports && adapter.supports('enrich');
    let enrichedMap = new Map();
    if (canEnrich && items.length) {
      const already = await this._alreadyEnriched(source.id, items);
      const dq = durable.quarantinedDocUrls(source.id);
      const toEnrich = items.filter(it => !already.has(it.url) && !dq.has(it.url));
      const outcomes = await pool(toEnrich, CFG.enrichConc, async (item) => {
        try {
          const en = await sourceCatalogEnrichmentService.enrichAndSave(source, item);
          durable.noteDocSuccess(source.id, item.url);
          return en;
        } catch (e) {
          if (isRateLimited(e) || isBlocked(e)) { this._applyBackoff(source.id); run.cap = 1; }
          durable.noteDocFailure(source.id, item.url, `enrich ${httpStatusOf(e) || ''} ${e.message}`.trim());
          telemetry.recordWarn({ sourceId: source.id, sourceName: source.name, phase: 'enrich', status: httpStatusOf(e), message: e.message });
          return null;
        }
      });
      outcomes.forEach((en, idx) => { if (en && !en.error) { enrichedCount++; enrichedMap.set(toEnrich[idx].url || toEnrich[idx].id, en); } });
    }

    // Resolve the direct download link where the search result lacks one.
    const resolvedMap = new Map();
    if (CFG.resolveDownload && adapter.supports && adapter.supports('download')) {
      const dq = durable.quarantinedDocUrls(source.id);
      const needing = items.filter(it => !it.pdfUrl && it.url && !dq.has(it.url));
      if (needing.length) {
        await pool(needing, CFG.enrichConc, async (item) => {
          try {
            const dl = await adapter.resolveDownload(item);
            if (dl?.downloadUrl) resolvedMap.set(item.url || item.id, dl.downloadUrl);
          } catch (e) {
            if (isRateLimited(e) || isBlocked(e)) { this._applyBackoff(source.id); run.cap = 1; }
            durable.noteDocFailure(source.id, item.url, `download ${httpStatusOf(e) || ''} ${e.message}`.trim());
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

    // Advance cursor / completion.
    let hasMore;
    if (tokenMode) {
      // Token already advanced + persisted above; complete when the feed is done.
      hasMore = result.hasMore === true;
      if (!run.exhausted && !hasMore) await this._finishSource(source, run, exactTotal);
    } else {
      // Numeric-paged: driven by page-fullness hasMore, bounded by the accurate
      // known total so we stop at the real last page (not an offset-wrap zone).
      // Guard against out-of-order completion by a sibling in-flight page.
      const reachedKnownTotal = run.knownTotal && page * CFG.pageSize >= run.knownTotal;
      hasMore = result.hasMore === true && !reachedKnownTotal;
      if (!run.exhausted) {
        if (hasMore) {
          run.maxDonePage = Math.max(run.maxDonePage, page);
          await this._setCursor(source.id, run.maxDonePage, exactTotal);
        } else {
          await this._finishSource(source, run, reachedKnownTotal ? run.knownTotal : exactTotal);
        }
      }
    }

    this._noteSuccess(source.id);          // a clean page closes the circuit
    // Efficiency rating: total slot-occupancy latency + this page's yield. Drives
    // the per-source pool quota so slow/unproductive sources can't clog the pool.
    ratings.record(source.id, { name: source.name, latencyMs: Date.now() - pageStart, processed: items.length, newNodes, ok: true });
    this.stats.docsIndexed += items.length;
    this.stats.docsEnriched += enrichedCount;
    this.stats.newNodes = (this.stats.newNodes || 0) + newNodes;
    telemetry.recordThroughput({ processed: items.length, newNodes, enriched: enrichedCount });
    this._emit('index:source', {
      type: 'page-done', sourceId: source.id, name: source.name, page,
      indexed: items.length, newNodes, enriched: enrichedCount, total: result.total, hasMore,
    });
  }

  // ── backoff (durable) ──

  _backoffUntil(sourceId) { return durable.getSource(sourceId)?.backoffUntil || 0; }

  _applyBackoff(sourceId) {
    const prev = this._backoffUntil(sourceId);
    const factor = prev > Date.now() ? 2 : 1;
    const until = Date.now() + CFG.backoffBaseMs * factor;
    durable.setBackoff(sourceId, until);
    this._logMsg('warn', `backoff ${sourceId} until ${new Date(until).toISOString()}`);
    const info = [...this._activeInfo.values()].find(i => i.sourceId === sourceId);
    telemetry.recordWarn({ sourceId, sourceName: info?.name, phase: 'backoff', message: `backoff until ${new Date(until).toISOString()}` });
  }

  // ── circuit breaker (error-spike / mass errors → quarantine source, durable) ──

  _circuitOpen(sourceId) {
    const r = durable.getSource(sourceId);
    if (!r) return false;
    // needs_fix / manual quarantines stay closed-for-harvest until their cooldown
    // elapses (natural low-cadence re-probe) or an admin lifts them.
    return (r.openUntil || 0) > Date.now();
  }

  /** Record a failure; trip the breaker on an error spike (mass errors) or a hard error. */
  _noteFailure(sourceId, sourceName, category) {
    if (!sourceId) return;
    const now = Date.now();
    if (this._circuitOpen(sourceId)) return;             // already quarantined — nothing to do
    let fails = this._fails.get(sourceId) || [];
    fails.push(now);
    fails = fails.filter(t => t >= now - CFG.cbWindowMs);
    this._fails.set(sourceId, fails);
    // Non-transient categories trip immediately (retrying won't help); otherwise
    // trip once the error count in the window crosses the threshold (mass errors).
    const cat = errorPolicy.CATEGORIES[category];
    const hardTrip = cat && cat.transient === false;
    if (fails.length >= CFG.cbThreshold || hardTrip) this._openCircuit(sourceId, sourceName, category);
  }

  _openCircuit(sourceId, sourceName, category) {
    const cat = errorPolicy.CATEGORIES[category];
    const nonTransient = cat && cat.transient === false;
    const prev = durable.getSource(sourceId) || {};
    const trips = (prev.trips || 0) + 1;

    // Non-transient (ACCESS_BLOCKED / CONFIG_MISSING / PARSE_ERROR) → 'needs_fix':
    // long, fixed cooldown so a permanently-broken source is retried only rarely
    // (self-heal) and is surfaced in the "needs intervention" list. Transient
    // spikes → 'auto': exponential cooldown, self-heals on the next clean page.
    let cool, mode;
    if (nonTransient) {
      cool = CFG.needsFixCooldownMs;
      mode = 'needs_fix';
    } else {
      cool = Math.min(CFG.cbCooldownMs * Math.pow(2, trips - 1), CFG.cbMaxCooldownMs);
      mode = 'auto';
    }
    const openUntil = Date.now() + cool;
    const reason = category || 'error-spike';
    durable.setCircuit(sourceId, { name: sourceName || prev.name, mode, openUntil, trips, reason, category });
    this._fails.delete(sourceId);

    this._logMsg('warn', `circuit OPEN ${sourceName || sourceId} (${reason}, ${mode}, trip ${trips}) — paused ${Math.round(cool / 1000)}s`);
    telemetry.recordWarn({ sourceId, sourceName, phase: 'circuit',
      message: `circuit opened (${reason}, ${mode}, trip ${trips}) — paused ${Math.round(cool / 1000)}s` });
    this._emit('index:source', { type: 'circuit-open', sourceId, name: sourceName, reason, mode, trips, openUntil });
    try { require('./document-index.incidents').onCircuitOpen({ sourceId, sourceName, category: reason, trips, openUntil }); } catch { /* engine optional */ }
  }

  _noteSuccess(sourceId) {
    this._fails.delete(sourceId);
    const r = durable.getSource(sourceId);
    if (!r) return;
    const wasTripped = (r.trips || 0) > 0 || (r.openUntil || 0) > 0;
    // A clean page recovers ANY source (transient half-open OR a needs_fix source
    // whose remote/config was fixed) — durable state is cleared.
    if (wasTripped) {
      durable.clearCircuit(sourceId);
      durable.clearBackoff(sourceId);
      try { require('./document-index.incidents').onSourceRecovered(sourceId); } catch { /* optional */ }
    }
  }

  /** Manually quarantine a source (used by admin / AI actions). Durable. */
  pauseSource(sourceId, ms, reason = 'manual') {
    const prev = durable.getSource(sourceId) || {};
    const openUntil = Date.now() + Math.max(1000, parseInt(ms, 10) || CFG.cbCooldownMs);
    durable.setCircuit(sourceId, { name: prev.name, mode: 'manual', openUntil, trips: prev.trips || 0, reason });
    this._emit('index:source', { type: 'circuit-open', sourceId, name: prev.name, reason, mode: 'manual', openUntil });
    return { sourceId, openUntil, reason };
  }

  /** Lift a quarantine / backoff for a source (used by admin / AI actions). Durable. */
  resumeSource(sourceId) {
    durable.clearCircuit(sourceId);
    durable.clearBackoff(sourceId);
    this._fails.delete(sourceId);
    this._srcRun.delete(sourceId);       // re-seed cursor/frontier on next pick
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

  // ── token cursor (OAI-PMH resumptionToken) ──
  async _getCursorToken(sourceId) {
    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id}) RETURN s.indexCursorToken as t`, { id: sourceId }
    ).catch(() => []);
    const t = rows[0]?.t;
    return (typeof t === 'string' && t) ? t : null;
  }

  /** Datestamp of the last successfully-harvested OAI record — the incremental
   *  checkpoint used as `from=` so a restart/re-open doesn't re-walk the feed. */
  async _getLastDatestamp(sourceId) {
    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id}) RETURN s.indexLastDatestamp as d`, { id: sourceId }
    ).catch(() => []);
    const d = rows[0]?.d;
    return (typeof d === 'string' && d) ? d : null;
  }

  async _setCursorToken(sourceId, token, datestamp) {
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.indexCursorToken = $token, s.indexStatus = 'indexing', s.lastIndexedAt = $now,
           s.indexLastDatestamp = CASE WHEN $ds IS NULL THEN s.indexLastDatestamp ELSE $ds END`,
      { id: sourceId, token: token || null, ds: datestamp || null, now: new Date().toISOString() }
    ).catch(() => {});
  }

  async _setCursor(sourceId, cursor, total) {
    // Only overwrite indexTotal when we actually have a fresh total — never null
    // out a previously-probed accurate count (e.g. Invenio hit count).
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.indexCursor = $cursor, s.indexStatus = 'indexing',
           s.indexTotal = CASE WHEN $total IS NULL THEN s.indexTotal ELSE $total END,
           s.lastIndexedAt = $now`,
      { id: sourceId, cursor, total: total != null ? Number(total) : null, now: new Date().toISOString() }
    ).catch(() => {});
  }

  async _markComplete(sourceId, exactTotal) {
    // Reaching the end by exhaustive paging IS the count probe: the source's
    // total = the exact API total when known, else the distinct docs harvested.
    // Never DOWNGRADE a previously-probed accurate 'api' total to a node count.
    const have = await this._docCount(sourceId);          // docs actually harvested
    let total = exactTotal, method = 'api';
    if (total == null) {
      total = have;
      method = 'probe';
    }
    // Floor at the harvested count — the total can't be less than what we have.
    if (have > (Number(total) || 0)) { total = have; method = 'harvested'; }
    const now = new Date().toISOString();
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.indexCursor = 0, s.indexCursorToken = null, s.indexStatus = 'complete',
           s.indexTotal = CASE WHEN $method = 'probe' AND s.indexTotalMethod = 'api' THEN s.indexTotal ELSE $total END,
           s.indexTotalMethod = CASE WHEN $method = 'probe' AND s.indexTotalMethod = 'api' THEN 'api' ELSE $method END,
           s.indexTotalAt = $now, s.lastIndexedAt = $now`,
      { id: sourceId, total: Number(total), method, now }
    ).catch(() => {});
    this._emit('index:source', { type: 'source-complete', sourceId, total, method });
  }

  /**
   * The API stopped yielding documents well before the known total (WAF /
   * offset-wrap / access limit). Record an HONEST 'partial' status — coverage
   * stays truthful (indexed / knownTotal) instead of a false 100% — and back the
   * source off; it is re-opened for another attempt by the periodic partial-retry.
   */
  async _markPartial(sourceId, knownTotal, have) {
    const now = new Date().toISOString();
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.indexCursor = 0, s.indexStatus = 'partial',
           s.indexTotal = $total, s.indexTotalMethod = 'api', s.indexTotalAt = $now,
           s.lastIndexedAt = $now, s.partialAt = $now`,
      { id: sourceId, total: Number(knownTotal), now }
    ).catch(() => {});
    this._applyBackoff(sourceId);
    this._logMsg('warn', `${sourceId}: partial — ${have}/${knownTotal} reachable via API (source access-limited), retry later`);
    this._emit('index:source', { type: 'source-partial', sourceId, total: knownTotal, have });
    try { require('./document-index.incidents').raise({
      scope: 'source', sourceId, category: 'ACCESS_BLOCKED', source: 'system',
      description: `Only ${have} of ${knownTotal} documents are reachable via the API (WAF/offset limit) — needs a pagination/access fix to harvest the rest.`,
    }); } catch { /* optional */ }
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
      `MATCH (d:SourceDocument {sourceId: $id})
       WHERE d.url IN $urls AND d.enrichStatus IN ['enriched','full']
       RETURN collect(d.url) as urls`,
      { id: sourceId, urls }
    ).catch(() => []);
    return new Set(rows[0]?.urls || []);
  }

  /** Total SourceDocument nodes already collected for a source (the frontier). */
  async _docCount(sourceId) {
    const rows = await mg().runQuery(
      `MATCH (d:SourceDocument {sourceId: $id}) RETURN count(d) as c`,
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

    // Re-open 'partial' sources (API previously yielded < known total) for another
    // harvest attempt once their retry cooldown elapses — access may have improved.
    // Rating-tuned: a chronically STALLED source (last attempts produced 0 new)
    // backs off much longer so it doesn't burst-clog the pool with 0-yield re-scans.
    for (const s of this._sources) {
      if (s.indexStatus !== 'partial') continue;
      if (this._circuitOpen(s.id) || this._backoffUntil(s.id) > now) continue;
      const at = s.partialAt ? Date.parse(s.partialAt) : 0;
      const stalled = ratings.scoreFor(s.id).tier === 'stalled';
      const retryMs = stalled ? CFG.partialRetryMs * 4 : CFG.partialRetryMs;
      if (now - at < retryMs) continue;
      await mg().runQuery(
        `MATCH (s:SourceCatalog {id: $id}) SET s.indexStatus = 'pending', s.indexCursor = 0`, { id: s.id }
      ).catch(() => {});
      this._srcRun.delete(s.id);
      this._sourcesLoadedAt = 0;
      this._logMsg('info', `${s.name}: partial retry — re-opened for harvest${stalled ? ' (was stalled)' : ''}`);
    }

    let best = null, bestAt = Infinity;
    for (const s of this._sources) {
      if (this._srcRun.get(s.id)?.inflight > 0) continue;     // don't recount a source being harvested
      if (this._backoffUntil(s.id) > now) continue;
      if (this._circuitOpen(s.id)) continue;                  // skip quarantined sources
      if (['indexing', 'pending', 'partial'].includes(s.indexStatus)) continue; // let the harvester finish first
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
    const have = await this._docCount(sourceId);         // docs already harvested
    const adapter = resolveAdapter(source);

    let res;
    if (adapter.supports && adapter.supports('resumptionPaging')) {
      // Token-paged (OAI) sources: the numeric page-walk probe is meaningless (the
      // adapter ignores page numbers and re-serves page 1). Use the adapter's exact
      // count() when available (full-feed completeListSize), else the harvested
      // node count — NEVER the bogus page-1 size.
      let apiTotal = null;
      try { const c = await adapter.count(); if (c && Number.isFinite(c.total)) apiTotal = c.total; } catch { /* ignore */ }
      res = { total: apiTotal != null ? apiTotal : have, method: apiTotal != null ? 'api' : 'harvested', exhausted: true };
    } else {
      this.stats.recounting = { sourceId, name: source.name };
      try { res = await probeSourceTotal(source, {}); }
      finally { this.stats.recounting = null; }
    }

    // A source can NEVER hold fewer documents than we have already harvested — floor
    // the total at the live node count so an under-counting probe can never corrupt
    // a good total (the bug behind "indexTotal=65 while 5041 indexed").
    let total = Number.isFinite(res.total) ? res.total : 0;
    let method = res.method;
    if (have > total) { total = have; method = 'harvested'; }

    await this._saveTotal(sourceId, total, method);
    res = { ...res, total, method };

    const grew = prevTotal != null && Number.isFinite(total) && total > prevTotal;
    if (grew && source.indexStatus === 'complete') {
      // New documents appeared → re-open for the harvester.
      await mg().runQuery(
        `MATCH (s:SourceCatalog {id: $id}) SET s.indexStatus = 'pending', s.indexCursor = 0`,
        { id: sourceId }
      ).catch(() => {});
      this._srcRun.delete(sourceId);  // re-seed cursor/frontier on next pick
      this._sourcesLoadedAt = 0;      // force reload so it gets picked up
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

  /**
   * Re-probe an ACCURATE document count for every enabled source and store it,
   * then reset finished sources back to 'pending' so the harvester re-processes
   * them against the corrected totals. Runs in the background; progress is exposed
   * via `stats.recountAll` and `index:source` events. Skips quarantined sources.
   */
  recountAndResetAll({ resetStatuses = ['complete', 'partial'] } = {}) {
    if (this._recountAllBusy) return { alreadyRunning: true, progress: this.stats.recountAll };
    this._recountAllBusy = true;
    this.stats.recountAll = { startedAt: new Date().toISOString(), total: 0, done: 0, recounted: 0, reset: 0, errors: 0, current: null, finishedAt: null };
    (async () => {
      try {
        const all = (await sourceCatalogService.list({})).filter(s => s.enabled !== false);
        this.stats.recountAll.total = all.length;
        for (const s of all) {
          this.stats.recountAll.current = s.name;
          if (this._circuitOpen(s.id)) { this.stats.recountAll.done++; continue; } // skip quarantined
          try {
            const res = await this.refreshCount(s.id);          // accurate probe (adapter.count() or galloping) + save
            if (res) this.stats.recountAll.recounted++;
          } catch (e) {
            this.stats.recountAll.errors++;
            telemetry.recordWarn({ sourceId: s.id, sourceName: s.name, phase: 'recount', message: e.message });
          }
          if (resetStatuses.includes(s.indexStatus)) {
            await mg().runQuery(
              `MATCH (s:SourceCatalog {id: $id}) SET s.indexStatus = 'pending', s.indexCursor = 0, s.lastIndexedAt = null`,
              { id: s.id }
            ).catch(() => {});
            this._srcRun.delete(s.id);
            this.stats.recountAll.reset++;
          }
          this.stats.recountAll.done++;
        }
        this._sourcesLoadedAt = 0;   // force reload so reset sources are picked up
      } catch (e) {
        this._logMsg('error', `recountAndResetAll failed: ${e.message}`);
      } finally {
        this.stats.recountAll.current = null;
        this.stats.recountAll.finishedAt = new Date().toISOString();
        this._recountAllBusy = false;
        this._emit('index:global', { type: 'recount-all-done', ...this.stats.recountAll });
        this._logMsg('info', `recountAndResetAll done: ${JSON.stringify(this.stats.recountAll)}`);
      }
    })().catch(() => {});
    return { started: true, progress: this.stats.recountAll };
  }

  async reindexSource(sourceId, { purgeVectors = false } = {}) {
    // Full re-index → clear the incremental checkpoint too (start from scratch).
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.indexCursor = 0, s.indexCursorToken = null, s.indexLastDatestamp = null,
           s.indexStatus = 'pending', s.lastIndexedAt = null`,
      { id: sourceId }
    );
    durable.clearBackoff(sourceId);
    this._srcRun.delete(sourceId);     // re-seed cursor/frontier from page 1 on next pick
    if (purgeVectors && CFG.semantic) await sync.deleteBySource(sourceId).catch(() => {});
    this._sourcesLoadedAt = 0; // force reload
    this._emit('index:source', { type: 'reindex-requested', sourceId });
    return { reindex: sourceId };
  }

  /** Retry all quarantined documents for a source (clear its per-doc quarantine). */
  clearDocQuarantine(sourceId) {
    durable.clearDocQuarantine(sourceId);
    this._emit('index:source', { type: 'doc-quarantine-cleared', sourceId });
    return { sourceId, cleared: true };
  }

  /**
   * Enable/disable a source for indexing. Takes effect immediately and SAFELY:
   * disabling only stops NEW page-tasks from being dispatched (the picker drops
   * the source on the next reload) — any in-flight page finishes cleanly, nothing
   * is aborted mid-request. The flag is persisted on the SourceCatalog node, so it
   * survives restart.
   */
  async setSourceEnabled(sourceId, enabled) {
    const en = enabled !== false;
    await sourceCatalogService.update(sourceId, { enabled: en });
    this._srcRun.delete(sourceId);       // drop cached run state
    this._sourcesLoadedAt = 0;           // force reload so the change is honored on the next dispatch
    if (en) durable.clearBackoff(sourceId);   // give a re-enabled source a fresh start
    this._logMsg('info', `source ${sourceId} ${en ? 'enabled' : 'disabled'} for indexing`);
    this._emit('index:source', { type: en ? 'source-enabled' : 'source-disabled', sourceId });
    return { sourceId, enabled: en };
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
