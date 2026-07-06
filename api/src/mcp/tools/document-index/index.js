'use strict';
/**
 * Document Index MCP Tools
 *
 *  document_index.search  — cross-source local search over harvested document metadata
 *  document_index.get     — fetch one indexed document's metadata by id
 *  document_index.stats   — index size + per-source coverage + indexer status
 *  document_index.control — control the background indexer (start/pause/resume/stop/reindex)
 *
 * These search the LOCAL index only — they never call an external source.
 */

const { BaseTool } = require('../primitives/BaseTool');

let _search = null, _sync = null, _svc = null;
function search() { if (!_search) _search = require('../../../services/indexing/document-index.search'); return _search; }
function sync()   { if (!_sync)   _sync   = require('../../../services/indexing/document-index.sync'); return _sync; }
function svc()    { if (!_svc)    _svc    = require('../../../services/indexing/document-index.service').getDocumentIndexService(); return _svc; }

// ── Search ─────────────────────────────────────────────────────

class DocumentIndexSearchTool extends BaseTool {
  getDefinition() {
    return {
      id: 'document_index.search',
      name: 'Search Document Index',
      version: '1.0.0',
      level: 1,
      category: 'document_index',
      description: [
        'Search documents across ALL configured UN sources using the LOCAL index',
        '(no external calls). Matches on title, symbol, description, abstract and subjects,',
        'with facet filters. Each result includes the direct download link (downloadUrl / pdfUrl)',
        'and the owning source — the file itself is not downloaded.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          q:            { type: 'string',  description: 'Keyword/phrase to search (name, symbol, subject, abstract).' },
          sourceId:     { type: 'string',  description: 'Restrict to one source catalog id.' },
          fileType:     { type: 'string',  description: 'Filter by file type (e.g. pdf, html).' },
          language:     { type: 'string',  description: 'Filter by language code (e.g. EN, FR, ES).' },
          enrichStatus: { type: 'string',  description: 'Filter by enrichment status (none|indexed|enriched|full).' },
          dateFrom:     { type: 'string',  description: 'Lower bound on document date (string compare).' },
          dateTo:       { type: 'string',  description: 'Upper bound on document date.' },
          hasPdf:       { type: 'boolean', description: 'Only documents that have a direct PDF/download link.' },
          semantic:     { type: 'boolean', description: 'Use semantic (vector) search instead of keyword (if enabled).' },
          page:         { type: 'integer', description: 'Page number (1-based).', default: 1 },
          limit:        { type: 'integer', description: 'Results per page (1-100).', default: 20 },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 8000, maxMemoryMb: 30 },
    };
  }

  async execute(args) {
    const result = await search().search({
      q: args.q || '', sourceId: args.sourceId, fileType: args.fileType,
      language: args.language, enrichStatus: args.enrichStatus,
      dateFrom: args.dateFrom, dateTo: args.dateTo,
      hasPdf: args.hasPdf === true, semantic: args.semantic === true,
      page: args.page, limit: args.limit,
    });
    return this.success(result);
  }
}

// ── Get ────────────────────────────────────────────────────────

class DocumentIndexGetTool extends BaseTool {
  getDefinition() {
    return {
      id: 'document_index.get',
      name: 'Get Indexed Document',
      version: '1.0.0',
      level: 1,
      category: 'document_index',
      description: 'Fetch a single indexed document (full metadata + direct download link) by its index id.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Indexed document id.' } },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
    };
  }

  async execute(args) {
    this.validateArgs(args, ['id']);
    const doc = await search().getById(args.id);
    if (!doc) return this.error('NOT_FOUND', `Document ${args.id} not indexed`);
    return this.success(doc);
  }
}

// ── Stats ──────────────────────────────────────────────────────

class DocumentIndexStatsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'document_index.stats',
      name: 'Document Index Stats',
      version: '1.0.0',
      level: 1,
      category: 'document_index',
      description: 'Return index coverage: total indexed documents, enrichment %, per-source progress, and the background indexer status.',
      inputSchema: { type: 'object', properties: {} },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
    };
  }

  async execute() {
    const [idx, vec] = await Promise.all([
      search().stats(),
      sync().stats().catch(() => ({ exists: false })),
    ]);
    return this.success({ ...idx, semantic: vec, indexer: svc().getStatus() });
  }
}

// ── Control ────────────────────────────────────────────────────

class DocumentIndexControlTool extends BaseTool {
  getDefinition() {
    return {
      id: 'document_index.control',
      name: 'Control Document Indexer',
      version: '1.0.0',
      level: 2,
      category: 'document_index',
      description: 'Control the always-on document indexer: start | pause | resume | stop; reindex a single source (resets its harvest cursor); or probe a source\'s current document count by sequential paging (stores the total and re-indexes if it grew).',
      inputSchema: {
        type: 'object',
        required: ['action'],
        properties: {
          action:   { type: 'string', enum: ['start', 'pause', 'resume', 'stop', 'reindex', 'probe'], description: 'Control action.' },
          sourceId: { type: 'string', description: 'Required for action=reindex|probe — the source to re-harvest / recount.' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE'],
    };
  }

  async execute(args) {
    this.validateArgs(args, ['action']);
    const s = svc();
    switch (args.action) {
      case 'start':  return this.success(s.state === 'IDLE' && !s._handle ? (s.schedule(), s.getStatus()) : s.start());
      case 'pause':  return this.success(s.pause());
      case 'resume': return this.success(s.resume());
      case 'stop':   return this.success(s.stop());
      case 'reindex':
        if (!args.sourceId) return this.error('INVALID_ARGS', 'sourceId required for reindex');
        return this.success(await s.reindexSource(args.sourceId));
      case 'probe':
        if (!args.sourceId) return this.error('INVALID_ARGS', 'sourceId required for probe');
        return this.success(await s.probeSource(args.sourceId));
      default: return this.error('INVALID_ARGS', 'unknown action');
    }
  }
}

// ── Registry ───────────────────────────────────────────────────

function createDocumentIndexTools() {
  return [
    new DocumentIndexSearchTool(),
    new DocumentIndexGetTool(),
    new DocumentIndexStatsTool(),
    new DocumentIndexControlTool(),
  ];
}

module.exports = {
  DocumentIndexSearchTool,
  DocumentIndexGetTool,
  DocumentIndexStatsTool,
  DocumentIndexControlTool,
  createDocumentIndexTools,
};
