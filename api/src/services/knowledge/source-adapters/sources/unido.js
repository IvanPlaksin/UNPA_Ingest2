'use strict';
/**
 * Per-source adapter — UNIDO Publications (unido).
 * Family: url-catalog. Auto-generated from research/unido.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnidoAdapter extends UrlCatalogAdapter {
  static key          = "unido";
  static family       = "url-catalog";
  static capabilities = ["browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "HONEST: www.unido.org/publications returned HTTP 403 to the crawler User-Agent (Cloudflare/WAF), not because it is a JS SPA. It is server-rendered and scrapable with a realistic browser User-Agent. The newer catalogue's search API/params we";
  static defaultConfig = {
    "adapterKey": "unido",
    "url": "https://www.unido.org/publications",
    "searchUrlTemplate": "",
    "linkFilter": "",
    "includeAllLinks": false
  };
}

module.exports = UnidoAdapter;
