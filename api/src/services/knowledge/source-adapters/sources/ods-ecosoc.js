'use strict';
/**
 * Per-source adapter — UN ODS — Economic and Social Council (ods-ecosoc).
 * Family: invenio. Auto-generated from research/ods-ecosoc.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { InvenioAdapter } = require('../family/invenio.adapter');

class OdsEcosocAdapter extends InvenioAdapter {
  static key          = "ods-ecosoc";
  static family       = "invenio";
  static capabilities = ["search","browseAll","paginate","filter","sort","download","enrich"];
  static filterSchema = [
    {
      "type": "symbol",
      "param": "p",
      "label": "Document symbol",
      "syntax": "191__a:\"E/*\"",
      "preset": "191__b:\"E/\"",
      "notes": "ECOSOC scope: symbols beginning E/ (E/RES/..., E/2023/..., E/CN.x/...). Series subfield 191$b = 'E/'."
    },
    {
      "type": "language",
      "param": "ln",
      "label": "Interface language",
      "options": [
        "en",
        "fr",
        "es",
        "ar",
        "ru",
        "zh"
      ]
    },
    {
      "type": "dateFrom",
      "param": "p",
      "label": "Year",
      "syntax": "year:2020"
    },
    {
      "type": "author",
      "param": "p",
      "label": "Authoring body",
      "syntax": "710__a:\"UN. Economic and Social Council\""
    },
    {
      "type": "subject",
      "param": "p",
      "label": "UNBIS subject term",
      "syntax": "650__a:\"...\""
    }
  ];
  static downloadMode = "record-files";
  static enrichMode   = "marcxml";
  static notes        = "Scope is ECOSOC symbols only. The `/search` list endpoint is AWS-WAF-challenged for server-to-server calls (HTTP 202); the `export/xm` and `files` record paths are not, so enrichment and download are reliable while result-listing may need r";
  static defaultConfig = {
    "adapterKey": "ods-ecosoc",
    "endpoint": "https://digitallibrary.un.org/search",
    "searchParam": "p",
    "defaultQuery": "191__b:\"E/\"",
    "queryParams": {
      "of": "recjson",
      "ln": "en"
    },
    "pageParam": "jrec",
    "limitParam": "rg",
    "pageParamStyle": "offset-1",
    "sortParams": {
      "field": "sf",
      "order": "so",
      "orderDesc": "d",
      "orderAsc": "a"
    },
    "responseMapping": {
      "recid": "recid",
      "title": "title.title",
      "symbol": "primary_report_number",
      "note": "recjson mapping per Invenio 1.x; /search list endpoint is WAF-gated (HTTP 202) — use MARCXML export for authoritative per-record metadata and /record/{id}/files for download."
    }
  };
}

module.exports = OdsEcosocAdapter;
