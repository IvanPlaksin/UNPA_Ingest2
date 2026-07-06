'use strict';
/**
 * Pure parsing / normalization helpers shared by source adapters.
 * Extracted verbatim from the original source-catalog.service.js so that the
 * adapter refactor preserves existing browse behavior exactly.
 */

const path = require('path');
const url  = require('url');

// ── URL / object helpers ──────────────────────────────────────

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

// Find English PDF URL from UN Digital Library files array
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

// ── Multilingual field unwrap (REST responses) ────────────────
// Unwrap {value:"...",lang:"..."} style fields → plain string.

function unwrap(v, depth = 0) {
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
}

// Prefer the English entry in a language-tagged array, else the first.
function unwrapEn(v) {
  if (!Array.isArray(v)) return unwrap(v);
  const en = v.find(x => x && typeof x === 'object' &&
    (x.lang === 'en' || x.lang === 'English' || x.language === 'en' || x.language === 'English'));
  return unwrap(en || v[0]);
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

// ── RSS / Atom parser ─────────────────────────────────────────

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

// ── OAI-PMH parser ────────────────────────────────────────────

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

module.exports = {
  getExt,
  nested,
  parseConfig,
  serializeConfig,
  normalizeSymbol,
  findEnglishPdf,
  unwrap,
  unwrapEn,
  extractLinksFromHtml,
  parseRssItems,
  parseOaiPmhRecords,
};
