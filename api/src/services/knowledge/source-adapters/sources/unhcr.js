'use strict';
/**
 * Per-source adapter — UNHCR Refworld (unhcr).
 * Family: url-catalog. Auto-generated from research/unhcr.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnhcrAdapter extends UrlCatalogAdapter {
  static key          = "unhcr";
  static family       = "url-catalog";
  static capabilities = ["search","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "Limited/unverified: The entire site sits behind Cloudflare's interactive bot challenge ('Just a moment...'); both WebFetch and direct HTTP clients received HTTP 403, so search params, pagination and facet field names could not be fully enumerated programmatica";
  static defaultConfig = {
    "adapterKey": "unhcr",
    "endpoint": "https://www.refworld.org/search",
    "method": "GET",
    "searchParam": "query",
    "queryParams": {
      "sort": "score",
      "order": "desc"
    },
    "pageParam": "page",
    "limitParam": null,
    "pageParamStyle": "offset-0",
    "responseMapping": {
      "items": null,
      "title": null,
      "url": null,
      "date": null,
      "total": null,
      "symbol": null,
      "description": null,
      "notes": "No JSON API. Results are server-rendered HTML (Drupal + Solr). Programmatic use would require HTML scraping of the search-results page, which is blocked by Cloudflare's interactive bot challenge. Treat as a human-facing catalog URL, not a structured feed."
    }
  };
}

module.exports = UnhcrAdapter;
