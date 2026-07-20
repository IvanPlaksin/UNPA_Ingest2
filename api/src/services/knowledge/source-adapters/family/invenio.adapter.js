'use strict';
/**
 * InvenioAdapter — family base for Invenio 1.x repositories (UN Digital Library
 * and the ODS scopes over it). Search + result mapping reuse RestApiAdapter's
 * recjson handling (which already understands digitallibrary.un.org `files`).
 *
 * Adds:
 *   - Boolean filter folding into the `p` query (symbol/year/author/subject),
 *     with language mapped to the `ln` param.
 *   - MARCXML enrichment via /record/{recid}/export/xm? (WAF-safe).
 *
 * Download needs no override: RestApiAdapter._mapResponse already resolves the
 * English PDF into item.pdfUrl, and the base resolveDownload returns it.
 */

const { RestApiAdapter } = require('./rest-api.adapter');
const { axios, httpsAgent } = require('../lib/http');
const { fetchUNDLRecord } = require('../lib/marc');
const { CAPABILITIES } = require('../capabilities');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class InvenioAdapter extends RestApiAdapter {
  static key    = 'invenio';
  static family = 'invenio';
  static capabilities = ['search', 'browseAll', 'paginate', 'filter', 'sort', 'download', 'enrich', 'count'];
  static downloadMode = 'record-files';
  static enrichMode   = 'marcxml';

  /**
   * Exact catalog count. The recjson list API exposes NO total AND does not
   * paginate reliably server-to-server (WAF clamps deep offsets to a repeated
   * result set), so page-walking under-counts massively — e.g. the GA scope
   * `191__b:"A/"` really holds ~263k records but recjson re-serves the first
   * ~1k. The Invenio `of=hb` HTML page reports the true hit count
   * (`<strong>263,581</strong> records found`); we read that in ONE request so
   * the source's coverage % and completion status are honest.
   */
  async count(opts = null) {
    const cfg = this.config;
    if (!cfg.endpoint) return null;
    // opts may be { query } to override the counted query (e.g. a `year:YYYY/MM`
    // publication-period slice), and/or { dateRange:{from,until,type} } for a
    // legacy d1/d2 release-date window. Back-compat: a bare {from,until} is a range.
    const o = opts || {};
    const dateRange = o.dateRange || (o.from ? o : null);
    const q = o.query || cfg.defaultQuery || cfg.queryParams?.[cfg.searchParam] || '';
    const params = { ...(cfg.queryParams || {}), of: 'hb', rg: 1 };
    if (cfg.searchParam && q) params[cfg.searchParam] = q;
    delete params.jrec;
    // Optional date-range slice (release date d1/d2) for a windowed count.
    if (dateRange && dateRange.from) { params.d1 = dateRange.from; if (dateRange.until) params.d2 = dateRange.until; if (dateRange.type) params.dt = dateRange.type; }
    const axConf = { method: 'GET', url: cfg.endpoint, params, timeout: 30000, httpsAgent, headers: { ...(cfg.headers || {}) } };
    let resp = await axios(axConf);
    let tries = 0;
    while (resp.status === 202 && tries < 5) { await sleep(1500); resp = await axios(axConf); tries++; }
    const html = typeof resp.data === 'string' ? resp.data : '';
    const m = html.match(/<strong>\s*([\d,]+)\s*<\/strong>\s*records?\s+found/i);
    if (m) return { total: parseInt(m[1].replace(/,/g, ''), 10), exact: true, method: 'api' };
    return null;
  }

  /** Fold declared filters into the Invenio `p` query (Boolean AND). */
  _applyFilters(params, filters) {
    const sp = this.config.searchParam || 'p';
    const clauses = [];
    for (const f of this.effectiveFilterSchema()) {
      const v = filters[f.type];
      if (v == null || v === '') continue;
      switch (f.type) {
        case 'language': params.ln = v; break;
        case 'symbol':   clauses.push(`191__a:"${v}"`); break;
        case 'author':   clauses.push(`710__a:"${v}"`); break;
        case 'subject':  clauses.push(`650__a:"${v}"`); break;
        case 'year':
        case 'dateFrom':
        case 'yearFrom': clauses.push(`year:${v}`); break;
        default:
          if (f.param && f.param !== 'p') params[f.param] = v;
      }
    }
    if (clauses.length) {
      const existing = params[sp] ? `(${params[sp]}) AND ` : '';
      params[sp] = existing + clauses.join(' AND ');
    }
  }

  /** Per-record MARC21 XML enrichment (WAF-safe path). */
  async enrich(item) {
    this.requireCapability(CAPABILITIES.ENRICH);
    const recid = item?.metadata?.recid || item?.externalId || item?.recid;
    if (!recid) return null;
    return fetchUNDLRecord(recid, '[Invenio]');
  }
}

module.exports = { InvenioAdapter };
