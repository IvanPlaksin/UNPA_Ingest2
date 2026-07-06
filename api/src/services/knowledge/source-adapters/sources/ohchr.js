'use strict';
/**
 * Per-source adapter — OHCHR Human Rights Documents (ohchr).
 * Family: url-catalog. Auto-generated from research/ohchr.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class OhchrAdapter extends UrlCatalogAdapter {
  static key          = "ohchr";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "HONEST ASSESSMENT: this is a stateful WebForms app. A stateless scraper cannot retrieve documents from a plain GET; it must either replay the __VIEWSTATE post-back sequence or drive the form with a headless browser. Only browseAll is claime";
  static defaultConfig = {
    "adapterKey": "ohchr",
    "url": "https://ap.ohchr.org/documents/mainec.aspx",
    "searchUrlTemplate": "https://ap.ohchr.org/documents/mainec.aspx?syb={query}",
    "linkFilter": ".pdf",
    "includeAllLinks": false
  };
}

module.exports = OhchrAdapter;
