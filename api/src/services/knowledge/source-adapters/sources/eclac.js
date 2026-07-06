'use strict';
/**
 * Per-source adapter — ECLAC Repository (eclac).
 * Family: dspace. Auto-generated from research/eclac.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { DspaceAdapter } = require('../family/dspace.adapter');

class EclacAdapter extends DspaceAdapter {
  static key          = "eclac";
  static family       = "dspace";
  static capabilities = ["search","browseAll","paginate","filter","sort","download","enrich","fulltext"];
  static filterSchema = [
    {
      "type": "dateFrom",
      "param": "f.dateIssued",
      "label": "Date issued range",
      "notes": "DSpace 7 range filter, same platform as WHO IRIS. Value format: [YYYY TO YYYY],equals (URL-encode brackets). 'dateIssued' confirmed present in the facet list."
    },
    {
      "type": "docType",
      "param": "f.typedoc",
      "label": "Document type",
      "options": [
        "libro",
        "contribución a congreso",
        "capítulo de libro",
        "artículo",
        "publicación seriada",
        "video",
        "revista",
        "bibliografía",
        "informe"
      ],
      "notes": "Verified via /discover/facets/typedoc. Labels are in Spanish. Value format: <value>,equals. Top counts: libro 20989, contribución a congreso 15965, capítulo de libro 5346, artículo 4151."
    },
    {
      "type": "language",
      "param": "f.language",
      "label": "Language",
      "options": [
        "spa",
        "eng",
        "fra",
        "por",
        "mul",
        "ita",
        "zho"
      ],
      "notes": "Verified via /discover/facets/language. ISO codes. Counts: spa 37399, eng 14547, fra 1128, por 970, mul 486. Value format: <code>,equals."
    },
    {
      "type": "subject",
      "param": "f.subject",
      "label": "Subject",
      "notes": "Rich facet set (27 total). Notable: unsymbol (UN document symbol), sdg (Sustainable Development Goal), regionaloffice, series, publisher, project, event, coverageEng/coverageSpa (country coverage), subjectEng/subjectSpa, topicEng/topicSpa, workareaEng/workareaSpa."
    }
  ];
  static downloadMode = "dspace-bitstream";
  static enrichMode   = "dspace-item";
  static notes        = "WebFetch succeeds here (no aggressive WAF), unlike WHO IRIS. Facet labels for document type are Spanish only. OAI-PMH exists at `https://repositorio.cepal.org/server/oai/request` but supports only bulk harvesting by set/date, not keyword qu";
  static defaultConfig = {
    "adapterKey": "eclac",
    "endpoint": "https://repositorio.cepal.org/server/api/discover/search/objects",
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
      "symbol": "metadata['dc.identifier.unsymbol'][0].value",
      "description": "metadata['dc.description.abstract'][0].value",
      "uuid": "uuid",
      "language": "metadata['dc.language.iso'][0].value",
      "type": "metadata['dc.type.coar'][0].value",
      "publisher": "metadata['dc.publisher'][0].value"
    }
  };
}

module.exports = EclacAdapter;
