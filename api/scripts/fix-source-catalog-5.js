'use strict';
/**
 * fix-source-catalog-5.js — fifth-pass fixes
 * After fourth pass: 32 OK, 3 empty, 3 errors.
 *
 * Errors:
 *   IAEA       — 403 (Atom feed blocked)
 *   UNEP       — 403 (unep.org/resources blocks scrapers)
 *   UNDP       — 404 (api.open.undp.org/api/v1/projects endpoint)
 *
 * Empty:
 *   FAO        — 0 items (openknowledge.fao.org communities page, JS-rendered)
 *   IFAD       — 0 items (ifad.org/en/evaluations, no PDF links in HTML)
 *   UNIDO      — 0 items (response.docs path wrong)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const sources = await sourceCatalogService.list({ namespace: null, type: null });
  const byName = Object.fromEntries(sources.map(s => [s.name, s]));

  const fixes = [

    // ── IAEA: org site blocks all feeds — use IAEA news Atom (different server) ─
    // iaea.org/newscenter/news has a different CDN path that may work
    {
      name: 'IAEA Publications',
      type: 'RSS_FEED',
      description: 'IAEA news Atom feed — nuclear safety, energy, and safeguards updates.',
      config: {
        url: 'https://www.iaea.org/newscenter/news/atom.asp',
        headers: {
          'Referer': 'https://www.iaea.org/',
          'Cache-Control': 'no-cache',
        },
      },
    },

    // ── UNEP: unep.org blocks scrapers — use UNEP WEDOCS DSpace portal ────────
    // wedocs.unep.org is a separate server with different WAF rules
    {
      name: 'UNEP Publications',
      type: 'URL_CATALOG',
      description: 'UNEP WEDOCS document repository (DSpace portal).',
      config: {
        url: 'https://wedocs.unep.org/discover',
        searchUrlTemplate: 'https://wedocs.unep.org/discover?query={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── UNDP: switch to URL_CATALOG on undp.org/publications ─────────────────
    // The open API has unstable endpoints; UNDP publications page is static enough
    {
      name: 'UNDP Publications',
      type: 'URL_CATALOG',
      description: 'UNDP publications portal (HTML scraping).',
      config: {
        url: 'https://www.undp.org/publications',
        searchUrlTemplate: 'https://www.undp.org/publications?search={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── FAO: FAO publications page has static PDF links ───────────────────────
    // openknowledge.fao.org is JS-rendered; fao.org/publications is more static
    {
      name: 'FAO Knowledge Repository',
      type: 'URL_CATALOG',
      description: 'FAO publications catalogue (HTML scraping).',
      config: {
        url: 'https://www.fao.org/publications/find-data/en/',
        searchUrlTemplate: 'https://www.fao.org/search/en/?q={query}&filterfield=subtype&filtervalue=reports',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── IFAD: try IFAD publications portal with more accessible URL ───────────
    {
      name: 'IFAD Documents',
      type: 'URL_CATALOG',
      description: 'IFAD knowledge and publications portal.',
      config: {
        url: 'https://www.ifad.org/en/knowledge-publications',
        searchUrlTemplate: 'https://www.ifad.org/en/search?q={query}',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // ── UNIDO: try root-array mapping (API may return array directly) ─────────
    {
      name: 'UNIDO Publications',
      type: 'REST_API',
      description: 'UNIDO open data API — industrial development publications.',
      config: {
        method: 'GET',
        endpoint: 'https://open.unido.org/api/documents',
        searchParam: 'q',
        defaultQuery: '',
        queryParams: {
          rows:  '25',
          start: '0',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: '',
          title: 'title',
          url:   'url',
          date:  'date',
          total: '',
        },
      },
    },

  ];

  console.log(`\nApplying ${fixes.length} fifth-pass fixes...\n`);
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
