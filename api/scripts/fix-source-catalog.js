'use strict';
/**
 * fix-source-catalog.js
 * Applies targeted fixes to the seeded UN source catalog entries:
 *  - Correct broken URLs (404)
 *  - Add better configs for empty-results sources
 *  - Replace WFP API (401) with URL_CATALOG
 *  - Fix FAO defaultQuery for empty browse
 *  - Fix GA RSS URL
 *  - Update OHCHR, UN SC, UNHCR with alternative endpoints
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const sources = await sourceCatalogService.list({ namespace: null, type: null });
  const byName = Object.fromEntries(sources.map(s => [s.name, s]));

  const fixes = [
    // ── 404 fixes ─────────────────────────────────────────────────────────────

    {
      name: 'IFAD Documents',
      config: {
        url: 'https://www.ifad.org/en/web/knowledge/publications',
        searchUrlTemplate: 'https://www.ifad.org/en/web/knowledge/publications?search={query}',
        linkFilter: '.pdf',
      },
    },
    {
      name: 'UNIDO Publications',
      config: {
        url: 'https://www.unido.org/resources/publications',
        searchUrlTemplate: 'https://www.unido.org/search?q={query}&f%5B0%5D=type%3Apublication',
        linkFilter: '.pdf',
      },
    },
    {
      name: 'UNODC Publications',
      config: {
        url: 'https://www.unodc.org/unodc/en/data-and-analysis/index.html',
        searchUrlTemplate: 'https://www.unodc.org/search/?q={query}&filter=publications',
        linkFilter: '.pdf',
      },
    },

    // ── WFP API → URL_CATALOG (was 401) ───────────────────────────────────────

    {
      name: 'WFP Documents API',
      type: 'URL_CATALOG',
      config: {
        url: 'https://docs.wfp.org/api/documents?per_page=25&page=1',
        searchUrlTemplate: 'https://docs.wfp.org/api/documents?title_q={query}&per_page=25&page=1',
        linkFilter: '.pdf',
        includeAllLinks: false,
      },
    },

    // ── FAO: add defaultQuery so blank browse returns results ─────────────────

    {
      name: 'FAO Knowledge Repository',
      config: {
        method: 'GET',
        endpoint: 'https://openknowledge.fao.org/rest/search',
        searchParam: 'query',
        defaultQuery: '*',
        queryParams: {
          scope: '/',
          rpp: '25',
          etal: '0',
          start: '0',
          advanced: 'false',
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

    // ── World Bank: fix responseMapping to match actual field paths ────────────

    {
      name: 'World Bank Documents & Reports',
      config: {
        method: 'GET',
        endpoint: 'https://search.worldbank.org/api/v3/wds',
        searchParam: 'qterm',
        defaultQuery: 'development',
        queryParams: {
          format: 'json',
          fl: 'id,display_title,pdfurl,url,docdt,count,lang_exact,docty_exact',
          rows: '25',
          os: '0',
          order: 'desc',
          sort: 'docdt',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'documents',
          title: 'display_title',
          url:   'pdfurl',
          date:  'docdt',
          total: 'total',
        },
      },
    },

    // ── UN GA RSS: fix URL ────────────────────────────────────────────────────
    // Official GA RSS was removed; replace with UN GA news feed

    {
      name: 'UN General Assembly RSS',
      config: {
        url: 'https://news.un.org/feed/subscribe/en/news/topic/un-affairs/feed/rss.xml',
      },
    },

    // ── OHCHR 403: switch to the Charter-body document search page ─────────────

    {
      name: 'OHCHR Human Rights Documents',
      config: {
        url: 'https://ap.ohchr.org/documents/mainec.aspx',
        searchUrlTemplate: 'https://ap.ohchr.org/documents/mainec.aspx?syb={query}',
        linkFilter: '.pdf',
      },
    },

    // ── UN Security Council 403: use accessible archive page ──────────────────

    {
      name: 'UN Security Council Documents',
      config: {
        url: 'https://www.un.org/securitycouncil/content/resolutions-adopted-security-council-2024',
        searchUrlTemplate: '',
        linkFilter: '.pdf',
      },
    },

    // ── UNHCR Refworld 403: use Refworld search with accept headers ────────────
    // Refworld JS-renders the list; point to the UNHCR document portal instead

    {
      name: 'UNHCR Refworld',
      config: {
        url: 'https://www.unhcr.org/what-we-do/reports-and-publications',
        searchUrlTemplate: 'https://www.unhcr.org/search?query={query}&f%5B0%5D=type%3Apublication',
        linkFilter: '.pdf',
      },
    },

    // ── WHO IRIS: switch to DSpace REST API ───────────────────────────────────

    {
      name: 'WHO IRIS Repository',
      type: 'REST_API',
      config: {
        method: 'GET',
        endpoint: 'https://iris.who.int/rest/search',
        searchParam: 'query',
        defaultQuery: 'health',
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

    // ── IAEA: use INIS REST API (International Nuclear Information System) ─────

    {
      name: 'IAEA Publications',
      type: 'REST_API',
      config: {
        method: 'GET',
        endpoint: 'https://inis.iaea.org/search/search.aspx',
        searchParam: 'q',
        defaultQuery: 'nuclear',
        queryParams: {
          format: 'json',
          page: '1',
          pageSize: '25',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'results',
          title: 'title',
          url:   'url',
          date:  'date',
          total: 'totalResults',
        },
      },
    },

    // ── UNDP HDR: use proper search URL ──────────────────────────────────────

    {
      name: 'UNDP Human Development Reports',
      config: {
        url: 'https://hdr.undp.org/content/human-development-report-2023-24',
        searchUrlTemplate: 'https://hdr.undp.org/reports-and-publications?search={query}',
        linkFilter: '.pdf',
      },
    },

    // ── UNDP Publications: use search URL ────────────────────────────────────

    {
      name: 'UNDP Publications',
      config: {
        url: 'https://www.undp.org/publications',
        searchUrlTemplate: 'https://www.undp.org/publications?search={query}',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // ── UNESCO UNESDOC: fix response mapping for v2.1 API ────────────────────

    {
      name: 'UNESCO UNESDOC',
      config: {
        method: 'GET',
        endpoint: 'https://data.unesco.org/api/explore/v2.1/catalog/datasets/doc001/records',
        searchParam: 'q',
        defaultQuery: '',
        queryParams: {
          limit: '25',
          offset: '0',
          lang: 'en',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'results',
          title: 'dc_title',
          url:   'dc_identifier',
          date:  'dc_date',
          total: 'total_count',
        },
      },
    },

    // ── UN Digital Library: fix response mapping (Invenio JSON format) ────────

    {
      name: 'UN Digital Library',
      config: {
        method: 'GET',
        endpoint: 'https://digitallibrary.un.org/search',
        searchParam: 'p',
        defaultQuery: 'resolution',
        queryParams: {
          of: 'recjson',
          action_search: 'Search',
          rg: '25',
          ln: 'en',
          c: '',
        },
        auth: { type: 'none' },
        responseMapping: {
          items: 'hits.hits',
          title: '_source.title.0',
          url:   '_source.url.0.value',
          date:  '_source.date',
          total: 'hits.total',
        },
      },
    },

    // ── UN Women: use publications archive that has direct PDF links ──────────

    {
      name: 'UN Women Publications',
      config: {
        url: 'https://www.unwomen.org/en/digital-library/annual-report',
        searchUrlTemplate: 'https://www.unwomen.org/en/search-results?querytext={query}&f%5B0%5D=type%3Apublication',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // ── UNEP: use knowledge repository with PDF links ─────────────────────────

    {
      name: 'UNEP Publications',
      config: {
        url: 'https://www.unep.org/resources/assessments',
        searchUrlTemplate: 'https://www.unep.org/search?keywords={query}&field_resource_content_type%5B%5D=publication',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },

    // ── UNCTAD: use publications listing that includes PDF links ──────────────

    {
      name: 'UNCTAD Publications',
      config: {
        url: 'https://unctad.org/publications',
        searchUrlTemplate: 'https://unctad.org/search?keyword={query}&type=publication',
        linkFilter: '.pdf',
        includeAllLinks: true,
      },
    },
  ];

  console.log(`\nApplying ${fixes.length} catalog fixes...\n`);
  let ok = 0, skip = 0, err = 0;

  for (const fix of fixes) {
    const s = byName[fix.name];
    if (!s) { console.log(`  ⊘ Not found: "${fix.name}"`); skip++; continue; }

    const patch = {};
    if (fix.type)   patch.type   = fix.type;
    if (fix.config) patch.config = fix.config;
    if (fix.description) patch.description = fix.description;

    try {
      await sourceCatalogService.update(s.id, patch);
      console.log(`  ✓ Fixed: ${fix.name}`);
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
