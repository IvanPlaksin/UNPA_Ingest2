'use strict';
/**
 * Per-source adapter — UN Knowledge Gateway (un-knowledge-gateway).
 * SharePoint Online: unitednations.sharepoint.com/sites/APP-Gateway
 *
 * Auth challenge: SharePoint Online REST API returns 403 to non-browser HTTP
 * clients even with valid FedAuth session cookies. Azure Front Door enforces
 * TLS/HTTP browser fingerprinting on this tenant.
 *
 * Access strategy:
 *   Cache-file mode (current) — read from a JSON snapshot populated by the
 *   browser console export script (see scripts/export-kg-docs.js).
 *
 *   Refresh: run the browser script on the SharePoint page, paste the
 *   clipboard output into api/data/kg-cache.json, or set config.cacheFile
 *   to any absolute path. Recommended refresh interval: 7 days.
 *
 * Future: Bearer token mode — once MSAL token flow is wired up, the adapter
 *   can call the SharePoint REST API directly. Toggle via config.useApi=true.
 */

const path = require('path');
const fs   = require('fs');
const { SourceAdapter } = require('../base.adapter');

const SITE_URL      = 'https://unitednations.sharepoint.com/sites/APP-Gateway';
const DEFAULT_CACHE = path.resolve(__dirname, '../../../../..', 'data', 'kg-cache.json');

class UnKnowledgeGatewayAdapter extends SourceAdapter {
  static key          = 'un-knowledge-gateway';
  static family       = 'sharepoint';
  static capabilities = ['search', 'browseAll', 'paginate'];
  static filterSchema = [
    {
      type:  'library',
      param: 'lib',
      label: 'Document Library',
      notes: 'Filter by SharePoint document library name, e.g. "Documents"',
    },
  ];
  static downloadMode = 'browser-session';
  static notes        = [
    'UN Knowledge Gateway — SharePoint Online (APP-Gateway site).',
    'Access via local JSON cache exported from browser console.',
    'Refresh cache weekly: open DevTools on the site → run export script → save to api/data/kg-cache.json.',
  ].join(' ');
  static defaultConfig = {
    adapterKey:     'un-knowledge-gateway',
    cacheFile:      null,   // absolute path override; null → api/data/kg-cache.json
    maxFileAgeDays: 7,
  };

  // ── Cache I/O ────────────────────────────────────────────────

  _cacheFilePath() {
    return this.config.cacheFile || DEFAULT_CACHE;
  }

  _loadCache() {
    const filePath = this._cacheFilePath();

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Knowledge Gateway cache not found at: ${filePath}\n` +
        `Run the browser export script on the SharePoint page and save the output there.\n` +
        `Script: d:\\UN\\Repos\\UNPA\\UNPA_Ingest\\api\\scripts\\export-kg-docs.js (paste in DevTools console)`
      );
    }

    const ageMs     = Date.now() - fs.statSync(filePath).mtimeMs;
    const maxAgeMs  = (this.config.maxFileAgeDays || 7) * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      const days = Math.floor(ageMs / 86400000);
      console.warn(
        `[KnowledgeGateway] Cache is ${days} days old (>${this.config.maxFileAgeDays || 7} day limit). ` +
        `Consider refreshing via the browser export script.`
      );
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  // ── Normalise cache entry → SourceDocument shape ─────────────

  _normalise(doc) {
    const ext = (doc.file || '').split('.').pop().toLowerCase() || 'unknown';
    return {
      title:    doc.title || doc.file || 'Untitled',
      url:      doc.url || `${SITE_URL}/_layouts/15/DocIdRedir.aspx?ID=${doc.id}`,
      pdfUrl:   null, // SharePoint download requires authenticated browser session
      fileType: ext,
      date:     doc.modified || doc.created || null,
      symbol:   null,
      metadata: {
        library:      doc.lib   || 'Unknown',
        fileName:     doc.file  || null,
        created:      doc.created  || null,
        modified:     doc.modified || null,
        author:       doc.author      || null,
        authorEmail:  doc.authorEmail || null,
        sourcePortal: SITE_URL,
        docId:        doc.id || null,
      },
    };
  }

  // ── search() ─────────────────────────────────────────────────

  async search({ query = '', page = 1, limit = 25, filters = {} } = {}) {
    const cache = this._loadCache();
    let items   = (cache.docs || []).map(d => this._normalise(d));

    if (filters.lib) {
      const libQ = filters.lib.toLowerCase();
      items = items.filter(i => i.metadata.library.toLowerCase().includes(libQ));
    }

    if (query) {
      const q = query.toLowerCase();
      items = items.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.metadata.fileName && i.metadata.fileName.toLowerCase().includes(q)) ||
        (i.metadata.library  && i.metadata.library.toLowerCase().includes(q))
      );
    }

    const start = (page - 1) * limit;
    return {
      results: items.slice(start, start + limit),
      total:   items.length,
      hasMore: items.length > start + limit,
    };
  }

  // ── resolveDownload() ─────────────────────────────────────────

  async resolveDownload(item) {
    return {
      downloadUrl: item?.url || null,
      filename:    item?.metadata?.fileName || null,
      mime:        null,
      note:        'SharePoint download requires UN credentials — open URL in an authenticated browser session',
    };
  }

  // ── cacheInfo() — diagnostic ──────────────────────────────────

  async cacheInfo() {
    const filePath = this._cacheFilePath();
    if (!fs.existsSync(filePath)) {
      return { exists: false, path: filePath };
    }
    const stat   = fs.statSync(filePath);
    const cache  = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      exists:    true,
      path:      filePath,
      docCount:  (cache.docs || []).length,
      libCount:  (cache.libs || []).length,
      fetchedAt: cache.at || null,
      ageDays:   Math.floor((Date.now() - stat.mtimeMs) / 86400000),
    };
  }
}

module.exports = UnKnowledgeGatewayAdapter;
