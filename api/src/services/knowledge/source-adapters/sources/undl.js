'use strict';
/**
 * Per-source adapter — UN Digital Library (undl).
 * Family: invenio. Auto-generated from research/undl.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { InvenioAdapter } = require('../family/invenio.adapter');

class UndlAdapter extends InvenioAdapter {
  static key          = "undl";
  static family       = "invenio";
  static capabilities = ["search","browseAll","paginate","filter","sort","download","enrich"];
  static filterSchema = [
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
      ],
      "notes": "ln sets the UI language; language of full text is filtered by fulltext filename suffix (-EN.pdf etc.), not by a query param."
    },
    {
      "type": "dateFrom",
      "param": "p",
      "label": "Year",
      "syntax": "year:2020",
      "notes": "Range: year:2019->2021 (Invenio span syntax)."
    },
    {
      "type": "symbol",
      "param": "p",
      "label": "Document symbol",
      "syntax": "191__a:\"S/RES/2321 (2016)\""
    },
    {
      "type": "subject",
      "param": "p",
      "label": "UNBIS subject term",
      "syntax": "650__a:\"PEACEBUILDING\""
    },
    {
      "type": "author",
      "param": "p",
      "label": "Authoring body",
      "syntax": "710__a:\"UN. Secretary-General\""
    },
    {
      "type": "collection",
      "param": "c",
      "label": "Collection code",
      "notes": "Invenio collection selector; value list not verifiable through the WAF. Left unconstrained for the general UNDL source."
    }
  ];
  static downloadMode = "record-files";
  static enrichMode   = "marcxml";
  static notes        = "The `/search` endpoint is behind an AWS WAF that answers server-to-server requests with HTTP 202 `x-amzn-waf-action: challenge`; a JS/browser challenge must be solved to retrieve result lists. The record `export/xm` and `files` paths are no";
  static defaultConfig = {
    "adapterKey": "undl",
    "endpoint": "https://digitallibrary.un.org/search",
    "searchParam": "p",
    "defaultQuery": "resolution",
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
      "symbol": "primary_report_number OR system_control_number",
      "files": "files[] { name, url, size, type }",
      "note": "recjson field names per Invenio 1.x; endpoint is WAF-challenged in server-to-server calls so mapping is documented, not byte-verified. MARCXML export is the reliable metadata channel — see enrich."
    }
  };
}

module.exports = UndlAdapter;
