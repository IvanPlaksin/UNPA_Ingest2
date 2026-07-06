'use strict';
/**
 * Adapter registry.
 *
 * resolveAdapter(source) returns an adapter instance for a SourceCatalog entry:
 *   1. by explicit config.adapterKey → the registered per-source adapter
 *   2. else by source.type → the family base adapter
 *   3. else → UrlCatalogAdapter as a last-resort default
 * Every source therefore always resolves to *something*.
 *
 * Per-source adapters live in ./sources/*.js and each export a class with a
 * unique static `key`; they are auto-discovered at load time.
 */

const fs   = require('fs');
const path = require('path');

const { SourceAdapter }    = require('./base.adapter');
const { RestApiAdapter }   = require('./family/rest-api.adapter');
const { UrlCatalogAdapter }= require('./family/url-catalog.adapter');
const { RssFeedAdapter }   = require('./family/rss-feed.adapter');
const { OaiPmhAdapter }    = require('./family/oai-pmh.adapter');
const { OdsAdapter }       = require('./family/ods.adapter');
const { OiosAdapter }      = require('./family/oios.adapter');
const { InvenioAdapter }   = require('./family/invenio.adapter');
const { DspaceAdapter }    = require('./family/dspace.adapter');
const { OpendatasoftAdapter } = require('./family/opendatasoft.adapter');

// Source-type → family base adapter.
const TYPE_FAMILY = {
  URL_CATALOG: UrlCatalogAdapter,
  REST_API:    RestApiAdapter,
  RSS_FEED:    RssFeedAdapter,
  ODS_API:     OdsAdapter,
  OIOS_PORTAL: OiosAdapter,
  OAI_PMH:     OaiPmhAdapter,
};

// Family key → family base adapter (for adapters that reference a family by name).
const FAMILY_BY_KEY = {
  'rest-api':    RestApiAdapter,
  'url-catalog': UrlCatalogAdapter,
  'rss-feed':    RssFeedAdapter,
  'oai-pmh':     OaiPmhAdapter,
  'ods':         OdsAdapter,
  'oios':        OiosAdapter,
  'invenio':     InvenioAdapter,
  'opendatasoft':OpendatasoftAdapter,
  'dspace':      DspaceAdapter,
};

// ── Auto-discover per-source adapters ─────────────────────────

const _byKey = new Map();

function _register(cls) {
  if (cls && typeof cls === 'function' && cls.key && cls.prototype instanceof SourceAdapter) {
    _byKey.set(cls.key, cls);
  }
}

function _loadSourceAdapters() {
  const dir = path.join(__dirname, 'sources');
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    try {
      const mod = require(path.join(dir, file));
      // A module may export the class directly, as { default }, or as a named export.
      const candidates = [mod, mod?.default, ...Object.values(mod || {})];
      for (const c of candidates) _register(c);
    } catch (err) {
      console.warn(`[SourceAdapters] failed to load ${file}: ${err.message}`);
    }
  }
}
_loadSourceAdapters();

// ── Public API ────────────────────────────────────────────────

function resolveAdapter(source) {
  const cfg = source?.config || {};
  const key = cfg.adapterKey;

  if (key && _byKey.has(key)) return new (_byKey.get(key))(source);
  if (key && FAMILY_BY_KEY[key]) return new (FAMILY_BY_KEY[key])(source);

  const Family = TYPE_FAMILY[source?.type] || UrlCatalogAdapter;
  return new Family(source);
}

function getAdapterClass(key) {
  return _byKey.get(key) || FAMILY_BY_KEY[key] || null;
}

function listAdapterKeys() {
  return [...new Set([..._byKey.keys(), ...Object.keys(FAMILY_BY_KEY)])];
}

module.exports = {
  resolveAdapter,
  getAdapterClass,
  listAdapterKeys,
  TYPE_FAMILY,
  FAMILY_BY_KEY,
  _byKey, // exposed for tests
};
