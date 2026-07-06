'use strict';
/**
 * Per-source adapter — IFAD Documents (ifad).
 * Family: url-catalog. Auto-generated from research/ifad.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class IfadAdapter extends UrlCatalogAdapter {
  static key          = "ifad";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "direct-pdf";
  static notes        = "HONEST ASSESSMENT: the main site is behind bot protection and returns 403 to plain GETs, so this adapter is effectively a near-stub. A headless browser (with realistic headers/JS execution) is required to exercise the search page and harves";
  static defaultConfig = {
    "adapterKey": "ifad",
    "url": "https://www.ifad.org/en/knowledge",
    "searchUrlTemplate": "https://www.ifad.org/en/search?q={query}",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = IfadAdapter;
