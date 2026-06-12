'use strict';
/**
 * seed-un-source-catalog-2.js — Add new UN sources discovered in Phase 2 research.
 *
 * Probe results from probe-new-sources.js:
 *   WORKING: ESCAP Publications (276 links), UPU (373 links), UNFPA (12 PDFs),
 *            UNDRR (accessible), CEB/HLCM (12 PDFs), Montreal Protocol (21 PDFs),
 *            CBD (8 PDFs), ITLOS (200 links), UNIDIR, UNRISD, JIU Reports,
 *            IPCC Reports, UNCCD, WIPO, WMO, ECLAC (OAI-PMH: 44k+ docs)
 *   BLOCKED: ICC, CITES, ITU, IMO, ReliefWeb RSS
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const existing = await sourceCatalogService.list({ namespace: null, type: null });
  const existingNames = new Set(existing.map(s => s.name));

  const sources = [

    // ── REGIONAL COMMISSIONS ─────────────────────────────────────────────────

    {
      name: 'ECLAC Repository',
      type: 'OAI_PMH',
      description: 'ECLAC/CEPAL institutional repository — 44,000+ documents via OAI-PMH protocol.',
      namespace: 'UN',
      tags: ['regional-commission', 'latin-america', 'oai-pmh'],
      config: {
        endpoint: 'https://repositorio.cepal.org/server/oai/request',
        metadataPrefix: 'oai_dc',
        from: '2020-01-01',
      },
    },

    {
      name: 'ESCAP Publications',
      type: 'URL_CATALOG',
      description: 'UN Economic and Social Commission for Asia and the Pacific — publications catalogue.',
      namespace: 'UN',
      tags: ['regional-commission', 'asia-pacific'],
      config: {
        url: 'https://www.unescap.org/publications',
        searchUrlTemplate: 'https://www.unescap.org/publications?search={query}',
        linkFilter: '',
        includeAllLinks: false,
      },
    },

    // ── RESEARCH INSTITUTES ──────────────────────────────────────────────────

    {
      name: 'UNU Collections',
      type: 'URL_CATALOG',
      description: 'United Nations University collections — research publications and working papers.',
      namespace: 'UN',
      tags: ['research-institute', 'university'],
      config: {
        url: 'https://collections.unu.edu/',
        searchUrlTemplate: 'https://collections.unu.edu/?q={query}',
        linkFilter: '',
        includeAllLinks: false,
      },
    },

    {
      name: 'UNRISD Publications',
      type: 'URL_CATALOG',
      description: 'UN Research Institute for Social Development — policy research publications.',
      namespace: 'UN',
      tags: ['research-institute', 'social-development'],
      config: {
        url: 'https://www.unrisd.org/en/publications',
        searchUrlTemplate: 'https://www.unrisd.org/en/search?q={query}',
        linkFilter: '',
        includeAllLinks: false,
      },
    },

    {
      name: 'UNIDIR Publications',
      type: 'URL_CATALOG',
      description: 'UN Institute for Disarmament Research — disarmament and security publications.',
      namespace: 'UN',
      tags: ['research-institute', 'disarmament'],
      config: {
        url: 'https://unidir.org/publications',
        searchUrlTemplate: 'https://unidir.org/publications?search={query}',
        linkFilter: '',
        includeAllLinks: false,
      },
    },

    {
      name: 'JIU Reports',
      type: 'URL_CATALOG',
      description: 'UN Joint Inspection Unit — system-wide evaluations and inspections.',
      namespace: 'UN',
      tags: ['inspection', 'oversight', 'evaluation'],
      config: {
        url: 'https://www.unjiu.org/content/reports-notes',
        searchUrlTemplate: 'https://www.unjiu.org/content/reports-notes?search={query}',
        linkFilter: '.pdf',
        includeAllLinks: false,
      },
    },

    // ── TRIBUNALS & LEGAL ────────────────────────────────────────────────────

    {
      name: 'ITLOS Cases',
      type: 'URL_CATALOG',
      description: 'International Tribunal for the Law of the Sea — case list and judgments.',
      namespace: 'UN',
      tags: ['tribunal', 'legal', 'law-of-the-sea'],
      config: {
        url: 'https://www.itlos.org/en/main/cases/list-of-cases/',
        searchUrlTemplate: 'https://www.itlos.org/en/main/cases/list-of-cases/?search={query}',
        linkFilter: '',
        includeAllLinks: true,
      },
    },

    // ── SPECIALIZED AGENCIES ─────────────────────────────────────────────────

    {
      name: 'WIPO Publications',
      type: 'URL_CATALOG',
      description: 'World Intellectual Property Organization — publications on IP law and policy.',
      namespace: 'UN',
      tags: ['specialized-agency', 'intellectual-property'],
      config: {
        url: 'https://www.wipo.int/publications/en/',
        searchUrlTemplate: 'https://www.wipo.int/publications/en/?search={query}',
        linkFilter: '',
        includeAllLinks: false,
      },
    },

    {
      name: 'WMO Library',
      type: 'URL_CATALOG',
      description: 'World Meteorological Organization library — meteorology and climate publications.',
      namespace: 'UN',
      tags: ['specialized-agency', 'meteorology', 'climate'],
      config: {
        url: 'https://library.wmo.int/',
        searchUrlTemplate: 'https://library.wmo.int/search.php?q={query}',
        linkFilter: '',
        includeAllLinks: false,
      },
    },

    {
      name: 'UPU Publications',
      type: 'URL_CATALOG',
      description: 'Universal Postal Union — postal sector publications and annual reports.',
      namespace: 'UN',
      tags: ['specialized-agency', 'postal'],
      config: {
        url: 'https://www.upu.int/en/Publications',
        searchUrlTemplate: 'https://www.upu.int/en/Publications?search={query}',
        linkFilter: '',
        includeAllLinks: false,
      },
    },

    // ── PROGRAMMES & FUNDS ───────────────────────────────────────────────────

    {
      name: 'UNFPA Publications',
      type: 'URL_CATALOG',
      description: 'UN Population Fund — population, reproductive health, and gender publications.',
      namespace: 'UN',
      tags: ['fund', 'population', 'health'],
      config: {
        url: 'https://www.unfpa.org/publications',
        searchUrlTemplate: 'https://www.unfpa.org/publications?search={query}',
        linkFilter: '.pdf',
        includeAllLinks: false,
      },
    },

    {
      name: 'UNDRR Publications',
      type: 'URL_CATALOG',
      description: 'UN Office for Disaster Risk Reduction — Sendai Framework and disaster risk publications.',
      namespace: 'UN',
      tags: ['programme', 'disaster-risk', 'sendai'],
      config: {
        url: 'https://www.undrr.org/publications',
        searchUrlTemplate: 'https://www.undrr.org/publications?search={query}',
        linkFilter: '',
        includeAllLinks: false,
      },
    },

    {
      name: 'CEB Reports',
      type: 'URL_CATALOG',
      description: 'UN System Chief Executives Board — coordination reports and HLCM documents.',
      namespace: 'UN',
      tags: ['coordination', 'ceb', 'hlcm'],
      config: {
        url: 'https://unsceb.org/content/reports',
        searchUrlTemplate: 'https://unsceb.org/search?q={query}',
        linkFilter: '.pdf',
        includeAllLinks: false,
      },
    },

    // ── TREATY BODIES & CONVENTIONS ──────────────────────────────────────────

    {
      name: 'IPCC Reports',
      type: 'URL_CATALOG',
      description: 'Intergovernmental Panel on Climate Change — assessment reports and working group publications.',
      namespace: 'UN',
      tags: ['treaty-body', 'climate-change', 'ipcc'],
      config: {
        url: 'https://www.ipcc.ch/reports/',
        searchUrlTemplate: 'https://www.ipcc.ch/reports/?search={query}',
        linkFilter: '',
        includeAllLinks: false,
      },
    },

    {
      name: 'CBD Documents',
      type: 'URL_CATALOG',
      description: 'Convention on Biological Diversity — documents, decisions, and Kunming-Montreal framework.',
      namespace: 'UN',
      tags: ['convention', 'biodiversity', 'cbd'],
      config: {
        url: 'https://www.cbd.int/documents',
        searchUrlTemplate: 'https://www.cbd.int/documents?search={query}',
        linkFilter: '.pdf',
        includeAllLinks: false,
      },
    },

    {
      name: 'UNCCD Resources',
      type: 'URL_CATALOG',
      description: 'UN Convention to Combat Desertification — land degradation and drought publications.',
      namespace: 'UN',
      tags: ['convention', 'desertification', 'land'],
      config: {
        url: 'https://www.unccd.int/resources',
        searchUrlTemplate: 'https://www.unccd.int/resources?search={query}',
        linkFilter: '',
        includeAllLinks: false,
      },
    },

    {
      name: 'Montreal Protocol',
      type: 'URL_CATALOG',
      description: 'Montreal Protocol on ozone-depleting substances — official treaty documents and reports.',
      namespace: 'UN',
      tags: ['treaty', 'ozone', 'montreal-protocol'],
      config: {
        url: 'https://ozone.unep.org/treaties/montreal-protocol',
        searchUrlTemplate: 'https://ozone.unep.org/treaties/montreal-protocol?search={query}',
        linkFilter: '.pdf',
        includeAllLinks: false,
      },
    },

  ];

  console.log(`\nSeeding ${sources.length} new UN sources...\n`);
  let created = 0, skipped = 0, failed = 0;

  for (const src of sources) {
    if (existingNames.has(src.name)) {
      console.log(`  ⊘ Already exists: "${src.name}"`);
      skipped++;
      continue;
    }
    try {
      await sourceCatalogService.create({
        name:        src.name,
        type:        src.type,
        description: src.description,
        namespace:   src.namespace || 'UN',
        tags:        src.tags || [],
        config:      src.config,
        isActive:    true,
      });
      console.log(`  ✓ Created: [${src.type}] ${src.name}`);
      created++;
    } catch (e) {
      console.error(`  ✗ Failed: ${src.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n  Created: ${created}  Skipped: ${skipped}  Failed: ${failed}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
