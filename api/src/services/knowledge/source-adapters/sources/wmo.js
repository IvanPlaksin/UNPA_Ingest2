'use strict';
/**
 * Per-source adapter — WMO Library (wmo).
 * Family: url-catalog. Auto-generated from research/wmo.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class WmoAdapter extends UrlCatalogAdapter {
  static key          = "wmo";
  static family       = "url-catalog";
  static capabilities = ["search","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "Limited/unverified: HARD BLOCKER: bot-challenge wall (/api/is_human_challenge) that demands JS execution and human-like interaction signals. Plain HTTP clients only ever receive the challenge shell (HTTP 200 but no data). Ingestion would require a challenge-so";
  static defaultConfig = {
    "adapterKey": "wmo",
    "url": "https://library.wmo.int/",
    "searchUrlTemplate": "https://library.wmo.int/records?query={query}",
    "linkFilter": "/records/item/",
    "includeAllLinks": false,
    "_note": "library.wmo.int no longer serves the legacy Invenio v1.x interface. Every path (/, /records, /index.php?p=...&of=recjson, /index.php?...&of=xm) returns an identical JS 'WMO e-Library' shell whose <script> performs a bot challenge POST to /api/is_human_challenge before rendering. There is no working of=recjson / of=xm / of=hx output and no /api/records or /api/is REST endpoint (both HTTP 404)."
  };
}

module.exports = WmoAdapter;
