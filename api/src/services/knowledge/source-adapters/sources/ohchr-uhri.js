'use strict';
/**
 * Per-source adapter — OHCHR Universal Human Rights Index (UHRI) (ohchr-uhri).
 * Family: rest-api. Auto-generated from research/ohchr-uhri.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { RestApiAdapter } = require('../family/rest-api.adapter');

class OhchrUhriAdapter extends RestApiAdapter {
  static key          = "ohchr-uhri";
  static family       = "rest-api";
  static capabilities = ["browseAll","download"];
  static filterSchema = [];
  static downloadMode = "record-page";
  static enrichMode   = "dspace-item";
  static notes        = "The interactive search UI is JS-only and would need a headless browser; however the REST/export API makes that unnecessary for ingestion. The fully-documented filtered endpoints require a support-email request, so programmatic fine-grained ";
  static defaultConfig = {
    "adapterKey": "ohchr-uhri",
    "method": "GET",
    "endpoint": "https://uhri.ohchr.org/api/uhri/export-results/export-full-en.json",
    "searchParam": null,
    "queryParams": {},
    "responseMapping": {
      "items": "",
      "title": "title",
      "url": "",
      "date": "date",
      "symbol": "symbol",
      "description": "text"
    },
    "_api": {
      "baseUrl": "https://uhri.ohchr.org",
      "exportJsonUrl": "https://uhri.ohchr.org/api/uhri/export-results/export-full-en.json",
      "exportXlsxUrl": "https://uhri.ohchr.org/api/uhri/export-results/export-full-en.xlsx",
      "apiPrefix": "/api/uhri/",
      "documentPageTemplate": "https://uhri.ohchr.org/en/document/{uuid}",
      "notes": "OHCHR offers free public REST API access to the Universal Human Rights Index. Confirmed working public export endpoint returns the full dataset as JSON (>10 MB) and XLSX. Full filtered-query endpoint parameters are provided on request to uhrisupport@ohchr.org; the export endpoints are directly usable without contact."
    }
  };
}

module.exports = OhchrUhriAdapter;
