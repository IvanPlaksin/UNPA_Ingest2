'use strict';
/**
 * Per-source adapter — ESCAP Publications (escap).
 * Family: dspace. Auto-generated from research/escap.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { DspaceAdapter } = require('../family/dspace.adapter');

class EscapAdapter extends DspaceAdapter {
  static key          = "escap";
  static family       = "dspace";
  static capabilities = ["search","browseAll","paginate","filter","sort","download","enrich"];
  static filterSchema = [
    {
      "type": "dateFrom",
      "param": "f.dateIssued.min",
      "label": "Issued year from (DSpace date facet range)"
    },
    {
      "type": "dateTo",
      "param": "f.dateIssued.max",
      "label": "Issued year to"
    },
    {
      "type": "docType",
      "param": "f.type",
      "label": "Document type (facet value, e.g. 'Report','Text'; append ',equals')"
    },
    {
      "type": "language",
      "param": "f.language",
      "label": "Language (facet value; append ',equals')"
    }
  ];
  static downloadMode = "dspace-bitstream";
  static enrichMode   = "dspace-item";
  static notes        = "Unauthenticated access worked with a plain browser User-Agent (no Referer needed, unlike FAO). Pagination is zero-based `page`/`size`; DSpace typically caps size at 100.";
  static defaultConfig = {
    "adapterKey": "escap",
    "endpoint": "https://repository.unescap.org/server/api/discover/search/objects",
    "method": "GET",
    "searchParam": "query",
    "queryParams": {
      "sort": "dc.date.issued,DESC",
      "_note_filters": "DSpace filter syntax: append &f.<facet>=<value>,equals. Verified facet names: dateIssued, type, language, country, unbist, unsdg, author, series."
    },
    "pageParam": "page",
    "limitParam": "size",
    "pageParamStyle": "zero-based",
    "responseMapping": {
      "items": "_embedded.searchResult._embedded.objects[]._embedded.indexableObject",
      "title": "metadata['dc.title'][0].value",
      "url": "metadata['dc.identifier.uri'][0].value",
      "date": "metadata['dc.date.issued'][0].value",
      "total": "_embedded.searchResult.page.totalElements",
      "description": "metadata['dc.description.abstract'][0].value",
      "id": "uuid",
      "type": "metadata['dc.type'][0].value",
      "language": "metadata['dc.language.iso'][0].value"
    }
  };
}

module.exports = EscapAdapter;
