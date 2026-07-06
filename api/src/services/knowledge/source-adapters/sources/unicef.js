'use strict';
/**
 * Per-source adapter — UNICEF Reports & Publications (unicef).
 * Family: url-catalog. Auto-generated from research/unicef.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnicefAdapter extends UrlCatalogAdapter {
  static key          = "unicef";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "Cloudflare bot protection: dynamic/search URLs and query-string requests return HTTP 403/202 challenges; a browser-like User-Agent is required and even then search is unreliable. Static listing pages (/reports, data.unicef.org/resources) ar";
  static defaultConfig = {
    "adapterKey": "unicef",
    "url": "https://www.unicef.org/reports",
    "searchUrlTemplate": "https://www.unicef.org/search?query={query}",
    "linkFilter": "/reports/",
    "includeAllLinks": false,
    "_note": "unicef.org exposes no open document API. The static listing page /reports returns HTTP 200 with harvestable report links (href=\"/reports/{slug}\"). Dynamic search (/search?query=) and query-string variants are behind Cloudflare bot protection and return HTTP 403 / 202 challenge to non-browser clients. data.unicef.org/resources/ (statistics/data resources) is a separate HTML listing that also returns 200 and can be harvested as a secondary catalog."
  };
}

module.exports = UnicefAdapter;
