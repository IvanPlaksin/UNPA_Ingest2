'use strict';
/**
 * Per-source adapter — UN Treaty Collection (un-treaties).
 * Family: url-catalog. Auto-generated from research/un-treaties.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnTreatiesAdapter extends UrlCatalogAdapter {
  static key          = "un-treaties";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "The listing/volume pages are server-rendered and their PDFs are directly harvestable. However, keyword/advanced search and per-treaty detail navigation depend on ASP.NET post-back state, so a stateless scraper cannot query them via a simple";
  static defaultConfig = {
    "adapterKey": "un-treaties",
    "url": "https://treaties.un.org/Pages/LatestTreaties.aspx?clang=_en",
    "searchUrlTemplate": "",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = UnTreatiesAdapter;
