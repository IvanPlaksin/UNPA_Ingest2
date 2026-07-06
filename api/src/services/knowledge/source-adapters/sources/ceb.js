'use strict';
/**
 * Per-source adapter — CEB Reports (ceb).
 * Family: url-catalog. Auto-generated from research/ceb.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class CebAdapter extends UrlCatalogAdapter {
  static key          = "ceb";
  static family       = "url-catalog";
  static capabilities = ["browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "direct-pdf";
  static notes        = "List browsing is solid and server-rendered, but keyword search is not usable via a simple URL (search page appears JS-driven / returned no scrapable links). Coverage is therefore best via paginated browse of /content/reports and sibling cat";
  static defaultConfig = {
    "adapterKey": "ceb",
    "url": "https://unsceb.org/content/reports",
    "searchUrlTemplate": "",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = CebAdapter;
