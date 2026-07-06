'use strict';
/**
 * Per-source adapter — UNESCO UNESDOC (unesco).
 * Family: opendatasoft. Auto-generated from research/unesco.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { OpendatasoftAdapter } = require('../family/opendatasoft.adapter');

class UnescoAdapter extends OpendatasoftAdapter {
  static key          = "unesco";
  static family       = "opendatasoft";
  static capabilities = ["search","browseAll","paginate","filter","sort","download"];
  static filterSchema = [
    {
      "type": "language",
      "param": "refine=language",
      "label": "Language",
      "options": [
        "eng",
        "fre",
        "spa",
        "rus",
        "ara",
        "chi",
        "por",
        "mul",
        "ita",
        "ger",
        "jpn",
        "kor"
      ]
    },
    {
      "type": "docType",
      "param": "refine=type",
      "label": "Document type",
      "options": [
        "programme and meeting document",
        "conference_material",
        "article",
        "book part",
        "book",
        "periodical issue",
        "mission_reports",
        "guides_manuals_and_handbooks",
        "interviews",
        "legal_materials",
        "brochures",
        "yearbooks",
        "directories"
      ]
    },
    {
      "type": "yearFrom",
      "param": "where",
      "label": "Year (use where: year>=YYYY)"
    }
  ];
  static downloadMode = "record-page";
  static enrichMode   = "opendatasoft-record";
  static notes        = "Default `limit` max is 100 per call; deep pagination via `offset` is capped by ODS (typically offset+limit <= 10000) — use `where`/`order_by` windowing for full harvest. Facet field name casing in schema doc (`dc_*`) does not match the live";
  static defaultConfig = {
    "adapterKey": "unesco",
    "endpoint": "https://data.unesco.org/api/explore/v2.1/catalog/datasets/doc001/records",
    "method": "GET",
    "searchParam": "q",
    "queryParams": {},
    "pageParam": "offset",
    "limitParam": "limit",
    "pageParamStyle": "offset-0",
    "responseMapping": {
      "items": "results",
      "title": "title",
      "url": "url",
      "date": "year",
      "total": "total_count",
      "symbol": "document_code",
      "description": "description"
    }
  };
}

module.exports = UnescoAdapter;
