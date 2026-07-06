'use strict';
/**
 * UrlCatalogAdapter — family base for HTML pages with document links.
 * Ports SourceCatalogService._browseUrlCatalog (link scraping).
 */

const { SourceAdapter } = require('../base.adapter');
const { axios, httpsAgent } = require('../lib/http');
const { extractLinksFromHtml } = require('../lib/parse');

const HTML_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
  'Cache-Control': 'no-cache',
};

class UrlCatalogAdapter extends SourceAdapter {
  static key    = 'url-catalog';
  static family = 'url-catalog';
  static capabilities = ['search', 'browseAll', 'paginate', 'download'];
  static downloadMode = 'direct-pdf';

  async search({ query = '', page = 1, limit = 20 } = {}) {
    const cfg = this.config;
    const searchUrl = query && cfg.searchUrlTemplate
      ? cfg.searchUrlTemplate.replace('{query}', encodeURIComponent(query))
      : cfg.url;

    if (!searchUrl) throw new Error('URL not configured');

    const response = await axios.get(searchUrl, {
      timeout: 20000, httpsAgent,
      headers: HTML_HEADERS,
      maxRedirects: 10,
    });

    const all = extractLinksFromHtml(response.data, searchUrl, cfg);

    const filtered = query && !cfg.searchUrlTemplate
      ? all.filter(r => r.title.toLowerCase().includes(query.toLowerCase()) || r.url.toLowerCase().includes(query.toLowerCase()))
      : all;

    const start = (page - 1) * limit;
    return {
      results: filtered.slice(start, start + limit),
      total:   filtered.length,
      hasMore: filtered.length > start + limit,
    };
  }
}

module.exports = { UrlCatalogAdapter, HTML_HEADERS };
