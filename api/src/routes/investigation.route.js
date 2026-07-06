'use strict';

const express = require('express');
const router = express.Router();

const { getInvestigationSessionService } = require('../services/investigation/investigation-session.service');
const { getInvestigationVersionService } = require('../services/investigation/investigation-version.service');
const { getInvestigationArtifactService } = require('../services/investigation/investigation-artifact.service');
const { getInvestigationStepService } = require('../services/investigation/investigation-step.service');
const { getInvestigationAgentService } = require('../services/investigation/investigation-agent.service');
const { getInvestigationChatMessageService } = require('../services/investigation/investigation-chat-message.service');

const ok = (res, data) => res.json({ success: true, data });
const err = (res, e, status = 500) => res.status(status).json({ success: false, error: e.message });

// ─── Sessions ─────────────────────────────────────────────────────────────────

// GET /api/v1/investigation/sessions
router.get('/sessions', async (req, res) => {
  try {
    const { status, createdBy, parentSessionId, limit = 50, offset = 0 } = req.query;
    const svc = getInvestigationSessionService();
    const data = await svc.list({
      status: status || null,
      createdBy: createdBy || null,
      parentSessionId: parentSessionId === 'null' ? null : (parentSessionId || undefined),
      limit: Number(limit),
      offset: Number(offset),
    });
    ok(res, data);
  } catch (e) { err(res, e); }
});

// POST /api/v1/investigation/sessions
router.post('/sessions', async (req, res) => {
  try {
    const { name, description, parentSessionId, createdBy } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const svc = getInvestigationSessionService();
    ok(res, await svc.create({ name, description, parentSessionId: parentSessionId || null, createdBy: createdBy || 'system' }));
  } catch (e) { err(res, e); }
});

// POST /api/v1/investigation/sessions/:id/subsessions
router.post('/sessions/:id/subsessions', async (req, res) => {
  try {
    const { name, description, createdBy } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    const parent = await getInvestigationSessionService().findById(req.params.id);
    if (!parent) return res.status(404).json({ success: false, error: 'Parent session not found' });
    if (parent.status !== 'ACTIVE') return res.status(400).json({ success: false, error: 'Parent session is not active' });
    ok(res, await getInvestigationSessionService().create({
      name,
      description: description || `Subsession of: ${parent.name}`,
      parentSessionId: req.params.id,
      createdBy: createdBy || 'system',
    }));
  } catch (e) { err(res, e); }
});

// GET /api/v1/investigation/sessions/:id
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await getInvestigationSessionService().findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    ok(res, session);
  } catch (e) { err(res, e); }
});

// PUT /api/v1/investigation/sessions/:id
router.put('/sessions/:id', async (req, res) => {
  try {
    const { name, description } = req.body;
    ok(res, await getInvestigationSessionService().update(req.params.id, { name, description }));
  } catch (e) { err(res, e); }
});

// POST /api/v1/investigation/sessions/:id/close
router.post('/sessions/:id/close', async (req, res) => {
  try {
    ok(res, await getInvestigationSessionService().close(req.params.id));
  } catch (e) { err(res, e); }
});

// GET /api/v1/investigation/sessions/:id/subsessions
router.get('/sessions/:id/subsessions', async (req, res) => {
  try {
    ok(res, await getInvestigationSessionService().listSubsessions(req.params.id));
  } catch (e) { err(res, e); }
});

// POST /api/v1/investigation/sessions/:id/confluence
// Import subsession result artifacts into this (parent) session
router.post('/sessions/:id/confluence', async (req, res) => {
  try {
    const { subsessionId } = req.body;
    if (!subsessionId) return res.status(400).json({ success: false, error: 'subsessionId required' });
    ok(res, await getInvestigationSessionService().confluenceSubsession(req.params.id, subsessionId));
  } catch (e) { err(res, e); }
});

// ─── Chat (AI Agent) ──────────────────────────────────────────────────────────

// GET /api/v1/investigation/sessions/:id/messages
// Returns persisted chat history (user + assistant messages) ordered by createdAt.
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    const messages = await getInvestigationChatMessageService().list(req.params.id);
    ok(res, messages);
  } catch (e) { err(res, e); }
});

// POST /api/v1/investigation/sessions/:id/chat
router.post('/sessions/:id/chat', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { message, context = {} } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const session = await getInvestigationSessionService().findById(sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, error: 'Session is not active' });
    }

    // Persist user message
    const chatSvc = getInvestigationChatMessageService();
    await chatSvc.save(sessionId, { role: 'user', text: message.trim() }).catch(e => console.error('[Chat] Failed to persist user message:', e.message));

    // Build context for agent
    const currentVersion = await getInvestigationVersionService().getCurrent(sessionId);
    const artifacts = await getInvestigationArtifactService().listCommitted(sessionId, { limit: 100 });

    let parentContext = null;
    if (session.parentSessionId) {
      try {
        const parentArtifacts = await getInvestigationArtifactService().listBySession(session.parentSessionId, { limit: 50 });
        parentContext = {
          sessionId: session.parentSessionId,
          artifacts: parentArtifacts.map(a => ({
            artifactId: a.artifactId,
            primitiveType: a.primitiveType,
            contentSummary: summarizeContent(a.primitiveType, a.content),
          })),
        };
      } catch {}
    }

    const agentContext = {
      currentVersionId: currentVersion?.versionId || null,
      artifactsSummary: artifacts.map(a => ({
        artifactId: a.artifactId,
        primitiveType: a.primitiveType,
        contentSummary: summarizeContent(a.primitiveType, a.content),
      })),
      parentContext,
      ...context,
      _entityCache: (context.resolvedEntities || []).map(e => ({
        entityId: e.id,
        name: e.label,
        type: e.type || '',
        namespace: e.namespace || '',
      })),
    };

    const result = await getInvestigationAgentService().processMessage(
      sessionId,
      message.trim(),
      agentContext
    );

    // Persist assistant message (non-blocking)
    chatSvc.save(sessionId, {
      role: 'assistant',
      text: result.message || '',
      type: result.type || null,
      primitiveType: result.primitiveType || null,
      artifactId: result.artifact?.artifactId || null,
      params: result.params || null,
    }).catch(e => console.error('[Chat] Failed to persist assistant message:', e.message));

    ok(res, result);
  } catch (e) { err(res, e); }
});

function summarizeContent(primitiveType, content) {
  switch (primitiveType) {
    case 'LOCATE': return { query: content.query, count: content.results?.length || 0 };
    case 'CONNECT': return { fromEntityId: content.fromEntityId, toEntityId: content.toEntityId, pathCount: content.paths?.length || 0 };
    case 'EXPAND': return { entityId: content.entityId, nodeCount: content.nodeCount };
    case 'SYNTHESIZE': return { narrativeLength: content.narrative?.length || 0 };
    default: return {};
  }
}

// ─── Versions ─────────────────────────────────────────────────────────────────

// GET /api/v1/investigation/sessions/:id/versions
router.get('/sessions/:id/versions', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    ok(res, await getInvestigationVersionService().list(req.params.id, Number(limit), Number(offset)));
  } catch (e) { err(res, e); }
});

// GET /api/v1/investigation/sessions/:id/versions/current
router.get('/sessions/:id/versions/current', async (req, res) => {
  try {
    const v = await getInvestigationVersionService().getCurrent(req.params.id);
    if (!v) return res.status(404).json({ success: false, error: 'No versions yet' });
    ok(res, v);
  } catch (e) { err(res, e); }
});

// POST /api/v1/investigation/sessions/:id/checkpoint
// Cut a LOGICAL version (explicit user checkpoint)
router.post('/sessions/:id/checkpoint', async (req, res) => {
  try {
    const { message, createdBy } = req.body;
    ok(res, await getInvestigationVersionService().cutLogical({
      sessionId: req.params.id,
      message: message || 'checkpoint',
      createdBy: createdBy || 'system',
    }));
  } catch (e) { err(res, e); }
});

// GET /api/v1/investigation/sessions/:id/versions/diff?from=versionIdA&to=versionIdB
router.get('/sessions/:id/versions/diff', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, error: 'from and to versionIds required' });
    ok(res, await getInvestigationVersionService().diff(from, to));
  } catch (e) { err(res, e); }
});

// GET /api/v1/investigation/sessions/:id/versions/:versionId/state
// Read-only snapshot: all artifacts + steps visible at that version point in time
router.get('/sessions/:id/versions/:versionId/state', async (req, res) => {
  try {
    ok(res, await getInvestigationVersionService().getStateAtVersion(req.params.id, req.params.versionId));
  } catch (e) { err(res, e); }
});

// ─── Artifacts ────────────────────────────────────────────────────────────────

// GET /api/v1/investigation/sessions/:id/artifacts?versionId=X&primitiveType=Y&status=all|proposed|committed
router.get('/sessions/:id/artifacts', async (req, res) => {
  try {
    const { versionId, primitiveType, status, limit = 100, offset = 0 } = req.query;
    ok(res, await getInvestigationArtifactService().listBySession(req.params.id, {
      versionId: versionId || null,
      primitiveType: primitiveType || null,
      status: status && status !== 'all' ? status.toUpperCase() : null,
      limit: Number(limit),
      offset: Number(offset),
    }));
  } catch (e) { err(res, e); }
});

// GET /api/v1/investigation/sessions/:id/artifacts/context
// Returns COMMITTED artifacts only — the AI context view of the session.
router.get('/sessions/:id/artifacts/context', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const artifacts = await getInvestigationArtifactService().listCommitted(req.params.id, { limit: Number(limit) });
    const summarized = artifacts.map(a => ({
      artifactId: a.artifactId,
      primitiveType: a.primitiveType,
      createdAt: a.createdAt,
      committedAt: a.committedAt,
      revisionNumber: a.revisionNumber,
      contentSummary: _summarizeContent(a.primitiveType, a.content),
    }));
    ok(res, { artifacts: summarized, count: summarized.length });
  } catch (e) { err(res, e); }
});

function _summarizeContent(primitiveType, content) {
  switch (primitiveType) {
    case 'LOCATE':    return { query: content.query, resultCount: content.results?.length || 0 };
    case 'CONNECT':   return { pathCount: content.paths?.length || 0 };
    case 'EXPAND':    return { entityId: content.entityId, nodeCount: content.nodeCount };
    case 'MATRIX':    return { summary: content.summary };
    case 'STRUCTURE': return { summary: content.summary };
    case 'TIMELINE':  return { eventCount: content.summary?.eventCount, span: content.span };
    case 'RESOLVE':   return { summary: content.summary, anchor: content.anchor?.name };
    case 'SYNTHESIZE':return { narrativeLength: content.narrative?.length || 0 };
    default:          return {};
  }
}

// GET /api/v1/investigation/artifacts/:artifactId
router.get('/artifacts/:artifactId', async (req, res) => {
  try {
    const artifact = await getInvestigationArtifactService().findById(req.params.artifactId);
    if (!artifact) return res.status(404).json({ success: false, error: 'Artifact not found' });
    ok(res, artifact);
  } catch (e) { err(res, e); }
});

// GET /api/v1/investigation/sessions/:id/drift?versionId=X
// Detect drift between pinned KB snapshot and current HEAD.
// Enriches result with artifact titles + entity names.
router.get('/sessions/:id/drift', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { versionId } = req.query;
    let sigillum = null;
    try { sigillum = require('../services/sigillum/sigillum.service').getSigillumService(); } catch {}

    const artifactSvc = getInvestigationArtifactService();
    const raw = await artifactSvc.detectDrift(sessionId, versionId || null, sigillum);

    // Enrich entity names
    let entitySvc = null;
    try { entitySvc = require('../services/knowledge/entity-store.service').entityStoreService; } catch {}

    const enriched = await Promise.all(
      (raw.driftedArtifacts || []).map(async (drifted) => {
        const full = await artifactSvc.findById(drifted.artifactId).catch(() => null);
        const title = _driftArtifactTitle(full);

        const affectedEntities = await Promise.all(
          (drifted.affectedEntities || []).map(async (e) => {
            let entityName = null;
            if (entitySvc) {
              try {
                const entity = await entitySvc.getEntity(e.entityId);
                entityName = entity?.name || null;
              } catch {}
            }
            return { ...e, entityName: entityName || e.entityId };
          })
        );

        return { ...drifted, title, affectedEntities };
      })
    );

    const allArtifacts = await artifactSvc.listBySession(sessionId, { status: 'COMMITTED' });
    const totalCommitted = allArtifacts.length;

    ok(res, {
      ...raw,
      driftedArtifacts: enriched,
      summary: {
        totalArtifacts: totalCommitted,
        driftedCount: enriched.length,
        modifiedEntities: enriched.flatMap(a => a.affectedEntities).filter(e => e.changeType !== 'DELETED').length,
        deletedEntities: enriched.flatMap(a => a.affectedEntities).filter(e => e.changeType === 'DELETED').length,
      },
    });
  } catch (e) { err(res, e); }
});

function _driftArtifactTitle(artifact) {
  if (!artifact) return 'Unknown';
  const c = artifact.content || {};
  switch (artifact.primitiveType) {
    case 'LOCATE':    return `Locate: "${c.query || '?'}" — ${c.results?.length || 0} results`;
    case 'CONNECT':   return `Connect: ${c.paths?.length || 0} path(s)`;
    case 'EXPAND':    return `Expand: ${c.nodeCount || 0} nodes @ depth ${c.depth || '?'}`;
    case 'MATRIX':    return `Matrix: ${c.summary?.totalCells || 0} cells`;
    case 'STRUCTURE': return `Structure: ${c.summary?.nodeCount || 0} nodes`;
    case 'TIMELINE':  return `Timeline: ${c.summary?.eventCount || 0} events`;
    case 'RESOLVE':   return `Resolve: ${c.anchor?.name || '?'}`;
    case 'SYNTHESIZE':return `Synthesis${c.narrative ? ': ' + c.narrative.slice(0, 40) + '…' : ''}`;
    case 'TEXT':      return `Note: ${c.title || '?'}`;
    default:          return artifact.primitiveType;
  }
}

function _paramsFromContent(primitiveType, content) {
  switch (primitiveType) {
    case 'CONNECT':   return { fromEntityId: content.fromEntityId, toEntityId: content.toEntityId, maxHops: content.maxHops };
    case 'EXPAND':    return { entityId: content.entityId, depth: content.depth };
    case 'MATRIX':    return { rowEntityIds: content.rowEntityIds, colEntityIds: content.colEntityIds };
    case 'STRUCTURE': return { entityIds: (content.nodes || []).map(n => n.entityId) };
    case 'TIMELINE':  return { entityIds: content.entityIds };
    case 'RESOLVE':   return { entityId: content.anchor?.entityId };
    default:          return {};
  }
}

// POST /api/v1/investigation/sessions/:id/artifacts/:artifactId/refresh
// Re-executes the primitive that created the artifact with the same inputParams.
// Marks old artifact as superseded and returns new artifact + new version.
router.post('/sessions/:id/artifacts/:artifactId/refresh', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { artifactId } = req.params;
    const primitiveRegistry = require('../services/investigation/primitives/primitive-registry');

    // Get original artifact to access stepId and primitiveType
    const artifact = await getInvestigationArtifactService().findById(artifactId);
    if (!artifact) return res.status(404).json({ success: false, error: 'Artifact not found' });

    // Resolve step: first via STEP_PRODUCES edge, fallback to artifact.stepId
    let step = await getInvestigationStepService().getStepByArtifact(artifactId);
    if (!step && artifact.stepId) {
      step = await getInvestigationStepService().findById(artifact.stepId);
    }
    if (!step) {
      // Last resort: reconstruct params from artifact content
      step = { primitiveType: artifact.primitiveType, inputParams: _paramsFromContent(artifact.primitiveType, artifact.content) };
    }
    if (!primitiveRegistry.list().includes(step.primitiveType)) {
      return res.status(400).json({ success: false, error: `No primitive registered for: ${step.primitiveType}` });
    }

    // Re-execute the primitive directly (skip LLM classification)
    let entityStoreService = null;
    try { entityStoreService = require('../services/knowledge/entity-store.service').entityStoreService; } catch {}
    const primitive = primitiveRegistry.get(step.primitiveType);
    const result = await primitive.execute(step.inputParams, {}, { entityStoreService });
    if (!result.evidencedBy || result.evidencedBy.length === 0) result.evidencedBy = ['__no-evidence__'];

    // Cut evidentiary version
    const newVersion = await getInvestigationVersionService().cutEvidentiary({
      sessionId,
      message: `refresh:${step.primitiveType.toLowerCase()}`,
      entityIds: result.evidencedBy.filter(id => id !== '__no-evidence__'),
    });

    // Create a new step for traceability
    const newStep = await getInvestigationStepService().begin({
      sessionId,
      versionId: newVersion.versionId,
      primitiveType: step.primitiveType,
      inputParams: step.inputParams,
    });

    // Save new artifact
    const newArtifact = await getInvestigationArtifactService().save({
      sessionId,
      versionId: newVersion.versionId,
      stepId: newStep.stepId,
      primitiveType: step.primitiveType,
      content: result.content,
      evidenceEntityIds: result.evidencedBy,
    });
    await getInvestigationStepService().complete(newStep.stepId, newArtifact.artifactId);

    // Mark old artifact superseded
    await getInvestigationArtifactService().markSuperseded(artifactId, newArtifact.artifactId);

    ok(res, { oldArtifactId: artifactId, newArtifact, newVersionId: newVersion.versionId });
  } catch (e) { err(res, e); }
});

// POST /api/v1/investigation/sessions/:id/run-tool
// Execute a primitive and save result as PROPOSED (no evidentiary version yet).
// The caller must call POST /artifacts/:artifactId/commit to finalize.
router.post('/sessions/:id/run-tool', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const { primitiveType, params: toolParams = {} } = req.body;
    if (!primitiveType) return res.status(400).json({ success: false, error: 'primitiveType required' });

    const primitiveRegistry = require('../services/investigation/primitives/primitive-registry');
    if (!primitiveRegistry.list().includes(primitiveType)) {
      return res.status(400).json({ success: false, error: `Unknown primitiveType: ${primitiveType}` });
    }

    const session = await getInvestigationSessionService().findById(sessionId);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.status !== 'ACTIVE') return res.status(400).json({ success: false, error: 'Session is not active' });

    let entityStoreService = null;
    try { entityStoreService = require('../services/knowledge/entity-store.service').entityStoreService; } catch {}

    const currentVersion = await getInvestigationVersionService().getCurrent(sessionId);
    const primitive = primitiveRegistry.get(primitiveType);
    const result = await primitive.execute(toolParams, {}, { entityStoreService });

    const evidenceEntityIds = (result.evidencedBy || []).length > 0 ? result.evidencedBy : ['__no-evidence__'];

    const artifact = await getInvestigationArtifactService().saveProposed({
      sessionId,
      versionId: currentVersion?.versionId || 'pending',
      primitiveType,
      content: result.content,
      evidenceEntityIds,
      producedBy: 'TOOL',
    });

    ok(res, { artifactId: artifact.artifactId, artifact, result: result.content });
  } catch (e) { err(res, e); }
});

// POST /api/v1/investigation/artifacts/:artifactId/commit
// Transition PROPOSED → COMMITTED and cut evidentiary version.
router.post('/artifacts/:artifactId/commit', async (req, res) => {
  try {
    const { artifactId } = req.params;
    const result = await getInvestigationArtifactService().commit(artifactId, {
      versionService: getInvestigationVersionService(),
    });
    ok(res, result);
  } catch (e) { err(res, e, e.message.includes('not found') ? 404 : 400); }
});

// GET /api/v1/investigation/artifacts/:artifactId/summary
// Generate (lazy) AI narrative summary for an artifact's content.
// Result is cached in artifact.content.aiSummary to avoid repeated LLM calls.
router.get('/artifacts/:artifactId/summary', async (req, res) => {
  try {
    const artifactSvc = getInvestigationArtifactService();
    const artifact = await artifactSvc.findById(req.params.artifactId);
    if (!artifact) return res.status(404).json({ success: false, error: 'Artifact not found' });

    // SYNTHESIZE and TEXT are self-describing — no LLM needed
    if (artifact.primitiveType === 'SYNTHESIZE') {
      return ok(res, { summary: artifact.content?.narrative || null });
    }
    if (artifact.primitiveType === 'TEXT') {
      return ok(res, { summary: artifact.content?.body || null });
    }

    // Return cached summary if already generated
    if (artifact.content?.aiSummary) {
      return ok(res, { summary: artifact.content.aiSummary });
    }

    // Generate and cache
    const summary = await getInvestigationAgentService().generateArtifactSummary(
      artifact.primitiveType, artifact.content || {}
    );
    if (summary) {
      artifactSvc.patchContent(artifact.artifactId, { aiSummary: summary }).catch(() => {});
    }
    ok(res, { summary });
  } catch (e) { err(res, e); }
});

// DELETE /api/v1/investigation/artifacts/:artifactId
// Discard a PROPOSED artifact (permanently delete).
router.delete('/artifacts/:artifactId', async (req, res) => {
  try {
    ok(res, await getInvestigationArtifactService().discard(req.params.artifactId));
  } catch (e) { err(res, e, e.message.includes('not found') ? 404 : 400); }
});

// POST /api/v1/investigation/artifacts/:artifactId/revise
// Create a new PROPOSED revision of a COMMITTED artifact.
router.post('/artifacts/:artifactId/revise', async (req, res) => {
  try {
    const { content, evidenceEntityIds } = req.body;
    ok(res, await getInvestigationArtifactService().revise(req.params.artifactId, { content, evidenceEntityIds }));
  } catch (e) { err(res, e, e.message.includes('not found') ? 404 : 400); }
});

// ─── Program (Step Chain) ────────────────────────────────────────────────────

// GET /api/v1/investigation/sessions/:id/program
// Returns the full reproducible step chain for this session
router.get('/sessions/:id/program', async (req, res) => {
  try {
    ok(res, await getInvestigationStepService().getProgram(req.params.id));
  } catch (e) { err(res, e); }
});

module.exports = router;
