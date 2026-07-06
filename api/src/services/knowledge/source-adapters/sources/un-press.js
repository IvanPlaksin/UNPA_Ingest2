'use strict';
/**
 * Per-source adapter — UN Press Releases (un-press).
 * Family: rss-feed. Auto-generated from research/un-press.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { RssFeedAdapter } = require('../family/rss-feed.adapter');

class UnPressAdapter extends RssFeedAdapter {
  static key          = "un-press";
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
  static notes        = "Feed returns only the most recent ~10 items — a notably small window; no historical pagination and no archive parameter, so frequent polling is required to avoid missing releases.";
  static defaultConfig = {
    "adapterKey": "un-press",
    "url": "https://press.un.org/en/rss.xml"
  };
}

module.exports = UnPressAdapter;
