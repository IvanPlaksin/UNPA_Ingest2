'use strict';
/**
 * DateRangeHarvester — full-corpus harvest for sources whose API clamps deep
 * pagination or scatters coverage, by partitioning the corpus on a DATE window
 * and paging each window fully. Runs its own loop, isolated from the numeric
 * main-pool dispatcher, but its in-flight fetches are surfaced in the pool status
 * so the dashboard shows them as active work.
 *
 * Two partition MODES (per source `config.dateMode`):
 *   - 'query' (Invenio/ODS): append `year:YYYY` / `year:YYYY/MM` (PUBLICATION
 *     period) to the base query. Bypasses the recjson ~1000 clamp; reaches the
 *     whole 1946→today corpus. Low concurrency (shared WAF-throttled endpoint).
 *   - 'param' (World Bank WDS …): pass a date window as request params
 *     (`strdate`/`enddate`, ISO) via `config.dateRangeParams`. WDS has no ~1000
 *     clamp (only a deep-offset ceiling), so a whole YEAR fits one window and is
 *     paged with HIGH concurrency (the endpoint tolerates ~24-30 parallel).
 *
 * PER-SOURCE PARALLELISM. Each source harvests a year through a bounded pool of
 * `config.harvestConcurrency` workers pulling page-tasks — this is what fills the
 * main pool's slots. Sources that share one endpoint are grouped
 * (`config.endpointGroup`) and only ONE source per group runs at a time, so the
 * 4 ODS scopes never hammer digitallibrary in parallel while World Bank (its own
 * group) runs 24-wide.
 *
 * CHECKPOINT. `indexPubThrough` (last fully-harvested year) is stored on the
 * source node — durable, never "lost" (unlike an in-memory OAI token). Restart
 * resumes at the next year; the current year is re-checked for new documents.
 */

const { sourceCatalogService } = require('../knowledge/source-catalog.service');
const { resolveAdapter } = require('../knowledge/source-adapters/registry');
const ratings = require('./document-index.ratings');
const telemetry = require('./document-index.telemetry');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

function envInt(n, d) { const v = parseInt(process.env[n], 10); return Number.isFinite(v) ? v : d; }
const CFG = {
  tickMs:       envInt('DOCUMENT_INDEXER_RANGE_TICK_MS', 2000),
  pageSize:     envInt('DOCUMENT_INDEXER_RANGE_PAGE_SIZE', 50),
  sliceMax:     envInt('DOCUMENT_INDEXER_RANGE_SLICE_MAX', 900),   // split a window above this (recjson clamp)
  startYear:    envInt('DOCUMENT_INDEXER_RANGE_START_YEAR', 1946), // UN founding
  requestGapMs: envInt('DOCUMENT_INDEXER_RANGE_GAP_MS', 250),      // per-worker politeness gap
  concurrency:  envInt('DOCUMENT_INDEXER_RANGE_CONCURRENCY', 3),   // default per-source parallel fetches
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const curYear = () => new Date().getUTCFullYear();
const pad = (n) => String(n).padStart(2, '0');
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

class DateRangeHarvester {
  constructor(svc) {
    this.svc = svc;                 // main indexer service (state + shared helpers)
    this._busy = new Set();         // sourceIds currently harvesting
    this._busyGroups = new Set();   // endpoint groups currently in use (mutual exclusion)
    this._rr = 0;                   // round-robin pointer across sources
    this.active = new Map();        // fetchKey → { sourceId, name, window, page } (pool display)
    this.stats = { docsIndexed: 0, newNodes: 0, errors: 0 };
  }

  start() { if (!this._handle) this._handle = setInterval(() => this._tick().catch(() => {}), CFG.tickMs); }
  stop() { if (this._handle) clearInterval(this._handle); this._handle = null; }

  async _sources() {
    const all = await sourceCatalogService.list({}).catch(() => []);
    return all.filter(s => s.enabled !== false && s.config && s.config.harvestMode === 'date-range');
  }

  /** Per-source harvest parameters derived from config. */
  _params(source) {
    const c = source.config || {};
    const host = (c.endpoint || '').replace(/^https?:\/\/([^/]+).*/, '$1');
    return {
      concurrency: Math.max(1, c.harvestConcurrency || CFG.concurrency),
      dateMode:    c.dateMode || 'query',                        // 'query' | 'param'
      sliceMax:    c.harvestSliceMax || CFG.sliceMax,
      pageSize:    c.harvestPageSize || CFG.pageSize,
      gapMs:       c.harvestGapMs != null ? c.harvestGapMs : CFG.requestGapMs,
      startYear:   c.dateStart ? parseInt(String(c.dateStart).slice(0, 4), 10) : CFG.startYear,
      base:        c.defaultQuery || (c.count && c.count.query) || '',
      group:       c.endpointGroup || host || 'default',
      fmt:         (c.dateRangeParams && c.dateRangeParams.format) || 'iso',
      order:       c.harvestOrder === 'newest' ? 'newest' : 'oldest',   // dense recent years first
    };
  }

  async _tick() {
    if (this.svc.state !== 'RUNNING') return;
    const sources = await this._sources();
    const n = sources.length;
    if (!n) return;
    const now = Date.now();
    for (let k = 0; k < n; k++) {
      const s = sources[(this._rr + k) % n];
      if (this._busy.has(s.id)) continue;
      const P = this._params(s);
      if (this._busyGroups.has(P.group)) continue;               // one source per shared endpoint
      if (this.svc._circuitOpen(s.id) || this.svc._backoffUntil(s.id) > now) continue;
      this._busy.add(s.id); this._busyGroups.add(P.group);
      this._harvestNextYear(s, P)
        .catch(e => { this.stats.errors++; this.svc._logMsg('warn', `date-range ${s.name}: ${e.message}`); })
        .finally(() => { this._busy.delete(s.id); this._busyGroups.delete(P.group); });
    }
    this._rr = (this._rr + 1) % n;
  }

  /** Harvest the next unharvested year for a source (parallel), then advance the frontier. */
  async _harvestNextYear(source, P) {
    const cur = curYear();
    const frontier = await this._getFrontier(source.id);
    // 'oldest': frontier = last done year, walk UP from startYear.
    // 'newest': frontier = OLDEST done year, walk DOWN from the current year
    //           (dense recent years fill the pool first; older years follow).
    let year;
    if (P.order === 'newest') {
      if (frontier == null || frontier <= P.startYear) year = cur;         // start / caught up → (re)check current
      else year = frontier - 1;
    } else {
      if (frontier == null) year = P.startYear;
      else if (frontier < cur) year = frontier + 1;
      else year = cur;
    }
    if (year > cur || year < P.startYear) return;
    if (!P.base && P.dateMode === 'query') { this.svc._logMsg('warn', `date-range ${source.name}: no base query`); return; }

    const adapter = resolveAdapter(source);
    const windows = await this._windowsForYear(source, adapter, P, year);
    // Count(s) failed (throttle/network) — the year's true size is UNKNOWN, so we
    // must NOT advance the frontier past it (that would skip real documents and
    // race to a false 'complete'). Back off and retry the SAME year next tick.
    if (windows === null) { this.svc._applyBackoff(source.id); return; }

    const tasks = [];
    for (const w of windows) {
      const pages = Math.max(1, Math.ceil((w.count || P.pageSize) / P.pageSize));
      for (let p = 1; p <= pages; p++) tasks.push({ w, page: p });
    }
    const failures = tasks.length ? await this._runPool(source, adapter, P, tasks) : 0;
    // A page fetch failed — the year is only PARTIALLY harvested. Do not advance;
    // retry the whole year (already-saved pages dedup on MERGE).
    if (failures > 0) { this.svc._applyBackoff(source.id); return; }

    // Year fully harvested → advance the durable frontier.
    if (P.order === 'newest') {
      const oldestDone = Math.min(frontier == null ? cur : frontier, year);
      await this._setFrontier(source.id, oldestDone, oldestDone <= P.startYear ? 'complete' : 'indexing');
    } else if (year < cur) {
      await this._setFrontier(source.id, year, 'indexing');
    } else {
      await this._setFrontier(source.id, cur, 'complete');
    }
  }

  /**
   * Build the windows for a publication year, splitting to months if over
   * sliceMax. Returns null if ANY count failed (unknown size → caller must retry
   * the year, not skip it); [] only for a genuinely empty year.
   */
  async _windowsForYear(source, adapter, P, year) {
    const yWin = this._window(P, year);
    const total = await this._count(adapter, yWin);
    if (total === null) return null;                       // count failed → retry (do NOT skip year)
    if (total === 0) return [];                            // genuinely empty year
    if (total <= P.sliceMax) return [{ ...yWin, count: total }];
    const out = [];
    for (let m = 1; m <= 12; m++) {
      if (this.svc.state !== 'RUNNING') return null;       // interrupted → retry year
      const mWin = this._window(P, year, m);
      const mc = await this._count(adapter, mWin);
      if (mc === null) return null;                        // a month count failed → retry whole year
      if (mc > 0) out.push({ ...mWin, count: mc });        // months are ~hundreds; day-split rarely needed
    }
    return out;
  }

  /** Construct a window descriptor for a year (and optional month) per dateMode. */
  _window(P, year, month) {
    const label = month ? `${year}/${pad(month)}` : `${year}`;
    if (P.dateMode === 'param') {
      const m1 = month || 1, m2 = month || 12;
      const from = this._fmtDate(P, year, m1, 1);
      const until = this._fmtDate(P, year, m2, daysInMonth(year, m2));
      return { label, dateRange: { from, until } };
    }
    // query mode (Invenio year: publication period)
    const q = month ? `${P.base} AND year:${year}/${pad(month)}` : `${P.base} AND year:${year}`;
    return { label, query: q };
  }

  _fmtDate(P, y, m, d) {
    if (P.fmt === 'ddmmyyyy') return `${pad(d)}/${pad(m)}/${y}`;
    return `${y}-${pad(m)}-${pad(d)}`;                       // iso (default, WDS)
  }

  /** Windowed count. Returns the count, or null on error (distinct from 0 = empty). */
  async _count(adapter, win) {
    try {
      const r = win.query ? await adapter.count({ query: win.query }) : await adapter.count({ dateRange: win.dateRange });
      return (r && Number.isFinite(r.total)) ? r.total : null;
    } catch { return null; }
  }

  /** Run page-tasks through a bounded pool of `P.concurrency` workers; return the failure count. */
  async _runPool(source, adapter, P, tasks) {
    let idx = 0, failures = 0;
    const worker = async () => {
      while (idx < tasks.length && this.svc.state === 'RUNNING') {
        const t = tasks[idx++];
        const ok = await this._fetchAndSave(source, adapter, P, t.w, t.page);
        if (!ok) failures++;
        if (P.gapMs) await sleep(P.gapMs);
      }
    };
    await Promise.all(Array.from({ length: P.concurrency }, worker));
    // If interrupted mid-year, treat unrun tasks as failures so the year is retried.
    if (this.svc.state !== 'RUNNING' && idx < tasks.length) failures += tasks.length - idx;
    return failures;
  }

  /** One page of one window: fetch → persist → record. Returns true on success, false on failure. */
  async _fetchAndSave(source, adapter, P, win, page) {
    const key = `${source.id}#${win.label}#${page}`;
    this.active.set(key, { sourceId: source.id, name: source.name, window: win.label, page });
    const t0 = Date.now();
    try {
      const args = win.query
        ? { query: win.query, page, limit: P.pageSize }
        : { query: '', page, limit: P.pageSize, dateRange: win.dateRange };
      const result = await adapter.search(args);
      const items = (result.results || []).filter(it => it.url || it.pdfUrl);
      if (!items.length) { ratings.record(source.id, { name: source.name, latencyMs: Date.now() - t0, processed: 0, newNodes: 0, ok: true }); return true; }

      const urls = items.map(it => it.url).filter(Boolean);
      const existing = await this.svc._countExisting(source.id, urls);
      const newNodes = Math.max(0, items.length - existing);
      // Skip the two write queries (_saveSourceDocuments + _markIndexed) for a
      // page that is ENTIRELY duplicates — the common case when a source re-walks
      // already-harvested years. This removes the redundant write pressure that
      // otherwise saturates Memgraph at ~1M nodes and times out. Pages with any
      // new document are still persisted whole (the batch includes them).
      if (newNodes > 0) {
        await sourceCatalogService._saveSourceDocuments(source.id, items).catch(() => {});
        await this.svc._markIndexed(source.id, items);
      }

      ratings.record(source.id, { name: source.name, latencyMs: Date.now() - t0, processed: items.length, newNodes, ok: true });
      telemetry.recordThroughput({ processed: items.length, newNodes });
      this.stats.docsIndexed += items.length; this.stats.newNodes += newNodes;
      this.svc._noteSuccess(source.id);
      return true;
    } catch (e) {
      this.stats.errors++;
      ratings.record(source.id, { name: source.name, latencyMs: Date.now() - t0, processed: 0, newNodes: 0, ok: false });
      const throttled = /429|503|rate|throttl|challenge/i.test(e.message) || e?.response?.status === 429 || e?.response?.status === 503;
      if (throttled) {
        // Transient WAF throttle — just back off; do NOT escalate to quarantine.
        this.svc._applyBackoff(source.id);
      } else {
        const en = telemetry.recordError({ sourceId: source.id, sourceName: source.name, phase: 'harvest', status: e?.response?.status, message: e.message, detail: `date ${win.label} p${page}` });
        this.svc._noteFailure(source.id, source.name, en.category);
      }
      return false;
    } finally {
      this.active.delete(key);
    }
  }

  // ── checkpoint persistence (durable on the source node) ──
  async _getFrontier(sourceId) {
    const rows = await mg().runQuery(`MATCH (s:SourceCatalog {id:$id}) RETURN s.indexPubThrough as f`, { id: sourceId }).catch(() => []);
    const f = rows[0]?.f;
    const y = (f == null) ? NaN : parseInt(String(f).slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
  }
  async _setFrontier(sourceId, year, status) {
    const c = await this.svc._docCount(sourceId);
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id:$id})
       SET s.indexPubThrough=$y, s.indexStatus=$st,
           s.indexTotal=CASE WHEN s.indexTotal>=$c THEN s.indexTotal ELSE $c END,
           s.lastIndexedAt=$now`,
      { id: sourceId, y: String(year), st: status, c: Number(c), now: new Date().toISOString() }
    ).catch(() => {});
  }

  /** Active fetches for the dashboard pool (same shape as main-pool tasks). */
  activeWindows() {
    return [...this.active.values()].map(w => ({
      sourceId: w.sourceId, name: w.name, page: w.page, window: w.window, family: 'date-range',
    }));
  }
}

module.exports = { DateRangeHarvester, CFG };
