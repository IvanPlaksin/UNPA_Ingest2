'use strict';
/**
 * Per-source adapter — ILO Publications (ilo).
 * Family: url-catalog. Auto-generated from research/ilo.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { UrlCatalogAdapter } = require('../family/url-catalog.adapter');

class IloAdapter extends UrlCatalogAdapter {
  static key          = "ilo";
  static family       = "url-catalog";
  static capabilities = ["search","paginate","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static notes        = "Limited/unverified: No anonymous JSON API. Recommended path: register for an Ex Libris Primo VE API key for ILO and reconfigure this adapter to family 'rest-api' against api-eu.hosted.exlibrisgroup.com/primo/v1/search. Until then, treat as a url-catalog with l";
  static defaultConfig = {
    "adapterKey": "ilo",
    "url": "https://labordoc.ilo.org/discovery/search?vid=41ILO_INST:41ILO_V2",
    "searchUrlTemplate": "https://labordoc.ilo.org/discovery/search?query=any,contains,{query}&tab=default_tab&search_scope=41ILO_DISCOVERY&vid=41ILO_INST:41ILO_V2&offset=0",
    "linkFilter": "/discovery/fulldisplay",
    "includeAllLinks": false,
    "_note": "labordoc.ilo.org has migrated to Ex Libris Alma / Primo VE (a JS single-page discovery app). The public search page is JS-rendered; there is no anonymous JSON scraping path. The internal /primaws/rest/pub/pnxs endpoint returns HTTP 400 without the correct signed/apikey parameters. Record permalinks follow /discovery/fulldisplay?docid=alma...&vid=41ILO_INST:41ILO_V2."
  };
}

module.exports = IloAdapter;
