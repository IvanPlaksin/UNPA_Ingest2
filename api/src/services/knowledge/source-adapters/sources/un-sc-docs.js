'use strict';
/**
 * Per-source adapter — UN Security Council Documents (un-sc-docs).
 * Family: url-catalog. Auto-generated from research/un-sc-docs.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnScDocsAdapter extends UrlCatalogAdapter {
  static key          = "un-sc-docs";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "The main.un.org host sits behind bot protection (plain WebFetch GETs returned 403), so a realistic User-Agent or headless browser may be needed to fetch the year pages, even though the content is server-rendered. The per-year URL pattern an";
  static defaultConfig = {
    "adapterKey": "un-sc-docs",
    "url": "https://main.un.org/securitycouncil/en/content/resolutions-adopted-security-council-2024",
    "searchUrlTemplate": "https://main.un.org/securitycouncil/en/content/resolutions-adopted-security-council-{_year}",
    "linkFilter": "",
    "includeAllLinks": true
  };
}

module.exports = UnScDocsAdapter;
