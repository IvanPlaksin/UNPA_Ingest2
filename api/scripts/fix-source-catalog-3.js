'use strict';
/**
 * fix-source-catalog-3.js — third-pass fixes
 * Addresses 3 errors + 7 empty sources after second fix round:
 *
 * Errors:
 *   UNDP Publications     — timeout (large JSON file)
 *   IAEA Publications     — 403 Cloudflare
 *   IFAD Documents        — 403 Cloudflare
 *
 * Empty (0 items):
 *   FAO Knowledge Repository          — DSpace 6 /rest/items format mismatch
 *   OHCHR Universal Human Rights Index — REST endpoint returns 0
 *   UN ODS — General Assembly         — c:'RES' collection filter blocks results
 *   UN Women Publications             — JS-rendered SPA
 *   UNEP Publications                 — JS-rendered SPA
 *   UNIDO Publications                — URL_CATALOG on JSON endpoint
 *   WFP Publications                  — JS-rendered SPA
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const sources = await sourceCatalogService.list({ namespace: null, type: null });
  const byName = Object.fromEntries(sources.map(s => [s.name, s]));

  const fixes = [

    // ── UNDP: switch away from 2024 summary JSON (too large) ─────────────────
    // Use the UNDP open project API with pagination — small pages
    {
      name: 'UNDP Publications',
      type: 'REST_API',
      description: 'UNDP open project API — paginated project summaries.',
      config: {
        method: 'GET',
        endpoint: 'https://api.open.undp.org/api/projects.json',
        searchParam: null,
        defaultQuery: '',
        queryParams: {
          page: '1',
          limit: '25',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'data',
          title: 'project_title',
          url:   'project_id',
          date:  'end_date',
          total: 'total',
        },
      },
    },

    // ── IAEA: use IAEA Atom/RSS feed (bypasses Cloudflare for feeds) ─────────
    {
      name: 'IAEA Publications',
      type: 'RSS_FEED',
      description: 'IAEA publications Atom feed — nuclear safety, energy, and safeguards reports.',
      config: {
        url: 'https://www.iaea.org/publications/atom/all',
      },
    },

    // ── IFAD: use IFAD open data CKAN API ─────────────────────────────────────
    {
      name: 'IFAD Documents',
      type: 'REST_API',
      description: 'IFAD CKAN open data API — rural development and food security reports.',
      config: {
        method: 'GET',
        endpoint: 'https://data.ifad.org/api/3/action/package_search',
        searchParam: 'q',
        defaultQuery: '',
        queryParams: {
          rows: '25',
          start: '0',
          sort: 'metadata_modified desc',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'result.results',
          title: 'title',
          url:   'url',
          date:  'metadata_modified',
          total: 'result.count',
        },
      },
    },

    // ── FAO: switch to DSpace 7 API (same as WHO IRIS) ────────────────────────
    {
      name: 'FAO Knowledge Repository',
      type: 'REST_API',
      description: 'FAO DSpace 7 REST API — food and agriculture publications.',
      config: {
        method: 'GET',
        endpoint: 'https://openknowledge.fao.org/server/api/discover/search/objects',
        searchParam: 'query',
        defaultQuery: 'food agriculture',
        queryParams: {
          sort: 'score,DESC',
          page: '0',
          size: '25',
          embed: 'item',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: '_embedded.searchResult._embedded.objects',
          title: '_embedded.indexableObject.name',
          url:   '_embedded.indexableObject.metadata.dc\\.identifier\\.uri.0.value',
          date:  '_embedded.indexableObject.metadata.dc\\.date\\.issued.0.value',
          total: '_embedded.searchResult.page.totalElements',
        },
      },
    },

    // ── OHCHR UHRI: switch to URL_CATALOG (the REST endpoint is non-public) ───
    {
      name: 'OHCHR Universal Human Rights Index (UHRI)',
      type: 'URL_CATALOG',
      description: 'UHRI — UN human rights recommendations from treaty bodies and UPR.',
      config: {
        url: 'https://uhri.ohchr.org/en/search',
        searchUrlTemplate: 'https://uhri.ohchr.org/en/search?query={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── UN ODS — General Assembly: remove collection filter (c:'RES' blocks results)
    {
      name: 'UN ODS — General Assembly',
      type: 'REST_API',
      description: 'UN ODS General Assembly documents (A/) via UN Digital Library REST API.',
      config: {
        method: 'GET',
        endpoint: 'https://digitallibrary.un.org/search',
        searchParam: 'p',
        defaultQuery: 'A/',
        queryParams: {
          of: 'recjson',
          action_search: 'Search',
          rg: '25',
          ln: 'en',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'hits.hits',
          title: '_source.title.0',
          url:   '_source.url.0.value',
          date:  '_source.date',
          total: 'hits.total',
          symbol: '_source.symbol.0',
        },
      },
    },

    // ── UN Women: use data API (UN Women open data portal) ────────────────────
    {
      name: 'UN Women Publications',
      type: 'REST_API',
      description: 'UN Women open data API — gender equality and women empowerment data.',
      config: {
        method: 'GET',
        endpoint: 'https://data.unwomen.org/sites/default/files/documents/api/publications.json',
        searchParam: null,
        defaultQuery: '',
        queryParams: {},
        auth: { type: 'none' },
        responseMapping: {
          items: 'items',
          title: 'title',
          url:   'url',
          date:  'date',
          total: '',
        },
      },
    },

    // ── UNEP: use UNEP document portal DSpace REST API ────────────────────────
    {
      name: 'UNEP Publications',
      type: 'REST_API',
      description: 'UNEP WEDOCS DSpace REST API — environmental assessments and reports.',
      config: {
        method: 'GET',
        endpoint: 'https://wedocs.unep.org/rest/search',
        searchParam: 'query',
        defaultQuery: 'environment',
        queryParams: {
          scope: '/',
          rpp: '25',
          etal: '0',
          start: '0',
          order: 'desc',
          sort_by: 'score',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'items',
          title: 'name',
          url:   'handle',
          date:  'lastModified',
          total: 'totalResults',
        },
      },
    },

    // ── UNIDO: switch from URL_CATALOG JSON endpoint to REST_API ─────────────
    {
      name: 'UNIDO Publications',
      type: 'REST_API',
      description: 'UNIDO open data API — industrial development publications and statistics.',
      config: {
        method: 'GET',
        endpoint: 'https://open.unido.org/api/documents',
        searchParam: 'q',
        defaultQuery: '',
        queryParams: {
          rows: '25',
          start: '0',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'result.results',
          title: 'title',
          url:   'url',
          date:  'metadata_modified',
          total: 'result.count',
        },
      },
    },

    // ── WFP: use WFP operations RSS feed ─────────────────────────────────────
    {
      name: 'WFP Publications',
      type: 'RSS_FEED',
      description: 'WFP global operations and publications RSS feed.',
      config: {
        url: 'https://www.wfp.org/rss.xml',
      },
    },

  ];

  console.log(`\nApplying ${fixes.length} third-pass fixes...\n`);
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
