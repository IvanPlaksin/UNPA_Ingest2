'use strict';
const {
  createEnvelope, buildNode, PROJECTION_KIND,
} = require('../../../constants/canonical-graph.constants');

/**
 * SEARCH primitive — multi-source document search over the project's knowledge sources.
 *
 * Searches selected sources via two complementary paths:
 *   1. Indexed docs  — local SourceDocument index (Qdrant/Memgraph)
 *   2. External browse — live adapter call to each source's search API
 *
 * 'EntityStore' entries in the sources list are skipped here (handled by LOCATE).
 *
 * Input params:
 *   query          {string}   required — search terms
 *   sources        {array}    required — mix of 'EntityStore' and catalog source UUIDs
 *   limit          {number}   default 10 — max results per source per path
 *   searchIndexed  {boolean}  default true  — query local SourceDocument index
 *   searchExternal {boolean}  default true  — browse external source API
 *
 * Output: CGE envelope (projection.kind = 'list')
 *   nodes:   document results as CGE nodes
 *   summary: { query, sourceCount, totalFound, pathBreakdown, errors }
 */

const PRIMITIVE_TYPE = 'SEARCH';

const inputSchema = {
  query:          { type: 'string',  required: true,  description: 'Search query' },
  sources:        { type: 'array',   required: true,  description: 'Source IDs (catalog UUIDs + "EntityStore")' },
  limit:          { type: 'number',  required: false, description: 'Max results per source per path (default 10)' },
  searchIndexed:  { type: 'boolean', required: false, description: 'Search indexed documents (default true)' },
  searchExternal: { type: 'boolean', required: false, description: 'Browse external source API (default true)' },
};

async function execute(params, _context, services) {
  const {
    query,
    sources        = [],
    limit          = 10,
    searchIndexed  = true,
    searchExternal = true,
  } = params;

  if (!query) throw new Error('SEARCH requires a query');

  const { documentIndexSearch, sourceCatalogService } = services;

  // Only catalog source UUIDs — EntityStore is handled by LOCATE
  const catalogSourceIds = (sources || []).filter(
    s => s !== 'EntityStore' && typeof s === 'string' && s.length > 8,
  );

  const allResults = [];
  const errors     = [];

  for (const sourceId of catalogSourceIds) {

    // ── Path 1: Indexed docs ─────────────────────────────────────────────────
    if (searchIndexed && documentIndexSearch) {
      try {
        const indexed = await documentIndexSearch.search({
          q:       query,
          sourceId,
          limit,
        });
        for (const doc of indexed.results || []) {
          allResults.push({
            _path:       'indexed',
            id:          `idx:${doc.id}`,
            sourceId:    doc.sourceId || sourceId,
            sourceName:  doc.sourceName || '',
            title:       doc.title || doc.symbol || doc.id,
            description: doc.abstract || doc.description || '',
            url:         doc.url || doc.pdfUrl || null,
            language:    (doc.languages || [])[0] || null,
            publishedAt: doc.date || null,
            score:       doc._score || null,
          });
        }
      } catch (e) {
        errors.push({ sourceId, path: 'indexed', error: e.message });
      }
    }

    // ── Path 2: External browse ──────────────────────────────────────────────
    if (searchExternal && sourceCatalogService) {
      try {
        const ext = await sourceCatalogService.browse(sourceId, { query, limit });
        for (const item of ext.results || []) {
          allResults.push({
            _path:       'external',
            id:          `ext:${sourceId}:${item.id || item.title || Math.random()}`,
            sourceId,
            sourceName:  ext.sourceName || '',
            title:       item.title || item.name || '',
            description: item.description || item.abstract || '',
            url:         item.url || item.pdfUrl || null,
            language:    item.language || null,
            publishedAt: item.date || item.publishedAt || null,
          });
        }
      } catch (e) {
        errors.push({ sourceId, path: 'external', error: e.message });
      }
    }
  }

  // ── Build CGE envelope ───────────────────────────────────────────────────
  const envelope = createEnvelope({
    roots:      [],
    kind:       PROJECTION_KIND.LIST,
    hints: {
      query,
      pathBreakdown: {
        indexed:  allResults.filter(r => r._path === 'indexed').length,
        external: allResults.filter(r => r._path === 'external').length,
      },
      errors: errors.length ? errors : undefined,
    },
    producedBy: 'TOOL',
    toolId:     'investigation.search',
  });

  for (const r of allResults) {
    envelope.nodes.push(buildNode({
      id:          r.id,
      type:        'SourceDocument',
      name:        r.title,
      description: r.description,
      properties: {
        sourceId:    r.sourceId,
        sourceName:  r.sourceName,
        searchPath:  r._path,
        url:         r.url,
        language:    r.language,
        publishedAt: r.publishedAt,
        score:       r.score || null,
      },
      epistemicLayer: 'document',
    }));
  }

  envelope.summary = {
    headline:    `Document search: "${query}"`,
    query,
    sourceCount: catalogSourceIds.length,
    totalFound:  allResults.length,
    pathBreakdown: {
      indexed:  allResults.filter(r => r._path === 'indexed').length,
      external: allResults.filter(r => r._path === 'external').length,
    },
    ...(errors.length ? { errors } : {}),
  };

  const evidencedBy = allResults.map(r => r.id).slice(0, 20);
  return { content: envelope, evidencedBy };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
