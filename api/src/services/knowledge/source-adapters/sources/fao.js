'use strict';
/**
 * Per-source adapter — FAO Knowledge Repository (fao).
 * Family: dspace. Auto-generated from research/fao.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { DspaceAdapter } = require('../family/dspace.adapter');

class FaoAdapter extends DspaceAdapter {
  static key          = "fao";
  static family       = "dspace";
  static capabilities = ["search","browseAll","paginate","filter","sort","download","enrich"];
  static filterSchema = [
    {
      "type": "dateFrom",
      "param": "f.dateIssued.min",
      "label": "Issued year from (DSpace date facet range; use full year, e.g. 2020)"
    },
    {
      "type": "dateTo",
      "param": "f.dateIssued.max",
      "label": "Issued year to"
    },
    {
      "type": "docType",
      "param": "f.taxonomyType",
      "label": "FAO content type (facet value, e.g. 'Book', 'Report'); dc.type carried per record"
    },
    {
      "type": "language",
      "param": "f.isoLanguage",
      "label": "Language (value is full name, e.g. 'English','French','Spanish'; append ',equals')"
    }
  ];
  static downloadMode = "dspace-bitstream";
  static enrichMode   = "dspace-item";
  static notes        = "The server returns HTTP 403 to default/bot User-Agents; requests MUST send a browser-like User-Agent AND a Referer: https://openknowledge.fao.org/ header. Pagination is zero-based via `page`/`size`. Very large `size` values may be capped by";
  static defaultConfig = {
    "adapterKey": "fao",
    "endpoint": "https://openknowledge.fao.org/server/api/discover/search/objects",
    "method": "GET",
    "searchParam": "query",
    "queryParams": {
      "sort": "dc.date.issued,DESC",
      "_note_filters": "DSpace filter syntax: append &f.<facet>=<value>,equals (e.g. f.isoLanguage=English,equals). Date range: f.dateIssued.min / f.dateIssued.max."
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
    },
    "headers": {
      "Referer": "https://openknowledge.fao.org/"
    }
  };
}

module.exports = FaoAdapter;
