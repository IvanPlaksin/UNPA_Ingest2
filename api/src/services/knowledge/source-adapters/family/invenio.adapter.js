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
const { fetchUNDLRecord } = require('../lib/marc');
const { CAPABILITIES } = require('../capabilities');

class InvenioAdapter extends RestApiAdapter {
  static key    = 'invenio';
  static family = 'invenio';
  static capabilities = ['search', 'browseAll', 'paginate', 'filter', 'sort', 'download', 'enrich'];
  static downloadMode = 'record-files';
  static enrichMode   = 'marcxml';

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
