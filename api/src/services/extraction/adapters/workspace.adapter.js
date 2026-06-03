'use strict';

/**
 * Workspace Adapter
 *
 * Plugs Workspace-specific logic into the unified extraction pipeline:
 *   - loadSource: read SourceReference node + extract text
 *   - persistGraph: create Draft* nodes via DraftService
 *   - storeResult: update SourceReference status + write extraction log
 *   - postProcessHooks: contradiction detection
 *
 * aiProvider = 'llm-provider' → direct LLMProviderService calls
 * allowRegexFallback = false
 */

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../../memgraph.service');
  return _mg;
}

// ── LOAD SOURCE ─────────────────────────────────────────────

async function loadSource(ctx) {
  const srcSvc = require('../../workspace/source.service');
  const source = await srcSvc.getSource(ctx.workspaceId, ctx.sourceId);
  if (!source) throw new Error(`Source not found: ${ctx.sourceId}`);

  ctx.sourceRef = source;
  ctx.documentType  = source.documentType || 'UNKNOWN';
  ctx.domain        = source.domain || 'GENERAL';
  ctx.epistemicLayer = null;

  await srcSvc.updateSourceStatus(ctx.workspaceId, ctx.sourceId, 'EXTRACTING');

  ctx.text = await srcSvc._extractText(source);
}

// ── PERSIST GRAPH ───────────────────────────────────────────

async function persistGraph(ctx) {
  const draftSvc = require('../../workspace/draft.service');
  const ids = new Map();

  // Entities → DraftEntity (or typed Draft)
  for (const e of ctx.entities) {
    try {
      const draft = await draftSvc.create(ctx.workspaceId, {
        type: 'entity',
        name: e.name,
        description: e.description || '',
        content: { ...e },
        sourceId: ctx.sourceId,
        confidence: e.confidence || 0.8,
        extractedBy: 'unified-pipeline',
      });
      ids.set(e.name, { nodeId: draft.id, nodeLabel: 'DraftEntity', entity: e });
      e._draftId = draft.id;
    } catch (err) {
      // non-fatal per entity
    }
  }

  // Relations → DraftEdges
  for (const rel of ctx.relations) {
    const srcName = rel.sourceEntity || rel.sourceEntityName || '';
    const tgtName = rel.targetEntity || rel.targetEntityName || '';
    const src = ctx.entities.find(e => e.name.toLowerCase() === srcName.toLowerCase());
    const tgt = ctx.entities.find(e => e.name.toLowerCase() === tgtName.toLowerCase());
    if (src?._draftId && tgt?._draftId) {
      try {
        await draftSvc.createEdge(ctx.workspaceId, {
          sourceId: src._draftId,
          targetId: tgt._draftId,
          edgeType: rel.relationshipType || 'RELATES_TO',
          confidence: rel.confidence || 0.7,
        });
      } catch {
        // non-fatal
      }
    }
  }

  // Specialized items → typed Draft nodes
  for (const [extractType, items] of ctx.specializedItems) {
    const draftType = extractType; // 'business_rule', 'workflow', etc.
    for (const item of items) {
      try {
        const name = item.name || item.term || item.title || `${extractType}_${Date.now()}`;
        const draft = await draftSvc.create(ctx.workspaceId, {
          type: draftType,
          name,
          description: item.description || item.definition || '',
          content: item,
          sourceId: ctx.sourceId,
          confidence: 0.75,
          extractedBy: 'unified-pipeline',
        });
        ids.set(`${extractType}::${name}`, { nodeId: draft.id, nodeLabel: draftSvc.getLabelForType?.(draftType) || 'DraftEntity', entity: item });
      } catch {
        // non-fatal
      }
    }
  }

  ctx.persistedIds = ids;
}

// ── STORE RESULT ────────────────────────────────────────────

async function storeResult(ctx) {
  const srcSvc = require('../../workspace/source.service');
  const now = new Date().toISOString();

  await srcSvc._updateSourceFields(ctx.workspaceId, ctx.sourceId, {
    status: 'EXTRACTED',
    extractedAt: now,
    extractionLog: JSON.stringify(ctx.log),
    chatHistory: JSON.stringify([]),
  });

  // resultId is not a separate node in workspace mode — use sourceId
  ctx.resultId = ctx.sourceId;
}

// ── POST-PROCESS HOOKS ──────────────────────────────────────

async function detectContradictionsHook(ctx) {
  if (!process.env.AUTO_DETECT_CONTRADICTIONS !== 'false') return {};
  try {
    const contradictionSvc = require('../../workspace/contradiction.service');
    const detection = await contradictionSvc.detectContradictions(ctx.workspaceId, {
      detectedBy: 'unified-pipeline',
    });
    const stats = await contradictionSvc.getContradictionStats(ctx.workspaceId);
    return {
      newContradictions: detection.created?.length || 0,
      deduplicated:      detection.skipped || 0,
      totalAfter:        stats.total,
      blocking:          stats.bySeverity?.BLOCKING || 0,
    };
  } catch (err) {
    return { error: err.message };
  }
}
detectContradictionsHook.hookName = 'detectContradictions';

// ── ADAPTER EXPORT ──────────────────────────────────────────

module.exports = {
  name: 'workspace',
  mode: 'WORKSPACE',
  aiProvider: 'llm-provider',
  allowRegexFallback: false,
  loadSource,
  persistGraph,
  storeResult,
  postProcessHooks: [detectContradictionsHook],
};
