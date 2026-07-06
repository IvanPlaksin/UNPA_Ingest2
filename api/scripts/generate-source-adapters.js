'use strict';
/**
 * generate-source-adapters.js
 *
 * Emits one per-source adapter module under
 *   api/src/services/knowledge/source-adapters/sources/<key>.js
 * from each research descriptor in
 *   api/src/services/knowledge/source-adapters/research/<key>.json
 *
 * Each module is a thin subclass of its family base carrying the researched
 * capabilities, filter schema, download/enrich modes, a limitations note and
 * the connection config (also seeded to the DB). Rich behavior (Invenio MARCXML
 * enrich, DSpace bitstream download, ODS refine filters) lives in the family
 * base, so these modules stay declarative.
 *
 * Usage: node api/scripts/generate-source-adapters.js
 */

const fs   = require('fs');
const path = require('path');

const RESEARCH_DIR = path.resolve(__dirname, '../src/services/knowledge/source-adapters/research');
const OUT_DIR      = path.resolve(__dirname, '../src/services/knowledge/source-adapters/sources');

const FAMILY = {
  'invenio':      { cls: 'InvenioAdapter',      file: 'invenio' },
  'dspace':       { cls: 'DspaceAdapter',       file: 'dspace' },
  'opendatasoft': { cls: 'OpendatasoftAdapter', file: 'opendatasoft' },
  'rest-api':     { cls: 'RestApiAdapter',      file: 'rest-api' },
  'url-catalog':  { cls: 'UrlCatalogAdapter',   file: 'url-catalog' },
  'rss-feed':     { cls: 'RssFeedAdapter',      file: 'rss-feed' },
  'oai-pmh':      { cls: 'OaiPmhAdapter',       file: 'oai-pmh' },
  'ods':          { cls: 'OdsAdapter',          file: 'ods' },
  'oios':         { cls: 'OiosAdapter',         file: 'oios' },
};

const VALID_CAPS = ['search','browseAll','paginate','filter','sort','download','enrich','fulltext'];
const VALID_CAPS_SET = new Set(VALID_CAPS);
const VALID_FILTERS = new Set(['dateFrom','dateTo','year','yearFrom','yearTo','language','docType','symbol','author','subject','collection','topic','country','owner','keyword']);

// Some research agents used a non-canonical capability vocabulary; map it.
const CAP_ALIAS = {
  pagination:'paginate', paginated:'paginate',
  datefilter:'filter', typefilter:'filter', languagefilter:'filter', countryfilter:'filter',
  collectionfilter:'filter', subjectfilter:'filter', facets:'filter', facet:'filter', filtering:'filter',
  itemmetadata:'enrich', metadata:'enrich', enrichment:'enrich',
  bitstreamdownload:'download', filedownload:'download', pdfdownload:'download',
  linkharvest:'browseAll', harvest:'browseAll', list:'browseAll', browse:'browseAll',
  fulltextsearch:'fulltext', keywordsearch:'search', textsearch:'search',
};

// Families whose adapters actually apply structured filters.
const FILTER_FAMILIES = new Set(['rest-api','dspace','opendatasoft','invenio','oai-pmh','rss-feed']);
// Families whose adapters actually implement per-record enrichment.
// (rest-api / opendatasoft list records are already field-rich, so no separate
//  enrich call — declaring it would be a capability the base can't fulfil.)
const ENRICH_FAMILIES = new Set(['dspace','invenio']);
// Families whose adapters implement server-side sorting.
const SORT_FAMILIES   = new Set(['rest-api','dspace','opendatasoft','invenio']);

function normalizeCaps(list, family, research, filterSchema) {
  const out = new Set();
  for (const c of (list || [])) {
    const mapped = VALID_CAPS_SET.has(c) ? c : CAP_ALIAS[String(c).toLowerCase()];
    if (mapped && VALID_CAPS_SET.has(mapped)) out.add(mapped);
  }
  // Download works everywhere (base resolveDownload); enrich only where implemented.
  if (research.download?.mode && research.download.mode !== 'none') out.add('download');
  if (!ENRICH_FAMILIES.has(family)) out.delete('enrich');
  else if (research.enrich?.mode && research.enrich.mode !== 'none') out.add('enrich');
  // Sorting only where the adapter implements it.
  if (!SORT_FAMILIES.has(family)) out.delete('sort');
  // Structured filters only count for families that implement them.
  if (FILTER_FAMILIES.has(family) && filterSchema.length) out.add('filter');
  else out.delete('filter');
  if (out.has('search') || out.has('filter')) out.add('paginate');
  // Every reachable source can at least list; keep blocked ones minimal but non-empty.
  if (research.verified !== false || out.size === 0) out.add('browseAll');
  return VALID_CAPS.filter(c => out.has(c));
}

function classNameFor(key) {
  return key.split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join('') + 'Adapter';
}

/** First sentence(s) of the ## Limitations section, for the capability note. */
function limitationsNote(md) {
  if (!md) return '';
  const m = /##\s*Limitations\s*\n([\s\S]*?)(\n##\s|$)/i.exec(md);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim().slice(0, 240);
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.json'));
  let written = 0;
  const summary = [];

  for (const file of files) {
    const research = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, file), 'utf8'));
    const key = research.key;
    if (!key) { console.warn(`skip ${file}: no key`); continue; }

    const fam = FAMILY[research.family] || FAMILY['url-catalog'];
    const cls = classNameFor(key);

    // Only keep filter schemas for families whose adapters apply them.
    const filterSchema = FILTER_FAMILIES.has(research.family)
      ? (research.filterSchema || []).filter(f => f && VALID_FILTERS.has(f.type))
      : [];
    const caps = normalizeCaps(research.capabilities, research.family, research, filterSchema);

    // Connection config baked into the adapter (DB seed can override).
    const cfg = { adapterKey: key, ...(research.config || {}) };
    // Preserve an "intended" config some research recorded for gated APIs.
    if (research.config?._intendedApi) cfg._intendedApi = research.config._intendedApi;

    const note = research.verified === false
      ? `Limited/unverified: ${limitationsNote(research.methodologyMarkdown) || (research.probeNotes || '').slice(0, 200)}`
      : limitationsNote(research.methodologyMarkdown);

    const lines = [
      `  static key          = ${JSON.stringify(key)};`,
      `  static family       = ${JSON.stringify(research.family)};`,
      `  static capabilities = ${JSON.stringify(caps)};`,
      `  static filterSchema = ${JSON.stringify(filterSchema, null, 2).replace(/\n/g, '\n  ')};`,
    ];
    if (research.download?.mode) lines.push(`  static downloadMode = ${JSON.stringify(research.download.mode)};`);
    if (research.enrich?.mode && research.enrich.mode !== 'none') lines.push(`  static enrichMode   = ${JSON.stringify(research.enrich.mode)};`);
    if (note) lines.push(`  static notes        = ${JSON.stringify(note)};`);
    lines.push(`  static defaultConfig = ${JSON.stringify(cfg, null, 2).replace(/\n/g, '\n  ')};`);

    const body = `'use strict';
/**
 * Per-source adapter — ${research.name} (${key}).
 * Family: ${research.family}. Auto-generated from research/${key}.json by
 * scripts/generate-source-adapters.js — edit the research descriptor + regenerate,
 * or add method overrides below the generated block.
 */

const { ${fam.cls} } = require('../family/${fam.file}.adapter');

class ${cls} extends ${fam.cls} {
${lines.join('\n')}
}

module.exports = ${cls};
`;

    fs.writeFileSync(path.join(OUT_DIR, `${key}.js`), body);
    written++;
    summary.push(`${key.padEnd(22)} ${research.family.padEnd(13)} caps=${caps.length} filters=${filterSchema.length}${research.verified === false ? '  [unverified]' : ''}`);
  }

  console.log(`Generated ${written} per-source adapter modules → ${OUT_DIR}\n`);
  console.log(summary.sort().join('\n'));
}

main();
