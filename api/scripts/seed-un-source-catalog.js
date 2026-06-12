'use strict';
/**
 * seed-un-source-catalog.js
 *
 * Populates the SourceCatalog with all known public UN document sources:
 *   - UN Official Document System (ODS)
 *   - UN Digital Library
 *   - World Bank Documents & Reports API
 *   - UNESCO UNESDOC (OpenDataSoft API)
 *   - FAO Knowledge Repository (DSpace REST)
 *   - OHCHR Documents
 *   - UNDP Publications
 *   - UNICEF Reports
 *   - UNCTAD Publications
 *   - UNHCR Refworld
 *   - ILO Publications
 *   - UN News RSS feeds (top-level + topic channels)
 *   - UN Press Releases RSS
 *   - UN General Assembly RSS
 *   - OIOS Reports Portal
 *   - Security Council Documents RSS
 *   - UN Women Publications
 *   - UNEP Publications
 *   - UNIDO Publications
 *   - WHO Documents & Publications
 *
 * Usage:
 *   node api/scripts/seed-un-source-catalog.js
 *   node api/scripts/seed-un-source-catalog.js --dry-run
 *   node api/scripts/seed-un-source-catalog.js --reset   (delete existing before seeding)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESET   = args.includes('--reset');

// ─── Source definitions ──────────────────────────────────────────────────────

const SOURCES = [

  // ═══════════════════════════════════════════
  // 1. UN Official Document System (ODS)
  // ═══════════════════════════════════════════
  {
    name: 'UN ODS — General Assembly',
    description: 'UN Official Document System: General Assembly documents (A/ symbol prefix). Resolutions, reports, working papers.',
    type: 'ODS_API',
    namespace: 'DEFAULT',
    tags: ['un', 'ods', 'general-assembly', 'resolutions'],
    config: { defaultQuery: 'A/', language: 'E' },
  },
  {
    name: 'UN ODS — Security Council',
    description: 'UN ODS: Security Council documents and resolutions (S/ symbol prefix).',
    type: 'ODS_API',
    namespace: 'DEFAULT',
    tags: ['un', 'ods', 'security-council', 'resolutions'],
    config: { defaultQuery: 'S/RES/', language: 'E' },
  },
  {
    name: 'UN ODS — Secretary-General Reports',
    description: 'UN ODS: Secretary-General reports (SG/SM series).',
    type: 'ODS_API',
    namespace: 'DEFAULT',
    tags: ['un', 'ods', 'secretary-general', 'reports'],
    config: { defaultQuery: 'SG/', language: 'E' },
  },
  {
    name: 'UN ODS — Economic and Social Council',
    description: 'UN ODS: ECOSOC documents (E/ symbol prefix).',
    type: 'ODS_API',
    namespace: 'DEFAULT',
    tags: ['un', 'ods', 'ecosoc'],
    config: { defaultQuery: 'E/', language: 'E' },
  },

  // ═══════════════════════════════════════════
  // 2. UN Digital Library
  // ═══════════════════════════════════════════
  {
    name: 'UN Digital Library',
    description: 'digitallibrary.un.org — full-text search over UN documents, voting records, speeches, maps and publications since 1979. Returns JSON via Invenio search API.',
    type: 'REST_API',
    namespace: 'DEFAULT',
    tags: ['un', 'digital-library', 'full-text', 'invenio'],
    config: {
      method: 'GET',
      endpoint: 'https://digitallibrary.un.org/search',
      searchParam: 'p',
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

  // ═══════════════════════════════════════════
  // 3. World Bank Documents & Reports
  // ═══════════════════════════════════════════
  {
    name: 'World Bank Documents & Reports',
    description: 'documents.worldbank.org — REST API v3 for searching 250 000+ World Bank publications, working papers, country reports, project documents.',
    type: 'REST_API',
    namespace: 'DEFAULT',
    tags: ['world-bank', 'development', 'economics', 'projects'],
    config: {
      method: 'GET',
      endpoint: 'https://search.worldbank.org/api/v3/wds',
      searchParam: 'qterm',
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

  // ═══════════════════════════════════════════
  // 4. UNESCO UNESDOC
  // ═══════════════════════════════════════════
  {
    name: 'UNESCO UNESDOC',
    description: 'data.unesco.org — UNESDOC catalogue of UNESCO publications via OpenDataSoft Explore API v2. Includes education, science, culture, communication documents.',
    type: 'REST_API',
    namespace: 'DEFAULT',
    tags: ['unesco', 'education', 'culture', 'science', 'unesdoc'],
    config: {
      method: 'GET',
      endpoint: 'https://data.unesco.org/api/explore/v2.1/catalog/datasets/doc001/records',
      searchParam: 'where',
      queryParams: {
        limit: '25',
        offset: '0',
        lang: 'en',
        timezone: 'UTC',
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

  // ═══════════════════════════════════════════
  // 5. FAO Knowledge Repository
  // ═══════════════════════════════════════════
  {
    name: 'FAO Knowledge Repository',
    description: 'openknowledge.fao.org — FAO official open repository with all FAO publications: technical papers, working papers, reports, manuals, guidelines.',
    type: 'REST_API',
    namespace: 'DEFAULT',
    tags: ['fao', 'food', 'agriculture', 'nutrition', 'rural-development'],
    config: {
      method: 'GET',
      endpoint: 'https://openknowledge.fao.org/rest/search',
      searchParam: 'query',
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

  // ═══════════════════════════════════════════
  // 6. OHCHR — Human Rights Bodies Documents
  // ═══════════════════════════════════════════
  {
    name: 'OHCHR Human Rights Documents',
    description: 'ap.ohchr.org — UN Charter-body documents: Human Rights Council, treaty bodies, UPR recommendations, special procedures reports.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['ohchr', 'human-rights', 'hrc', 'treaty-bodies'],
    config: {
      url: 'https://www.ohchr.org/en/documents-listing',
      searchUrlTemplate: 'https://ap.ohchr.org/documents/mainec.aspx?t={query}',
      linkFilter: '.pdf',
    },
  },
  {
    name: 'OHCHR Universal Human Rights Index (UHRI)',
    description: 'uhri.ohchr.org — 170 000+ recommendations and observations from UN human rights bodies, searchable by country, treaty, theme.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['ohchr', 'human-rights', 'uhri', 'recommendations'],
    config: {
      url: 'https://uhri.ohchr.org/en/documents',
      searchUrlTemplate: 'https://uhri.ohchr.org/en/documents?searchTerms={query}',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 7. UNDP
  // ═══════════════════════════════════════════
  {
    name: 'UNDP Publications',
    description: 'undp.org — UNDP publications: Human Development Reports, country programme documents, project evaluations, policy papers.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['undp', 'development', 'hdr', 'country-programmes'],
    config: {
      url: 'https://www.undp.org/publications',
      searchUrlTemplate: 'https://www.undp.org/publications?search={query}',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 8. UNICEF
  // ═══════════════════════════════════════════
  {
    name: 'UNICEF Reports & Publications',
    description: 'unicef.org — UNICEF annual reports, situation analyses, research papers, evaluation reports on child rights and welfare.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['unicef', 'children', 'child-rights', 'humanitarian'],
    config: {
      url: 'https://www.unicef.org/reports',
      searchUrlTemplate: 'https://www.unicef.org/search?q={query}&f%5B0%5D=content_type%3Areport',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 9. UNCTAD
  // ═══════════════════════════════════════════
  {
    name: 'UNCTAD Publications',
    description: 'unctad.org — UN Trade and Development publications: World Investment Reports, flagship reports, policy briefs, trade statistics.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['unctad', 'trade', 'investment', 'development', 'economics'],
    config: {
      url: 'https://unctad.org/publications',
      searchUrlTemplate: 'https://unctad.org/search?keyword={query}&type=publication',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 10. UNHCR Refworld
  // ═══════════════════════════════════════════
  {
    name: 'UNHCR Refworld',
    description: 'refworld.org — UNHCR global law and policy database: refugee law, statelessness, internal displacement. Covers UNHCR documents, court decisions, national legislation.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['unhcr', 'refugee', 'asylum', 'statelessness', 'law'],
    config: {
      url: 'https://www.refworld.org/',
      searchUrlTemplate: 'https://www.refworld.org/search.html#q={query}',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 11. ILO Publications
  // ═══════════════════════════════════════════
  {
    name: 'ILO Publications',
    description: 'ilo.org — International Labour Organization publications: conventions, recommendations, reports, World Employment and Social Outlook.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['ilo', 'labour', 'employment', 'conventions', 'standards'],
    config: {
      url: 'https://www.ilo.org/publications',
      searchUrlTemplate: 'https://www.ilo.org/search?q={query}&type=publication',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 12. UN Women
  // ═══════════════════════════════════════════
  {
    name: 'UN Women Publications',
    description: 'unwomen.org — UN Women reports and publications on gender equality, empowerment, and women\'s rights.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['un-women', 'gender', 'equality', 'empowerment'],
    config: {
      url: 'https://www.unwomen.org/en/digital-library/publications',
      searchUrlTemplate: 'https://www.unwomen.org/en/search-results?querytext={query}&f%5B0%5D=type%3Apublication',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 13. UNEP
  // ═══════════════════════════════════════════
  {
    name: 'UNEP Publications',
    description: 'unep.org — UN Environment Programme publications: environmental assessments, flagship reports, technical guidance, Global Environment Outlook.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['unep', 'environment', 'climate', 'biodiversity', 'sustainability'],
    config: {
      url: 'https://www.unep.org/resources',
      searchUrlTemplate: 'https://www.unep.org/search?keywords={query}&field_resource_content_type%5B%5D=publication',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 14. UNIDO
  // ═══════════════════════════════════════════
  {
    name: 'UNIDO Publications',
    description: 'unido.org — UN Industrial Development Organization publications: industrial development reports, technical papers, country assessments.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['unido', 'industry', 'development', 'manufacturing'],
    config: {
      url: 'https://www.unido.org/resources-publications-flagship-publications',
      searchUrlTemplate: 'https://www.unido.org/search?q={query}&f%5B0%5D=type%3Apublication',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 15. WHO Documents
  // ═══════════════════════════════════════════
  {
    name: 'WHO IRIS Repository',
    description: 'iris.who.int — WHO Institutional Repository for Information Sharing: technical reports, guidelines, manuals, resolutions, policies.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['who', 'health', 'medical', 'guidelines', 'public-health'],
    config: {
      url: 'https://iris.who.int/',
      searchUrlTemplate: 'https://iris.who.int/search?query={query}&rpp=25&sort_by=score',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 16. OIOS Portal
  // ═══════════════════════════════════════════
  {
    name: 'OIOS Evaluation & Inspection Reports',
    description: 'oios.un.org — UN Office of Internal Oversight Services: evaluation reports, inspection reports, audit reports, investigation summaries.',
    type: 'OIOS_PORTAL',
    namespace: 'AUDIT',
    tags: ['oios', 'audit', 'evaluation', 'oversight', 'inspection'],
    config: { url: 'https://oios.un.org/resources/' },
  },

  // ═══════════════════════════════════════════
  // 17. RSS Feeds — UN News
  // ═══════════════════════════════════════════
  {
    name: 'UN News — All Topics',
    description: 'news.un.org — UN News all-topics RSS feed. Latest official UN press releases, statements, meetings coverage.',
    type: 'RSS_FEED',
    namespace: 'DEFAULT',
    tags: ['un', 'news', 'rss', 'press-releases'],
    config: { url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
  },
  {
    name: 'UN News — Peace & Security',
    description: 'UN News RSS: peace and security topic feed.',
    type: 'RSS_FEED',
    namespace: 'DEFAULT',
    tags: ['un', 'news', 'rss', 'peace', 'security'],
    config: { url: 'https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml' },
  },
  {
    name: 'UN News — Human Rights',
    description: 'UN News RSS: human rights topic feed.',
    type: 'RSS_FEED',
    namespace: 'DEFAULT',
    tags: ['un', 'news', 'rss', 'human-rights'],
    config: { url: 'https://news.un.org/feed/subscribe/en/news/topic/human-rights/feed/rss.xml' },
  },
  {
    name: 'UN News — Climate Change',
    description: 'UN News RSS: climate change topic feed.',
    type: 'RSS_FEED',
    namespace: 'DEFAULT',
    tags: ['un', 'news', 'rss', 'climate'],
    config: { url: 'https://news.un.org/feed/subscribe/en/news/topic/climate-change/feed/rss.xml' },
  },
  {
    name: 'UN News — Humanitarian Aid',
    description: 'UN News RSS: humanitarian aid and emergencies.',
    type: 'RSS_FEED',
    namespace: 'DEFAULT',
    tags: ['un', 'news', 'rss', 'humanitarian'],
    config: { url: 'https://news.un.org/feed/subscribe/en/news/topic/humanitarian-aid/feed/rss.xml' },
  },
  {
    name: 'UN News — SDGs',
    description: 'UN News RSS: Sustainable Development Goals coverage.',
    type: 'RSS_FEED',
    namespace: 'DEFAULT',
    tags: ['un', 'news', 'rss', 'sdg', 'sustainability'],
    config: { url: 'https://news.un.org/feed/subscribe/en/news/topic/sdgs/feed/rss.xml' },
  },
  {
    name: 'UN News — Economic Development',
    description: 'UN News RSS: economic development and finance.',
    type: 'RSS_FEED',
    namespace: 'DEFAULT',
    tags: ['un', 'news', 'rss', 'economics', 'finance'],
    config: { url: 'https://news.un.org/feed/subscribe/en/news/topic/economic-development/feed/rss.xml' },
  },
  {
    name: 'UN News — Migrants & Refugees',
    description: 'UN News RSS: migration, refugees, displacement.',
    type: 'RSS_FEED',
    namespace: 'DEFAULT',
    tags: ['un', 'news', 'rss', 'migration', 'refugees'],
    config: { url: 'https://news.un.org/feed/subscribe/en/news/topic/migrants-and-refugees/feed/rss.xml' },
  },

  // ═══════════════════════════════════════════
  // 18. RSS Feeds — UN Press
  // ═══════════════════════════════════════════
  {
    name: 'UN Press Releases',
    description: 'press.un.org — Official UN press releases, press conferences, and meeting coverage RSS feed.',
    type: 'RSS_FEED',
    namespace: 'DEFAULT',
    tags: ['un', 'press', 'rss', 'meetings', 'conferences'],
    config: { url: 'https://press.un.org/en/rss.xml' },
  },

  // ═══════════════════════════════════════════
  // 19. UN General Assembly RSS
  // ═══════════════════════════════════════════
  {
    name: 'UN General Assembly RSS',
    description: 'un.org/ga — Official General Assembly news and documents RSS feed.',
    type: 'RSS_FEED',
    namespace: 'DEFAULT',
    tags: ['un', 'general-assembly', 'rss'],
    config: { url: 'https://www.un.org/en/ga/rss/rss_ga.xml' },
  },

  // ═══════════════════════════════════════════
  // 20. Security Council Verbatim Records catalog
  // ═══════════════════════════════════════════
  {
    name: 'UN Security Council Documents',
    description: 'un.org/securitycouncil — Security Council resolutions, verbatim records, press statements. Web catalog with PDF links.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['security-council', 'resolutions', 'verbatim', 'un'],
    config: {
      url: 'https://main.un.org/securitycouncil/en/content/resolutions',
      searchUrlTemplate: '',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 21. UN Treaty Collection
  // ═══════════════════════════════════════════
  {
    name: 'UN Treaty Collection',
    description: 'treaties.un.org — United Nations Treaty Collection: multilateral treaties deposited with the Secretary-General, including status of ratifications.',
    type: 'URL_CATALOG',
    namespace: 'LEGAL',
    tags: ['treaties', 'legal', 'international-law', 'ratification'],
    config: {
      url: 'https://treaties.un.org/pages/Treaties.aspx',
      searchUrlTemplate: 'https://treaties.un.org/pages/UNTSOnline.aspx?id=I&clang=_en&Temp=mtdsg3&Q={query}',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 22. International Court of Justice
  // ═══════════════════════════════════════════
  {
    name: 'ICJ Decisions & Orders',
    description: 'icj-cij.org — International Court of Justice: judgments, advisory opinions, orders, pleadings and correspondence. Official PDF documents.',
    type: 'URL_CATALOG',
    namespace: 'LEGAL',
    tags: ['icj', 'legal', 'court', 'judgments', 'international-law'],
    config: {
      url: 'https://www.icj-cij.org/en/decisions',
      searchUrlTemplate: '',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 23. UNDP Human Development Reports
  // ═══════════════════════════════════════════
  {
    name: 'UNDP Human Development Reports',
    description: 'hdr.undp.org — All Human Development Reports (HDR) since 1990, statistical annexes, technical notes, and thematic reports.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['undp', 'hdr', 'human-development', 'statistics'],
    config: {
      url: 'https://hdr.undp.org/reports-and-publications',
      searchUrlTemplate: 'https://hdr.undp.org/reports-and-publications?search={query}',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 24. UNODC — Drugs and Crime
  // ═══════════════════════════════════════════
  {
    name: 'UNODC Publications',
    description: 'unodc.org — UN Office on Drugs and Crime: World Drug Report, crime statistics, anti-corruption, terrorism prevention publications.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['unodc', 'drugs', 'crime', 'corruption', 'terrorism'],
    config: {
      url: 'https://www.unodc.org/unodc/en/publications/index.html',
      searchUrlTemplate: 'https://www.unodc.org/unodc/search/results.html?q={query}',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 25. WFP — World Food Programme
  // ═══════════════════════════════════════════
  {
    name: 'WFP Publications',
    description: 'docs.wfp.org — World Food Programme official document repository: annual reports, evaluations, emergency assessments, strategic plans.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['wfp', 'food-security', 'humanitarian', 'emergency'],
    config: {
      url: 'https://docs.wfp.org/',
      searchUrlTemplate: 'https://docs.wfp.org/api/documents?title_q={query}&order=default&operation=&page=1',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 26. WFP Documents REST API
  // ═══════════════════════════════════════════
  {
    name: 'WFP Documents API',
    description: 'docs.wfp.org REST API — programmatic access to WFP document database. Supports full-text search, type and date filters.',
    type: 'REST_API',
    namespace: 'DEFAULT',
    tags: ['wfp', 'api', 'food-security', 'documents'],
    config: {
      method: 'GET',
      endpoint: 'https://docs.wfp.org/api/documents',
      searchParam: 'title_q',
      queryParams: {
        order: 'default',
        page: '1',
        per_page: '25',
      },
      auth: { type: 'none' },
      responseMapping: {
        items: 'documents',
        title: 'title',
        url:   'url',
        date:  'publication_date',
        total: 'total_count',
        symbol: 'wbs_code',
      },
    },
  },

  // ═══════════════════════════════════════════
  // 27. IAEA — Nuclear Documents
  // ═══════════════════════════════════════════
  {
    name: 'IAEA Publications',
    description: 'iaea.org — International Atomic Energy Agency: nuclear safety standards, technical reports, nuclear security guidance, safeguards documents.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['iaea', 'nuclear', 'safety', 'safeguards', 'energy'],
    config: {
      url: 'https://www.iaea.org/publications',
      searchUrlTemplate: 'https://www.iaea.org/search?keywords={query}&f%5B0%5D=type%3Apublication',
      linkFilter: '.pdf',
    },
  },

  // ═══════════════════════════════════════════
  // 28. IFAD — Agriculture & Rural Development
  // ═══════════════════════════════════════════
  {
    name: 'IFAD Documents',
    description: 'ifad.org — International Fund for Agricultural Development: project documents, evaluation reports, annual reports, rural poverty assessments.',
    type: 'URL_CATALOG',
    namespace: 'DEFAULT',
    tags: ['ifad', 'agriculture', 'rural-development', 'poverty'],
    config: {
      url: 'https://www.ifad.org/en/publications',
      searchUrlTemplate: 'https://www.ifad.org/en/search?q={query}&type=publication',
      linkFilter: '.pdf',
    },
  },

];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  console.log(`\n🔍  UN Source Catalog Seeder`);
  console.log(`   Sources to seed : ${SOURCES.length}`);
  console.log(`   Dry run         : ${DRY_RUN}`);
  console.log(`   Reset existing  : ${RESET}\n`);

  if (RESET && !DRY_RUN) {
    console.log('  ⚠️  Deleting existing SourceCatalog entries…');
    const existing = await sourceCatalogService.list({ namespace: null, type: null });
    for (const s of existing) {
      await sourceCatalogService.delete(s.id);
    }
    console.log(`  ✓  Deleted ${existing.length} existing entries\n`);
  }

  let created = 0, skipped = 0, failed = 0;

  for (const src of SOURCES) {
    const label = `[${src.type}] ${src.name}`;
    if (DRY_RUN) {
      console.log(`  ✓ (dry-run) ${label}`);
      created++;
      continue;
    }
    try {
      await sourceCatalogService.create(src);
      console.log(`  ✓ Created  ${label}`);
      created++;
    } catch (err) {
      if (err.message?.includes('already exists') || err.message?.includes('unique')) {
        console.log(`  ⊘ Skipped  ${label} (already exists)`);
        skipped++;
      } else {
        console.error(`  ✗ Failed   ${label}: ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\n  ─────────────────────────────────────`);
  console.log(`  Created : ${created}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Failed  : ${failed}`);
  console.log(`  Total   : ${SOURCES.length}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err.message, err.stack);
  process.exit(1);
});
