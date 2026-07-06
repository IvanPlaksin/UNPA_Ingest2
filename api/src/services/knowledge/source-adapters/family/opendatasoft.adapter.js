'use strict';
/**
 * OpendatasoftAdapter — family base for OpenDataSoft Explore API v2.1 datasets
 * (UNESCO UNESDOC). Search plumbing (q / limit / offset) is inherited from
 * RestApiAdapter; this class overrides the flat ODS response mapping, the
 * `refine=` / `where` filter mapping, and per-record enrichment.
 */

const { v4: uuidv4 } = require('uuid');
const { RestApiAdapter } = require('./rest-api.adapter');
const { axios, httpsAgent } = require('../lib/http');
const { nested } = require('../lib/parse');
const { CAPABILITIES } = require('../capabilities');

const LANG_MAP = {
  en: 'EN', eng: 'EN', fr: 'FR', fre: 'FR', es: 'ES', spa: 'ES',
  ar: 'AR', ara: 'AR', ru: 'RU', rus: 'RU', zh: 'ZH', chi: 'ZH', pt: 'PT', por: 'PT',
};
const normLang = (c) => c ? (LANG_MAP[String(c).toLowerCase()] || String(c).toUpperCase().slice(0, 2)) : null;
const yearOf = (v) => { const m = String(v || '').match(/\d{4}/); return m ? m[0] : ''; };

class OpendatasoftAdapter extends RestApiAdapter {
  static key    = 'opendatasoft';
  static family = 'opendatasoft';
  static capabilities = ['search', 'browseAll', 'paginate', 'filter', 'sort', 'download', 'enrich'];
  static downloadMode = 'record-page';
  static enrichMode   = 'opendatasoft-record';

  /** ODS facet filters: refine=<facet>:<value>; year via ODSQL `where`. */
  _applyFilters(params, filters) {
    const refines = [];
    const whereClauses = [];
    for (const f of this.effectiveFilterSchema()) {
      const v = filters[f.type];
      if (v == null || v === '') continue;
      const p = String(f.param || '');
      if (p.startsWith('refine')) {
        const facet = p.includes('=') ? p.split('=')[1] : (f.facet || f.type);
        refines.push(`${facet}:${v}`);
      } else if (f.type === 'yearFrom' || f.type === 'year') {
        whereClauses.push(`year>=${yearOf(v)}`);
      } else if (f.type === 'yearTo' || f.type === 'dateTo') {
        whereClauses.push(`year<=${yearOf(v)}`);
      } else if (f.type === 'dateFrom') {
        whereClauses.push(`year>=${yearOf(v)}`);
      } else if (p === 'where') {
        whereClauses.push(`year>=${yearOf(v)}`);
      } else {
        params[p] = v;
      }
    }
    if (refines.length) params.refine = refines.length === 1 ? refines[0] : refines;
    if (whereClauses.length) {
      params.where = [params.where, ...whereClauses].filter(Boolean).join(' AND ');
    }
  }

  _mapResponse(data, { page, limit }) {
    const cfg = this.config;
    const m = cfg.responseMapping || {};
    const items = nested(data, m.items || 'results') || [];
    const totalRaw = Number(nested(data, m.total || 'total_count'));
    const totalExact = Number.isFinite(totalRaw) && totalRaw >= 0;
    const total = totalExact ? totalRaw : items.length;

    const results = items.map(r => {
      const pick = (key, fallback) => (key ? (nested(r, key) ?? r[fallback]) : r[fallback]);
      const title = pick(m.title, 'title') || 'Untitled';
      const url   = pick(m.url, 'url') || '';
      const dateV = pick(m.date, 'year');
      const symbol = pick(m.symbol, 'document_code') || null;
      const desc  = pick(m.description, 'description') || '';
      const lang  = r.language || r.dc_language;
      const langs = Array.isArray(lang) ? lang.map(normLang).filter(Boolean)
                  : (lang ? [normLang(lang)] : []);
      return {
        id:          r.uuid || uuidv4(),
        title:       String(title).substring(0, 200),
        url,
        pdfUrl:      undefined,
        fileType:    'pdf',
        date:        dateV != null ? String(dateV) : null,
        description: String(desc).substring(0, 500) || null,
        symbol,
        languages:   langs.length ? langs : undefined,
        metadata:    { uuid: r.uuid, coverUrl: r.cover_url || null },
      };
    });

    const pageSize = limit || results.length || 1;
    const hasMore = totalExact ? (page * pageSize < total) : (items.length >= pageSize && items.length > 0);
    return { results, total, totalExact, hasMore };
  }

  async enrich(item) {
    this.requireCapability(CAPABILITIES.ENRICH);
    const uuid = item?.metadata?.uuid;
    if (!uuid) return null;
    const tmpl = this.config.enrichEndpoint || `${this.config.endpoint}/{uuid}`;
    const url = tmpl.replace('{uuid}', encodeURIComponent(uuid));
    let resp;
    try {
      resp = await axios.get(url, { timeout: 15000, httpsAgent, headers: { Accept: 'application/json' } });
    } catch (err) {
      console.warn(`[ODS] enrich failed for ${uuid}: ${err.message}`);
      return null;
    }
    const rec = resp.data || {};
    const f = rec.fields || rec.record?.fields || rec;
    const arr = (v) => v == null ? [] : (Array.isArray(v) ? v.filter(Boolean) : [v]);
    return {
      abstract:      f.description || '',
      subjects:      arr(f.subject),
      bodies:        arr(f.creator),
      reportNumbers: f.document_code ? [f.document_code] : [],
      notes:         arr(f.rights),
      collections:   arr(f.type),
      marcData:      null,
    };
  }
}

module.exports = { OpendatasoftAdapter };
