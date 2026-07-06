'use strict';
/**
 * DspaceAdapter — family base for DSpace 7 repositories (WHO IRIS, ECLAC, FAO,
 * ESCAP …) via the Discovery REST API.
 *
 *   search : GET {base}/server/api/discover/search/objects?query=&page=&size=&f.*=
 *   filter : DSpace facet params  f.<facet>=<value>,equals  (date via range or .min/.max)
 *   download: item → ORIGINAL bundle → bitstream → /core/bitstreams/{uuid}/content
 *   enrich : GET {base}/server/api/core/items/{uuid}  (full Dublin Core block)
 */

const { v4: uuidv4 } = require('uuid');
const { SourceAdapter } = require('../base.adapter');
const { axios, httpsAgent } = require('../lib/http');
const { nested } = require('../lib/parse');
const { CAPABILITIES } = require('../capabilities');

const DSPACE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

const LANG_MAP = {
  en: 'EN', eng: 'EN', english: 'EN',
  fr: 'FR', fre: 'FR', fra: 'FR', french: 'FR',
  es: 'ES', spa: 'ES', spanish: 'ES',
  ar: 'AR', ara: 'AR', arabic: 'AR',
  ru: 'RU', rus: 'RU', russian: 'RU',
  zh: 'ZH', chi: 'ZH', zho: 'ZH', chinese: 'ZH',
  pt: 'PT', por: 'PT', portuguese: 'PT',
};
function normLang(code) {
  if (!code) return null;
  return LANG_MAP[String(code).toLowerCase()] || String(code).toUpperCase().slice(0, 3);
}
function yearOf(v) {
  const m = String(v || '').match(/\d{4}/);
  return m ? m[0] : '';
}

class DspaceAdapter extends SourceAdapter {
  static key    = 'dspace';
  static family = 'dspace';
  static capabilities = ['search', 'browseAll', 'paginate', 'filter', 'sort', 'download', 'enrich', 'fulltext'];
  static downloadMode = 'dspace-bitstream';
  static enrichMode   = 'dspace-item';

  /** DSpace REST base, e.g. https://iris.who.int (before /server/api). */
  _base() {
    const ep = this.config.endpoint || '';
    return ep.split('/server/api')[0] || ep;
  }

  _headers() {
    return { ...DSPACE_HEADERS, ...(this.config.headers || {}) };
  }

  async search({ query = '', page = 1, limit = 20, filters = {}, sort = null } = {}) {
    const cfg = this.config;
    if (!cfg.endpoint) throw new Error('DSpace endpoint not configured');

    const params = { dsoType: 'item', ...(cfg.queryParams || {}) };
    const searchParam = cfg.searchParam || 'query';
    const effectiveQuery = query || cfg.defaultQuery || '';
    if (effectiveQuery) params[searchParam] = effectiveQuery;

    params[cfg.pageParam || 'page'] = page - 1;   // DSpace pages are 0-based
    params[cfg.limitParam || 'size'] = limit;

    if (this.supports('filter') && filters && Object.keys(filters).length) {
      this._applyFilters(params, filters);
    }
    if (this.supports('sort') && sort?.field) {
      params[cfg.sortParam || 'sort'] = `${sort.field},${sort.dir === 'asc' ? 'ASC' : 'DESC'}`;
    } else if (cfg.sortExample && !params[cfg.sortParam || 'sort']) {
      // leave default relevance sort
    }

    const response = await axios.get(cfg.endpoint, {
      params, timeout: 20000, httpsAgent, headers: this._headers(),
    });

    return this._mapResponse(response.data, { page, limit });
  }

  /** DSpace facet filters: f.<facet>=<value>,equals; date range or .min/.max. */
  _applyFilters(params, filters) {
    const schema = this.effectiveFilterSchema();
    // Handle date bounds together.
    const dateEntry = schema.find(f => f.type === 'dateFrom' || f.type === 'dateTo');
    if (dateEntry && (filters.dateFrom || filters.dateTo || filters.yearFrom || filters.yearTo)) {
      const from = yearOf(filters.dateFrom || filters.yearFrom);
      const to   = yearOf(filters.dateTo   || filters.yearTo);
      const p = dateEntry.param || 'f.dateIssued';
      if (p.endsWith('.min') || p.endsWith('.max')) {
        const facet = p.replace(/\.(min|max)$/, '');
        if (from) params[`${facet}.min`] = from;
        if (to)   params[`${facet}.max`] = to;
      } else {
        params[p] = `[${from || '*'} TO ${to || '*'}],equals`;
      }
    }
    for (const f of schema) {
      if (f.type === 'dateFrom' || f.type === 'dateTo') continue;
      const v = filters[f.type];
      if (v == null || v === '' || !f.param) continue;
      params[f.param] = `${v},equals`;
    }
  }

  _mapResponse(data, { page, limit }) {
    const sr   = nested(data, '_embedded.searchResult') || data;
    const objs = nested(sr, '_embedded.objects') || [];
    const totalRaw = Number(nested(sr, 'page.totalElements'));
    const totalExact = Number.isFinite(totalRaw) && totalRaw >= 0;
    const total = totalExact ? totalRaw : objs.length;

    const results = objs.map(o => {
      const io = o?._embedded?.indexableObject || o?.indexableObject || o;
      const md = io?.metadata || {};
      const mv = (k) => md[k]?.[0]?.value || '';
      const all = (k) => (md[k] || []).map(x => x.value).filter(Boolean);

      const title = mv('dc.title') || io?.name || 'Untitled';
      const handle = io?.handle;
      const url = mv('dc.identifier.uri') || (handle ? `https://hdl.handle.net/${handle}` : '');
      const date = mv('dc.date.issued') || mv('dc.date');
      const symbol = mv('dc.identifier.govdoc') || mv('dc.identifier.unsymbol') || mv('dc.identifier.other') || '';
      const description = mv('dc.description.abstract') || mv('dc.description') || '';
      const langs = [...new Set(all('dc.language.iso').concat(all('dc.language')).map(normLang).filter(Boolean))];

      return {
        id:          io?.uuid || uuidv4(),
        title:       String(title).substring(0, 200),
        url,
        pdfUrl:      undefined,
        fileType:    'pdf',
        date:        date || null,
        description: String(description).substring(0, 500) || null,
        symbol:      symbol || null,
        languages:   langs.length ? langs : undefined,
        metadata:    { uuid: io?.uuid, handle, dspace: true },
      };
    });

    const pageSize = limit || results.length || 1;
    const hasMore = totalExact ? (page * pageSize < total) : (objs.length >= pageSize && objs.length > 0);
    return { results, total, totalExact, hasMore };
  }

  /** Resolve the ORIGINAL-bundle bitstream content URL. */
  async resolveDownload(item) {
    const uuid = item?.metadata?.uuid;
    const base = this._base();
    if (!uuid || !base) {
      return { downloadUrl: item?.pdfUrl || item?.url || '', filename: null, mime: null };
    }
    try {
      const bundlesResp = await axios.get(`${base}/server/api/core/items/${uuid}/bundles`, {
        timeout: 15000, httpsAgent, headers: this._headers(),
      });
      const bundles = nested(bundlesResp.data, '_embedded.bundles') || [];
      const original = bundles.find(b => b.name === 'ORIGINAL') || bundles[0];
      if (!original) throw new Error('no ORIGINAL bundle');

      const bitstreamsHref = nested(original, '_links.bitstreams.href')
        || `${base}/server/api/core/bundles/${original.uuid}/bitstreams`;
      const bsResp = await axios.get(bitstreamsHref, {
        timeout: 15000, httpsAgent, headers: this._headers(),
      });
      const bitstreams = nested(bsResp.data, '_embedded.bitstreams') || [];
      const primary = bitstreams.find(b => (b.name || '').toLowerCase().endsWith('.pdf')) || bitstreams[0];
      if (!primary) throw new Error('no bitstream');

      const contentHref = nested(primary, '_links.content.href')
        || `${base}/server/api/core/bitstreams/${primary.uuid}/content`;
      return { downloadUrl: contentHref, filename: primary.name || null, mime: 'application/pdf' };
    } catch (err) {
      console.warn(`[DSpace] download resolve failed for ${uuid}: ${err.message}`);
      return { downloadUrl: item?.pdfUrl || item?.url || '', filename: null, mime: null };
    }
  }

  /** Full item metadata → canonical enrichment object. */
  async enrich(item) {
    this.requireCapability(CAPABILITIES.ENRICH);
    const uuid = item?.metadata?.uuid;
    const base = this._base();
    if (!uuid || !base) return null;
    let resp;
    try {
      resp = await axios.get(`${base}/server/api/core/items/${uuid}`, {
        timeout: 15000, httpsAgent, headers: this._headers(),
      });
    } catch (err) {
      console.warn(`[DSpace] enrich failed for ${uuid}: ${err.message}`);
      return null;
    }
    const md = resp.data?.metadata || {};
    const all = (k) => (md[k] || []).map(x => x.value).filter(Boolean);
    const mv  = (k) => md[k]?.[0]?.value || '';

    const abstract = mv('dc.description.abstract') || mv('dc.description') || '';
    const subjects = [...new Set([...all('dc.subject'), ...all('dc.subject.mesh'), ...all('dc.subject.classification')])];
    const bodies   = all('dc.contributor.author').concat(all('dc.contributor.corporate'));
    const reportNumbers = [...new Set([...all('dc.identifier.govdoc'), ...all('dc.identifier.unsymbol')])];
    const notes = all('dc.description.sponsorship');
    const collections = all('dc.relation.ispartofseries');

    return {
      abstract,
      subjects,
      bodies,
      reportNumbers,
      notes,
      collections,
      marcData: null,
    };
  }
}

module.exports = { DspaceAdapter };
