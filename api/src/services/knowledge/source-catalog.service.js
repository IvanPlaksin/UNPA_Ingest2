'use strict';
/**
 * SourceCatalogService
 *
 * Catalog of external information sources for document discovery.
 * Each entry describes how to browse / search an external repository
 * and can import found files directly into the Documents pipeline.
 *
 * Supported source types:
 *   URL_CATALOG  — HTML page with document links (link scraping)
 *   REST_API     — Generic REST/JSON API (configurable response mapping)
 *   RSS_FEED     — RSS or Atom feed
 *   ODS_API      — UN Official Document System (documents.un.org)
 *   OIOS_PORTAL  — UN OIOS Reports portal
 *   OAI_PMH      — OAI-PMH protocol (ECLAC, ESCAP, etc.)
 */

const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const axios  = require('axios');
const https  = require('https');
const path   = require('path');
const url    = require('url');

const LOG_PREFIX = '[SourceCatalog]';

const SOURCE_TYPES = ['URL_CATALOG', 'REST_API', 'RSS_FEED', 'ODS_API', 'OIOS_PORTAL', 'OAI_PMH'];

// Namespace for deterministic SourceDocument IDs (uuidv5)
const SOURCE_DOC_NS = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

// Reusable HTTPS agent (skips cert verification for self-signed UN certs)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

// ── Helpers ──────────────────────────────────────────────────

function getExt(rawUrl) {
  try {
    const u = new url.URL(rawUrl);
    const ext = path.extname(u.pathname).toLowerCase().replace('.', '');
    return ext || null;
  } catch { return null; }
}

function nested(obj, dotPath) {
  if (!dotPath) return undefined;
  return dotPath.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function parseConfig(raw) {
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
}

function serializeConfig(config) {
  return JSON.stringify(config || {});
}

// Normalize UN document symbol: S_RES_2319(2016)-EN.pdf → S/RES/2319(2016)
function normalizeSymbol(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  s = s.replace(/\.[a-zA-Z]{2,4}$/, '');       // remove extension
  s = s.replace(/-[A-Z]{1,3}$/, '');            // remove language suffix (-EN, -AR, -RU, etc.)
  s = s.replace(/_\(/g, '(');                   // _( → ( (year in parens: S_RES_2235_(2015) → S_RES_2235(2015))
  s = s.replace(/_/g, '/');                      // remaining underscores → slashes
  s = s.replace(/\/+/g, '/');                    // collapse double slashes
  return s;
}

// Find English PDF URL from DL files array
function findEnglishPdf(files, recid) {
  if (!Array.isArray(files) || !recid) return '';
  // Prefer -EN. suffix PDF
  const enPdf = files.find(f => {
    const n = (f.full_name || f.name || '').toUpperCase();
    return n.includes('-EN.') && (f.eformat === 'pdf' || n.endsWith('.PDF'));
  });
  // Fallback to any PDF
  const anyPdf = enPdf || files.find(f =>
    f.eformat === 'pdf' || (f.full_name || f.name || '').toLowerCase().endsWith('.pdf')
  );
  if (!anyPdf) return '';
  const filename = anyPdf.full_name || anyPdf.name;
  if (!filename) return '';
  return `https://digitallibrary.un.org/record/${recid}/files/${encodeURIComponent(filename)}`;
}

// ── HTML link extractor ───────────────────────────────────────

function extractLinksFromHtml(html, baseUrl, config = {}) {
  const results = [];
  const seen = new Set();
  const DOC_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'rtf'];

  const linkFilter = config.linkFilter ? config.linkFilter.toLowerCase() : null;

  const aTagRe = /<a\s[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aTagRe.exec(html)) !== null) {
    let href = m[1].trim();
    const inner = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (!href || href.startsWith('#') || href.startsWith('javascript')) continue;
    if (linkFilter && !href.toLowerCase().includes(linkFilter) && !inner.toLowerCase().includes(linkFilter)) continue;

    try {
      if (!href.startsWith('http')) href = new url.URL(href, baseUrl).href;
    } catch { continue; }

    const ext = getExt(href);
    const isDoc = DOC_EXTS.includes(ext);
    const title = inner || path.basename(new url.URL(href).pathname) || href;

    if (!isDoc && !config.includeAllLinks) continue;
    if (seen.has(href)) continue;
    seen.add(href);

    results.push({
      title:    title.substring(0, 200),
      url:      href,
      fileType: ext || 'html',
      date:     null,
      description: null,
      symbol:   null,
    });
  }
  return results;
}

// ── RSS/Atom parser ───────────────────────────────────────────

function parseRssItems(xml, query) {
  const items = [];
  const itemRe = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  const tagRe  = (name) => new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, 'i');

  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const chunk = m[1];
    const title = (tagRe('title').exec(chunk)?.[1] || '').trim();
    const linkM = /<link[^>]+href=["'](https?:\/\/[^"']+)["']/.exec(chunk)
               || /<link[^>]*>\s*(https?:\/\/[^\s<]+)\s*<\/link>/.exec(chunk);
    const link = linkM ? linkM[1].trim() : '';
    const date = (tagRe('pubDate').exec(chunk)?.[1]
               || tagRe('published').exec(chunk)?.[1]
               || tagRe('dc:date').exec(chunk)?.[1] || '').trim();
    const desc = (tagRe('description').exec(chunk)?.[1]
               || tagRe('summary').exec(chunk)?.[1] || '').replace(/<[^>]*>/g, '').trim();

    if (!title || !link) continue;
    if (query && !title.toLowerCase().includes(query.toLowerCase()) &&
        !desc.toLowerCase().includes(query.toLowerCase())) continue;

    items.push({
      title:       title.substring(0, 200),
      url:         link,
      fileType:    getExt(link) || 'html',
      date:        date || null,
      description: desc.substring(0, 500) || null,
      symbol:      null,
    });
  }
  return items;
}

// ── OAI-PMH parser ───────────────────────────────────────────

function parseOaiPmhRecords(xml, query) {
  const results = [];
  const recordRe = /<record[\s>]([\s\S]*?)<\/record>/gi;
  const tag = (name, chunk) => {
    const re = new RegExp(`<(?:[a-z]+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:[a-z]+:)?${name}>`, 'i');
    return (re.exec(chunk)?.[1] || '').replace(/<[^>]*>/g, '').trim();
  };

  let m;
  while ((m = recordRe.exec(xml)) !== null) {
    const chunk = m[1];
    if (/<header[^>]+status="deleted"/.test(chunk)) continue;

    const title = tag('title', chunk);
    const identifiers = [];
    const idRe = /<(?:[a-z]+:)?identifier[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?identifier>/gi;
    let im;
    while ((im = idRe.exec(chunk)) !== null) {
      const v = im[1].trim();
      if (v.startsWith('http')) identifiers.push(v);
    }
    const docUrl = identifiers[0] || '';
    const date   = tag('date', chunk);
    const desc   = tag('description', chunk).substring(0, 500);

    if (!title) continue;
    if (query && !title.toLowerCase().includes(query.toLowerCase()) &&
        !desc.toLowerCase().includes(query.toLowerCase())) continue;

    results.push({
      title:       title.substring(0, 200),
      url:         docUrl,
      fileType:    getExt(docUrl) || 'html',
      date:        date || null,
      description: desc || null,
      symbol:      null,
    });
  }
  return results;
}

// ── Main service ──────────────────────────────────────────────

class SourceCatalogService {

  // ─── CRUD ─────────────────────────────────────────────────────

  async create({ name, description = '', type, namespace = 'DEFAULT', config = {}, tags = [], methodology = '' }) {
    if (!name) throw new Error('name is required');
    if (!SOURCE_TYPES.includes(type)) throw new Error(`Unknown type: ${type}`);

    const id  = uuidv4();
    const now = new Date().toISOString();
    await mg().runQuery(
      `CREATE (s:SourceCatalog {
         id: $id, name: $name, description: $desc,
         type: $type, namespace: $ns,
         config: $cfg, tags: $tags,
         methodology: $methodology,
         enabled: true, documentCount: 0,
         createdAt: $now, updatedAt: $now, lastBrowsedAt: null
       })`,
      { id, name, desc: description, type, ns: namespace,
        cfg: serializeConfig(config), tags: JSON.stringify(tags),
        methodology: methodology || '', now }
    );
    console.log(`${LOG_PREFIX} Created "${name}" (${type})`);
    return this.get(id);
  }

  async list({ namespace, type, enabled } = {}) {
    const conds = [];
    const params = {};
    if (namespace) { conds.push('s.namespace = $ns'); params.ns = namespace; }
    if (type)      { conds.push('s.type = $type');    params.type = type; }
    if (enabled != null) { conds.push('s.enabled = $enabled'); params.enabled = enabled; }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog) ${where}
       RETURN s.id as id, s.name as name, s.description as description,
              s.type as type, s.namespace as namespace,
              s.config as config, s.tags as tags,
              s.methodology as methodology,
              s.enabled as enabled, s.documentCount as documentCount,
              s.createdAt as createdAt, s.updatedAt as updatedAt,
              s.lastBrowsedAt as lastBrowsedAt
       ORDER BY s.name`,
      params
    );
    return rows.map(this._format);
  }

  async get(id) {
    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       RETURN s.id as id, s.name as name, s.description as description,
              s.type as type, s.namespace as namespace,
              s.config as config, s.tags as tags,
              s.methodology as methodology,
              s.enabled as enabled, s.documentCount as documentCount,
              s.createdAt as createdAt, s.updatedAt as updatedAt,
              s.lastBrowsedAt as lastBrowsedAt`,
      { id }
    );
    if (!rows.length) return null;
    return this._format(rows[0]);
  }

  async update(id, updates) {
    const now = new Date().toISOString();
    const sets = ['s.updatedAt = $now'];
    const params = { id, now };

    if (updates.name        != null) { sets.push('s.name = $name');               params.name        = updates.name; }
    if (updates.description != null) { sets.push('s.description = $desc');        params.desc        = updates.description; }
    if (updates.type        != null) { sets.push('s.type = $type');               params.type        = updates.type; }
    if (updates.namespace   != null) { sets.push('s.namespace = $ns');            params.ns          = updates.namespace; }
    if (updates.config      != null) { sets.push('s.config = $cfg');              params.cfg         = serializeConfig(updates.config); }
    if (updates.tags        != null) { sets.push('s.tags = $tags');               params.tags        = JSON.stringify(updates.tags); }
    if (updates.enabled     != null) { sets.push('s.enabled = $enabled');         params.enabled     = updates.enabled; }
    if (updates.methodology != null) { sets.push('s.methodology = $methodology'); params.methodology = updates.methodology; }

    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id}) SET ${sets.join(', ')}`,
      params
    );
    return this.get(id);
  }

  async delete(id) {
    // Also delete associated SourceDocument nodes
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})-[:HAS_DOCUMENT]->(d:SourceDocument) DETACH DELETE d`,
      { id }
    ).catch(() => {});
    await mg().runQuery(`MATCH (s:SourceCatalog {id: $id}) DETACH DELETE s`, { id });
    return { deleted: true };
  }

  // ─── Browse ────────────────────────────────────────────────────

  async browse(id, { query = '', page = 1, limit = 20 } = {}) {
    const source = await this.get(id);
    if (!source) throw new Error(`Source not found: ${id}`);

    const cfg  = source.config || {};
    let result;

    switch (source.type) {
      case 'URL_CATALOG':
        result = await this._browseUrlCatalog(cfg, query, page, limit);
        break;
      case 'RSS_FEED':
        result = await this._browseRssFeed(cfg, query, page, limit);
        break;
      case 'REST_API':
        result = await this._browseRestApi(cfg, query, page, limit);
        break;
      case 'ODS_API':
        result = await this._browseOds(cfg, query, page, limit);
        break;
      case 'OIOS_PORTAL':
        result = await this._browseOios(cfg, query, page, limit);
        break;
      case 'OAI_PMH':
        result = await this._browseOaiPmh(cfg, query, page, limit);
        break;
      default:
        throw new Error(`Browse not implemented for type: ${source.type}`);
    }

    // Ensure every result item has a stable ID for frontend keying
    if (result.results) {
      result.results = result.results.map(item =>
        item.id ? item : { id: uuidv4(), ...item }
      );
    }

    // Cache discovered documents as SourceDocument nodes (async, non-blocking)
    if (result.results?.length) {
      this._saveSourceDocuments(id, result.results).catch(() => {});
    }

    // Merge enriched metadata (MARC data etc.) from previously enriched SourceDocument nodes
    if (result.results?.length) {
      result.results = await this._mergeEnrichedData(id, result.results);
    }

    // Update lastBrowsedAt
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id}) SET s.lastBrowsedAt = $now`,
      { id, now: new Date().toISOString() }
    ).catch(() => {});

    return { sourceId: id, sourceName: source.name, query, page, limit, ...result };
  }

  async _browseUrlCatalog(cfg, query, page, limit) {
    const searchUrl = query && cfg.searchUrlTemplate
      ? cfg.searchUrlTemplate.replace('{query}', encodeURIComponent(query))
      : cfg.url;

    if (!searchUrl) throw new Error('URL not configured');

    const response = await axios.get(searchUrl, {
      timeout: 20000, httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
      },
      maxRedirects: 10,
    });

    const all = extractLinksFromHtml(response.data, searchUrl, cfg);

    const filtered = query && !cfg.searchUrlTemplate
      ? all.filter(r => r.title.toLowerCase().includes(query.toLowerCase()) || r.url.toLowerCase().includes(query.toLowerCase()))
      : all;

    const start = (page - 1) * limit;
    return {
      results: filtered.slice(start, start + limit),
      total:   filtered.length,
      hasMore: filtered.length > start + limit,
    };
  }

  async _browseRssFeed(cfg, query, page, limit) {
    if (!cfg.url) throw new Error('Feed URL not configured');
    const response = await axios.get(cfg.url, {
      timeout: 15000, httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        ...(cfg.headers || {}),
      },
    });
    const all = parseRssItems(response.data, query);
    const start = (page - 1) * limit;
    return { results: all.slice(start, start + limit), total: all.length, hasMore: all.length > start + limit };
  }

  async _browseRestApi(cfg, query, page, limit) {
    if (!cfg.endpoint) throw new Error('API endpoint not configured');

    const effectiveQuery = query || cfg.defaultQuery || '';

    const params = { ...(cfg.queryParams || {}) };
    if (cfg.searchParam && effectiveQuery) params[cfg.searchParam] = effectiveQuery;

    // Pagination: support offset-1 (e.g. Invenio jrec), offset-0, or page-number styles
    if (cfg.pageParam) {
      if (cfg.pageParamStyle === 'offset-1') {
        params[cfg.pageParam] = (page - 1) * limit + 1;
      } else if (cfg.pageParamStyle === 'offset-0') {
        params[cfg.pageParam] = (page - 1) * limit;
      } else {
        params[cfg.pageParam] = page;
      }
    }
    if (cfg.limitParam) params[cfg.limitParam] = limit;

    const headers = { ...(cfg.headers || {}) };
    if (cfg.auth?.type === 'bearer')
      headers['Authorization'] = `Bearer ${cfg.auth.token}`;
    else if (cfg.auth?.type === 'apiKey')
      headers[cfg.auth.headerName || 'X-API-Key'] = cfg.auth.key;

    const axConf = {
      method:  cfg.method || 'GET',
      url:     cfg.endpoint,
      headers,
      timeout: 20000,
      httpsAgent,
    };
    if (axConf.method.toUpperCase() === 'GET') axConf.params = params;
    else axConf.data = params;

    if (cfg.auth?.type === 'basic')
      axConf.auth = { username: cfg.auth.username, password: cfg.auth.password };

    let response = await axios(axConf);
    // Invenio async "Accepted" — retry up to 5 times with 1.5s delay
    let retries = 0;
    while (response.status === 202 && retries < 5) {
      await new Promise(res => setTimeout(res, 1500));
      response = await axios(axConf);
      retries++;
    }
    const data = response.data;

    // Unwrap multilingual field formats: {value:"...",lang:"..."} → string
    // unwrap: returns any string value; unwrapEn: prefers English language entry
    const unwrap = (v, depth = 0) => {
      if (v == null || depth > 4) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return String(v);
      if (Array.isArray(v)) return v.length > 0 ? unwrap(v[0], depth + 1) : '';
      if (typeof v === 'object') {
        for (const k of ['value', '_', 'text', 'content', 'name', 'title']) {
          if (typeof v[k] === 'string' && v[k].length > 0) return v[k];
        }
        for (const k of ['value', '_', 'text', 'content']) {
          if (v[k] != null) return unwrap(v[k], depth + 1);
        }
        const strVal = Object.values(v).find(x => typeof x === 'string' && x.length > 0);
        if (strVal) return strVal;
      }
      return '';
    };

    const unwrapEn = (v) => {
      if (!Array.isArray(v)) return unwrap(v);
      // Prefer English language entry
      const en = v.find(x => x && typeof x === 'object' &&
        (x.lang === 'en' || x.lang === 'English' || x.language === 'en' || x.language === 'English'));
      return unwrap(en || v[0]);
    };

    const m = cfg.responseMapping || {};
    let raw;
    if (!m.items && m.items !== 0) {
      raw = Array.isArray(data) ? data : [];
    } else {
      raw = nested(data, m.items) || (Array.isArray(data) ? data : []);
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      raw = Object.values(raw);
    }
    const total = Number(nested(data, m.total)) || raw.length;

    // Detect if this is a UN Digital Library source (Invenio recjson format)
    const isDlSource = cfg.endpoint?.includes('digitallibrary.un.org');

    const results = raw.map(item => {
      const rawRecid = item.recid ? String(item.recid) : '';
      const rawUrl   = unwrap(nested(item, m.url) || item.url || item.link || rawRecid || '');
      const finalUrl = m.urlPrefix && rawUrl ? `${m.urlPrefix}${rawUrl}` : rawUrl;

      // Title: for DL sources prefer English; fallback to symbol derived from filename
      const rawTitleField = nested(item, m.title) || item.title || item.name;
      const title = (() => {
        if (rawTitleField) {
          const t = unwrapEn(rawTitleField);
          if (t) return t.substring(0, 200);
        }
        if (m.titleFallback) {
          const fb = nested(item, m.titleFallback);
          if (fb) return unwrap(fb).substring(0, 200);
        }
        return '';
      })();

      // Symbol: normalize from files (prefer English filename) or explicit field
      const rawSymbol = unwrap(nested(item, m.symbol) || item.symbol || '');
      let sym = '';
      if (isDlSource && Array.isArray(item.files) && item.files.length) {
        // Find English filename for symbol derivation
        const enFile = item.files.find(f =>
          (f.full_name || f.name || '').toUpperCase().includes('-EN.')
        ) || item.files[0];
        sym = normalizeSymbol(enFile?.full_name || enFile?.name || rawSymbol);
      } else {
        sym = normalizeSymbol(rawSymbol);
      }

      // PDF URL: for DL sources extract from files array
      const pdfUrl = isDlSource
        ? findEnglishPdf(item.files, rawRecid || rawUrl)
        : '';

      // Available languages from DL files
      const languages = (isDlSource && Array.isArray(item.files))
        ? [...new Set(item.files.map(f => {
            const n = f.full_name || f.name || '';
            const lm = n.match(/-([A-Z]{1,3})\.[a-z]+$/i);
            return lm ? lm[1].toUpperCase() : null;
          }).filter(Boolean))]
        : [];

      // Metadata snapshot (files for DL, raw for others)
      const metadata = isDlSource && item.files
        ? { recid: rawRecid, files: item.files.slice(0, 10), languages }
        : undefined;

      // For DL sources: a "filename-like" title (S_RES_...-AR) is worse than the symbol
      const looksLikeFilename = title && /^[A-Z][A-Z_\/]+[\d_]/.test(title) && !title.includes(' ');
      const finalTitle = (looksLikeFilename && sym)
        ? sym
        : (title || sym || unwrap(nested(item, m.symbol) || item.symbol || '').substring(0, 200) || 'Untitled');

      return {
        id:          uuidv4(),
        title:       finalTitle,
        url:         finalUrl,
        pdfUrl:      pdfUrl || undefined,
        fileType:    pdfUrl ? 'pdf' : unwrap(nested(item, m.fileType) || getExt(rawUrl || '') || 'html'),
        date:        unwrap(nested(item, m.date) || item.date || item.published_at || item.pubDate || ''),
        description: unwrap(nested(item, m.description) || item.description || item.summary || '').substring(0, 500),
        symbol:      sym,
        languages:   languages.length ? languages : undefined,
        metadata:    metadata,
      };
    });

    return { results, total, hasMore: raw.length < total };
  }

  async _browseOds(cfg, query, page, limit) {
    const q = query || cfg.defaultQuery || 'A/RES/';
    const lang = cfg.language || 'E';

    const searchUrl = `https://documents.un.org/prod/ods.nsf/xpSearchResultsM.xsp?query=${encodeURIComponent(q)}&lang=${lang}&start=${(page - 1) * limit + 1}&limit=${limit}`;

    let html = '';
    try {
      const response = await axios.get(searchUrl, {
        timeout: 20000, httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://documents.un.org/',
        },
      });
      html = response.data;
    } catch {
      const dlUrl = `https://digitallibrary.un.org/search?p=${encodeURIComponent(q)}&of=recjson&action_search=Search&rg=${limit}&jrec=${(page - 1) * limit + 1}&ln=${lang.toLowerCase()}`;
      const dlResp = await axios.get(dlUrl, {
        timeout: 20000, httpsAgent,
        headers: { 'User-Agent': 'Mozilla/5.0 UNPA/1.0', 'Accept': 'application/json' },
      }).catch(err => { throw new Error(`ODS/DL request failed: ${err.message}`); });
      const data = dlResp.data;
      const hits = (data?.hits?.hits) || [];
      const results = hits.map(h => ({
        title:    String(h?._source?.title?.[0] || h?._source?.title || 'Untitled').substring(0, 200),
        url:      String(h?._source?.url?.[0]?.value || h?._source?.url || ''),
        fileType: 'pdf',
        date:     String(h?._source?.date || ''),
        description: '',
        symbol:   String(h?._source?.symbol?.[0] || ''),
      })).filter(r => r.url);
      const total = Number(data?.hits?.total) || results.length;
      return { results: results.slice(0, limit), total, hasMore: results.length >= limit };
    }

    const links = extractLinksFromHtml(html, searchUrl, { linkFilter: '.pdf' });

    const symbolHrefRe = /href=["']([^"']*\/(?:en|fr|es|ar|ru|zh)\/[A-Z][^"'\s]*\d+[^"'\s]*)["']/gi;
    const symbolResults = [];
    let sm;
    const seenSymbols = new Set(links.map(l => l.url));
    while ((sm = symbolHrefRe.exec(html)) !== null) {
      let href = sm[1];
      if (seenSymbols.has(href)) continue;
      try { href = new url.URL(href, 'https://documents.un.org').href; } catch { continue; }
      seenSymbols.add(href);
      symbolResults.push({ title: path.basename(href), url: href, fileType: 'html', date: null, description: null, symbol: null });
    }

    const all = [...links, ...symbolResults];
    return { results: all.slice(0, limit), total: all.length, hasMore: all.length >= limit };
  }

  async _browseOios(cfg, query, page, limit) {
    const baseUrl = cfg.url || 'https://oios.un.org/resources/';
    const searchUrl = query ? `${baseUrl}?s=${encodeURIComponent(query)}` : baseUrl;
    return this._browseUrlCatalog({ ...cfg, url: searchUrl }, '', page, limit);
  }

  async _browseOaiPmh(cfg, query, page, limit) {
    if (!cfg.endpoint) throw new Error('OAI-PMH endpoint not configured');
    const metadataPrefix = cfg.metadataPrefix || 'oai_dc';
    const params = { verb: 'ListRecords', metadataPrefix };
    if (cfg.set) params.set = cfg.set;
    if (cfg.from) params.from = cfg.from;

    const response = await axios.get(cfg.endpoint, {
      timeout: 20000, httpsAgent,
      params,
      headers: {
        'User-Agent': 'Mozilla/5.0 UNPA/1.0',
        'Accept': 'application/xml, text/xml, */*',
      },
    });

    const all = parseOaiPmhRecords(response.data, query);
    const start = (page - 1) * limit;
    return {
      results: all.slice(start, start + limit),
      total: all.length,
      hasMore: all.length > start + limit,
    };
  }

  // ─── Source Document Cache ──────────────────────────────────────

  /**
   * Overlay enriched metadata (MARC fields etc.) from cached SourceDocument nodes
   * onto live browse results.  Non-enriched items are returned unchanged.
   */
  async _mergeEnrichedData(sourceId, items) {
    const urls = items.map(r => r.url).filter(Boolean);
    if (!urls.length) return items;

    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $sourceId})-[:HAS_DOCUMENT]->(d:SourceDocument)
       WHERE d.url IN $urls AND d.enrichStatus IS NOT NULL AND d.enrichStatus <> 'none'
       RETURN d.url as url,
              d.abstract as abstract, d.subjects as subjects,
              d.bodies as bodies, d.reportNumbers as reportNumbers,
              d.notes as notes, d.collections as collections,
              d.marcData as marcData,
              d.enrichStatus as enrichStatus, d.enrichedAt as enrichedAt`,
      { sourceId, urls }
    ).catch(() => []);

    if (!rows.length) return items;

    const sp = (v, fallback) => { try { return JSON.parse(v || 'null') || fallback; } catch { return fallback; } };
    const map = {};
    for (const r of rows) {
      map[r.url] = {
        abstract:      r.abstract || '',
        subjects:      sp(r.subjects, []),
        bodies:        sp(r.bodies, []),
        reportNumbers: sp(r.reportNumbers, []),
        notes:         sp(r.notes, []),
        collections:   sp(r.collections, []),
        marcData:      sp(r.marcData, null),
        enrichStatus:  r.enrichStatus,
        enrichedAt:    r.enrichedAt || null,
      };
    }

    return items.map(item => {
      const extra = item.url ? map[item.url] : null;
      return extra ? { ...item, ...extra } : item;
    });
  }

  async _saveSourceDocuments(sourceId, docs) {
    const now = new Date().toISOString();
    for (const doc of docs) {
      try {
        const externalId = doc.url || doc.id;
        if (!externalId) continue;
        const docId = uuidv5(`${sourceId}::${externalId}`, SOURCE_DOC_NS);
        await mg().runQuery(`
          MERGE (d:SourceDocument {id: $id})
          SET d.sourceId      = $sourceId,
              d.externalId    = $externalId,
              d.title         = $title,
              d.symbol        = $symbol,
              d.url           = $url,
              d.pdfUrl        = $pdfUrl,
              d.fileType      = $fileType,
              d.date          = $date,
              d.description   = $description,
              d.metadata      = $metadata,
              d.languages     = $languages,
              d.updatedAt     = $now,
              d.discoveredAt  = coalesce(d.discoveredAt, $now)
          WITH d
          MATCH (s:SourceCatalog {id: $sourceId})
          MERGE (s)-[:HAS_DOCUMENT]->(d)
        `, {
          id:          docId,
          sourceId,
          externalId,
          title:       doc.title || '',
          symbol:      doc.symbol || '',
          url:         doc.url || '',
          pdfUrl:      doc.pdfUrl || '',
          fileType:    doc.fileType || '',
          date:        doc.date || '',
          description: doc.description || '',
          metadata:    JSON.stringify(doc.metadata || {}),
          languages:   JSON.stringify(doc.languages || []),
          now,
        });
      } catch { /* non-critical: skip individual failures */ }
    }
  }

  async getSourceDocuments(sourceId, { page = 1, limit = 20, importedOnly = false } = {}) {
    const conds = ['d.sourceId = $sourceId'];
    const params = { sourceId };
    if (importedOnly) conds.push('d.importedAt IS NOT NULL');

    const where = `WHERE ${conds.join(' AND ')}`;
    const skip  = (page - 1) * limit;

    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $sourceId})-[:HAS_DOCUMENT]->(d:SourceDocument)
       ${where}
       RETURN d.id as id, d.title as title, d.symbol as symbol,
              d.url as url, d.pdfUrl as pdfUrl,
              d.fileType as fileType, d.date as date,
              d.description as description,
              d.metadata as metadata, d.languages as languages,
              d.importedAt as importedAt, d.importedDocumentId as importedDocumentId,
              d.discoveredAt as discoveredAt,
              d.abstract as abstract, d.subjects as subjects,
              d.bodies as bodies, d.reportNumbers as reportNumbers,
              d.notes as notes, d.collections as collections,
              d.marcData as marcData,
              d.enrichStatus as enrichStatus, d.enrichedAt as enrichedAt
       ORDER BY d.discoveredAt DESC
       SKIP ${skip} LIMIT ${limit}`,
      params
    );

    const countRows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $sourceId})-[:HAS_DOCUMENT]->(d:SourceDocument)
       ${where}
       RETURN count(d) as total`,
      params
    );
    const total = Number(countRows[0]?.total) || 0;

    return {
      results: rows.map(r => ({
        id:                r.id,
        title:             r.title,
        symbol:            r.symbol,
        url:               r.url,
        pdfUrl:            r.pdfUrl || '',
        fileType:          r.fileType,
        date:              r.date,
        description:       r.description,
        metadata:          parseConfig(r.metadata),
        languages:         (() => { try { return JSON.parse(r.languages || '[]'); } catch { return []; } })(),
        importedAt:        r.importedAt || null,
        importedDocumentId: r.importedDocumentId || null,
        discoveredAt:      r.discoveredAt,
        abstract:          r.abstract || '',
        subjects:          (() => { try { return JSON.parse(r.subjects || '[]'); } catch { return []; } })(),
        bodies:            (() => { try { return JSON.parse(r.bodies || '[]'); } catch { return []; } })(),
        reportNumbers:     (() => { try { return JSON.parse(r.reportNumbers || '[]'); } catch { return []; } })(),
        notes:             (() => { try { return JSON.parse(r.notes || '[]'); } catch { return []; } })(),
        collections:       (() => { try { return JSON.parse(r.collections || '[]'); } catch { return []; } })(),
        marcData:          (() => { try { return r.marcData ? JSON.parse(r.marcData) : null; } catch { return null; } })(),
        enrichStatus:      r.enrichStatus || 'none',
        enrichedAt:        r.enrichedAt || null,
      })),
      total,
      hasMore: skip + limit < total,
    };
  }

  // ─── Import ────────────────────────────────────────────────────

  async importDocument(catalogId, { url: docUrl, title, namespace = 'DEFAULT', meta = {}, pdfUrl }) {
    // Use pdfUrl if provided (HTML record pages with embedded PDF links)
    const downloadUrl = pdfUrl || meta?.pdfUrl || docUrl;
    if (!downloadUrl) throw new Error('url is required');

    console.log(`${LOG_PREFIX} Importing: ${downloadUrl}`);

    // Resolve filename
    let filename;
    try {
      const parsed = new url.URL(downloadUrl);
      filename = path.basename(parsed.pathname) || 'document';
      if (!path.extname(filename)) filename += '.pdf';
    } catch {
      filename = (title || 'document').replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';
    }

    // Download
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      httpsAgent,
      headers: { 'User-Agent': 'Mozilla/5.0 UNPA-Ingest/1.0' },
      maxContentLength: 50 * 1024 * 1024,
    });

    const buffer = Buffer.from(response.data);
    const mime   = response.headers['content-type']?.split(';')[0] || 'application/octet-stream';

    if (title) filename = title.substring(0, 120).replace(/[^a-zA-Z0-9._\-\s]/g, '_').trim() + '.' + (path.extname(filename).slice(1) || 'pdf');

    const { documentProcessingService } = require('./document-processing.service');
    const result = await documentProcessingService.uploadDocument(
      buffer, filename, mime,
      namespace,
      { sourceUrl: docUrl, documentTitle: title || null, ...meta }
    );

    // Mark SourceDocument as imported
    if (docUrl) {
      const externalId = docUrl;
      const docId = uuidv5(`${catalogId}::${externalId}`, SOURCE_DOC_NS);
      await mg().runQuery(
        `MATCH (d:SourceDocument {id: $id})
         SET d.importedAt = $now, d.importedDocumentId = $documentId`,
        { id: docId, now: new Date().toISOString(), documentId: result?.id || '' }
      ).catch(() => {});
    }

    // Bump documentCount on source catalog entry
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.documentCount = coalesce(s.documentCount, 0) + 1`,
      { id: catalogId }
    ).catch(() => {});

    return result;
  }

  // ─── Format ────────────────────────────────────────────────────

  _format(r) {
    return {
      id:            r.id,
      name:          r.name,
      description:   r.description || '',
      type:          r.type,
      namespace:     r.namespace,
      config:        parseConfig(r.config),
      tags:          (() => { try { return JSON.parse(r.tags || '[]'); } catch { return []; } })(),
      methodology:   r.methodology || '',
      enabled:       r.enabled !== false,
      documentCount: Number(r.documentCount) || 0,
      createdAt:     r.createdAt,
      updatedAt:     r.updatedAt,
      lastBrowsedAt: r.lastBrowsedAt || null,
    };
  }
}

const sourceCatalogService = new SourceCatalogService();
module.exports = { sourceCatalogService, SourceCatalogService, SOURCE_TYPES };
