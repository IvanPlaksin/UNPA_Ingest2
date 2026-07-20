'use strict';
/**
 * Per-source adapter — UN Secretariat Policy Portal (un-policy-portal).
 * Family: url-catalog. Covers the four public browse endpoints:
 *   - Secretary-General's Bulletins (ST/SGB)
 *   - Administrative Instructions (ST/AI)
 *   - Information Circulars (ST/IC)
 *   - Policy Guidelines (OHRM/PG, etc.)
 *
 * Listing:   policy.un.org Drupal Views tables — HTML parsing with pagination.
 * Download:  documents.un.org/api/symbol/access?s={symbol}&l=en&t=pdf (302 → PDF).
 *
 * Probed: 2026-07-07. All four browse endpoints return HTTP 200 public HTML.
 * ODS symbol access API verified on ST/SGB/2024/3, ST/AI/2022/2, ST/SGB/2007/6.
 */

const { UrlCatalogAdapter, HTML_HEADERS } = require('../family/url-catalog.adapter');
const { axios, httpsAgent } = require('../lib/http');

const ODS_PDF_API = 'https://documents.un.org/api/symbol/access';
const DEFAULT_DELAY = 1000; // ms polite delay between requests

const BROWSE_ENDPOINTS = [
  {
    url: 'https://policy.un.org/en/browse-source/secretary-generals-bulletins-sgbs',
    docType: 'SGB',
    issuingBody: 'SECRETARIAT',
    documentType: 'SGB_BULLETIN',
  },
  {
    url: 'https://policy.un.org/en/browse-source/administrative-instructions-ais',
    docType: 'AI',
    issuingBody: 'SECRETARIAT',
    documentType: 'ADMINISTRATIVE_INSTRUCTION',
  },
  {
    url: 'https://policy.un.org/en/browse-source/information-circulars-ics',
    docType: 'IC',
    issuingBody: 'SECRETARIAT',
    documentType: 'INFORMATION_CIRCULAR',
  },
  {
    url: 'https://policy.un.org/en/browse-source/policy-guidelines',
    docType: 'PG',
    issuingBody: 'SECRETARIAT',
    documentType: 'POLICY_GUIDELINE',
  },
];

// ── HTML parsers ────────────────────────────────────────────────

/**
 * Parse Drupal views-view-table rows.
 * Columns: Year | Symbol | Title | Date published
 */
function parseTableRows(html, endpoint) {
  const results = [];

  // Extract the <tbody>...</tbody> block
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return results;

  const tbody = tbodyMatch[1];
  const rowRe = /<tr>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRe.exec(tbody)) !== null) {
    const rowHtml = rowMatch[1];
    // Extract text content of each <td> cell
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRe.exec(rowHtml)) !== null) {
      const text = tdMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      cells.push(text);
    }

    // Expect at least [Year, Symbol, Title] — Date optional
    if (cells.length < 3) continue;
    const symbol = cells[1] ? cells[1].trim() : '';
    if (!symbol || !symbol.includes('/')) continue;

    const title = cells[2] ? cells[2].trim() : symbol;
    const rawDate = cells[3] ? cells[3].trim() : '';

    // Convert DD/MM/YYYY → YYYY-MM-DD
    let date = null;
    const dm = rawDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dm) date = `${dm[3]}-${dm[2]}-${dm[1]}`;

    results.push({
      title: title || symbol,
      url:   `https://docs.un.org/en/${encodeURIComponent(symbol)}`,
      pdfUrl: `${ODS_PDF_API}?s=${encodeURIComponent(symbol)}&l=en&t=pdf`,
      fileType: 'pdf',
      date,
      symbol,
      metadata: {
        issuingBody:  endpoint.issuingBody,
        documentType: endpoint.documentType,
        docTypeCode:  endpoint.docType,
        sourcePortal: 'policy.un.org',
      },
    });
  }

  return results;
}

/**
 * Extract block_config_key and total page count from pagination HTML.
 * Returns { key: string|null, totalPages: number }.
 * Note: Drupal HTML-encodes ampersands as &amp; in href attributes.
 */
function extractPagination(html) {
  // Decode HTML entities in href attributes before matching
  const decoded = html.replace(/&amp;/g, '&');

  // Match the first block_config_key in a pagination href
  const keyMatch = decoded.match(/[?&]block_config_key=([^&"'\s]+)/);
  const key = keyMatch ? keyMatch[1] : null;

  // Count highest page= value in pagination links (0-indexed → +1)
  let totalPages = 1;
  const pageRe = /[?&]page=(\d+)/g;
  let pm;
  while ((pm = pageRe.exec(decoded)) !== null) {
    const n = parseInt(pm[1], 10) + 1;
    if (n > totalPages) totalPages = n;
  }

  return { key, totalPages };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Adapter class ───────────────────────────────────────────────

class UnPolicyPortalAdapter extends UrlCatalogAdapter {
  static key          = 'un-policy-portal';
  static family       = 'url-catalog';
  static capabilities = ['search', 'browseAll', 'paginate', 'download'];
  static filterSchema = [
    {
      type:    'documentType',
      param:   'type',
      label:   'Document type',
      options: ['SGB', 'AI', 'IC', 'PG'],
      notes:   'Filter to a single document type browse endpoint',
    },
  ];
  static downloadMode = 'direct-pdf';
  static notes        = 'UN Secretariat Policy Portal. SGBs, AIs, ICs, Policy Guidelines. PDF via ODS symbol API (documents.un.org). Verified public access, no auth required.';
  static defaultConfig = {
    adapterKey:  'un-policy-portal',
    politeDelay: DEFAULT_DELAY,
    language:    'en',
  };

  // ── Internal: fetch all rows from one browse endpoint ──────────

  async _fetchEndpoint(endpoint) {
    const delay = this.config.politeDelay ?? DEFAULT_DELAY;
    const results = [];

    // Page 1 (no query params)
    const resp1 = await axios.get(endpoint.url, {
      timeout: 30000,
      httpsAgent,
      headers: HTML_HEADERS,
      maxRedirects: 5,
    });
    const html1 = resp1.data;
    results.push(...parseTableRows(html1, endpoint));

    const { key, totalPages } = extractPagination(html1);

    // Pages 2…N (0-indexed: page=1, page=2, …)
    for (let p = 1; p < totalPages; p++) {
      if (delay > 0) await sleep(delay);
      const pageUrl = key
        ? `${endpoint.url}?block_config_key=${key}&page=${p}`
        : `${endpoint.url}?page=${p}`;
      try {
        const respN = await axios.get(pageUrl, {
          timeout: 30000,
          httpsAgent,
          headers: HTML_HEADERS,
          maxRedirects: 5,
        });
        results.push(...parseTableRows(respN.data, endpoint));
      } catch (err) {
        console.warn(`[UnPolicyPortalAdapter] Page ${p} failed for ${endpoint.url}: ${err.message}`);
      }
    }

    return results;
  }

  // ── search() — main catalog discovery method ──────────────────

  async search({ query = '', page = 1, limit = 25, filters = {} } = {}) {
    const delay = this.config.politeDelay ?? DEFAULT_DELAY;

    const endpoints = BROWSE_ENDPOINTS.filter(e =>
      !filters.type || e.docType === filters.type
    );

    const allResults = [];
    for (const endpoint of endpoints) {
      try {
        const rows = await this._fetchEndpoint(endpoint);
        allResults.push(...rows);
        if (delay > 0 && endpoint !== endpoints[endpoints.length - 1]) {
          await sleep(delay);
        }
      } catch (err) {
        console.warn(`[UnPolicyPortalAdapter] Endpoint ${endpoint.docType} failed: ${err.message}`);
      }
    }

    // Query filter
    const filtered = query
      ? allResults.filter(r =>
          r.title.toLowerCase().includes(query.toLowerCase()) ||
          (r.symbol && r.symbol.toLowerCase().includes(query.toLowerCase()))
        )
      : allResults;

    const start = (page - 1) * limit;
    return {
      results:  filtered.slice(start, start + limit),
      total:    filtered.length,
      hasMore:  filtered.length > start + limit,
    };
  }

  // ── resolveDownload() — ODS symbol → direct PDF URL ───────────

  async resolveDownload(item) {
    const symbol = item?.symbol || item?.metadata?.symbol;
    if (!symbol) {
      const fallback = item?.pdfUrl || item?.url || '';
      return { downloadUrl: fallback, filename: null, mime: 'application/pdf' };
    }

    const apiUrl = `${ODS_PDF_API}?s=${encodeURIComponent(symbol)}&l=${this.config.language || 'en'}&t=pdf`;

    try {
      const resp = await axios.get(apiUrl, {
        timeout: 15000,
        httpsAgent,
        maxRedirects: 0,  // capture the 302 location header directly
        validateStatus: s => s >= 200 && s < 400,
        headers: { 'User-Agent': HTML_HEADERS['User-Agent'] },
      });

      const redirectUrl = resp.headers?.location;
      if (redirectUrl) {
        const filename = redirectUrl.split('/').pop() || `${symbol.replace(/\//g, '_')}.PDF`;
        return { downloadUrl: redirectUrl, filename, mime: 'application/pdf' };
      }
    } catch (err) {
      // Axios throws on 3xx when maxRedirects=0; extract location from error
      const location = err?.response?.headers?.location;
      if (location) {
        const filename = location.split('/').pop() || `${symbol.replace(/\//g, '_')}.PDF`;
        return { downloadUrl: location, filename, mime: 'application/pdf' };
      }
    }

    // Fallback: return the API URL itself (browser will follow redirect)
    return { downloadUrl: apiUrl, filename: null, mime: 'application/pdf' };
  }
}

module.exports = UnPolicyPortalAdapter;
