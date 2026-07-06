'use strict';
/**
 * Per-source adapter — UN Women Publications (un-women).
 * Family: url-catalog. Auto-generated from research/un-women.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnWomenAdapter extends UrlCatalogAdapter {
  static key          = "un-women";
  static family       = "url-catalog";
  static capabilities = ["search","browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "No public API. Pagination uses ?page=N (0-indexed). The site sits behind a CDN; automated clients should send a realistic User-Agent to avoid WAF challenges. Search results require type-filtering.";
  static defaultConfig = {
    "adapterKey": "un-women",
    "url": "https://www.unwomen.org/en/digital-library/publications",
    "searchUrlTemplate": "https://www.unwomen.org/en/search-results?querytext={query}",
    "linkFilter": "",
    "includeAllLinks": false
  };
}

module.exports = UnWomenAdapter;
