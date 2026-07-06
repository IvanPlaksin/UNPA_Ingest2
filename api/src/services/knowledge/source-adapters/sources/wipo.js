'use strict';
/**
 * Per-source adapter — WIPO Publications (wipo).
 * Family: url-catalog. Auto-generated from research/wipo.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class WipoAdapter extends UrlCatalogAdapter {
  static key          = "wipo";
  static family       = "url-catalog";
  static capabilities = ["search","browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "dspace-bitstream";
  static enrichMode   = "dspace-item";
  static notes        = "HONEST: probes of both the collection page and the recjson endpoint returned HTTP 403 (the repository blocks non-browser User-Agents / bot traffic). This is a WAF/UA block, not a JS SPA; the repository is server-rendered and machine-friendl";
  static defaultConfig = {
    "adapterKey": "wipo",
    "url": "https://tind.wipo.int/collection/WIPO%20Publications",
    "searchUrlTemplate": "https://tind.wipo.int/search?p={query}",
    "linkFilter": "",
    "includeAllLinks": false,
    "repositoryPlatform": "TIND (Invenio fork, CERN-derived)",
    "recordUrlPattern": "https://tind.wipo.int/record/{id}",
    "candidateJsonApi": "https://tind.wipo.int/search?p={query}&of=recjson (Invenio recjson output format)"
  };
}

module.exports = WipoAdapter;
