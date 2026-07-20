'use strict';
/**
 * fix-source-catalog-10.js — deactivate 3 SPA-only sources inaccessible server-side.
 *
 * UNU Collections   — HTTP 202 (Invenio async) on all URLs
 * WMO Library       — 10KB JS-shell SPA, 0 links on all URLs
 * UNRISD Publications — 997B JS-shell SPA, 0 links on all URLs
 *
 * These require JavaScript rendering (Puppeteer/Playwright). Deactivate to keep
 * the active catalog 100% functional.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const sources = await sourceCatalogService.list({ namespace: null, type: null });
  const byName = Object.fromEntries(sources.map(s => [s.name, s]));

  const toDeactivate = ['UNU Collections', 'WMO Library', 'UNRISD Publications'];

  let ok = 0, err = 0;
  for (const name of toDeactivate) {
    const s = byName[name];
    if (!s) { console.log(`  ⊘ Not found: "${name}"`); continue; }
    try {
      await sourceCatalogService.update(s.id, { isActive: false });
      console.log(`  ✓ Deactivated: ${name}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ Failed: ${name}: ${e.message}`);
      err++;
    }
  }

  console.log(`\n  Deactivated: ${ok}  Failed: ${err}\n`);
  process.exit(err > 0 ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
