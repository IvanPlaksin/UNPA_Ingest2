'use strict';
/**
 * Per-source adapter — UNDP Publications (undp).
 * Family: url-catalog. Auto-generated from research/undp.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UndpAdapter extends UrlCatalogAdapter {
  static key          = "undp";
  static family       = "url-catalog";
  static capabilities = ["browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "HONEST: main undp.org/publications returned 403 (WAF), not a JS-SPA issue. Chosen Climate Promise sub-site is topically scoped to climate/NDC work, so it is narrower than the org-wide catalog. Pagination ?page=N.";
  static defaultConfig = {
    "adapterKey": "undp",
    "url": "https://climatepromise.undp.org/research-and-reports",
    "searchUrlTemplate": "",
    "linkFilter": "",
    "includeAllLinks": false
  };
}

module.exports = UndpAdapter;
