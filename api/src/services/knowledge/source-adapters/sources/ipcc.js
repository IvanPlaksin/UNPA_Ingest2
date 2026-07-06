'use strict';
/**
 * Per-source adapter — IPCC Reports (ipcc).
 * Family: url-catalog. Auto-generated from research/ipcc.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class IpccAdapter extends UrlCatalogAdapter {
  static key          = "ipcc";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "Server-rendered, so no headless browser is needed. However harvesting requires following report landing pages to their /downloads/ subpages rather than reading PDFs off a single flat index; a crawler must walk that two/three-hop structure.";
  static defaultConfig = {
    "adapterKey": "ipcc",
    "url": "https://www.ipcc.ch/reports/",
    "searchUrlTemplate": "",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = IpccAdapter;
