'use strict';
/**
 * Source Catalog MCP Tools
 *
 *  source_catalog.list    — list catalog entries (filter by namespace / type)
 *  source_catalog.get     — get single entry by id
 *  source_catalog.create  — create a new catalog entry
 *  source_catalog.update  — update an existing entry
 *  source_catalog.delete  — delete an entry
 *  source_catalog.browse  — search documents from a configured external source
 *  source_catalog.import  — download and import a discovered document
 */

const { BaseTool } = require('../primitives/BaseTool');

let _svc = null;
function getSvc() {
  if (!_svc) _svc = require('../../../services/knowledge/source-catalog.service').sourceCatalogService;
  return _svc;
}

// ── List ─────────────────────────────────────────────────────────────────────

class SourceCatalogListTool extends BaseTool {
  getDefinition() {
    return {
      id: 'source_catalog.list',
      name: 'List Source Catalog',
      version: '1.0.0',
      level: 1,
      category: 'source_catalog',
      description: 'List configured external information sources. Filter by namespace or type. Returns name, type, description, tags, and namespace for each entry.',
      inputSchema: {
        type: 'object',
        properties: {
          namespace: {
            type: 'string',
            description: 'Filter by namespace (DEFAULT, INEED, KM, HR, FINANCE, PROCUREMENT, LEGAL, IT, AUDIT)',
          },
          type: {
            type: 'string',
            enum: ['URL_CATALOG', 'REST_API', 'RSS_FEED', 'ODS_API', 'OIOS_PORTAL'],
            description: 'Filter by source type',
          },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 3000, maxMemoryMb: 10 },
    };
  }

  async execute(args) {
    const results = await getSvc().list({
      namespace: args.namespace || null,
      type: args.type || null,
    });
    return this.success({ sources: results, count: results.length });
  }
}

// ── Get ──────────────────────────────────────────────────────────────────────

class SourceCatalogGetTool extends BaseTool {
  getDefinition() {
    return {
      id: 'source_catalog.get',
      name: 'Get Source Catalog Entry',
      version: '1.0.0',
      level: 1,
      category: 'source_catalog',
      description: 'Get full details of a single source catalog entry including connection configuration.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Source catalog entry ID' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
    };
  }

  async execute(args) {
    this.validateArgs(args, ['id']);
    const result = await getSvc().get(args.id);
    if (!result) return this.error('NOT_FOUND', `Source ${args.id} not found`);
    return this.success(result);
  }
}

// ── Create ───────────────────────────────────────────────────────────────────

class SourceCatalogCreateTool extends BaseTool {
  getDefinition() {
    return {
      id: 'source_catalog.create',
      name: 'Create Source Catalog Entry',
      version: '1.0.0',
      level: 2,
      category: 'source_catalog',
      description: 'Register a new external information source in the catalog. Supports URL_CATALOG, REST_API, RSS_FEED, ODS_API, OIOS_PORTAL types.',
      inputSchema: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name:        { type: 'string', description: 'Human-readable source name' },
          description: { type: 'string', description: 'Brief description of the source' },
          type: {
            type: 'string',
            enum: ['URL_CATALOG', 'REST_API', 'RSS_FEED', 'ODS_API', 'OIOS_PORTAL'],
            description: 'Source type determining browsing strategy',
          },
          namespace: {
            type: 'string',
            description: 'Target namespace for imported documents (default: DEFAULT)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Classification tags',
          },
          config: {
            type: 'object',
            description: [
              'Type-specific connection config.',
              'URL_CATALOG: { url, searchUrlTemplate?, linkFilter? }',
              'REST_API: { method, endpoint, searchParam, queryParams, auth, responseMapping }',
              'RSS_FEED: { url }',
              'ODS_API: { defaultQuery?, language? }',
              'OIOS_PORTAL: { url? }',
            ].join(' '),
          },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE'],
    };
  }

  async execute(args) {
    this.validateArgs(args, ['name', 'type']);
    const result = await getSvc().create({
      name: args.name,
      description: args.description || '',
      type: args.type,
      namespace: args.namespace || 'DEFAULT',
      tags: args.tags || [],
      config: args.config || {},
    });
    return this.success(result);
  }
}

// ── Update ───────────────────────────────────────────────────────────────────

class SourceCatalogUpdateTool extends BaseTool {
  getDefinition() {
    return {
      id: 'source_catalog.update',
      name: 'Update Source Catalog Entry',
      version: '1.0.0',
      level: 2,
      category: 'source_catalog',
      description: 'Update an existing source catalog entry. Only supplied fields are updated.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id:          { type: 'string' },
          name:        { type: 'string' },
          description: { type: 'string' },
          namespace:   { type: 'string' },
          tags:        { type: 'array', items: { type: 'string' } },
          config:      { type: 'object' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE'],
    };
  }

  async execute(args) {
    this.validateArgs(args, ['id']);
    const { id, ...patch } = args;
    const result = await getSvc().update(id, patch);
    if (!result) return this.error('NOT_FOUND', `Source ${id} not found`);
    return this.success(result);
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────

class SourceCatalogDeleteTool extends BaseTool {
  getDefinition() {
    return {
      id: 'source_catalog.delete',
      name: 'Delete Source Catalog Entry',
      version: '1.0.0',
      level: 2,
      category: 'source_catalog',
      description: 'Delete a source catalog entry. Does NOT affect already-imported documents.',
      inputSchema: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      safetyLevel: 'CONFIRM',
      sideEffects: ['WRITE'],
    };
  }

  async execute(args) {
    this.validateArgs(args, ['id']);
    await getSvc().delete(args.id);
    return this.success({ deleted: args.id });
  }
}

// ── Browse ───────────────────────────────────────────────────────────────────

class SourceCatalogBrowseTool extends BaseTool {
  getDefinition() {
    return {
      id: 'source_catalog.browse',
      name: 'Browse Source for Documents',
      version: '1.0.0',
      level: 2,
      category: 'source_catalog',
      description: [
        'Search an external information source for documents matching a query.',
        'Dispatches to the appropriate strategy per source type:',
        '  URL_CATALOG → scrapes HTML links;',
        '  REST_API    → calls configured endpoint with response mapping;',
        '  RSS_FEED    → parses Atom/RSS feed items;',
        '  ODS_API     → queries documents.un.org;',
        '  OIOS_PORTAL → scrapes oios.un.org.',
        'Returns up to `limit` results with title, url, fileType, date, description.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        required: ['source_id'],
        properties: {
          source_id: { type: 'string', description: 'Source catalog entry ID' },
          query:     { type: 'string', description: 'Search query / keyword', default: '' },
          page:      { type: 'integer', description: 'Page number (1-based)', default: 1 },
          limit:     { type: 'integer', description: 'Max results per page (1-100)', default: 25 },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 30 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['source_id']);
    const result = await getSvc().browse(args.source_id, {
      query: args.query || '',
      page:  Math.max(1, args.page || 1),
      limit: Math.min(100, args.limit || 25),
    });
    return this.success(result);
  }
}

// ── Import ───────────────────────────────────────────────────────────────────

class SourceCatalogImportTool extends BaseTool {
  getDefinition() {
    return {
      id: 'source_catalog.import',
      name: 'Import Document from Source',
      version: '1.0.0',
      level: 3,
      category: 'source_catalog',
      description: [
        'Download a document from a URL discovered by source_catalog.browse and import it',
        'into the document processing pipeline. Returns the created document record.',
        'After import the document goes through the normal classify → extract flow.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        required: ['source_id', 'url'],
        properties: {
          source_id:  { type: 'string', description: 'Source catalog entry ID' },
          url:        { type: 'string', description: 'Document URL to download' },
          title:      { type: 'string', description: 'Document title (optional, auto-detected if omitted)' },
          namespace:  { type: 'string', description: 'Target namespace for the imported document' },
          meta:       { type: 'object', description: 'Additional metadata to attach to the document' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL', 'WRITE'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 100 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['source_id', 'url']);
    const result = await getSvc().importDocument(args.source_id, {
      url:       args.url,
      title:     args.title,
      namespace: args.namespace,
      meta:      args.meta,
    });
    return this.success(result);
  }
}

// ── Seed ─────────────────────────────────────────────────────────────────────

class SourceCatalogSeedTool extends BaseTool {
  getDefinition() {
    return {
      id: 'source_catalog.seed_un_sources',
      name: 'Seed UN Document Sources',
      version: '1.0.0',
      level: 3,
      category: 'source_catalog',
      description: [
        'Populate the source catalog with the built-in list of known public UN document sources',
        '(~28 entries: ODS, Digital Library, World Bank, UNESCO UNESDOC, FAO, OHCHR, UNDP,',
        'UNICEF, UNCTAD, WHO, OIOS, IAEA, WFP, UN News RSS feeds, Security Council, ICJ,',
        'UN Treaties, UNODC, ILO, UNHCR, UN Women, UNEP, UNIDO, IFAD, UNDP HDR).',
        'Pass reset=true to delete existing entries first.',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          reset:   { type: 'boolean', default: false, description: 'Delete existing entries before seeding' },
          dry_run: { type: 'boolean', default: false, description: 'Validate only, do not write' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 20 },
    };
  }

  async execute(args) {
    const { execFileSync } = require('child_process');
    const path = require('path');
    const scriptPath = path.resolve(__dirname, '../../../../scripts/seed-un-source-catalog.js');
    const scriptArgs = [];
    if (args.dry_run) scriptArgs.push('--dry-run');
    if (args.reset)   scriptArgs.push('--reset');

    let output;
    try {
      output = execFileSync(process.execPath, [scriptPath, ...scriptArgs], {
        encoding: 'utf8',
        env: process.env,
        cwd: path.resolve(__dirname, '../../../../'),
        timeout: 55000,
      });
    } catch (e) {
      return this.error('SEED_FAILED', e.stdout || e.message);
    }

    const lines = output.split('\n').filter(Boolean);
    return this.success({ log: lines });
  }
}

// ── Registry ─────────────────────────────────────────────────────────────────

function createSourceCatalogTools() {
  return [
    new SourceCatalogListTool(),
    new SourceCatalogGetTool(),
    new SourceCatalogCreateTool(),
    new SourceCatalogUpdateTool(),
    new SourceCatalogDeleteTool(),
    new SourceCatalogBrowseTool(),
    new SourceCatalogImportTool(),
    new SourceCatalogSeedTool(),
  ];
}

module.exports = {
  SourceCatalogListTool,
  SourceCatalogGetTool,
  SourceCatalogCreateTool,
  SourceCatalogUpdateTool,
  SourceCatalogDeleteTool,
  SourceCatalogBrowseTool,
  SourceCatalogImportTool,
  SourceCatalogSeedTool,
  createSourceCatalogTools,
};
