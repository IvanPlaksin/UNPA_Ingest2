'use strict';
/**
 * Per-source adapter — WHO IRIS Repository (who-iris).
 * Family: dspace. Auto-generated from research/who-iris.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { DspaceAdapter } = require('../family/dspace.adapter');

class WhoIrisAdapter extends DspaceAdapter {
  static key          = "who-iris";
  static family       = "dspace";
  static capabilities = ["search","browseAll","paginate","filter","sort","download","enrich","fulltext"];
  static filterSchema = [
    {
      "type": "dateFrom",
      "param": "f.dateIssued",
      "label": "Date issued range",
      "notes": "DSpace range filter. Value format: [YYYY TO YYYY],equals (URL-encoded). Verified returned 2276 results for [2020 TO 2023]."
    },
    {
      "type": "docType",
      "param": "f.itemtype",
      "label": "Document type",
      "options": [
        "Governing Bodies documents",
        "Journal articles",
        "Technical Documents",
        "Publications",
        "Meeting reports",
        "Press Releases, Fact Sheets, Newsletters, Statements",
        "Speeches and Remarks",
        "Multimedia material"
      ],
      "notes": "Value format: <value>,equals. Verified f.itemtype=Publications,equals returned 3891 results. Labels are inconsistently cased in the index (e.g. both 'Governing Bodies documents' and 'Governing Bodies Documents' exist)."
    },
    {
      "type": "language",
      "param": "f.language",
      "label": "Language",
      "notes": "Facet exists (name 'language'). ISO codes stored in dc.language.iso (e.g. 'en'). Facet value listing via /discover/facets/language returned HTTP 400 without a query context; apply as f.language=<code>,equals within a search."
    },
    {
      "type": "subject",
      "param": "f.subject",
      "label": "Subject / MeSH",
      "notes": "Additional verified facets: author, mesh, publisher, series, entityType."
    }
  ];
  static downloadMode = "dspace-bitstream";
  static enrichMode   = "dspace-item";
  static notes        = "WebFetch is blocked by a WAF (HTTP 403); a browser-like User-Agent via direct HTTP client works. Facet-value listing endpoints (e.g. `/discover/facets/language`) require a search context and may 400 when called bare. Item-type labels are in";
  static defaultConfig = {
    "adapterKey": "who-iris",
    "endpoint": "https://iris.who.int/server/api/discover/search/objects",
    "method": "GET",
    "searchParam": "query",
    "queryParams": {
      "dsoType": "item"
    },
    "pageParam": "page",
    "limitParam": "size",
    "pageParamStyle": "offset-0",
    "sortParam": "sort",
    "sortExample": "dc.date.issued,DESC",
    "responseMapping": {
      "items": "_embedded.searchResult._embedded.objects",
      "itemRoot": "_embedded.indexableObject",
      "title": "metadata['dc.title'][0].value",
      "url": "metadata['dc.identifier.uri'][0].value",
      "date": "metadata['dc.date.issued'][0].value",
      "total": "_embedded.searchResult.page.totalElements",
      "symbol": "metadata['dc.identifier.govdoc'][0].value",
      "description": "metadata['dc.description'][0].value",
      "uuid": "uuid",
      "language": "metadata['dc.language.iso'][0].value",
      "type": "metadata['dc.type'][0].value",
      "publisher": "metadata['dc.publisher'][0].value"
    }
  };
}

module.exports = WhoIrisAdapter;
