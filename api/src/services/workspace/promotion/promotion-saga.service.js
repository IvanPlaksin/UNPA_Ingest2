/**
 * Promotion SAGA Service
 *
 * Builds and executes SAGA transactions for promoting WorkSpace drafts to KB.
 * Steps are executed sequentially; on failure, completed steps are compensated in LIFO order.
 *
 * @module services/workspace/promotion/promotion-saga
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

const LOG_PREFIX = '[PromotionSaga]';

let _mg = null, _qdrant = null, _tei = null;
function mg() { if (!_mg) _mg = require('../../memgraph.service'); return _mg; }
function qdrant() { if (!_qdrant) _qdrant = require('../../qdrant.service'); return _qdrant; }
function tei() { if (!_tei) _tei = require('../../tei.service'); return _tei; }

const SagaStepType = {
  CREATE_KB_NODE: 'CREATE_KB_NODE', UPDATE_KB_NODE: 'UPDATE_KB_NODE',
  CREATE_VERSION: 'CREATE_VERSION', CREATE_EDGE: 'CREATE_EDGE',
  UPDATE_EMBEDDING: 'UPDATE_EMBEDDING', UPDATE_DRAFT_STATUS: 'UPDATE_DRAFT_STATUS',
  CREATE_PROMOTION_RECORD: 'CREATE_PROMOTION_RECORD'
};

/**
 * Build promotion SAGA from resolved items
 */
function buildPromotionSaga({ workspaceId, targetNamespace, items, userId }) {
  const sagaId = `promotion-${workspaceId.slice(0, 8)}-${Date.now()}`;
  const steps = [];
  const promoted = [];

  for (const item of items) {
    if (!item.resolved || !item.promotionData || item.promotionData.operation === 'SKIP') continue;
    steps.push(...buildItemSteps(item, { targetNamespace, workspaceId }));
    promoted.push({ draftId: item.draftId, operation: item.promotionData.operation });
  }

  // Final: PromotionRecord
  steps.push({
    id: `step-promo-record`, type: SagaStepType.CREATE_PROMOTION_RECORD,
    data: { workspaceId, targetNamespace, userId, promotedCount: promoted.length, promoted }
  });

  return { id: sagaId, workspaceId, targetNamespace, userId, steps, createdAt: new Date().toISOString() };
}

function buildItemSteps(item, ctx) {
  const steps = [];
  const d = item.promotionData;
  const pfx = `step-${item.draftId.slice(0, 8)}`;

  if (d.operation === 'CREATE') {
    steps.push({ id: `${pfx}-create`, type: SagaStepType.CREATE_KB_NODE, draftId: item.draftId, data: { label: d.entityType, props: { ...d.properties, namespace: ctx.targetNamespace }, content: d.content } });
    for (let i = 0; i < (d.relationships || []).length; i++) {
      steps.push({ id: `${pfx}-edge-${i}`, type: SagaStepType.CREATE_EDGE, draftId: item.draftId, data: d.relationships[i] });
    }
    if (d.embedding?.required) steps.push({ id: `${pfx}-emb`, type: SagaStepType.UPDATE_EMBEDDING, draftId: item.draftId, data: { ns: ctx.targetNamespace, text: d.embedding.text } });
  }

  if (d.operation === 'UPDATE' || d.operation === 'MERGE') {
    steps.push({ id: `${pfx}-update`, type: SagaStepType.UPDATE_KB_NODE, draftId: item.draftId, data: { targetId: d.targetId, toAdd: d.propertiesToAdd || d.mergedProperties || {}, toUpdate: d.propertiesToUpdate || {}, meta: d.metadata } });
    if (d.embedding?.required) steps.push({ id: `${pfx}-emb`, type: SagaStepType.UPDATE_EMBEDDING, draftId: item.draftId, data: { entityId: d.targetId, ns: ctx.targetNamespace, text: d.embedding.text } });
  }

  if (d.operation === 'SUPERSEDE') {
    const newId = d.newEntity.properties.id;
    steps.push({ id: `${pfx}-newver`, type: SagaStepType.CREATE_VERSION, draftId: item.draftId, data: { prevId: d.previousId, label: d.newEntity.entityType, props: { ...d.newEntity.properties, namespace: ctx.targetNamespace }, content: d.newEntity.content || {} } });
    steps.push({ id: `${pfx}-mark`, type: SagaStepType.UPDATE_KB_NODE, draftId: item.draftId, data: { targetId: d.previousId, toUpdate: d.previousUpdate } });
    steps.push({ id: `${pfx}-supedge`, type: SagaStepType.CREATE_EDGE, draftId: item.draftId, data: { relType: 'SUPERSEDES', sourceId: newId, targetId: d.previousId } });
    if (d.embedding?.required) steps.push({ id: `${pfx}-emb`, type: SagaStepType.UPDATE_EMBEDDING, draftId: item.draftId, data: { entityId: newId, ns: ctx.targetNamespace, text: d.embedding.text } });
  }

  // Always update draft status
  steps.push({ id: `${pfx}-draft`, type: SagaStepType.UPDATE_DRAFT_STATUS, draftId: item.draftId, data: { wsId: ctx.workspaceId, draftId: item.draftId } });

  return steps;
}

/**
 * Execute promotion SAGA
 */
async function executePromotionSaga(saga) {
  const log = [];
  const completed = [];
  const created = {}; // stepId → entityId

  const addLog = (msg, lvl = 'info') => {
    log.push({ ts: new Date().toISOString(), lvl, msg });
    console.log(`${LOG_PREFIX} ${msg}`);
  };

  addLog(`Starting SAGA ${saga.id} (${saga.steps.length} steps)`);

  try {
    for (const step of saga.steps) {
      addLog(`Step: ${step.id} (${step.type})`);
      try {
        const result = await executeStep(step, created);
        if (result?.createdId) created[step.id] = result.createdId;
        step._original = result?.original;
        completed.push(step);
      } catch (err) {
        addLog(`FAILED: ${step.id} — ${err.message}`, 'error');
        await compensate(completed, created, addLog);
        return { success: false, sagaId: saga.id, error: err.message, failedStep: step.id, compensated: true, log };
      }
    }

    addLog('SAGA completed');
    return { success: true, sagaId: saga.id, promotedCount: completed.filter(s => s.type === SagaStepType.CREATE_KB_NODE || s.type === SagaStepType.CREATE_VERSION).length, created, log };
  } catch (error) {
    addLog(`SAGA error: ${error.message}`, 'error');
    if (completed.length > 0) await compensate(completed, created, addLog);
    return { success: false, sagaId: saga.id, error: error.message, log };
  }
}

async function executeStep(step, created) {
  switch (step.type) {
    case SagaStepType.CREATE_KB_NODE: {
      await mg().runQuery(`CREATE (n:${step.data.label} $props) SET n.content = $content`, { props: step.data.props, content: JSON.stringify(step.data.content || {}) });
      return { createdId: step.data.props.id };
    }
    case SagaStepType.UPDATE_KB_NODE: {
      const orig = await mg().runQuery('MATCH (n {id: $id}) RETURN n', { id: step.data.targetId });
      const sets = [...Object.keys(step.data.toAdd || {}).map(k => `n.${k} = $all.${k}`), ...Object.keys(step.data.toUpdate || {}).map(k => `n.${k} = $all.${k}`)];
      if (sets.length) await mg().runQuery(`MATCH (n {id: $id}) SET ${sets.join(', ')}`, { id: step.data.targetId, all: { ...step.data.toAdd, ...step.data.toUpdate } });
      return { original: orig[0]?.n?.properties };
    }
    case SagaStepType.CREATE_VERSION: {
      await mg().runQuery(`CREATE (n:${step.data.label} $props) SET n.content = $content`, { props: step.data.props, content: JSON.stringify(step.data.content || {}) });
      return { createdId: step.data.props.id };
    }
    case SagaStepType.CREATE_EDGE: {
      const src = step.data.sourceId || created[Object.keys(created).find(k => k.includes(step.draftId?.slice(0, 8)))];
      if (src && step.data.targetId) {
        await mg().runQuery(`MATCH (a {id: $s}), (b {id: $t}) CREATE (a)-[:${step.data.relType || 'RELATED_TO'}]->(b)`, { s: src, t: step.data.targetId });
      }
      return {};
    }
    case SagaStepType.UPDATE_EMBEDDING: {
      try {
        const id = step.data.entityId || created[Object.keys(created).find(k => k.includes(step.draftId?.slice(0, 8)))];
        const vec = await tei().getEmbedding(step.data.text);
        if (vec && id) {
          const coll = `${(step.data.ns || 'core').toLowerCase()}_knowledge`;
          await qdrant().workspaceUpsert(coll.replace('_knowledge', ''), [{ id, vector: vec, payload: { entityId: id, namespace: step.data.ns } }]);
        }
      } catch { /* best effort */ }
      return {};
    }
    case SagaStepType.UPDATE_DRAFT_STATUS: {
      const orig = await mg().runQuery('MATCH (d {id: $id}) RETURN d.status as s', { id: step.data.draftId });
      step._origStatus = orig[0]?.s;
      await mg().runQuery(`MATCH (d {id: $id}) SET d.status = 'PROMOTED', d.promotedAt = $t`, { id: step.data.draftId, t: new Date().toISOString() });
      return {};
    }
    case SagaStepType.CREATE_PROMOTION_RECORD: {
      const recId = uuidv4();
      await mg().runQuery(
        `CREATE (pr:PromotionRecord:META {id: $id, namespace: 'META', workspaceId: $ws, targetNamespace: $tns, userId: $uid, promotedCount: $cnt, promotedEntities: $ents, createdAt: $t})`,
        { id: recId, ws: step.data.workspaceId, tns: step.data.targetNamespace, uid: step.data.userId, cnt: step.data.promotedCount, ents: JSON.stringify(step.data.promoted), t: new Date().toISOString() }
      );
      return { createdId: recId };
    }
    default: throw new Error(`Unknown step type: ${step.type}`);
  }
}

async function compensate(completed, created, addLog) {
  for (const step of [...completed].reverse()) {
    try {
      addLog(`Compensating: ${step.id}`);
      switch (step.type) {
        case SagaStepType.CREATE_KB_NODE:
        case SagaStepType.CREATE_VERSION:
          await mg().runQuery('MATCH (n {id: $id}) DETACH DELETE n', { id: step.data.props?.id || created[step.id] });
          break;
        case SagaStepType.UPDATE_KB_NODE:
          if (step._original) await mg().runQuery('MATCH (n {id: $id}) SET n = $p', { id: step.data.targetId, p: step._original });
          break;
        case SagaStepType.CREATE_EDGE:
          // Edge deletion best-effort
          break;
        case SagaStepType.UPDATE_DRAFT_STATUS:
          await mg().runQuery(`MATCH (d {id: $id}) SET d.status = $s REMOVE d.promotedAt`, { id: step.data.draftId, s: step._origStatus || 'READY_TO_PROMOTE' });
          break;
        case SagaStepType.CREATE_PROMOTION_RECORD:
          if (created[step.id]) await mg().runQuery('MATCH (n {id: $id}) DELETE n', { id: created[step.id] });
          break;
      }
    } catch (e) { addLog(`Compensation failed: ${step.id}: ${e.message}`, 'error'); }
  }
}

module.exports = { buildPromotionSaga, executePromotionSaga, SagaStepType };
