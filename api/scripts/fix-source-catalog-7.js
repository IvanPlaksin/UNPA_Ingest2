'use strict';
/**
 * fix-source-catalog-7.js — seventh-pass fixes
 * After sixth pass: 32 OK, 2 empty, 4 errors.
 *
 * Probe findings:
 *   IAEA NDS    — 11KB static HTML, 20 links, 0 direct .pdf hrefs → remove filter
 *   IFAD /knowledge — 213KB, 235 links → use this URL
 *   InforMEA /documents — 625KB, 27 PDF links → use for UNEP
 *   UNDP/UNIDO  — all undp.org + unido.org blocked → use ReliefWeb open API
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const sources = await sourceCatalogService.list({ namespace: null, type: null });
  const byName = Object.fromEntries(sources.map(s => [s.name, s]));

  const fixes = [

    // ── IAEA: NDS has 20 links but no .pdf in hrefs — remove filter ───────────
    {
      name: 'IAEA Publications',
      type: 'URL_CATALOG',
      description: 'IAEA Nuclear Data Section publications — nuclear safety and energy reports.',
      config: {
        url: 'https://www-nds.iaea.org/publications/',
        searchUrlTemplate: 'https://www-nds.iaea.org/publications/',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── IFAD: /en/knowledge (213KB, 235 links) works, /en/publications is 404 ─
    {
      name: 'IFAD Documents',
      type: 'URL_CATALOG',
      description: 'IFAD knowledge hub — rural development and food security reports.',
      config: {
        url: 'https://www.ifad.org/en/knowledge',
        searchUrlTemplate: 'https://www.ifad.org/en/search?q={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── UNEP: InforMEA /en/documents has 27 PDF links ─────────────────────────
    {
      name: 'UNEP Publications',
      type: 'URL_CATALOG',
      description: 'InforMEA (UNEP MEA platform) — multilateral environmental agreements.',
      config: {
        url: 'https://www.informea.org/en/documents',
        searchUrlTemplate: 'https://www.informea.org/en/search/{query}',
        linkFilter: '.pdf',
        includeAllLinks: false,
      },
    },

    // ── UNDP: all undp.org URLs blocked — use ReliefWeb open API ─────────────
    // ReliefWeb API (reliefweb.int) has content from all major UN agencies.
    // Filter by source = UNDP to get UNDP-published humanitarian reports.
    {
      name: 'UNDP Publications',
      type: 'REST_API',
      description: 'UNDP reports via ReliefWeb open API (humanitarian situation reports).',
      config: {
        method: 'GET',
        endpoint: 'https://api.reliefweb.int/v1/reports',
        searchParam: 'query[value]',
        defaultQuery: '',
        queryParams: {
          appname:               'unpa-ingest',
          'filter[field]':       'source',
          'filter[value]':       'UNDP',
          limit:                 '25',
          'fields[include][]':   'title',
          'sort[]':              'date:desc',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'data',
          title: 'fields.title',
          url:   'fields.url_alias',
          date:  'fields.date.created',
          total: 'totalCount',
        },
      },
    },

    // ── UNIDO: all unido.org blocked — use ReliefWeb API filtered by UNIDO ────
    {
      name: 'UNIDO Publications',
      type: 'REST_API',
      description: 'UNIDO reports via ReliefWeb open API.',
      config: {
        method: 'GET',
        endpoint: 'https://api.reliefweb.int/v1/reports',
        searchParam: 'query[value]',
        defaultQuery: '',
        queryParams: {
          appname:               'unpa-ingest',
          'filter[field]':       'source',
          'filter[value]':       'UNIDO',
          limit:                 '25',
          'fields[include][]':   'title',
          'sort[]':              'date:desc',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'data',
          title: 'fields.title',
          url:   'fields.url_alias',
          date:  'fields.date.created',
          total: 'totalCount',
        },
      },
    },

  ];

  console.log(`\nApplying ${fixes.length} seventh-pass fixes...\n`);
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
