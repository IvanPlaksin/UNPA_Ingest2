'use strict';
/**
 * Per-source adapter — CBD Documents (cbd).
 * Family: url-catalog. Auto-generated from research/cbd.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class CbdAdapter extends UrlCatalogAdapter {
  static key          = "cbd";
  static family       = "url-catalog";
  static capabilities = ["search","browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "direct-pdf";
  static notes        = "Server-rendered and scrapable, but the search/facet system is form-based rather than a clean parameterized API, limiting programmatic filtering. Multilingual duplicates require de-duplication by base filename.";
  static defaultConfig = {
    "adapterKey": "cbd",
    "url": "https://www.cbd.int/documents",
    "searchUrlTemplate": "https://www.cbd.int/documents?search={query}",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = CbdAdapter;
