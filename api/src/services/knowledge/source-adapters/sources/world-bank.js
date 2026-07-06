'use strict';
/**
 * Per-source adapter — World Bank Documents & Reports (world-bank).
 * Family: rest-api. Auto-generated from research/world-bank.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { RestApiAdapter } = require('../family/rest-api.adapter');

class WorldBankAdapter extends RestApiAdapter {
  static key          = "world-bank";
  static family       = "rest-api";
  static capabilities = ["search","browseAll","paginate","filter","sort","download","fulltext"];
  static filterSchema = [
    {
      "type": "dateFrom",
      "param": "strdate",
      "label": "Published from (YYYY-MM-DD)"
    },
    {
      "type": "dateTo",
      "param": "enddate",
      "label": "Published to (YYYY-MM-DD)"
    },
    {
      "type": "docType",
      "param": "docty_exact",
      "label": "Document type",
      "options": [
        "Procurement Plan",
        "Implementation Status and Results Report",
        "Auditing Document",
        "Environmental Assessment",
        "Project Information Document",
        "Working Paper",
        "Report",
        "Project Paper",
        "Agreement",
        "Brief",
        "Disbursement Letter",
        "Integrated Safeguards Data Sheet",
        "Resettlement Plan",
        "Environmental and Social Review Summary",
        "Environmental and Social Commitment Plan",
        "Project Appraisal Document",
        "Stakeholder Engagement Plan",
        "Implementation Completion and Results Report",
        "Financing Agreement",
        "Environmental and Social Management Plan"
      ]
    },
    {
      "type": "language",
      "param": "lang_exact",
      "label": "Language",
      "options": [
        "English",
        "French",
        "Spanish",
        "Arabic",
        "Chinese",
        "Portuguese",
        "Russian"
      ]
    },
    {
      "type": "country",
      "param": "count",
      "label": "Country"
    },
    {
      "type": "owner",
      "param": "owner",
      "label": "Owner / Vice Presidency"
    }
  ];
  static downloadMode = "direct-pdf";
  static enrichMode   = "wds-detail";
  static notes        = "Pagination uses `os` (offset, 0-based) with `rows` page size. Very large offsets may be rate-limited. `docty_exact` label mismatches fail silently (empty result). Not every document has a `pdfurl`.";
  static defaultConfig = {
    "adapterKey": "world-bank",
    "endpoint": "https://search.worldbank.org/api/v3/wds",
    "method": "GET",
    "searchParam": "qterm",
    "queryParams": {
      "format": "json",
      "fl": "docdt,docty,lang,count,pdfurl,txturl,url,display_title,abstracts,entityids,guid,topicv3"
    },
    "pageParam": "os",
    "limitParam": "rows",
    "pageParamStyle": "offset-0",
    "responseMapping": {
      "items": "documents",
      "title": "display_title",
      "url": "pdfurl",
      "date": "docdt",
      "total": "total",
      "symbol": "id",
      "description": "abstracts.cdata!"
    }
  };
}

module.exports = WorldBankAdapter;
