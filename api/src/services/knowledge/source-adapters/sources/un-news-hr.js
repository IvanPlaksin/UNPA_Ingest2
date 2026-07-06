'use strict';
/**
 * Per-source adapter — UN News — Human Rights (un-news-hr).
 * Family: rss-feed. Auto-generated from research/un-news-hr.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { RssFeedAdapter } = require('../family/rss-feed.adapter');

class UnNewsHrAdapter extends RssFeedAdapter {
  static key          = "un-news-hr";
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
  static notes        = "Feed returns only the most recent ~30 items (observed span July back to late May); no historical pagination beyond the feed window.";
  static defaultConfig = {
    "adapterKey": "un-news-hr",
    "url": "https://news.un.org/feed/subscribe/en/news/topic/human-rights/feed/rss.xml"
  };
}

module.exports = UnNewsHrAdapter;
