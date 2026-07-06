'use strict';
/**
 * Per-source adapter — UNDRR Publications (undrr).
 * Family: url-catalog. Auto-generated from research/undrr.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UndrrAdapter extends UrlCatalogAdapter {
  static key          = "undrr";
  static family       = "url-catalog";
  static capabilities = ["browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "HONEST: listing blocked by WAF to bot UA (403), not JS-SPA. No PreventionWeb API. Use a browser-grade User-Agent. Pagination ?page=N.";
  static defaultConfig = {
    "adapterKey": "undrr",
    "url": "https://www.undrr.org/publications",
    "searchUrlTemplate": "https://www.undrr.org/publications?search_api_fulltext={query}",
    "linkFilter": "",
    "includeAllLinks": false
  };
}

module.exports = UndrrAdapter;
