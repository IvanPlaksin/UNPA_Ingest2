'use strict';
/**
 * Fix responseMapping for all DL/ODS sources.
 *
 * DL recjson format: plain array at root (NOT hits.hits), each item has:
 *   - recid: integer record ID
 *   - title: [{value:"...", lang:"en"}, ...] array of multilingual title objects
 *   - date: "YYYY-MM-DD" string
 *   - files: [{full_name:"S_RES_...", eformat:".pdf", ...}]
 *   - NO top-level url field — construct from recid
 *
 * Fixes:
 *   items: "" (empty = root array, current "hits.hits" works as fallback but causes confusion)
 *   title: "title" (let unwrap() handle [{value,lang}] array)
 *   url: "recid" + urlPrefix "https://digitallibrary.un.org/record/"
 *   date: "date"
 *   symbol: "files.0.name" (filename encodes the symbol like "S_RES_2319_2016_-EN")
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');
  const sources = await sourceCatalogService.list({});

  const dlMapping = {
    items:     '',
    title:     'title',
    url:       'recid',
    urlPrefix: 'https://digitallibrary.un.org/record/',
    date:      'date',
    total:     '',
    symbol:    'files.0.name',
  };

  const targets = sources.filter(s => s.name.startsWith('UN ODS') || s.name === 'UN Digital Library');
  for (const s of targets) {
    await sourceCatalogService.update(s.id, {
      config: { ...s.config, responseMapping: dlMapping },
    });
    console.log('Updated:', s.name);
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
