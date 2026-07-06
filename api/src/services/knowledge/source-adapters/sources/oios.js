'use strict';
/**
 * Per-source adapter — OIOS Evaluation & Inspection Reports (oios).
 * Family: url-catalog. Auto-generated from research/oios.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class OiosAdapter extends UrlCatalogAdapter {
  static key          = "oios";
  static family       = "url-catalog";
  static capabilities = ["search","browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "direct-pdf";
  static notes        = "Server-rendered, so no headless browser is needed for browsing category pages. The search parameter syntax (?s=) is inferred and should be verified against a live query before relying on keyword search; browse + direct download are the soli";
  static defaultConfig = {
    "adapterKey": "oios",
    "url": "https://oios.un.org/resources/",
    "searchUrlTemplate": "https://oios.un.org/en/search?s={query}",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = OiosAdapter;
