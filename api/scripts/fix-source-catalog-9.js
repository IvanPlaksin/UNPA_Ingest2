'use strict';
/**
 * fix-source-catalog-9.js — ninth-pass fixes for new sources added in Phase 2.
 *
 * From probe-empty-sources.js:
 *   UPU (373 links, 0 PDF) — needs includeAllLinks: true
 *   WIPO (176 links, 0 PDF) — needs includeAllLinks: true
 *   IPCC (183 links, 0 PDF) — needs includeAllLinks: true
 *   UNDRR (41 links, 0 PDF) — needs includeAllLinks: true
 *   UNIDIR (184 links, 0 PDF) — needs includeAllLinks: true
 *   JIU (74 links, 1 PDF) — linkFilter '.pdf' too strict, use includeAllLinks: true
 *   UNCCD (156 links, 0 PDF) — real list is /resources/all-resources
 *   UNRISD (997B, 0 links) — SPA, switch to RSS feed
 *   UNU Collections (HTTP 202) — Invenio async; switch to repo.unu.edu search
 *   WMO Library (10KB, 0 links) — switch to WMO publication catalog search
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const sources = await sourceCatalogService.list({ namespace: null, type: null });
  const byName = Object.fromEntries(sources.map(s => [s.name, s]));

  const fixes = [

    // includeAllLinks fixes ────────────────────────────────────────────────────
    {
      name: 'UPU Publications',
      config: {
        url: 'https://www.upu.int/en/Publications',
        searchUrlTemplate: 'https://www.upu.int/en/Publications?search={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },
    {
      name: 'WIPO Publications',
      config: {
        url: 'https://www.wipo.int/publications/en/',
        searchUrlTemplate: 'https://www.wipo.int/publications/en/?query={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },
    {
      name: 'IPCC Reports',
      config: {
        url: 'https://www.ipcc.ch/reports/',
        searchUrlTemplate: 'https://www.ipcc.ch/search/?q={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },
    {
      name: 'UNDRR Publications',
      config: {
        url: 'https://www.undrr.org/publications',
        searchUrlTemplate: 'https://www.undrr.org/search?q={query}&type=publication',
        linkFilter: '',
        includeAllLinks: true,
      },
    },
    {
      name: 'UNIDIR Publications',
      config: {
        url: 'https://unidir.org/publications',
        searchUrlTemplate: 'https://unidir.org/?s={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },
    {
      name: 'JIU Reports',
      config: {
        url: 'https://www.unjiu.org/content/reports-notes',
        searchUrlTemplate: 'https://www.unjiu.org/content/reports-notes?search={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // URL fixes ───────────────────────────────────────────────────────────────
    {
      name: 'UNCCD Resources',
      config: {
        url: 'https://www.unccd.int/resources/all-resources',
        searchUrlTemplate: 'https://www.unccd.int/resources/all-resources?search={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // SPA / no-links — switch to RSS or different URL ─────────────────────────
    {
      name: 'UNRISD Publications',
      type: 'RSS_FEED',
      description: 'UN Research Institute for Social Development — research publications feed.',
      config: {
        url: 'https://www.unrisd.org/feed',
        searchUrlTemplate: null,
      },
    },

    // UNU: try collections.unu.edu/search (may return proper HTML on retry) ───
    {
      name: 'UNU Collections',
      config: {
        url: 'https://collections.unu.edu/eserv/browse/query/',
        searchUrlTemplate: 'https://collections.unu.edu/search.php#k={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // WMO: use public records catalog ─────────────────────────────────────────
    {
      name: 'WMO Library',
      config: {
        url: 'https://library.wmo.int/records?ln=en&p=&f=&action_search=Search&c=&sf=&so=d&rm=&rg=10&sc=0&of=hb',
        searchUrlTemplate: 'https://library.wmo.int/records?ln=en&p={query}&action_search=Search&of=hb',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

  ];

  console.log(`\nApplying ${fixes.length} ninth-pass fixes...\n`);
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
