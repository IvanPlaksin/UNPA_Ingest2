'use strict';
/**
 * Per-source adapter — UNODC Publications (unodc).
 * Family: url-catalog. Auto-generated from research/unodc.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnodcAdapter extends UrlCatalogAdapter {
  static key          = "unodc";
  static family       = "url-catalog";
  static capabilities = ["search","browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "direct-pdf";
  static notes        = "HONEST: URL structure is inconsistent across the site and several probed paths (index.html, statistics/publications.html, publications-by-date.html) returned 404, so exact entry points must be verified per report series. Flagship reports (e";
  static defaultConfig = {
    "adapterKey": "unodc",
    "url": "https://www.unodc.org/unodc/en/data-and-analysis/",
    "searchUrlTemplate": "https://www.unodc.org/search/?q={query}",
    "linkFilter": "",
    "includeAllLinks": true
  };
}

module.exports = UnodcAdapter;
