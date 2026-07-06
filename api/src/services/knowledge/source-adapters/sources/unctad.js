'use strict';
/**
 * Per-source adapter — UNCTAD Publications (unctad).
 * Family: url-catalog. Auto-generated from research/unctad.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnctadAdapter extends UrlCatalogAdapter {
  static key          = "unctad";
  static family       = "url-catalog";
  static capabilities = ["search","browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "HONEST: WebFetch returned 403 (WAF blocking the crawler User-Agent), not because the page is a JS SPA. The HTML is server-rendered and scrapable with a proper browser User-Agent. Without one, no links are retrievable. Pagination uses ?page=";
  static defaultConfig = {
    "adapterKey": "unctad",
    "url": "https://unctad.org/publications",
    "searchUrlTemplate": "https://unctad.org/search?keyword={query}&type=publication",
    "linkFilter": "",
    "includeAllLinks": false
  };
}

module.exports = UnctadAdapter;
