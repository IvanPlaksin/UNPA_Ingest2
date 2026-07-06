'use strict';
/**
 * OdsAdapter — family base for the UN Official Document System (legacy type).
 * Ports SourceCatalogService._browseOds: scrapes documents.un.org, falling back
 * to the Digital Library recjson API when ODS is unavailable.
 *
 * NOTE: current ODS sources are configured as Invenio REST_API entries; this
 * family remains for the ODS_API source type and backwards compatibility.
 */

const url  = require('url');
const path = require('path');
const { SourceAdapter } = require('../base.adapter');
const { axios, httpsAgent } = require('../lib/http');
const { extractLinksFromHtml } = require('../lib/parse');

class OdsAdapter extends SourceAdapter {
  static key    = 'ods';
  static family = 'ods';
  static capabilities = ['search', 'browseAll', 'paginate', 'download'];
  static downloadMode = 'direct-pdf';

  async search({ query = '', page = 1, limit = 20 } = {}) {
    const cfg = this.config;
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
}

module.exports = { OdsAdapter };
