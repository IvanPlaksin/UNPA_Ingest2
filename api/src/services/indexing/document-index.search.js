'use strict';
/**
 * Document Index — cross-source search over the local SourceDocument index.
 *
 * This is the LOCAL search: it queries the SourceDocument nodes already
 * harvested by the DocumentIndexService and NEVER calls an external source.
 *
 *   - keyword + facet search   → Memgraph (title/symbol/description/abstract
 *                                CONTAINS + facet filters, paginated)
 *   - semantic search          → Qdrant `source_documents` (optional), hydrated
 *                                back from Memgraph
 *   - facets / stats           → Memgraph aggregates
 *
 * Every result carries the direct download link (`pdfUrl`) in its metadata; the
 * file itself is never fetched here.
 */

const mg = require('../memgraph.service');

// ── helpers ───────────────────────────────────────────────────

function parseJsonArr(v) { try { return JSON.parse(v || '[]'); } catch { return []; } }
function parseJsonObj(v) { try { return v ? JSON.parse(v) : {}; } catch { return {}; } }

function formatDoc(r) {
  return {
    id:            r.id,
    sourceId:      r.sourceId,
    sourceName:    r.sourceName || '',
    title:         r.title || '',
    symbol:        r.symbol || '',
    url:           r.url || '',
    pdfUrl:        r.pdfUrl || '',          // direct PDF link when the source exposes one
    downloadUrl:   r.downloadUrl || r.pdfUrl || r.url || '', // direct download link (never downloaded here)
    fileType:      r.fileType || '',
    date:          r.date || '',
    description:   r.description || '',
    abstract:      r.abstract || '',
    languages:     parseJsonArr(r.languages),
    subjects:      parseJsonArr(r.subjects),
    canonicalKey:  r.canonicalKey || '',
    enrichStatus:  r.enrichStatus || 'none',
    indexStatus:   r.indexStatus || 'pending',
    discoveredAt:  r.discoveredAt || null,
    indexedAt:     r.indexedAt || null,
    metadata:      parseJsonObj(r.metadata),
  };
}

// WHERE clause shared by search + count + facets. Returns { where, params }.
function buildWhere(opts) {
  const {
    q = '', sourceId = null, fileType = null, language = null,
    enrichStatus = null, dateFrom = null, dateTo = null, hasPdf = false,
  } = opts;

  const conds = [];
  const params = {};

  const query = (q || '').trim().toLowerCase();
  if (query) {
    params.q = query;
    conds.push(`(toLower(d.title) CONTAINS $q OR toLower(coalesce(d.symbol,'')) CONTAINS $q
      OR toLower(coalesce(d.description,'')) CONTAINS $q OR toLower(coalesce(d.abstract,'')) CONTAINS $q
      OR toLower(coalesce(d.subjects,'')) CONTAINS $q)`);
  }
  if (sourceId)     { conds.push('d.sourceId = $sourceId');         params.sourceId = sourceId; }
  if (fileType)     { conds.push('d.fileType = $fileType');         params.fileType = fileType; }
  if (enrichStatus) { conds.push('d.enrichStatus = $enrichStatus'); params.enrichStatus = enrichStatus; }
  if (language)     { conds.push('d.languages CONTAINS $langTok');  params.langTok = `"${language}"`; }
  if (dateFrom)     { conds.push('d.date >= $dateFrom');            params.dateFrom = dateFrom; }
  if (dateTo)       { conds.push('d.date <= $dateTo');              params.dateTo = dateTo; }
  if (hasPdf)       { conds.push(`d.pdfUrl IS NOT NULL AND d.pdfUrl <> ''`); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return { where, params };
}

const RETURN_FIELDS = `
  d.id as id, d.sourceId as sourceId, d.title as title, d.symbol as symbol,
  d.url as url, d.pdfUrl as pdfUrl, d.downloadUrl as downloadUrl, d.fileType as fileType, d.date as date,
  d.description as description, d.abstract as abstract, d.languages as languages,
  d.subjects as subjects, d.canonicalKey as canonicalKey, d.enrichStatus as enrichStatus,
  d.indexStatus as indexStatus, d.discoveredAt as discoveredAt, d.indexedAt as indexedAt,
  d.metadata as metadata`;

// ── keyword + facet search (Memgraph) ─────────────────────────

async function keywordSearch(opts = {}) {
  const page  = Math.max(1, parseInt(opts.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 20));
  const skip  = (page - 1) * limit;

  const { where, params } = buildWhere(opts);

  const rows = await mg.runQuery(
    `MATCH (d:SourceDocument)
     ${where}
     WITH d ORDER BY d.date DESC, d.discoveredAt DESC
     SKIP ${skip} LIMIT ${limit}
     OPTIONAL MATCH (s:SourceCatalog {id: d.sourceId})
     RETURN ${RETURN_FIELDS}, s.name as sourceName`,
    params
  );

  const countRows = await mg.runQuery(
    `MATCH (d:SourceDocument)
     ${where}
     RETURN count(d) as total`,
    params
  );
  const total = Number(countRows[0]?.total) || 0;

  return {
    results: rows.map(formatDoc),
    total,
    page,
    limit,
    hasMore: skip + limit < total,
    mode: 'keyword',
  };
}

// ── semantic search (Qdrant → hydrate from Memgraph) ──────────

async function semanticSearch(opts = {}) {
  const limit = Math.min(100, Math.max(1, parseInt(opts.limit, 10) || 20));
  const q = (opts.q || '').trim();
  if (!q) return keywordSearch(opts);

  const sync = require('./document-index.sync');
  let hits = [];
  try {
    hits = await sync.semanticSearch(q, opts, limit * 3);
  } catch (e) {
    // Semantic path unavailable → transparent fallback to keyword.
    return { ...(await keywordSearch(opts)), mode: 'keyword-fallback', semanticError: e.message };
  }
  if (!hits.length) return { results: [], total: 0, page: 1, limit, hasMore: false, mode: 'semantic' };

  const ids = hits.map(h => h.id);
  const rows = await mg.runQuery(
    `MATCH (d:SourceDocument)
     WHERE d.id IN $ids
     OPTIONAL MATCH (s:SourceCatalog {id: d.sourceId})
     RETURN ${RETURN_FIELDS}, s.name as sourceName`,
    { ids }
  );
  const byId = new Map(rows.map(r => [r.id, formatDoc(r)]));
  const scoreById = new Map(hits.map(h => [h.id, h.score]));

  const results = hits
    .map(h => byId.get(h.id))
    .filter(Boolean)
    .map(d => ({ ...d, score: scoreById.get(d.id) }))
    .slice(0, limit);

  return { results, total: results.length, page: 1, limit, hasMore: false, mode: 'semantic' };
}

// ── public search dispatcher ──────────────────────────────────

async function search(opts = {}) {
  return opts.semantic ? semanticSearch(opts) : keywordSearch(opts);
}

// ── facets ────────────────────────────────────────────────────

async function facets(opts = {}) {
  const { where, params } = buildWhere(opts);

  const bySource = await mg.runQuery(
    `MATCH (d:SourceDocument)
     ${where}
     WITH d.sourceId as id, count(d) as count
     OPTIONAL MATCH (s:SourceCatalog {id: id})
     RETURN id, s.name as name, count
     ORDER BY count DESC`,
    params
  );
  const byType = await mg.runQuery(
    `MATCH (d:SourceDocument)
     ${where}
     RETURN coalesce(d.fileType,'unknown') as value, count(d) as count
     ORDER BY count DESC`,
    params
  );
  const byEnrich = await mg.runQuery(
    `MATCH (d:SourceDocument)
     ${where}
     RETURN coalesce(d.enrichStatus,'none') as value, count(d) as count
     ORDER BY count DESC`,
    params
  );

  return {
    sources:      bySource.map(r => ({ id: r.id, name: r.name, count: Number(r.count) })),
    fileTypes:    byType.map(r => ({ value: r.value, count: Number(r.count) })),
    enrichStatus: byEnrich.map(r => ({ value: r.value, count: Number(r.count) })),
  };
}

// ── stats / coverage ──────────────────────────────────────────

async function stats() {
  const totals = await mg.runQuery(
    `MATCH (d:SourceDocument)
     RETURN count(d) as total,
            count(CASE WHEN d.enrichStatus = 'enriched' OR d.enrichStatus = 'full' THEN 1 END) as enriched,
            count(CASE WHEN d.pdfUrl IS NOT NULL AND d.pdfUrl <> '' THEN 1 END) as withPdf`,
    {}
  );
  const perSource = await mg.runQuery(
    `MATCH (s:SourceCatalog)
     OPTIONAL MATCH (d:SourceDocument {sourceId: s.id})
     RETURN s.id as id, s.name as name, s.type as type,
            s.namespace as namespace, s.enabled as enabled,
            s.indexStatus as indexStatus, s.indexCursor as indexCursor,
            s.indexTotal as indexTotal, s.indexTotalMethod as indexTotalMethod,
            s.indexTotalAt as indexTotalAt, s.lastIndexedAt as lastIndexedAt,
            count(d) as indexed,
            count(CASE WHEN d.enrichStatus IN ['enriched','full'] THEN 1 END) as enriched,
            count(CASE WHEN d.pdfUrl IS NOT NULL AND d.pdfUrl <> '' THEN 1 END) as withPdf
     ORDER BY name`,
    {}
  );
  const t = totals[0] || {};
  const sources = perSource.map(r => ({
    id: r.id, name: r.name, type: r.type,
    namespace:     r.namespace || 'DEFAULT',
    enabled:       r.enabled !== false,
    indexed:       Number(r.indexed) || 0,
    enriched:      Number(r.enriched) || 0,
    withPdf:       Number(r.withPdf) || 0,
    indexStatus:   r.indexStatus || 'pending',
    indexCursor:   Number(r.indexCursor) || 0,
    indexTotal:    r.indexTotal != null ? Number(r.indexTotal) : null,
    indexTotalMethod: r.indexTotalMethod || null,
    indexTotalAt:  r.indexTotalAt || null,
    lastIndexedAt: r.lastIndexedAt || null,
  }));
  return {
    total:    Number(t.total) || 0,
    enriched: Number(t.enriched) || 0,
    withPdf:  Number(t.withPdf) || 0,
    sourcesTotal:    sources.length,
    sourcesComplete: sources.filter(s => s.indexStatus === 'complete').length,
    sourcesIndexing: sources.filter(s => s.indexStatus === 'indexing').length,
    sourcesPending:  sources.filter(s => s.indexStatus === 'pending' || !s.indexStatus).length,
    sources,
  };
}

async function getById(id) {
  const rows = await mg.runQuery(
    `MATCH (d:SourceDocument {id: $id})
     OPTIONAL MATCH (s:SourceCatalog {id: d.sourceId})
     RETURN ${RETURN_FIELDS}, s.name as sourceName
     LIMIT 1`,
    { id }
  );
  return rows.length ? formatDoc(rows[0]) : null;
}

module.exports = { search, keywordSearch, semanticSearch, facets, stats, getById, formatDoc, buildWhere };
