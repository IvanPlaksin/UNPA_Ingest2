'use strict';
/**
 * Capability vocabulary for the SourceAdapter framework.
 *
 * Every source declares which of these capabilities it supports. The backend
 * uses the declaration to decide whether a request is honoured or rejected
 * with a CapabilityNotSupportedError; the frontend uses it to render only the
 * controls a source can actually serve (unsupported ones are shown disabled).
 */

// ── Capabilities ──────────────────────────────────────────────

const CAPABILITIES = Object.freeze({
  SEARCH:    'search',     // free-text / keyword query (server-side unless noted)
  BROWSE_ALL:'browseAll',  // list documents without a query
  PAGINATE:  'paginate',   // real pagination beyond the first window
  FILTER:    'filter',     // structured filters (see FILTER_TYPES)
  SORT:      'sort',       // server-side ordering
  DOWNLOAD:  'download',   // resolve a downloadable file for import
  ENRICH:    'enrich',     // fetch full per-record metadata
  FULLTEXT:  'fulltext',   // search covers document body text, not just metadata
});

const ALL_CAPABILITIES = Object.freeze(Object.values(CAPABILITIES));

// ── Filter types (the filter-schema vocabulary) ───────────────
// A source's filterSchema is an array of { type, param, label, ... } entries.
// `type` MUST be one of these; the UI renders a control per type.

const FILTER_TYPES = Object.freeze({
  DATE_FROM:  'dateFrom',   // date picker → lower bound
  DATE_TO:    'dateTo',     // date picker → upper bound
  YEAR:       'year',       // numeric / select (single year)
  YEAR_FROM:  'yearFrom',   // numeric → lower year bound
  YEAR_TO:    'yearTo',     // numeric → upper year bound
  LANGUAGE:   'language',   // select / multiselect (options[])
  DOC_TYPE:   'docType',    // select (options[])
  SYMBOL:     'symbol',     // text (UN document symbol)
  AUTHOR:     'author',     // text
  SUBJECT:    'subject',    // text / select (UNBIS / MeSH subject term)
  COLLECTION: 'collection', // select (options[])
  TOPIC:      'topic',      // select / text
  COUNTRY:    'country',    // text / select
  OWNER:      'owner',      // text (owning unit / vice-presidency)
  KEYWORD:    'keyword',    // free-text keyword
});

const ALL_FILTER_TYPES = Object.freeze(Object.values(FILTER_TYPES));

// ── Error ─────────────────────────────────────────────────────

class CapabilityNotSupportedError extends Error {
  constructor(capability, sourceName) {
    super(`Capability "${capability}" is not supported by source${sourceName ? ` "${sourceName}"` : ''}`);
    this.name = 'CapabilityNotSupportedError';
    this.capability = capability;
    this.code = 'CAPABILITY_NOT_SUPPORTED';
    this.statusCode = 422;
  }
}

// ── Helpers ───────────────────────────────────────────────────

/** Validate + normalize a declared capability list to known values, order-stable. */
function normalizeCapabilities(list) {
  const set = new Set(Array.isArray(list) ? list : []);
  return ALL_CAPABILITIES.filter(c => set.has(c));
}

/** Validate a filterSchema array: keep only entries with a known type + a param. */
function normalizeFilterSchema(schema) {
  if (!Array.isArray(schema)) return [];
  return schema.filter(f => f && ALL_FILTER_TYPES.includes(f.type));
}

module.exports = {
  CAPABILITIES,
  ALL_CAPABILITIES,
  FILTER_TYPES,
  ALL_FILTER_TYPES,
  CapabilityNotSupportedError,
  normalizeCapabilities,
  normalizeFilterSchema,
};
