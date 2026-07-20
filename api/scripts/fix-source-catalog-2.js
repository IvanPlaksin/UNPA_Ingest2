'use strict';
/**
 * fix-source-catalog-2.js — second-pass fixes
 * Remaining 7 errors + 9 empty sources after first fix round.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const sources = await sourceCatalogService.list({ namespace: null, type: null });
  const byName = Object.fromEntries(sources.map(s => [s.name, s]));

  const fixes = [

    // ── WHO IRIS: DSpace 7 REST API (not DSpace 6) ────────────────────────────
    {
      name: 'WHO IRIS Repository',
      type: 'REST_API',
      config: {
        method: 'GET',
        endpoint: 'https://iris.who.int/server/api/discover/search/objects',
        searchParam: 'query',
        defaultQuery: 'health guidelines',
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

    // ── FAO: switch to /rest/items (list without mandatory query) ─────────────
    {
      name: 'FAO Knowledge Repository',
      type: 'REST_API',
      config: {
        method: 'GET',
        endpoint: 'https://openknowledge.fao.org/rest/items',
        searchParam: null,
        defaultQuery: '',
        queryParams: {
          limit: '25',
          offset: '0',
          expand: 'metadata',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: '',
          title: 'name',
          url:   'handle',
          date:  'lastModified',
          total: '',
        },
      },
    },

    // ── IAEA: use publication search via known endpoint ────────────────────────
    {
      name: 'IAEA Publications',
      type: 'URL_CATALOG',
      config: {
        url: 'https://www.iaea.org/publications/search/type/report',
        searchUrlTemplate: 'https://www.iaea.org/publications/search/type/all?keywords={query}',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // ── ODS: force Digital Library fallback for all 4 ODS entries ─────────────
    // (ODS HTML is JS-rendered — DL REST returns real results)
    {
      name: 'UN ODS — General Assembly',
      type: 'REST_API',
      description: 'UN ODS General Assembly documents (A/) via UN Digital Library REST API.',
      config: {
        method: 'GET',
        endpoint: 'https://digitallibrary.un.org/search',
        searchParam: 'p',
        defaultQuery: 'A/RES',
        queryParams: {
          of: 'recjson',
          action_search: 'Search',
          rg: '25',
          ln: 'en',
          c: 'RES',
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
    {
      name: 'UN ODS — Security Council',
      type: 'REST_API',
      description: 'UN ODS Security Council documents (S/RES/) via UN Digital Library REST API.',
      config: {
        method: 'GET',
        endpoint: 'https://digitallibrary.un.org/search',
        searchParam: 'p',
        defaultQuery: 'S/RES',
        queryParams: { of: 'recjson', action_search: 'Search', rg: '25', ln: 'en' },
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
    {
      name: 'UN ODS — Secretary-General Reports',
      type: 'REST_API',
      description: 'UN ODS Secretary-General reports (SG/) via UN Digital Library REST API.',
      config: {
        method: 'GET',
        endpoint: 'https://digitallibrary.un.org/search',
        searchParam: 'p',
        defaultQuery: 'SG/SM',
        queryParams: { of: 'recjson', action_search: 'Search', rg: '25', ln: 'en' },
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
    {
      name: 'UN ODS — Economic and Social Council',
      type: 'REST_API',
      description: 'UN ODS ECOSOC documents (E/) via UN Digital Library REST API.',
      config: {
        method: 'GET',
        endpoint: 'https://digitallibrary.un.org/search',
        searchParam: 'p',
        defaultQuery: 'E/RES',
        queryParams: { of: 'recjson', action_search: 'Search', rg: '25', ln: 'en' },
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

    // ── WFP Documents API: delete (protected, duplicated by WFP Publications) ──
    // (handled separately — we delete it)

    // ── Sites behind Cloudflare WAF: switch to OpenDataSoft / known APIs ───────
    // UNDP: use UNDP HDR API
    {
      name: 'UNDP Publications',
      type: 'REST_API',
      description: 'UNDP open data API — project-level data with associated documents.',
      config: {
        method: 'GET',
        endpoint: 'https://api.open.undp.org/api/project_summary_2024.json',
        searchParam: null,
        defaultQuery: '',
        queryParams: {},
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

    // UNEP: use UNEP Knowledge Repository (different from unep.org)
    {
      name: 'UNEP Publications',
      type: 'URL_CATALOG',
      config: {
        url: 'https://wesr.unep.org/article/list',
        searchUrlTemplate: 'https://www.unep.org/resources?keywords={query}',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // UNHCR: use UNHCR public API
    {
      name: 'UNHCR Refworld',
      type: 'REST_API',
      description: 'UNHCR Refugee Statistics public API — population data and reports.',
      config: {
        method: 'GET',
        endpoint: 'https://api.unhcr.org/population/v1/asylum-applications/',
        searchParam: null,
        defaultQuery: '',
        queryParams: {
          limit: '25',
          page: '1',
          cf_type: 'ISO',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'items',
          title: 'country_of_origin_name',
          url:   '',
          date:  'year',
          total: 'maxPages',
        },
      },
    },

    // UNIDO: use UNIDO open data API
    {
      name: 'UNIDO Publications',
      type: 'URL_CATALOG',
      config: {
        url: 'https://open.unido.org/api/documents?rows=25&start=0',
        searchUrlTemplate: 'https://open.unido.org/api/documents?q={query}&rows=25&start=0',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // IFAD: use IFAD Open Data API
    {
      name: 'IFAD Documents',
      type: 'URL_CATALOG',
      config: {
        url: 'https://www.ifad.org/en/web/knowledge/publication',
        searchUrlTemplate: 'https://www.ifad.org/en/search?q={query}&resource_type=publications',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // UN Women: use un.org/womenwatch which has more accessible PDFs
    {
      name: 'UN Women Publications',
      type: 'URL_CATALOG',
      config: {
        url: 'https://www.unwomen.org/en/digital-library/publications?sortby=date',
        searchUrlTemplate: 'https://www.unwomen.org/en/digital-library/publications?q={query}',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // OHCHR UHRI: use the structured recommendations search
    {
      name: 'OHCHR Universal Human Rights Index (UHRI)',
      type: 'REST_API',
      description: 'UHRI REST-like API for human rights recommendations (170 000+ records).',
      config: {
        method: 'GET',
        endpoint: 'https://uhri.ohchr.org/api/v1/documents',
        searchParam: 'q',
        defaultQuery: 'human rights',
        queryParams: {
          per_page: '25',
          page: '1',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'data',
          title: 'title',
          url:   'url',
          date:  'date',
          total: 'meta.total',
        },
      },
    },

  ];

  console.log(`\nApplying ${fixes.length} second-pass fixes...\n`);
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

  // Delete WFP Documents API (protected endpoint, duplicates WFP Publications)
  const wfpApi = byName['WFP Documents API'];
  if (wfpApi) {
    try {
      await sourceCatalogService.delete(wfpApi.id);
      console.log(`  🗑  Deleted: WFP Documents API (protected endpoint)`);
      ok++;
    } catch (e) { console.error(`  ✗ Delete WFP API: ${e.message}`); }
  }

  console.log(`\n  Updated: ${ok}  Skipped: ${skip}  Failed: ${err}\n`);
  process.exit(err > 0 ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
