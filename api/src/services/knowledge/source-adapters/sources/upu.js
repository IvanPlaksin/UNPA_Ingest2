'use strict';
/**
 * Per-source adapter — UPU Publications (upu).
 * Family: url-catalog. Auto-generated from research/upu.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UpuAdapter extends UrlCatalogAdapter {
  static key          = "upu";
  static family       = "url-catalog";
  static capabilities = ["browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "The /en/Publications landing surfaces only a few featured items; the real catalogue is behind the 'All Publications' link. No verified search endpoint. Pagination behavior on the all-publications listing should be confirmed at crawl time. B";
  static defaultConfig = {
    "adapterKey": "upu",
    "url": "https://www.upu.int/en/universal-postal-union/activities/research-publications/all-publications",
    "searchUrlTemplate": "",
    "linkFilter": "",
    "includeAllLinks": false
  };
}

module.exports = UpuAdapter;
