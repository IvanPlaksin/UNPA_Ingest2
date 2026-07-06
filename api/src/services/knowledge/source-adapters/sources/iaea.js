'use strict';
/**
 * Per-source adapter — IAEA Publications (iaea).
 * Family: url-catalog. Auto-generated from research/iaea.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class IaeaAdapter extends UrlCatalogAdapter {
  static key          = "iaea";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "Limited/unverified: BLOCKED: all live probes returned HTTP 402/403 from the IAEA edge/WAF, so nothing was verified against real HTML. Scraping will require a headless browser with realistic headers/cookies. Until then capabilities are limited to a browseAll st";
  static defaultConfig = {
    "adapterKey": "iaea",
    "url": "https://www.iaea.org/publications",
    "searchUrlTemplate": "https://www.iaea.org/publications/search?keywords={query}",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = IaeaAdapter;
