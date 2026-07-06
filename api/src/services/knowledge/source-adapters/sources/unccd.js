'use strict';
/**
 * Per-source adapter — UNCCD Resources (unccd).
 * Family: url-catalog. Auto-generated from research/unccd.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnccdAdapter extends UrlCatalogAdapter {
  static key          = "unccd";
  static family       = "url-catalog";
  static capabilities = ["search","browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "No public repository API. Pagination uses ?page=N. Content is behind a CDN; send a realistic User-Agent. PDF links must be resolved per-record.";
  static defaultConfig = {
    "adapterKey": "unccd",
    "url": "https://www.unccd.int/resources/all-resources",
    "searchUrlTemplate": "https://www.unccd.int/resources/all-resources?search_api_fulltext={query}",
    "linkFilter": "",
    "includeAllLinks": false
  };
}

module.exports = UnccdAdapter;
