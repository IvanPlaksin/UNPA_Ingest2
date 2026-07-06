'use strict';
/**
 * RssFeedAdapter — family base for RSS / Atom feeds.
 * Ports SourceCatalogService._browseRssFeed. Search is client-side substring
 * filtering over the feed items (RSS has no server query API); optional
 * client-side date filtering when a dateFrom/dateTo filter is declared.
 */

const { SourceAdapter } = require('../base.adapter');
const { axios, httpsAgent } = require('../lib/http');
const { parseRssItems } = require('../lib/parse');

class RssFeedAdapter extends SourceAdapter {
  static key    = 'rss-feed';
  static family = 'rss-feed';
  static capabilities = ['search', 'browseAll', 'paginate'];
  static downloadMode = 'record-page';

  async search({ query = '', page = 1, limit = 20, filters = {} } = {}) {
    const cfg = this.config;
    if (!cfg.url) throw new Error('Feed URL not configured');

    const response = await axios.get(cfg.url, {
      timeout: 15000, httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        ...(cfg.headers || {}),
      },
    });

    let all = parseRssItems(response.data, query);

    // Client-side date filtering (RSS has no server filter).
    if (this.supports('filter') && (filters.dateFrom || filters.dateTo)) {
      const from = filters.dateFrom ? Date.parse(filters.dateFrom) : null;
      const to   = filters.dateTo   ? Date.parse(filters.dateTo)   : null;
      all = all.filter(it => {
        if (!it.date) return true;
        const t = Date.parse(it.date);
        if (Number.isNaN(t)) return true;
        if (from != null && t < from) return false;
        if (to   != null && t > to)   return false;
        return true;
      });
    }

    const start = (page - 1) * limit;
    return { results: all.slice(start, start + limit), total: all.length, hasMore: all.length > start + limit };
  }
}

module.exports = { RssFeedAdapter };
