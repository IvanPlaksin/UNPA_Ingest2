'use strict';
/**
 * Per-source adapter — UN iSeek Intranet (un-iseek).
 * Family: url-catalog.
 *
 * Pass 1: public layer crawl.
 *   1. Fetch A-Z Index (/en/nyc/iseek-index-un-resources) → dept page URLs.
 *   2. For each dept page, fetch → collect sub-page links + direct PDF links.
 *   3. For each sub-page (one level deeper), fetch → collect PDF links.
 *   4. Harvest all iseek.un.org/sites/default/files/*.pdf — publicly accessible.
 *
 * Cross-references: undocs.org/documents.un.org links are extracted as metadata
 * (symbol + URL) for REFERENCES edges, NOT as independent source documents.
 *
 * Download: direct GET on iseek.un.org/sites/default/files/ — no redirect needed.
 *
 * Probed: 2026-07-07. Public layer verified: 139 dept pages, direct PDF access (HTTP 200).
 * Auth: OpenID Connect (Microsoft Azure AD, tenant 0f9e35db-544f-4f60-bdcc-5ea416e6dc70).
 */

const { UrlCatalogAdapter, HTML_HEADERS } = require('../family/url-catalog.adapter');
const { axios, httpsAgent } = require('../lib/http');

const BASE_URL   = 'https://iseek.un.org';
const AZ_INDEX   = `${BASE_URL}/en/nyc/iseek-index-un-resources`;
const FILES_BASE = `${BASE_URL}/sites/default/files/`;
const DEFAULT_DELAY = 800; // ms — polite delay; no Crawl-delay in robots.txt

// UN document symbol pattern (ST/SGB/YYYY/N, ST/AI/YYYY/N, etc.)
const SYMBOL_RE = /\b(ST\/[A-Z]+\/\d{4}\/\d+(?:\/[A-Za-z]+\.\d+)?|A\/RES\/\d+\/\d+|A\/\d+\/\d+)\b/g;

// ── HTML parsers ────────────────────────────────────────────────

function extractDeptLinks(html) {
  const links = [];
  const re = /href="(\/en\/nyc\/[^"#?]+)"/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) !== null) {
    const path = m[1];
    if (seen.has(path)) continue;
    // Exclude login, search, standard nav, and language-switcher paths
    if (/\/(user|search|iseek-search|iseek-index|iseek-faqs|learning\/submit|news-staff|news$|united-nations-global|form\/|dgc\/od\/ksd\/iseek|SGpriorities|UN80)/.test(path)) continue;
    seen.add(path);
    links.push(path);
  }
  return links;
}

function extractPdfLinks(html, pageUrl) {
  const results = [];
  const seen = new Set();

  // Direct iseek /sites/default/files/ PDFs
  const pdfRe = /href="(https?:\/\/iseek\.un\.org\/sites\/default\/files\/[^"]+\.pdf)"\s*(?:[^>]*)?>([^<]*)</gi;
  let m;
  while ((m = pdfRe.exec(html)) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const rawTitle = m[2].replace(/\s+/g, ' ').trim();
    const filename  = url.split('/').pop() || '';
    const title     = rawTitle || filenameToTitle(filename);
    results.push({ url, title, filename, sourcePageUrl: pageUrl });
  }

  return results;
}

function extractUndocsRefs(html) {
  const refs = [];
  const re = /href="https?:\/\/(?:undocs\.org|documents\.un\.org)\/([^"?#]+)"/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(html)) !== null) {
    const raw    = m[1].replace(/^doc\//, '').trim();
    const symbol = decodeURIComponent(raw).toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    refs.push({ symbol, url: `https://undocs.org/${encodeURIComponent(symbol)}` });
  }
  return refs;
}

function filenameToTitle(filename) {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function extractDeptName(path) {
  const parts = path.replace(/^\/en\/nyc\//, '').split('/');
  return parts[0] || 'Unknown';
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Adapter class ───────────────────────────────────────────────

class UnIseekAdapter extends UrlCatalogAdapter {
  static key          = 'un-iseek';
  static family       = 'url-catalog';
  static capabilities = ['search', 'browseAll', 'paginate', 'download'];
  static filterSchema = [
    {
      type:  'department',
      param: 'dept',
      label: 'Department / Office',
      notes: 'Filter results to a specific UN Secretariat department (e.g. DMSPC, OLA)',
    },
  ];
  static downloadMode = 'direct-pdf';
  static notes        = 'UN iSeek Intranet public layer. 139+ UN Secretariat department pages, direct PDF access. Auth: OpenID Connect (Microsoft Azure AD). Pass 1: /sites/default/files/ PDFs only.';
  static defaultConfig = {
    adapterKey:  'un-iseek',
    politeDelay: DEFAULT_DELAY,
    maxDepth:    1, // 0 = dept pages only, 1 = dept + one sub-level
  };

  // ── Internal: fetch dept page URLs from A-Z Index ──────────────

  async _fetchDeptPages() {
    const resp = await axios.get(AZ_INDEX, {
      timeout: 30000, httpsAgent,
      headers: HTML_HEADERS, maxRedirects: 5,
    });
    return extractDeptLinks(resp.data);
  }

  // ── Internal: fetch PDF links from a single page ──────────────

  async _fetchPagePdfs(path) {
    const url = `${BASE_URL}${path}`;
    try {
      const resp = await axios.get(url, {
        timeout: 20000, httpsAgent,
        headers: HTML_HEADERS, maxRedirects: 5,
      });
      const pdfs    = extractPdfLinks(resp.data, url);
      const subLinks = extractDeptLinks(resp.data).filter(l => l.startsWith(path) && l !== path);
      const undocsRefs = extractUndocsRefs(resp.data);
      return { pdfs, subLinks, undocsRefs };
    } catch (err) {
      return { pdfs: [], subLinks: [], undocsRefs: [] };
    }
  }

  // ── search() — main catalog discovery method ──────────────────

  async search({ query = '', page = 1, limit = 25, filters = {} } = {}) {
    const delay    = this.config.politeDelay ?? DEFAULT_DELAY;
    const maxDepth = this.config.maxDepth ?? 1;

    // Step 1: A-Z Index → dept page paths
    const deptPaths = await this._fetchDeptPages();

    // Filter by dept if requested
    const filteredPaths = filters.dept
      ? deptPaths.filter(p => p.toLowerCase().includes(filters.dept.toLowerCase()))
      : deptPaths;

    const allPdfs = [];
    const seenUrls = new Set();

    // Step 2: crawl each dept page
    for (const deptPath of filteredPaths) {
      if (delay > 0) await sleep(delay);
      const { pdfs: deptPdfs, subLinks, undocsRefs } = await this._fetchPagePdfs(deptPath);
      const dept = extractDeptName(deptPath);

      for (const pdf of deptPdfs) {
        if (seenUrls.has(pdf.url)) continue;
        seenUrls.add(pdf.url);
        allPdfs.push(this._normalise(pdf, dept, undocsRefs));
      }

      // Step 3: one level deeper (sub-pages within same dept)
      if (maxDepth >= 1) {
        for (const subPath of subLinks.slice(0, 20)) { // cap per dept
          if (delay > 0) await sleep(delay);
          const { pdfs: subPdfs, undocsRefs: subRefs } = await this._fetchPagePdfs(subPath);
          for (const pdf of subPdfs) {
            if (seenUrls.has(pdf.url)) continue;
            seenUrls.add(pdf.url);
            allPdfs.push(this._normalise(pdf, dept, subRefs));
          }
        }
      }
    }

    // Query filter
    const filtered = query
      ? allPdfs.filter(r =>
          r.title.toLowerCase().includes(query.toLowerCase()) ||
          (r.symbol && r.symbol.toLowerCase().includes(query.toLowerCase())) ||
          (r.metadata?.department && r.metadata.department.toLowerCase().includes(query.toLowerCase()))
        )
      : allPdfs;

    const start = (page - 1) * limit;
    return {
      results:  filtered.slice(start, start + limit),
      total:    filtered.length,
      hasMore:  filtered.length > start + limit,
    };
  }

  // ── resolveDownload() — direct GET, no redirect needed ───────

  async resolveDownload(item) {
    const url = item?.pdfUrl || item?.url || '';
    if (!url || !url.includes('/sites/default/files/')) {
      return { downloadUrl: url, filename: null, mime: 'application/pdf' };
    }
    const filename = url.split('/').pop() || null;
    return { downloadUrl: url, filename, mime: 'application/pdf' };
  }

  // ── Internal: normalise PDF entry ───────────────────────────

  _normalise(pdf, dept, undocsRefs) {
    // Try to extract a UN document symbol from the title or filename
    const symbolMatch = (pdf.title + ' ' + pdf.filename).match(SYMBOL_RE);
    const symbol = symbolMatch ? symbolMatch[0] : null;

    return {
      title:   pdf.title,
      url:     pdf.sourcePageUrl,
      pdfUrl:  pdf.url,
      fileType: 'pdf',
      date:    null, // iSeek pages don't expose structured dates in the HTML
      symbol,
      metadata: {
        department:   dept,
        issuingBody:  'SECRETARIAT',
        sourcePortal: 'iseek.un.org',
        filename:     pdf.filename,
        undocsRefs:   undocsRefs.slice(0, 10).map(r => r.symbol), // cross-refs (not harvested as docs)
      },
    };
  }
}

module.exports = UnIseekAdapter;
