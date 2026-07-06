'use strict';
/**
 * Source document-count probe.
 *
 * Determines how many documents a source currently holds. For sources whose API
 * reports an exact total (World Bank, DSpace, OpenDataSoft) we read it directly
 * (one request). Otherwise (e.g. Invenio / UN Digital Library, which exposes no
 * total) we locate the LAST page that still returns documents and derive the
 * total from its position — using an **exponential (galloping) search then a
 * binary search on the page number**, so a source with hundreds of thousands of
 * documents is measured in O(log N) requests instead of O(N / pageSize).
 *
 * Strategy (per the "assume it's large, then adjust" idea):
 *   1. page 1 → exact-total short-circuit, or "≤ one page" fast path.
 *   2. jump to an optimistic start page (assumeDocs / pageSize) and gallop:
 *        - still returning results → double the page (grow) until it goes empty;
 *        - already empty → halve the page (shrink) until results reappear.
 *      This brackets the boundary between "has results" (lo) and "empty" (hi).
 *   3. binary-search (lo, hi) for the largest page that still returns documents.
 *      total = (lastPage - 1) * pageSize + docsOnLastPage.
 *
 * Each request has a hard timeout so a slow/WAF-gated page can never hang the
 * probe, and the whole probe is capped by a request budget.
 */

const { resolveAdapter } = require('../knowledge/source-adapters/registry');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function envInt(name, def) { const v = parseInt(process.env[name], 10); return Number.isFinite(v) ? v : def; }

const PROBE = {
  pageSize:         envInt('DOCUMENT_INDEXER_PROBE_PAGE_SIZE', 100),
  assumeDocs:       envInt('DOCUMENT_INDEXER_PROBE_ASSUME_DOCS', 100000),   // optimistic starting guess
  maxRequests:      envInt('DOCUMENT_INDEXER_PROBE_MAX_REQUESTS', 40),      // hard budget
  maxPage:          envInt('DOCUMENT_INDEXER_PROBE_MAX_PAGE', 2000000),     // safety ceiling on the page number
  requestTimeoutMs: envInt('DOCUMENT_INDEXER_PROBE_REQUEST_TIMEOUT_MS', 25000),
  politenessMs:     envInt('DOCUMENT_INDEXER_PROBE_POLITENESS_MS', 250),
};

/**
 * Core galloping + binary search. `fetchPage(page)` must resolve to
 *   { count, ok, total?, totalExact? }   (count = documents on that page).
 * Injectable so the arithmetic can be unit-tested without network.
 */
async function probeCount(fetchPage, opts = {}) {
  const pageSize    = opts.pageSize    || PROBE.pageSize;
  const assumeDocs  = opts.assumeDocs  || PROBE.assumeDocs;
  const maxRequests = opts.maxRequests || PROBE.maxRequests;
  const maxPage     = opts.maxPage     || PROBE.maxPage;

  let requests = 0;
  const at = async (page) => { requests++; return fetchPage(page); };
  const budget = () => requests < maxRequests;

  // 1. Page 1: exact-total short-circuit + tiny-source fast path.
  const p1 = await at(1);
  if (p1.ok && p1.totalExact && Number.isFinite(p1.total)) {
    return { total: p1.total, method: 'api', exact: true, requests, lastPage: 1, exhausted: true };
  }
  if (!p1.ok) return { total: 0, method: 'probe', exact: false, requests, exhausted: false, error: p1.error };
  if (p1.count < pageSize) {
    return { total: p1.count, method: 'probe', exact: false, requests, lastPage: 1, exhausted: true };
  }

  // Page 1 is full → the source spans more than one page.
  let lo = 1;          // known to have results (full page)
  let hi = null;       // known empty (once found)

  // 2. Galloping from an optimistic start.
  let cur = Math.min(Math.max(2, Math.floor(assumeDocs / pageSize)), maxPage);
  let curRes = await at(cur);

  if (curRes.ok && curRes.count > 0) {
    lo = cur;
    if (curRes.count < pageSize) hi = cur + 1;          // landed on the last (partial) page
    while (hi == null && budget() && cur < maxPage) {   // grow: double until empty
      cur = Math.min(cur * 2, maxPage);
      const r = await at(cur);
      if (r.ok && r.count > 0) { lo = cur; if (r.count < pageSize) hi = cur + 1; }
      else if (r.ok) { hi = cur; }
      else { hi = cur; }                                 // failed/timeout ⇒ treat as beyond the end
    }
    if (hi == null) {                                    // never went empty (budget/ceiling) → lower-bound estimate
      return { total: lo * pageSize, method: 'probe', exact: false, requests, lastPage: lo, exhausted: false, capped: true };
    }
  } else {
    // Start page was empty (overshot) → shrink until results reappear.
    hi = cur;
    let p = cur;
    while (budget() && p > 1) {
      p = Math.max(1, Math.floor(p / 2));
      const r = await at(p);
      if (r.ok && r.count > 0) { lo = p; break; }
      else { hi = p; }
      if (p === 1) break;
    }
  }

  // 3. Binary search for the largest page that still returns documents.
  while (budget() && hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const r = await at(mid);
    if (r.ok && r.count > 0) lo = mid; else hi = mid;
  }

  // Count documents on the last page to finish the total.
  const last = await at(lo);
  const lastCount = (last.ok && last.count > 0) ? last.count : pageSize;
  const total = (lo - 1) * pageSize + lastCount;
  return { total, method: 'probe', exact: false, requests, lastPage: lo, exhausted: true };
}

/** Wrap adapter.search with a hard per-request timeout (never hangs the probe). */
function makeFetcher(adapter, pageSize, timeoutMs, politenessMs) {
  return async (page) => {
    if (politenessMs) await sleep(politenessMs);
    const search = adapter.search({ query: '', page, limit: pageSize })
      .then(r => ({ count: (r.results || []).length, total: r.total, totalExact: r.totalExact === true, ok: true }))
      .catch(err => ({ count: 0, ok: false, error: err.message }));
    const timeout = new Promise(resolve => setTimeout(() => resolve({ count: 0, ok: false, error: 'probe timeout' }), timeoutMs));
    return Promise.race([search, timeout]);
  };
}

/**
 * Probe a source's current document count.
 * @returns {Promise<{total:number, method:'api'|'probe', exact:boolean, requests:number, lastPage:number, exhausted:boolean, capped?:boolean}>}
 */
async function probeSourceTotal(source, opts = {}) {
  const pageSize = opts.pageSize || PROBE.pageSize;
  const adapter = resolveAdapter(source);
  const fetchPage = makeFetcher(
    adapter, pageSize,
    opts.requestTimeoutMs || PROBE.requestTimeoutMs,
    opts.politenessMs != null ? opts.politenessMs : PROBE.politenessMs,
  );
  return probeCount(fetchPage, { ...PROBE, ...opts, pageSize });
}

module.exports = { probeSourceTotal, probeCount, PROBE };
