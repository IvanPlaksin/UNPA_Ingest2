'use strict';
/**
 * RestApiAdapter — family base for generic REST/JSON sources.
 *
 * Ports the original SourceCatalogService._browseRestApi verbatim (response
 * mapping, multilingual unwrap, UN Digital Library recjson handling, 202 WAF
 * retry) and adds capability-driven filter + sort mapping.
 *
 * Subclasses typically only declare capabilities / filterSchema / config and
 * optionally override `_applyFilters` (e.g. OpenDataSoft `refine=`, Invenio
 * Boolean `p`) or `_applySort`.
 */

const { v4: uuidv4 } = require('uuid');
const { SourceAdapter } = require('../base.adapter');
const { axios, httpsAgent } = require('../lib/http');
const {
  nested, getExt, unwrap, unwrapEn, normalizeSymbol, findEnglishPdf,
} = require('../lib/parse');

class RestApiAdapter extends SourceAdapter {
  static key    = 'rest-api';
  static family = 'rest-api';
  static capabilities = ['search', 'browseAll', 'paginate'];

  async search({ query = '', page = 1, limit = 20, filters = {}, sort = null, dateRange = null } = {}) {
    const cfg = this.config;
    if (!cfg.endpoint) throw new Error('API endpoint not configured');

    const effectiveQuery = query || cfg.defaultQuery || '';

    const params = { ...(cfg.queryParams || {}) };
    if (cfg.searchParam && effectiveQuery) params[cfg.searchParam] = effectiveQuery;

    // Pagination: offset-1 (Invenio jrec), offset-0, or page-number styles
    if (cfg.pageParam) {
      if (cfg.pageParamStyle === 'offset-1') {
        params[cfg.pageParam] = (page - 1) * limit + 1;
      } else if (cfg.pageParamStyle === 'offset-0') {
        params[cfg.pageParam] = (page - 1) * limit;
      } else {
        params[cfg.pageParam] = page;
      }
    }
    if (cfg.limitParam) params[cfg.limitParam] = limit;

    // Date-range slice — narrows a query to a window small enough to page fully
    // (past a deep-pagination clamp / to partition a huge corpus). The param
    // NAMES are per-source via `config.dateRangeParams` (default = Invenio legacy
    // d1/d2). WDS uses { from:'strdate', until:'enddate' }. `dateRange` values are
    // already formatted by the caller for the source (dd/mm/yyyy or ISO).
    if (dateRange && dateRange.from) {
      const dp = cfg.dateRangeParams || { from: 'd1', until: 'd2', type: 'dt' };
      params[dp.from] = dateRange.from;
      if (dateRange.until && dp.until) params[dp.until] = dateRange.until;
      if (dateRange.type && dp.type) params[dp.type] = dateRange.type;
    }

    // Capability-driven filters + sort (only applied when declared).
    if (this.supports('filter') && filters && Object.keys(filters).length) {
      this._applyFilters(params, filters);
    }
    if (this.supports('sort') && sort) {
      this._applySort(params, sort);
    }

    const headers = { ...(cfg.headers || {}) };
    if (cfg.auth?.type === 'bearer')
      headers['Authorization'] = `Bearer ${cfg.auth.token}`;
    else if (cfg.auth?.type === 'apiKey')
      headers[cfg.auth.headerName || 'X-API-Key'] = cfg.auth.key;

    const axConf = {
      method:  cfg.method || 'GET',
      url:     cfg.endpoint,
      headers,
      timeout: 20000,
      httpsAgent,
    };
    if (String(axConf.method).toUpperCase() === 'GET') axConf.params = params;
    else axConf.data = params;

    if (cfg.auth?.type === 'basic')
      axConf.auth = { username: cfg.auth.username, password: cfg.auth.password };

    let response = await axios(axConf);
    // Invenio / WAF async "Accepted" — retry up to 5 times with 1.5s delay
    let retries = 0;
    while (response.status === 202 && retries < 5) {
      await new Promise(res => setTimeout(res, 1500));
      response = await axios(axConf);
      retries++;
    }

    return this._mapResponse(response.data, { page, limit });
  }

  /**
   * Exact count for a query/date window, read from the response's mapped `total`
   * field via a 1-row search. `opts` = { query?, dateRange? }. Returns null when
   * the API exposes no total (Invenio overrides this with an of=hb reader).
   */
  async count(opts = {}) {
    const r = await this.search({ query: opts.query || '', page: 1, limit: 1, dateRange: opts.dateRange || null });
    if (!r) return null;
    return { total: Number(r.total) || 0, exact: r.totalExact === true, method: r.totalExact ? 'api' : 'page' };
  }

  /**
   * Default filter mapping: for each declared filter whose value is present,
   * set params[filter.param] = value. Overridden by OpenDataSoft/Invenio.
   */
  _applyFilters(params, filters) {
    for (const f of this.effectiveFilterSchema()) {
      const v = filters[f.type];
      if (v == null || v === '') continue;
      params[f.param] = v;
    }
  }

  /**
   * Default sort mapping using cfg.sortParams = { field, order, orderAsc, orderDesc }.
   * `sort` = { field, dir: 'asc'|'desc' }.
   */
  _applySort(params, sort) {
    const sp = this.config.sortParams;
    if (!sp || !sort?.field) return;
    if (sp.field) params[sp.field] = sort.field;
    if (sp.order) params[sp.order] = sort.dir === 'asc' ? (sp.orderAsc || 'a') : (sp.orderDesc || 'd');
  }

  /** Map a raw JSON response to { results, total, hasMore } using cfg.responseMapping. */
  _mapResponse(data, { page, limit }) {
    const cfg = this.config;
    const m = cfg.responseMapping || {};

    let raw;
    if (!m.items && m.items !== 0) {
      raw = Array.isArray(data) ? data : [];
    } else {
      raw = nested(data, m.items) || (Array.isArray(data) ? data : []);
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      raw = Object.values(raw);
    }
    // Only trust `total` when the response actually exposes a total field.
    // Otherwise (e.g. Invenio recjson) it would fall back to the page length,
    // which is NOT the source's document count — treat it as unknown.
    const mappedTotal = (m.total != null && m.total !== '') ? Number(nested(data, m.total)) : NaN;
    const totalExact = Number.isFinite(mappedTotal) && mappedTotal >= 0;
    const total = totalExact ? mappedTotal : raw.length;

    const isDlSource = cfg.endpoint?.includes('digitallibrary.un.org');

    const results = raw.map(item => {
      const rawRecid = item.recid ? String(item.recid) : '';
      const rawUrl   = unwrap(nested(item, m.url) || item.url || item.link || rawRecid || '');
      const finalUrl = m.urlPrefix && rawUrl ? `${m.urlPrefix}${rawUrl}` : rawUrl;

      const rawTitleField = nested(item, m.title) || item.title || item.name;
      const title = (() => {
        if (rawTitleField) {
          const t = unwrapEn(rawTitleField);
          if (t) return t.substring(0, 200);
        }
        if (m.titleFallback) {
          const fb = nested(item, m.titleFallback);
          if (fb) return unwrap(fb).substring(0, 200);
        }
        return '';
      })();

      const rawSymbol = unwrap(nested(item, m.symbol) || item.symbol || '');
      let sym = '';
      if (isDlSource && Array.isArray(item.files) && item.files.length) {
        const enFile = item.files.find(f =>
          (f.full_name || f.name || '').toUpperCase().includes('-EN.')
        ) || item.files[0];
        sym = normalizeSymbol(enFile?.full_name || enFile?.name || rawSymbol);
      } else {
        sym = normalizeSymbol(rawSymbol);
      }

      const pdfUrl = isDlSource
        ? findEnglishPdf(item.files, rawRecid || rawUrl)
        : '';

      const languages = (isDlSource && Array.isArray(item.files))
        ? [...new Set(item.files.map(f => {
            const n = f.full_name || f.name || '';
            const lm = n.match(/-([A-Z]{1,3})\.[a-z]+$/i);
            return lm ? lm[1].toUpperCase() : null;
          }).filter(Boolean))]
        : [];

      const metadata = isDlSource && item.files
        ? { recid: rawRecid, files: item.files.slice(0, 10), languages }
        : undefined;

      const looksLikeFilename = title && /^[A-Z][A-Z_\/]+[\d_]/.test(title) && !title.includes(' ');
      const finalTitle = (looksLikeFilename && sym)
        ? sym
        : (title || sym || unwrap(nested(item, m.symbol) || item.symbol || '').substring(0, 200) || 'Untitled');

      return {
        id:          uuidv4(),
        title:       finalTitle,
        url:         finalUrl,
        pdfUrl:      pdfUrl || undefined,
        fileType:    pdfUrl ? 'pdf' : unwrap(nested(item, m.fileType) || getExt(rawUrl || '') || 'html'),
        date:        unwrap(nested(item, m.date) || item.date || item.published_at || item.pubDate || ''),
        description: unwrap(nested(item, m.description) || item.description || item.summary || '').substring(0, 500),
        symbol:      sym,
        languages:   languages.length ? languages : undefined,
        metadata:    metadata,
      };
    });

    // Drop non-record pseudo-entries (e.g. World Bank WDS `documents.facets`):
    // an item with no locator and only the placeholder title carries no document.
    const cleaned = results.filter(r =>
      r.url || r.pdfUrl || (r.title && r.title !== 'Untitled') || r.symbol
    );

    // hasMore: with an exact total, compare against the offset; otherwise infer
    // from page fullness (a full page almost always means more records follow).
    const pageSize = limit || cleaned.length || raw.length || 1;
    const hasMore = totalExact
      ? (page * pageSize < total)
      : (raw.length >= pageSize && raw.length > 0);

    return { results: cleaned, total, totalExact, hasMore };
  }
}

module.exports = { RestApiAdapter };
