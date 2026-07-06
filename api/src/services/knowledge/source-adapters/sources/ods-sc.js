'use strict';
/**
 * Per-source adapter — UN ODS — Security Council (ods-sc).
 * Family: invenio. Auto-generated from research/ods-sc.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { InvenioAdapter } = require('../family/invenio.adapter');

class OdsScAdapter extends InvenioAdapter {
  static key          = "ods-sc";
  static family       = "invenio";
  static capabilities = ["search","browseAll","paginate","filter","sort","download","enrich"];
  static filterSchema = [
    {
      "type": "symbol",
      "param": "p",
      "label": "Document symbol",
      "syntax": "191__a:\"S/RES/2321 (2016)\"",
      "preset": "191__b:\"S/\"",
      "notes": "SC scope: symbols beginning S/ (S/RES/..., S/PRST/..., S/2016/...). Series subfield 191$b = 'S/'."
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
      "syntax": "year:2016"
    },
    {
      "type": "author",
      "param": "p",
      "label": "Authoring body",
      "syntax": "710__a:\"UN. Security Council\""
    }
  ];
  static downloadMode = "record-files";
  static enrichMode   = "marcxml";
  static notes        = "Scope is `S/` symbols only — no GA/ECOSOC documents. Voting field 996 is present on resolution records but not on every S/ document type. The `/search` list endpoint is AWS-WAF-challenged (HTTP 202) for server-to-server calls; `export/xm` a";
  static defaultConfig = {
    "adapterKey": "ods-sc",
    "endpoint": "https://digitallibrary.un.org/search",
    "searchParam": "p",
    "defaultQuery": "191__b:\"S/\" AND 191__a:\"S/RES\"",
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
      "recordArray": "$ (top-level JSON array)",
      "recid": "recid",
      "title": "title.title",
      "symbol": "primary_report_number",
      "files": "files[] { name, url }",
      "voting": "not in recjson by default — read MARC 996 via export/xm",
      "note": "recjson mapping documented per Invenio 1.x; /search is WAF-gated. MARCXML export is the authoritative metadata channel and is the only confirmed source of the 996 voting note."
    }
  };
}

module.exports = OdsScAdapter;
