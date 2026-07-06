'use strict';
/**
 * Per-source adapter — UN News — Humanitarian Aid (un-news-humanitarian).
 * Family: rss-feed. Auto-generated from research/un-news-humanitarian.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { RssFeedAdapter } = require('../family/rss-feed.adapter');

class UnNewsHumanitarianAdapter extends RssFeedAdapter {
  static key          = "un-news-humanitarian";
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
    "adapterKey": "un-news-humanitarian",
    "url": "https://news.un.org/feed/subscribe/en/news/topic/humanitarian-aid/feed/rss.xml"
  };
}

module.exports = UnNewsHumanitarianAdapter;
