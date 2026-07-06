'use strict';
/**
 * Per-source adapter — UNFPA Publications (unfpa).
 * Family: url-catalog. Auto-generated from research/unfpa.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnfpaAdapter extends UrlCatalogAdapter {
  static key          = "unfpa";
  static family       = "url-catalog";
  static capabilities = ["search","browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "direct-pdf";
  static notes        = "No public API. Pagination uses ?page=N (~57 pages at ~12/page). Behind a CDN; send a realistic User-Agent. Some publications have multiple language PDFs; pick the desired language variant.";
  static defaultConfig = {
    "adapterKey": "unfpa",
    "url": "https://www.unfpa.org/publications",
    "searchUrlTemplate": "https://www.unfpa.org/publications?search={query}",
    "linkFilter": "",
    "includeAllLinks": false
  };
}

module.exports = UnfpaAdapter;
