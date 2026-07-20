'use strict';

/**
 * Investigation AOPEG Plugin
 *
 * Wraps all 11 investigation primitives as `investigation.*` executors,
 * making them available as GXE graph nodes.
 *
 * Executor types:
 *   investigation.locate   — find KB entities by query
 *   investigation.expand   — neighbourhood expansion
 *   investigation.connect  — path finding between two entities
 *   investigation.profile  — entity dossier
 *   investigation.structure — graph topology metrics
 *   investigation.impact   — dependency impact analysis
 *   investigation.resolve  — duplicate / near-match candidates
 *   investigation.matrix   — cross-tabulation of entity sets
 *   investigation.timeline — chronological event projection
 *   investigation.text     — manual text note (no KB lookup)
 *   investigation.synthesize — narrative synthesis over session evidence
 */

const { PluginBase, BaseExecutor, createSuccessResult } = require('../plugin-base');
const primitiveRegistry = require('../../../../services/investigation/primitives/primitive-registry');

// ── Services (lazy-loaded singletons) ────────────────────────────────────────

let _entityStoreService = null;
function getEntityStoreService() {
  if (!_entityStoreService) {
    try {
      _entityStoreService = require('../../../../services/knowledge/entity-store.service').entityStoreService;
    } catch {
      _entityStoreService = null;
    }
  }
  return _entityStoreService;
}

let _documentIndexSearch = null;
function getDocumentIndexSearch() {
  if (!_documentIndexSearch) {
    try {
      _documentIndexSearch = require('../../../../services/indexing/document-index.search');
    } catch {
      _documentIndexSearch = null;
    }
  }
  return _documentIndexSearch;
}

let _sourceCatalogService = null;
function getSourceCatalogService() {
  if (!_sourceCatalogService) {
    try {
      _sourceCatalogService = require('../../../../services/knowledge/source-catalog.service').sourceCatalogService;
    } catch {
      _sourceCatalogService = null;
    }
  }
  return _sourceCatalogService;
}

// ── inputSchema → JSON Schema converter ──────────────────────────────────────

function toJsonSchema(inputSchema) {
  const properties = {};
  const required = [];
  for (const [key, def] of Object.entries(inputSchema)) {
    const prop = { type: def.type === 'array' ? 'array' : def.type };
    if (def.default !== undefined) prop.default = def.default;
    if (def.description) prop.description = def.description;
    properties[key] = prop;
    if (def.required) required.push(key);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}) };
}

// ── Executor factory ──────────────────────────────────────────────────────────

function createPrimitiveExecutor(primitiveType, displayName, description) {
  const primitive = primitiveRegistry.get(primitiveType);

  class PrimitiveExecutor extends BaseExecutor {
    constructor() {
      super();
      this.type         = `investigation.${primitiveType.toLowerCase()}`;
      this.displayName  = displayName;
      this.description  = description;
      this.domain       = 'investigation';
      this.parameterSchema = toJsonSchema(primitive.inputSchema || {});
    }

    async execute(parameters, context) {
      const services = {
        entityStoreService:  getEntityStoreService(),
        documentIndexSearch: getDocumentIndexSearch(),
        sourceCatalogService: getSourceCatalogService(),
        anthropicClient:     null, // SYNTHESIZE falls back to deterministic if null
        artifactsSummary:    context?.variables?.artifactsSummary || [],
      };

      // SYNTHESIZE reads from context.artifactsSummary
      const primitiveContext = {
        artifactsSummary: services.artifactsSummary,
        ...context,
      };

      try {
        const result = await primitive.execute(parameters, primitiveContext, services);
        return createSuccessResult(result, { primitiveType });
      } catch (e) {
        return { success: false, output: null, errors: [{ code: 'PRIMITIVE_ERROR', message: e.message }] };
      }
    }
  }

  return new PrimitiveExecutor();
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const PLUGIN_METADATA = {
  name:    'investigation',
  version: '1.0.0',
  domain:  'investigation',
  description: 'Investigation primitives as AOPEG graph nodes (CGE envelope output)',
};

class InvestigationPlugin extends PluginBase {
  constructor() {
    super(PLUGIN_METADATA);

    this.addExecutor(createPrimitiveExecutor('LOCATE',     'Locate Entities',      'Find KB entities matching a query'));
    this.addExecutor(createPrimitiveExecutor('EXPAND',     'Expand Neighbourhood', 'Expand the neighbourhood of an entity'));
    this.addExecutor(createPrimitiveExecutor('CONNECT',    'Connect Entities',     'Find paths between two entities'));
    this.addExecutor(createPrimitiveExecutor('PROFILE',    'Profile Entity',       'Build a dossier for an entity'));
    this.addExecutor(createPrimitiveExecutor('STRUCTURE',  'Graph Structure',      'Compute topology metrics of a subgraph'));
    this.addExecutor(createPrimitiveExecutor('IMPACT',     'Impact Analysis',      'Analyse dependency impact for an entity'));
    this.addExecutor(createPrimitiveExecutor('RESOLVE',    'Resolve Duplicates',   'Find near-duplicate entity candidates'));
    this.addExecutor(createPrimitiveExecutor('MATRIX',     'Relationship Matrix',  'Cross-tabulate relationships between entity sets'));
    this.addExecutor(createPrimitiveExecutor('TIMELINE',   'Timeline Projection',  'Project entities on a chronological timeline'));
    this.addExecutor(createPrimitiveExecutor('TEXT',       'Text Note',            'Create a manual investigator text note'));
    this.addExecutor(createPrimitiveExecutor('SEARCH',     'Search Knowledge Sources', 'Search indexed docs + browse external sources by query'));
    this.addExecutor(createPrimitiveExecutor('SYNTHESIZE', 'Synthesize Narrative', 'Generate a grounded narrative over session evidence'));
  }
}

const investigationPlugin = new InvestigationPlugin();

module.exports = { InvestigationPlugin, investigationPlugin };
