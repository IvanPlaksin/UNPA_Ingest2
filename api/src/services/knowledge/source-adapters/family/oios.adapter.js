'use strict';
/**
 * OiosAdapter — family base for the UN OIOS reports portal.
 * Ports SourceCatalogService._browseOios: builds an OIOS search URL and reuses
 * the HTML link-scraping strategy.
 */

const { UrlCatalogAdapter } = require('./url-catalog.adapter');

class OiosAdapter extends UrlCatalogAdapter {
  static key    = 'oios';
  static family = 'oios';
  static capabilities = ['search', 'browseAll', 'paginate', 'download'];
  static downloadMode = 'direct-pdf';

  async search({ query = '', page = 1, limit = 20 } = {}) {
    const cfg = this.config;
    const baseUrl = cfg.url || 'https://oios.un.org/resources/';
    const searchUrl = query ? `${baseUrl}?s=${encodeURIComponent(query)}` : baseUrl;
    // Delegate to UrlCatalogAdapter with the built URL and no further query filtering.
    const scoped = Object.create(this);
    scoped.config = { ...cfg, url: searchUrl };
    return UrlCatalogAdapter.prototype.search.call(scoped, { query: '', page, limit });
  }
}

module.exports = { OiosAdapter };
