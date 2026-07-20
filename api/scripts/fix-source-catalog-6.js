'use strict';
/**
 * fix-source-catalog-6.js — sixth-pass fixes
 * After fifth pass: 32 OK, 1 empty, 5 errors.
 *
 * Key findings from probe-apis.js:
 *   - open.unido.org/api/documents returns HTML (SPA route, not REST API)
 *   - www-nds.iaea.org/publications/ returns real 11KB static HTML
 *   - www.fao.org/publications/en/ returns real 48KB static HTML
 *   - IAEA all RSS/Atom feeds return 403
 *   - undp.org and unep.org blocked by Cloudflare
 *   - IFAD /knowledge-hub returns 404
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const sources = await sourceCatalogService.list({ namespace: null, type: null });
  const byName = Object.fromEntries(sources.map(s => [s.name, s]));

  const fixes = [

    // ── IAEA: www-nds.iaea.org is static HTML — different from www.iaea.org ────
    {
      name: 'IAEA Publications',
      type: 'URL_CATALOG',
      description: 'IAEA Nuclear Data Section publications — static HTML catalogue.',
      config: {
        url: 'https://www-nds.iaea.org/publications/',
        searchUrlTemplate: 'https://www-nds.iaea.org/publications/',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // ── FAO: fao.org/publications/en/ is 48KB static HTML — should have links ──
    {
      name: 'FAO Knowledge Repository',
      type: 'URL_CATALOG',
      description: 'FAO publications catalogue — food, agriculture, forestry and fisheries.',
      config: {
        url: 'https://www.fao.org/publications/en/',
        searchUrlTemplate: 'https://www.fao.org/search/en/?q={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── IFAD: try the direct /publications path on ifad.org ──────────────────
    {
      name: 'IFAD Documents',
      type: 'URL_CATALOG',
      description: 'IFAD publications and evaluation reports.',
      config: {
        url: 'https://www.ifad.org/en/publications',
        searchUrlTemplate: 'https://www.ifad.org/en/search?q={query}',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // ── UNDP: www.undp.org blocked — use UNDP Knowledge Hub on data.undp.org ──
    // UNDP Climate Promise publishes accessible reports
    {
      name: 'UNDP Publications',
      type: 'URL_CATALOG',
      description: 'UNDP publications and research reports (data.undp.org portal).',
      config: {
        url: 'https://data.undp.org/content/',
        searchUrlTemplate: 'https://data.undp.org/content/?search={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── UNEP: all unep.org subdomains blocked — use InforMEA (UNEP-managed MEAs) ─
    {
      name: 'UNEP Publications',
      type: 'URL_CATALOG',
      description: 'InforMEA (UNEP) — multilateral environmental agreement documentation.',
      config: {
        url: 'https://www.informea.org/en/search/node',
        searchUrlTemplate: 'https://www.informea.org/en/search/node/{query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── UNIDO: open.unido.org is SPA — switch to static UNIDO publications page ─
    {
      name: 'UNIDO Publications',
      type: 'URL_CATALOG',
      description: 'UNIDO publications and industrial development reports.',
      config: {
        url: 'https://www.unido.org/resources/publications',
        searchUrlTemplate: 'https://www.unido.org/search?q={query}&f%5B0%5D=type%3Apublication',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

  ];

  console.log(`\nApplying ${fixes.length} sixth-pass fixes...\n`);
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
