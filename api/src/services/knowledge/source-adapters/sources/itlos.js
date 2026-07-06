'use strict';
/**
 * Per-source adapter — ITLOS Cases (itlos).
 * Family: url-catalog. Auto-generated from research/itlos.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class ItlosAdapter extends UrlCatalogAdapter {
  static key          = "itlos";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "Server-rendered, no headless browser required. But PDFs are not on the index; a crawler must visit each case page to obtain document links, so harvesting is two-hop.";
  static defaultConfig = {
    "adapterKey": "itlos",
    "url": "https://www.itlos.org/en/main/cases/list-of-cases/",
    "searchUrlTemplate": "",
    "linkFilter": "",
    "includeAllLinks": true
  };
}

module.exports = ItlosAdapter;
