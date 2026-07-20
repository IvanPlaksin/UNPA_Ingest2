'use strict';
/**
 * fix-source-catalog-8.js — eighth-pass fixes
 * After seventh pass: 36 OK, 0 empty, 2 errors.
 *
 * Remaining errors:
 *   UNDP Publications  — ReliefWeb v1 decommissioned (410)
 *   UNIDO Publications — ReliefWeb v1 decommissioned (410)
 *
 * Probe findings:
 *   climatepromise.undp.org/research-and-reports → 200, 69KB, 106 links
 *   stat.unido.org/                              → 200, 108KB, 80 links
 *   All www.undp.org + www.unido.org blocked by Cloudflare
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const sources = await sourceCatalogService.list({ namespace: null, type: null });
  const byName = Object.fromEntries(sources.map(s => [s.name, s]));

  const fixes = [

    // ── UNDP: climatepromise.undp.org accessible — use Climate Promise reports ─
    {
      name: 'UNDP Publications',
      type: 'URL_CATALOG',
      description: 'UNDP Climate Promise research and reports — climate action publications.',
      config: {
        url: 'https://climatepromise.undp.org/research-and-reports',
        searchUrlTemplate: 'https://climatepromise.undp.org/research-and-reports?search={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── UNIDO: stat.unido.org accessible — use UNIDO statistics portal ────────
    {
      name: 'UNIDO Publications',
      type: 'URL_CATALOG',
      description: 'UNIDO statistical portal — industrial development data and reports.',
      config: {
        url: 'https://stat.unido.org/',
        searchUrlTemplate: 'https://stat.unido.org/?search={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

  ];

  console.log(`\nApplying ${fixes.length} eighth-pass fixes...\n`);
  let ok = 0, skip = 0, err = 0;

  for (const fix of fixes) {
    const s = byName[fix.name];
    if (!s) { console.log(`  ⊘ Not found: "${fix.name}"`); skip++; continue; }
    const patch = {};
    if (fix.type)        patch.type        = fix.type;
    if (fix.config)      patch.config      = fix.config;
    if (fix.description) patch.description = fix.description;
    try {
      await sourceCatalogService.update(s.id, patch);
      console.log(`  ✓ Fixed: [${fix.type || s.type}] ${fix.name}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ Failed: ${fix.name}: ${e.message}`);
      err++;
    }
  }

  console.log(`\n  Updated: ${ok}  Skipped: ${skip}  Failed: ${err}\n`);
  process.exit(err > 0 ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
