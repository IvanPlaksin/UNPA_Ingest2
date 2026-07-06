'use strict';
/**
 * Per-source adapter — WFP Publications (wfp).
 * Family: url-catalog. Auto-generated from research/wfp.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class WfpAdapter extends UrlCatalogAdapter {
  static key          = "wfp";
  static family       = "url-catalog";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "Limited/unverified: Two blockers: (1) docs.wfp.org/api/documents/ requires authentication (HTTP 401) — supply a token to unlock the clean rest-api path; (2) the wfp.org HTML search is behind Cloudflare and challenges query-string requests (HTTP 202). The stati";
  static defaultConfig = {
    "adapterKey": "wfp",
    "url": "https://www.wfp.org/publications",
    "searchUrlTemplate": "https://www.wfp.org/publications?search={query}",
    "linkFilter": "/publications/",
    "includeAllLinks": false,
    "_intendedApi": {
      "family": "rest-api",
      "endpoint": "https://docs.wfp.org/api/documents/",
      "method": "GET",
      "searchParam": "title_q",
      "queryParams": {
        "order": ""
      },
      "pageParam": "page",
      "limitParam": "per_page",
      "pageParamStyle": "one-based",
      "responseMapping": {
        "items": "documents",
        "title": "title",
        "url": "url",
        "date": "publication_date",
        "total": "total_count",
        "id": "wbs_code"
      },
      "_note": "docs.wfp.org/api/documents/ exists and matches the expected schema (documents[], total_count, fields title/url/publication_date/wbs_code) BUT now requires authentication. Anonymous GET returns HTTP 401 {\"detail\":\"Authentication credentials were not provided.\"}. Promote to family 'rest-api' with these params once an API token/credentials are supplied via header."
    }
  };
}

module.exports = WfpAdapter;
