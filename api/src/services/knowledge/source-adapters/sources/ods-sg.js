'use strict';
/**
 * Per-source adapter — UN ODS — Secretary-General Reports (ods-sg).
 * Family: invenio. Auto-generated from research/ods-sg.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { InvenioAdapter } = require('../family/invenio.adapter');

class OdsSgAdapter extends InvenioAdapter {
  static key          = "ods-sg";
  static family       = "invenio";
  static capabilities = ["search","browseAll","paginate","filter","sort","download","enrich"];
  static filterSchema = [
    {
      "type": "symbol",
      "param": "p",
      "label": "Document symbol",
      "syntax": "191__a:\"SG/SM/*\"",
      "preset": "191__a:\"SG/\"",
      "notes": "Secretary-General scope: SG/ symbols (SG/SM press releases, SG/A appointments) plus reports of the Secretary-General submitted under A/ and S/ series (title/author 'Secretary-General'). No single 191$b series covers all SG output, so scope is expressed via the SG/ symbol prefix and/or author 710/700 'Secretary-General'."
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
      "type": "subject",
      "param": "p",
      "label": "UNBIS subject term",
      "syntax": "650__a:\"...\""
    }
  ];
  static downloadMode = "record-files";
  static enrichMode   = "marcxml";
  static notes        = "SG output has no single series discriminator, so recall depends on the symbol/author query. The `/search` list endpoint is AWS-WAF-challenged (HTTP 202); `export/xm` and `files` record paths are WAF-safe, so enrichment and download are reli";
  static defaultConfig = {
    "adapterKey": "ods-sg",
    "endpoint": "https://digitallibrary.un.org/search",
    "searchParam": "p",
    "defaultQuery": "191__a:\"SG/\"",
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

module.exports = OdsSgAdapter;
