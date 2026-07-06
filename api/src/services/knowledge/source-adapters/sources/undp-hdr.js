'use strict';
/**
 * Per-source adapter — UNDP Human Development Reports (undp-hdr).
 * Family: url-catalog. Auto-generated from research/undp-hdr.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UndpHdrAdapter extends UrlCatalogAdapter {
  static key          = "undp-hdr";
  static family       = "url-catalog";
  static capabilities = ["browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "Relatively small, curated catalog (flagship reports rather than a large document pool). No search endpoint. PDFs require resolving each content page. Behind a CDN; use a realistic User-Agent.";
  static defaultConfig = {
    "adapterKey": "undp-hdr",
    "url": "https://hdr.undp.org/reports-and-publications",
    "searchUrlTemplate": "",
    "linkFilter": "",
    "includeAllLinks": false
  };
}

module.exports = UndpHdrAdapter;
