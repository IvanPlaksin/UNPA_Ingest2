'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');
  const sources = await sourceCatalogService.list({});
  const targets = sources.filter(s => s.name.startsWith('UN ODS') || s.name === 'UN Digital Library');

  for (const s of targets) {
    const rm = s.config?.responseMapping;
    if (!rm) continue;
    const updated = { ...rm };
    // url[0] can be a string or {value:"..."} — use _source.url.0; unwrap() handles both
    if (updated.url === '_source.url.0.value') updated.url = '_source.url.0';
    await sourceCatalogService.update(s.id, { config: { ...s.config, responseMapping: updated } });
    console.log('Fixed:', s.name, '| url:', updated.url);
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
