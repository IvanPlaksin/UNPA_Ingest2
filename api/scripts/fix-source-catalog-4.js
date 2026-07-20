'use strict';
/**
 * fix-source-catalog-4.js — fourth-pass fixes
 * After third pass: 30 OK, 1 empty, 7 errors.
 *
 * Errors:
 *   FAO          — 403 on DSpace 7 /server/api/
 *   IFAD         — ENOTFOUND data.ifad.org (hostname wrong)
 *   UN Women     — 404 on data.unwomen.org JSON
 *   UNDP         — 404 on api.open.undp.org/api/projects.json
 *   UNEP         — 403 on wedocs.unep.org/rest
 *   IAEA         — 403 on /publications/atom/all
 *   WFP          — 403 on wfp.org/rss.xml
 *
 * Empty:
 *   UNIDO        — 0 items (CKAN response mapping wrong)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const sources = await sourceCatalogService.list({ namespace: null, type: null });
  const byName = Object.fromEntries(sources.map(s => [s.name, s]));

  const fixes = [

    // ── FAO: DSpace 7 blocked — fall back to static publications page ─────────
    {
      name: 'FAO Knowledge Repository',
      type: 'URL_CATALOG',
      description: 'FAO publications listing (HTML scraping).',
      config: {
        url: 'https://openknowledge.fao.org/communities/b',
        searchUrlTemplate: 'https://openknowledge.fao.org/search?query={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── IFAD: data.ifad.org doesn't exist — use IFAD publications HTML ────────
    {
      name: 'IFAD Documents',
      type: 'URL_CATALOG',
      description: 'IFAD evaluation and publications portal.',
      config: {
        url: 'https://www.ifad.org/en/evaluations',
        searchUrlTemplate: 'https://www.ifad.org/en/search?q={query}&resource_type=publications',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // ── UN Women: 404 on JSON API — use UN Women publications HTML ────────────
    {
      name: 'UN Women Publications',
      type: 'URL_CATALOG',
      description: 'UN Women digital library publications.',
      config: {
        url: 'https://www.unwomen.org/en/digital-library/publications',
        searchUrlTemplate: 'https://www.unwomen.org/en/search-results?querytext={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── UNDP: 404 on projects.json — use paginated v1 API ────────────────────
    {
      name: 'UNDP Publications',
      type: 'REST_API',
      description: 'UNDP open data API v1 — development project reports.',
      config: {
        method: 'GET',
        endpoint: 'https://api.open.undp.org/api/v1/projects',
        searchParam: null,
        defaultQuery: '',
        queryParams: {
          per_page: '25',
          page:     '1',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: '',
          title: 'project_title',
          url:   'project_id',
          date:  'end_date',
          total: '',
        },
      },
    },

    // ── UNEP: 403 on DSpace 6 REST — try UNEP resources HTML page ────────────
    {
      name: 'UNEP Publications',
      type: 'URL_CATALOG',
      description: 'UNEP environmental assessments and publications.',
      config: {
        url: 'https://www.unep.org/resources/assessments',
        searchUrlTemplate: 'https://www.unep.org/search?keywords={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── IAEA: /publications/atom/all is 403 — try news press release Atom ─────
    {
      name: 'IAEA Publications',
      type: 'RSS_FEED',
      description: 'IAEA press releases Atom feed.',
      config: {
        url: 'https://www.iaea.org/newscenter/pressreleases/atom.asp',
      },
    },

    // ── WFP: wfp.org/rss.xml is 403 — try WFP situation reports page ─────────
    {
      name: 'WFP Publications',
      type: 'URL_CATALOG',
      description: 'WFP publications and situation reports.',
      config: {
        url: 'https://www.wfp.org/publications',
        searchUrlTemplate: 'https://www.wfp.org/publications?search={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── UNIDO: CKAN-style mapping returned 0 — try Solr/root-array mapping ────
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
          items: 'response.docs',
          title: 'dc_title',
          url:   'id',
          date:  'dc_date',
          total: 'response.numFound',
        },
      },
    },

  ];

  console.log(`\nApplying ${fixes.length} fourth-pass fixes...\n`);
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
