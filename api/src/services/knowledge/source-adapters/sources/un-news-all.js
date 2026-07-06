'use strict';
/**
 * Per-source adapter — UN News — All Topics (un-news-all).
 * Family: rss-feed. Auto-generated from research/un-news-all.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { RssFeedAdapter } = require('../family/rss-feed.adapter');

class UnNewsAllAdapter extends RssFeedAdapter {
  static key          = "un-news-all";
  static family       = "rss-feed";
  static capabilities = ["search","browseAll","paginate","filter","download"];
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
  static notes        = "Feed returns only the most recent ~30 items; no historical pagination beyond the feed window and no archive parameter.";
  static defaultConfig = {
    "adapterKey": "un-news-all",
    "url": "https://news.un.org/feed/subscribe/en/news/all/rss.xml"
  };
}

module.exports = UnNewsAllAdapter;
