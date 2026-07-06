'use strict';
/**
 * SourceAdapter — the common interface every document source implements.
 *
 * A source declares its capabilities statically; the base class provides
 * uniform STUBS for everything it does not override:
 *   - search()          → throws CapabilityNotSupportedError unless a family
 *                         base (rest-api / url-catalog / rss-feed / …) overrides it
 *   - enrich()          → throws CapabilityNotSupportedError (only enrich-capable
 *                         adapters override it)
 *   - resolveDownload() → returns pdfUrl || url (works for most sources)
 *
 * Concrete adapters extend a family base (see family/*.adapter.js) and usually
 * only declare capabilities, a filter schema, and a config; rich API sources
 * override search/enrich/resolveDownload.
 */

const { v4: uuidv4 } = require('uuid');
const {
  CAPABILITIES,
  CapabilityNotSupportedError,
  normalizeCapabilities,
  normalizeFilterSchema,
} = require('./capabilities');

class SourceAdapter {
  // ── Static descriptor (overridden by subclasses) ─────────────
  static key          = 'base';
  static family       = 'base';
  static capabilities = [];          // declared capability list (see CAPABILITIES)
  static filterSchema = [];          // declared filter schema (see FILTER_TYPES)
  static downloadMode = 'record-page';
  static enrichMode   = 'none';
  static notes        = '';
  static defaultConfig = {};   // researched connection config baked into the adapter

  constructor(source) {
    this.source = source || {};
    // Stored (DB) config overrides the adapter's baked-in researched defaults,
    // so a per-source adapter works even before the seed runs.
    this.config = { ...(this.constructor.defaultConfig || {}), ...(source?.config || {}) };
    this.name   = source?.name || this.constructor.key;
  }

  // ── Capability introspection ─────────────────────────────────

  /** Effective capability list: config override wins over the static declaration. */
  effectiveCapabilities() {
    const declared = Array.isArray(this.config.capabilities) && this.config.capabilities.length
      ? this.config.capabilities
      : this.constructor.capabilities;
    return normalizeCapabilities(declared);
  }

  /** Effective filter schema: config override wins over the static declaration. */
  effectiveFilterSchema() {
    const declared = Array.isArray(this.config.filterSchema) && this.config.filterSchema.length
      ? this.config.filterSchema
      : this.constructor.filterSchema;
    return normalizeFilterSchema(declared);
  }

  supports(capability) {
    return this.effectiveCapabilities().includes(capability);
  }

  requireCapability(capability) {
    if (!this.supports(capability)) {
      throw new CapabilityNotSupportedError(capability, this.name);
    }
  }

  /** Capability descriptor consumed by the API + frontend. */
  getCapabilities() {
    return {
      key:          this.constructor.key,
      family:       this.constructor.family,
      capabilities: this.effectiveCapabilities(),
      filterSchema: this.effectiveFilterSchema(),
      downloadMode: this.config.downloadMode || this.constructor.downloadMode,
      enrichMode:   this.config.enrichMode   || this.constructor.enrichMode,
      notes:        this.config.notes || this.constructor.notes || '',
    };
  }

  // ── Canonical result shape ───────────────────────────────────

  /**
   * Coerce a raw result into the canonical item shape used by BrowseDialog and
   * the SourceDocument cache. Guarantees a stable `id`.
   */
  normalizeItem(raw) {
    const item = raw || {};
    return {
      id:          item.id || uuidv4(),
      title:       item.title || 'Untitled',
      url:         item.url || '',
      pdfUrl:      item.pdfUrl || undefined,
      fileType:    item.fileType || 'html',
      date:        item.date || null,
      description: item.description || null,
      symbol:      item.symbol || null,
      languages:   item.languages && item.languages.length ? item.languages : undefined,
      metadata:    item.metadata || undefined,
    };
  }

  // ── Capability methods (STUBS — overridden by real adapters) ──

  /**
   * Search / list documents.
   * @returns {Promise<{results: object[], total: number, hasMore: boolean}>}
   */
  async search(/* { query, page, limit, filters, sort } */) {
    throw new CapabilityNotSupportedError(CAPABILITIES.SEARCH, this.name);
  }

  /**
   * Fetch full per-record metadata for a single item.
   * @returns {Promise<object|null>} canonical enrichment object (abstract, subjects, …)
   */
  async enrich(/* item */) {
    throw new CapabilityNotSupportedError(CAPABILITIES.ENRICH, this.name);
  }

  /**
   * Resolve a downloadable file for an item.
   * Default works for most sources (direct PDF or record page).
   * @returns {Promise<{downloadUrl: string, filename?: string, mime?: string}>}
   */
  async resolveDownload(item) {
    const downloadUrl = item?.pdfUrl || item?.metadata?.pdfUrl || item?.url;
    return { downloadUrl: downloadUrl || '', filename: null, mime: null };
  }
}

module.exports = { SourceAdapter };
