/**
 * Resolution Strategies Service
 *
 * Applies conflict resolution strategies and prepares data for promotion to KB.
 *
 * @module services/workspace/promotion/resolution
 */

'use strict';

const { PromotionAction } = require('./diff-computer.service');

const ResolutionStrategy = {
  USE_DRAFT: 'use_draft', USE_KB: 'use_kb', MERGE: 'merge',
  MANUAL: 'manual', SKIP: 'skip', CREATE_NEW: 'create_new',
  CREATE_VERSION: 'create_version', CREATE_EXCEPTION: 'create_exception'
};

const TYPE_MAP = {
  entity: 'Entity', business_rule: 'BusinessRule', workflow: 'Workflow',
  calculation: 'Calculation', concept: 'Concept', relationship: 'Relationship',
  policy: 'Policy', requirement: 'Requirement', anomaly: 'Anomaly', schema: 'Schema'
};

function applyResolution(diffItem, resolution) {
  const result = { draftId: diffItem.draftId, action: diffItem.action, resolved: true, promotionData: null, errors: [] };
  try {
    switch (diffItem.action) {
      case PromotionAction.NEW: result.promotionData = prepareNewEntity(diffItem); break;
      case PromotionAction.ENRICH: result.promotionData = prepareEnrichment(diffItem, resolution); break;
      case PromotionAction.SUPERSEDE: result.promotionData = prepareSupersedeData(diffItem, resolution); break;
      case PromotionAction.CONFLICT: result.promotionData = resolveConflicts(diffItem, resolution); break;
      case PromotionAction.MERGE: result.promotionData = prepareMergeData(diffItem, resolution); break;
      case PromotionAction.SKIP: case PromotionAction.REJECT: result.action = PromotionAction.SKIP; break;
      default: result.errors.push(`Unknown action: ${diffItem.action}`); result.resolved = false;
    }
  } catch (e) { result.errors.push(e.message); result.resolved = false; }
  return result;
}

function applyResolutions(diffItems, resolutions) {
  const items = diffItems.map(i => applyResolution(i, resolutions[i.draftId] || {}));
  return {
    items,
    summary: {
      total: items.length,
      resolved: items.filter(r => r.resolved).length,
      errors: items.filter(r => r.errors.length > 0).length,
      toPromote: items.filter(r => r.resolved && r.promotionData).length
    }
  };
}

function prepareNewEntity(diffItem) {
  const { v4: uuidv4 } = require('uuid');
  return {
    operation: 'CREATE',
    entityType: TYPE_MAP[diffItem.draftType] || 'KnowledgeObject',
    properties: {
      id: uuidv4(), name: diffItem.draftName, type: diffItem.draftType,
      description: diffItem.draftContent?.description || '',
      ...flattenContent(diffItem.draftContent),
      sourceType: 'workspace_extraction', sourceDraftId: diffItem.draftId,
      promotedAt: new Date().toISOString(), version: 1
    },
    content: diffItem.draftContent,
    relationships: extractRelationships(diffItem.draftContent),
    embedding: { required: true, text: embedText(diffItem.draftName, diffItem.draftContent) }
  };
}

function prepareEnrichment(diffItem, resolution) {
  const changes = diffItem.changes || {};
  const strategy = resolution.strategy || ResolutionStrategy.MERGE;
  const toAdd = changes.added || {};
  const toUpdate = {};

  if (strategy === ResolutionStrategy.USE_DRAFT) {
    Object.assign(toUpdate, Object.fromEntries(Object.entries(changes.modified || {}).map(([k, v]) => [k, v.new])));
  } else if (strategy === ResolutionStrategy.MERGE) {
    for (const [field, change] of Object.entries(changes.modified || {})) {
      const fr = resolution.fields?.[field];
      if (fr === 'use_draft') toUpdate[field] = change.new;
      else if (fr === 'merge') toUpdate[field] = mergeValues(change.old, change.new);
    }
  }

  return {
    operation: 'UPDATE', targetId: diffItem.bestMatch.entity.id, targetName: diffItem.bestMatch.entity.name,
    propertiesToAdd: toAdd, propertiesToUpdate: toUpdate,
    relationships: extractNewRelationships(diffItem),
    metadata: { enrichedFrom: diffItem.draftId, enrichedAt: new Date().toISOString() },
    embedding: { required: Object.keys(toAdd).length > 0 || Object.keys(toUpdate).length > 0, text: embedText(diffItem.bestMatch.entity.name, { ...diffItem.bestMatch.entity.content, ...toAdd, ...toUpdate }) }
  };
}

function prepareSupersedeData(diffItem) {
  const { v4: uuidv4 } = require('uuid');
  const prev = diffItem.bestMatch.entity;
  return {
    operation: 'SUPERSEDE', previousId: prev.id, previousVersion: prev.version || 1,
    newEntity: {
      entityType: TYPE_MAP[diffItem.draftType] || 'KnowledgeObject',
      properties: {
        id: uuidv4(), name: diffItem.draftName, type: diffItem.draftType,
        ...flattenContent(diffItem.draftContent),
        supersedes: prev.id, version: (prev.version || 1) + 1,
        sourceType: 'workspace_extraction', sourceDraftId: diffItem.draftId, promotedAt: new Date().toISOString()
      },
      content: diffItem.draftContent
    },
    previousUpdate: { supersededAt: new Date().toISOString(), status: 'superseded' },
    relationships: extractRelationships(diffItem.draftContent),
    embedding: { required: true, text: embedText(diffItem.draftName, diffItem.draftContent) }
  };
}

function resolveConflicts(diffItem, resolution) {
  const unresolved = (diffItem.conflicts || []).filter(c => !resolution.conflicts?.[c.field] && !resolution.defaultStrategy);
  if (unresolved.length > 0) return { operation: 'CONFLICT_UNRESOLVED', unresolvedConflicts: unresolved };
  const final = resolution.finalAction || ResolutionStrategy.USE_DRAFT;
  if (final === ResolutionStrategy.USE_DRAFT || final === ResolutionStrategy.CREATE_VERSION) return prepareSupersedeData(diffItem);
  if (final === ResolutionStrategy.MERGE) return prepareMergeData(diffItem, resolution);
  if (final === ResolutionStrategy.CREATE_NEW) return prepareNewEntity(diffItem);
  if (final === ResolutionStrategy.USE_KB) return { operation: 'SKIP', reason: 'User chose KB version' };
  return prepareSupersedeData(diffItem);
}

function prepareMergeData(diffItem, resolution) {
  const target = diffItem.bestMatch.entity;
  const merged = { ...(target.content || {}), ...(diffItem.changes?.added || {}) };
  if (resolution?.fields) {
    for (const [f, v] of Object.entries(resolution.fields)) {
      if (typeof v === 'object' && v.value !== undefined) merged[f] = v.value;
    }
  }
  return {
    operation: 'MERGE', targetId: target.id, targetName: target.name,
    mergedContent: merged, mergedProperties: flattenContent(merged),
    metadata: { mergedFrom: diffItem.draftId, mergedAt: new Date().toISOString(), previousVersion: target.version || 1, newVersion: (target.version || 1) + 1 },
    embedding: { required: true, text: embedText(target.name, merged) }
  };
}

function flattenContent(c) {
  if (!c) return {};
  const f = {};
  for (const [k, v] of Object.entries(c)) { if (!k.startsWith('_')) f[k] = typeof v === 'object' ? JSON.stringify(v) : v; }
  return f;
}

function extractRelationships(content) {
  const rels = [];
  if (!content) return rels;
  for (const field of ['relatedTo', 'references', 'dependsOn', 'partOf', 'contains']) {
    if (content[field]) {
      const targets = Array.isArray(content[field]) ? content[field] : [content[field]];
      for (const t of targets) rels.push({ type: field.toUpperCase(), targetName: typeof t === 'string' ? t : t.name, targetId: typeof t === 'object' ? t.id : null });
    }
  }
  return rels;
}

function extractNewRelationships(diffItem) {
  const draft = extractRelationships(diffItem.draftContent);
  const existing = new Set((diffItem.bestMatch?.entity?.relationships || []).map(r => `${r.type}:${r.targetName}`));
  return draft.filter(r => !existing.has(`${r.type}:${r.targetName}`));
}

function mergeValues(v1, v2) {
  if (Array.isArray(v1) && Array.isArray(v2)) return [...new Set([...v1.map(JSON.stringify), ...v2.map(JSON.stringify)])].map(x => { try { return JSON.parse(x); } catch { return x; } });
  if (typeof v1 === 'object' && typeof v2 === 'object') return { ...v1, ...v2 };
  return v2;
}

function embedText(name, content) {
  const parts = [name || ''];
  if (content) { for (const k of ['description', 'definition', 'formula', 'condition']) if (content[k]) parts.push(typeof content[k] === 'string' ? content[k] : JSON.stringify(content[k])); }
  return parts.join(' ').slice(0, 2000);
}

module.exports = {
  applyResolution, applyResolutions, prepareNewEntity, prepareEnrichment,
  prepareSupersedeData, resolveConflicts, prepareMergeData,
  ResolutionStrategy, flattenContent, extractRelationships
};
