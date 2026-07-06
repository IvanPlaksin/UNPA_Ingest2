'use strict';
/**
 * OaiPmhAdapter — family base for OAI-PMH repositories (harvest protocol).
 * Ports SourceCatalogService._browseOaiPmh. OAI-PMH has no keyword search;
 * "search" is client-side substring filtering over harvested records, and the
 * `from` date filter is the only server-side selector.
 */

const { SourceAdapter } = require('../base.adapter');
const { axios, httpsAgent } = require('../lib/http');
const { parseOaiPmhRecords } = require('../lib/parse');

class OaiPmhAdapter extends SourceAdapter {
  static key    = 'oai-pmh';
  static family = 'oai-pmh';
  static capabilities = ['search', 'browseAll', 'paginate'];
  static downloadMode = 'record-page';

  async search({ query = '', page = 1, limit = 20, filters = {} } = {}) {
    const cfg = this.config;
    if (!cfg.endpoint) throw new Error('OAI-PMH endpoint not configured');
    const metadataPrefix = cfg.metadataPrefix || 'oai_dc';
    const params = { verb: 'ListRecords', metadataPrefix };
    if (cfg.set) params.set = cfg.set;
    // `from` selector: config default or a declared dateFrom filter.
    const from = (this.supports('filter') && filters.dateFrom) || cfg.from;
    if (from) params.from = from;

    const response = await axios.get(cfg.endpoint, {
      timeout: 20000, httpsAgent,
      params,
      headers: {
        'User-Agent': 'Mozilla/5.0 UNPA/1.0',
        'Accept': 'application/xml, text/xml, */*',
      },
    });

    const all = parseOaiPmhRecords(response.data, query);
    const start = (page - 1) * limit;
    return {
      results: all.slice(start, start + limit),
      total: all.length,
      hasMore: all.length > start + limit,
    };
  }
}

module.exports = { OaiPmhAdapter };
