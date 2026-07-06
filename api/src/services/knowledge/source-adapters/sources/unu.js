'use strict';
/**
 * Per-source adapter — UNU Collections (unu).
 * Family: url-catalog. Auto-generated from research/unu.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class UnuAdapter extends UrlCatalogAdapter {
  static key          = "unu";
  static family       = "url-catalog";
  static capabilities = ["search","paginate","download"];
  static filterSchema = [];
  static downloadMode = "dspace-bitstream";
  static enrichMode   = "dspace-item";
  static notes        = "Limited/unverified: HARD BLOCKER: AWS WAF returns HTTP 202 with response header `x-amzn-waf-action: challenge` and an empty/interstitial body for both the v7 (/server/api) and v6 (/rest) APIs, from multiple browser-like User-Agents. Programmatic access require";
  static defaultConfig = {
    "adapterKey": "unu",
    "url": "https://collections.unu.edu/",
    "searchUrlTemplate": "https://collections.unu.edu/search?query={query}",
    "linkFilter": "/handle/",
    "includeAllLinks": false,
    "_intendedApi": {
      "family": "dspace",
      "endpoint": "https://collections.unu.edu/server/api/discover/search/objects",
      "searchParam": "query",
      "pageParam": "page",
      "limitParam": "size",
      "pageParamStyle": "zero-based",
      "responseMapping": {
        "items": "_embedded.searchResult._embedded.objects[]._embedded.indexableObject",
        "title": "metadata['dc.title'][0].value",
        "url": "metadata['dc.identifier.uri'][0].value",
        "date": "metadata['dc.date.issued'][0].value",
        "total": "_embedded.searchResult.page.totalElements"
      },
      "_note": "UNU IS a DSpace instance and this endpoint SHOULD work, BUT it is currently gated by an AWS WAF challenge (see probeNotes). Promote to family 'dspace' once WAF is bypassed (e.g. via a headless/challenge-solving fetch or an allow-listed IP)."
    }
  };
}

module.exports = UnuAdapter;
