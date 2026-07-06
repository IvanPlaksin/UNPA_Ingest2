'use strict';
/**
 * Per-source adapter — JIU Reports (jiu).
 * Family: url-catalog. Auto-generated from research/jiu.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class JiuAdapter extends UrlCatalogAdapter {
  static key          = "jiu";
  static family       = "url-catalog";
  static capabilities = ["search","browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "direct-pdf";
  static notes        = "Content is server-rendered so no headless browser is needed. Full capability set (search/browseAll/paginate/download) is supported through the server-rendered filterable/paginated table.";
  static defaultConfig = {
    "adapterKey": "jiu",
    "url": "https://www.unjiu.org/content/reports",
    "searchUrlTemplate": "",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = JiuAdapter;
