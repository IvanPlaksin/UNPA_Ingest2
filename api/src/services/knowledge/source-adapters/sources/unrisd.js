'use strict';
/**
 * Per-source adapter — UNRISD Publications (unrisd).
 * Family: rss-feed. Auto-generated from research/unrisd.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { RssFeedAdapter } = require('../family/rss-feed.adapter');

class UnrisdAdapter extends RssFeedAdapter {
  static key          = "unrisd";
  static family       = "rss-feed";
  static capabilities = ["browseAll","paginate","filter","download"];
  static filterSchema = [
    {
      "type": "dateFrom",
      "param": "_clientDateFrom",
      "label": "From date",
      "clientSide": true
    },
    {
      "type": "dateTo",
      "param": "_clientDateTo",
      "label": "To date",
      "clientSide": true
    },
    {
      "type": "keyword",
      "param": "_clientKeyword",
      "label": "Keyword (title/description)",
      "clientSide": true
    }
  ];
  static downloadMode = "record-page";
  static notes        = "Limited/unverified: The endpoint returns an HTML single-page-application shell (Content-Type text/html), not XML. The site is a Vue SPA: every probed path (/feed, /rss, /feed.xml, /rss.xml, /en/rss, /publications/feed, /feed/rss) returns HTTP 200 with the same";
  static defaultConfig = {
    "adapterKey": "unrisd",
    "url": "https://www.unrisd.org/feed"
  };
}

module.exports = UnrisdAdapter;
