'use strict';
/**
 * Entity Store MCP Tools
 *
 *  entity_store.impact              — impact summary + full analysis for an entity
 *  entity_store.supersession_chain  — document supersession lineage
 *  entity_store.relationship_evidence — multi-source evidence for an entity relationship
 */

const { BaseTool } = require('../primitives/BaseTool');

let _entitySvc = null;
function getEntitySvc() {
  if (!_entitySvc) _entitySvc = require('../../../services/knowledge/entity-store.service').entityStoreService;
  return _entitySvc;
}

let _impactSvc = null;
function getImpactSvc() {
  if (!_impactSvc) _impactSvc = require('../../../services/knowledge/impact-analysis.service').impactAnalysisService;
  return _impactSvc;
}

let _supersessionSvc = null;
function getSupersessionSvc() {
  if (!_supersessionSvc) _supersessionSvc = require('../../../services/knowledge/supersession.service').supersessionService;
  return _supersessionSvc;
}

// ── Impact Analysis ───────────────────────────────────────────────────────────

class EntityImpactTool extends BaseTool {
  getDefinition() {
    return {
      id: 'entity_store.impact',
      name: 'Entity Impact Analysis',
      version: '1.0.0',
      level: 1,
      category: 'entity_store',
      description: [
        'Reverse dependency analysis for a KB entity.',
        'Returns all entities that depend on the specified entity, grouped into:',
        '  directDependents   — 1-hop incoming ES_RELATED_TO relationships',
        '  transitiveDependents — 2-N hop paths (variable depth)',
        '  riskAssessment     — riskLevel (low/medium/high/critical), counts, risk factors',
        '  impactByCategory   — breakdown by entity category (systems, documents, policies…)',
        '  structuralAnalysis — articulation point approximation, degree centrality',
        '  recommendations    — actionable steps based on impact profile',
        'Use mode="summary" for a lightweight count + riskLevel check without full traversal.',
      ].join('\n'),
      inputSchema: {
        type: 'object',
        required: ['entityId'],
        properties: {
          entityId: {
            type: 'string',
            description: 'ID of the KB entity to analyze',
          },
          mode: {
            type: 'string',
            enum: ['full', 'summary'],
            description: 'full = complete analysis with all dependents; summary = lightweight count + riskLevel (default: full)',
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum hop depth for transitive dependency traversal (default: 5, max: 10)',
          },
          includeStructural: {
            type: 'boolean',
            description: 'Include articulation point approximation in structural analysis (default: true)',
          },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 15000, maxMemoryMb: 50 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['entityId']);
    const { entityId, mode = 'full', maxDepth = 5, includeStructural = true } = args;

    if (mode === 'summary') {
      const summary = await getImpactSvc().quickSummary(entityId);
      return this.success({
        entityId,
        mode: 'summary',
        ...summary,
      });
    }

    const analysis = await getImpactSvc().analyzeImpact(entityId, {
      maxDepth: Math.min(maxDepth, 10),
      includeStructural,
    });
    return this.success(analysis);
  }
}

// ── Supersession Chain ────────────────────────────────────────────────────────

class EntitySupersessionChainTool extends BaseTool {
  getDefinition() {
    return {
      id: 'entity_store.supersession_chain',
      name: 'Entity Supersession Chain',
      version: '1.0.0',
      level: 1,
      category: 'entity_store',
      description: [
        'Returns the complete supersession lineage for a normative document entity.',
        'The response includes:',
        '  supersedes    — older documents that this entity supersedes (newer → older)',
        '  supersededBy  — newer documents that supersede this entity',
        '  isInForce     — true if no other entity supersedes this one',
        'Applies to entity types: DOCUMENT, POLICY, RESOLUTION, REGULATION, GUIDELINE.',
        'Use entity_store.impact for dependency analysis; use this tool for normative lineage.',
      ].join('\n'),
      inputSchema: {
        type: 'object',
        required: ['entityId'],
        properties: {
          entityId: {
            type: 'string',
            description: 'ID of the document entity',
          },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 10 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['entityId']);
    const chain = await getSupersessionSvc().getSupersessionChain(args.entityId);
    return this.success(chain);
  }
}

// ── Relationship Evidence ─────────────────────────────────────────────────────

class EntityRelationshipEvidenceTool extends BaseTool {
  getDefinition() {
    return {
      id: 'entity_store.relationship_evidence',
      name: 'Entity Relationship Evidence',
      version: '1.0.0',
      level: 1,
      category: 'entity_store',
      description: [
        'Returns all evidence sources (RelationshipEvidence nodes) for a specific relationship',
        'between two KB entities. Each evidence record contains:',
        '  documentId  — source document that established this relationship',
        '  context     — text excerpt from the document',
        '  confidence  — extraction confidence (0-1)',
        '  extractedAt — timestamp of extraction',
        'Multiple documents can establish the same relationship; this tool reveals all of them.',
        'Use this for provenance analysis: "why does this relationship exist?"',
      ].join('\n'),
      inputSchema: {
        type: 'object',
        required: ['sourceEntityId', 'targetEntityId'],
        properties: {
          sourceEntityId: {
            type: 'string',
            description: 'ID of the source entity in the relationship',
          },
          targetEntityId: {
            type: 'string',
            description: 'ID of the target entity in the relationship',
          },
          relType: {
            type: 'string',
            description: 'Filter by relationship type (e.g. DEPENDS_ON, IMPLEMENTS). Omit to get all types.',
          },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 3000, maxMemoryMb: 10 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['sourceEntityId', 'targetEntityId']);
    const evidence = await getEntitySvc().getRelationshipEvidence(
      args.sourceEntityId,
      args.targetEntityId,
      args.relType || null,
    );
    return this.success({ evidence, count: evidence.length });
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createEntityStoreTools() {
  return [
    new EntityImpactTool(),
    new EntitySupersessionChainTool(),
    new EntityRelationshipEvidenceTool(),
  ];
}

module.exports = {
  EntityImpactTool,
  EntitySupersessionChainTool,
  EntityRelationshipEvidenceTool,
  createEntityStoreTools,
};
