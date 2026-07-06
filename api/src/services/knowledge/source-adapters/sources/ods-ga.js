'use strict';
/**
 * Per-source adapter — UN ODS — General Assembly (ods-ga).
 * Family: invenio. Auto-generated from research/ods-ga.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { InvenioAdapter } = require('../family/invenio.adapter');

class OdsGaAdapter extends InvenioAdapter {
  static key          = "ods-ga";
  static family       = "invenio";
  static capabilities = ["search","browseAll","paginate","filter","sort","download","enrich"];
  static filterSchema = [
    {
      "type": "symbol",
      "param": "p",
      "label": "Document symbol",
      "syntax": "191__a:\"A/*\"",
      "preset": "191__b:\"A/\"",
      "notes": "GA scope: symbols beginning A/ (A/RES/..., A/71/..., A/C.1/...). Series subfield 191$b = 'A/'."
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
      "syntax": "710__a:\"UN. General Assembly\""
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
  static notes        = "Scope is GA symbols only — no Security Council (`S/`) or ECOSOC (`E/`) documents. The `/search` list endpoint is AWS-WAF-challenged for server-to-server calls (HTTP 202); the `export/xm` and `files` record paths are not, so enrichment and d";
  static defaultConfig = {
    "adapterKey": "ods-ga",
    "endpoint": "https://digitallibrary.un.org/search",
    "searchParam": "p",
    "defaultQuery": "191__b:\"A/\"",
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
      "note": "recjson mapping documented per Invenio 1.x; the /search endpoint is WAF-gated so use MARCXML export for authoritative per-record metadata."
    }
  };
}

module.exports = OdsGaAdapter;
