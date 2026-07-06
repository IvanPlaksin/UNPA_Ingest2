'use strict';
/**
 * Per-source adapter — UNEP Publications (unep-informea).
 * Family: rest-api. Auto-generated from research/unep-informea.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { RestApiAdapter } = require('../family/rest-api.adapter');

class UnepInformeaAdapter extends RestApiAdapter {
  static key          = "unep-informea";
  static family       = "rest-api";
  static capabilities = ["browseAll","paginate","download"];
  static filterSchema = [];
  static downloadMode = "direct-pdf";
  static enrichMode   = "dspace-item";
  static notes        = "HONEST: The base service runs over plain HTTP (odata.informea.org) and most content fields are deferred, requiring an $expand or a second call per record. Dates are OData /Date(ms)/ epoch format needing parsing. Terms of service ask integra";
  static defaultConfig = {
    "adapterKey": "unep-informea",
    "method": "GET",
    "endpoint": "http://odata.informea.org/informea.svc/Documents",
    "searchParam": null,
    "queryParams": {
      "$format": "json",
      "$expand": "title,files,types,treaties",
      "$orderby": "updated desc"
    },
    "pageParam": "$skip",
    "limitParam": "$top",
    "pageParamStyle": "offset-0",
    "responseMapping": {
      "items": "d.results",
      "title": "title",
      "url": "",
      "date": "updated",
      "description": ""
    },
    "_odata": {
      "apiBaseUrl": "http://odata.informea.org/informea.svc",
      "documentsEndpoint": "/Documents",
      "protocol": "OData v2",
      "format": "json (append $format=json)",
      "listTemplate": "http://odata.informea.org/informea.svc/Documents?$top={limit}&$skip={offset}&$format=json",
      "searchTemplate": "http://odata.informea.org/informea.svc/Documents?$filter=substringof('{query}',title)&$format=json",
      "expandTemplate": "http://odata.informea.org/informea.svc/Documents('{id}')?$expand=title,files,authors,types,treaties,keywords&$format=json",
      "paginationParams": {
        "limit": "$top",
        "offset": "$skip"
      },
      "responseMapping": {
        "records": "d.results",
        "id": "id",
        "treaty": "treaty",
        "published": "published",
        "updated": "updated",
        "title": "title (deferred -> $expand=title)",
        "files": "files (deferred -> $expand=files, contains download URLs)",
        "authors": "authors (deferred)",
        "types": "types (deferred)"
      }
    }
  };
}

module.exports = UnepInformeaAdapter;
