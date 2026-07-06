'use strict';
/**
 * Per-source adapter — UNIDIR Publications (unidir).
 * Family: url-catalog. Auto-generated from research/unidir.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnidirAdapter extends UrlCatalogAdapter {
  static key          = "unidir";
  static family       = "url-catalog";
  static capabilities = ["search","browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "No verified public API. Site-wide ?s= search needs type-filtering. PDFs require resolving each record page. Pagination shows 30/page (~29 pages).";
  static defaultConfig = {
    "adapterKey": "unidir",
    "url": "https://unidir.org/publications",
    "searchUrlTemplate": "https://unidir.org/?s={query}",
    "linkFilter": "",
    "includeAllLinks": false
  };
}

module.exports = UnidirAdapter;
