'use strict';
/**
 * Per-source adapter — Montreal Protocol (montreal-protocol).
 * Family: url-catalog. Auto-generated from research/montreal-protocol.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class MontrealProtocolAdapter extends UrlCatalogAdapter {
  static key          = "montreal-protocol";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "direct-pdf";
  static notes        = "Server-rendered so no headless browser required. There is no keyword search endpoint, so only browseAll + direct download are supported.";
  static defaultConfig = {
    "adapterKey": "montreal-protocol",
    "url": "https://ozone.unep.org/treaties/montreal-protocol",
    "searchUrlTemplate": "",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = MontrealProtocolAdapter;
