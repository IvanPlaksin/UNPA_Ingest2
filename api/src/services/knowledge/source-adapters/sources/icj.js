'use strict';
/**
 * Per-source adapter — ICJ Decisions & Orders (icj).
 * Family: url-catalog. Auto-generated from research/icj.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class IcjAdapter extends UrlCatalogAdapter {
  static key          = "icj";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "direct-pdf";
  static notes        = "Content is server-rendered so a headless browser is NOT required. There is no keyword search endpoint, so only browse-all + direct download are supported. The set link filter (.pdf) restricts harvesting to decision documents.";
  static defaultConfig = {
    "adapterKey": "icj",
    "url": "https://www.icj-cij.org/decisions",
    "searchUrlTemplate": "",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = IcjAdapter;
