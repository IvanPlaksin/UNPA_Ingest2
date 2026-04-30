/**
 * Diff Computer Service
 *
 * Compares WorkSpace drafts against KB entities to determine
 * promotion actions: NEW, ENRICH, SUPERSEDE, CONFLICT, MERGE, REJECT, SKIP.
 *
 * @module services/workspace/promotion/diff-computer
 */

'use strict';

const LOG_PREFIX = '[DiffComputer]';

let _mg = null;
function mg() { if (!_mg) _mg = require('../../memgraph.service'); return _mg; }

const PromotionAction = {
  NEW: 'NEW', ENRICH: 'ENRICH', SUPERSEDE: 'SUPERSEDE',
  CONFLICT: 'CONFLICT', MERGE: 'MERGE', REJECT: 'REJECT', SKIP: 'SKIP'
};

const CONFIG = {
  thresholds: { new: 0.30, enrich: 0.70, supersede: 0.90, exact: 0.95 },
  targetNamespaces: ['core', 'project', 'Codex']
};

/**
 * Compute diff for all workspace drafts
 */
async function computeDiff(workspaceId, options = {}) {
  const { draftIds, targetNamespace = 'core', includePromoted = false } = options;
  const startTime = Date.now();
  const log = [];
  const addLog = (msg, level = 'info') => {
    log.push({ timestamp: new Date().toISOString(), level, message: msg });
    console.log(`${LOG_PREFIX} ${msg}`);
  };

  try {
    addLog(`Computing diff for workspace ${workspaceId}`);

    // Get drafts
    const drafts = await getDraftsForPromotion(workspaceId, { draftIds, includePromoted });
    addLog(`Found ${drafts.length} drafts`);

    if (drafts.length === 0) {
      return { success: true, items: [], grouped: {}, summary: { total: 0 }, log };
    }

    // Compute diff per draft
    const scorer = require('./similarity-scorer.service');
    const detector = require('./conflict-detector.service');
    const items = [];

    for (const draft of drafts) {
      const item = {
        draftId: draft.id, draftType: draft.type, draftName: draft.name,
        draftContent: typeof draft.content === 'string' ? JSON.parse(draft.content) : draft.content,
        workspaceId, action: null, kbMatches: [], maxSimilarity: 0, bestMatch: null,
        conflicts: [], changes: null, resolution: null, computedAt: new Date().toISOString()
      };

      try {
        const matches = await scorer.findSimilarKBEntities(draft, { namespace: targetNamespace, limit: 5 });
        item.kbMatches = matches;

        if (matches.length > 0) {
          item.maxSimilarity = matches[0].score;
          item.bestMatch = matches[0];
        }

        // Determine action
        if (item.maxSimilarity < CONFIG.thresholds.new) {
          item.action = PromotionAction.NEW;
        } else if (item.maxSimilarity < CONFIG.thresholds.enrich) {
          item.action = PromotionAction.ENRICH;
          item.changes = computeEnrichChanges(draft, item.bestMatch.entity);
        } else if (item.maxSimilarity < CONFIG.thresholds.supersede) {
          item.action = PromotionAction.SUPERSEDE;
          item.changes = computeSupersedChanges(draft, item.bestMatch.entity);
        } else {
          // Near-exact → check conflicts
          const conflicts = await detector.detectConflicts(draft, item.bestMatch.entity);
          if (conflicts.length > 0) {
            item.action = PromotionAction.CONFLICT;
            item.conflicts = conflicts;
          } else {
            item.action = PromotionAction.ENRICH;
            item.changes = computeEnrichChanges(draft, item.bestMatch.entity);
            if (!item.changes.added || Object.keys(item.changes.added).length === 0) {
              if (!item.changes.modified || Object.keys(item.changes.modified).length === 0) {
                item.action = PromotionAction.SKIP;
                item.skipReason = 'Duplicate - no new information';
              }
            }
          }
        }
      } catch (err) {
        item.action = PromotionAction.SKIP;
        item.skipReason = `Error: ${err.message}`;
      }

      items.push(item);
      addLog(`${draft.name}: ${item.action} (score: ${item.maxSimilarity.toFixed(2)})`);
    }

    // Cross-draft conflicts
    const crossConflicts = detectCrossDraftConflicts(items);
    if (crossConflicts.length > 0) {
      addLog(`${crossConflicts.length} cross-draft conflicts`, 'warn');
      for (const cc of crossConflicts) {
        for (const did of cc.draftIds) {
          const it = items.find(i => i.draftId === did);
          if (it && it.action !== PromotionAction.CONFLICT) {
            it.action = PromotionAction.CONFLICT;
            it.conflicts.push({ type: 'CROSS_DRAFT', description: cc.description, relatedDrafts: cc.draftIds.filter(id => id !== did) });
          }
        }
      }
    }

    // Group
    const grouped = {};
    for (const a of Object.values(PromotionAction)) grouped[a] = [];
    for (const item of items) grouped[item.action].push(item);

    const summary = {
      total: items.length,
      byAction: Object.fromEntries(Object.entries(grouped).map(([a, i]) => [a, i.length])),
      hasConflicts: (grouped[PromotionAction.CONFLICT] || []).length > 0,
      durationMs: Date.now() - startTime
    };

    addLog(`Diff complete: ${JSON.stringify(summary.byAction)}`);

    return { success: true, items, grouped, summary, targetNamespace, log };
  } catch (error) {
    addLog(`Failed: ${error.message}`, 'error');
    return { success: false, error: error.message, items: [], log };
  }
}

function computeEnrichChanges(draft, kbEntity) {
  const changes = { added: {}, modified: {}, unchanged: {} };
  const dc = (typeof draft.content === 'string' ? JSON.parse(draft.content) : draft.content) || {};
  const kc = kbEntity.content || kbEntity.properties || kbEntity;
  for (const [k, v] of Object.entries(dc)) {
    if (k.startsWith('_')) continue;
    if (!(k in kc)) changes.added[k] = v;
    else if (JSON.stringify(kc[k]) !== JSON.stringify(v)) changes.modified[k] = { old: kc[k], new: v };
    else changes.unchanged[k] = v;
  }
  return changes;
}

function computeSupersedChanges(draft, kbEntity) {
  return {
    previousVersion: { id: kbEntity.id, version: kbEntity.version || 1, content: kbEntity.content || kbEntity.properties },
    newContent: typeof draft.content === 'string' ? JSON.parse(draft.content) : draft.content
  };
}

function detectCrossDraftConflicts(items) {
  const byKB = {};
  for (const item of items) {
    if (item.bestMatch && item.action !== PromotionAction.NEW) {
      const kbId = item.bestMatch.entity?.id || item.bestMatch.kbId;
      if (!byKB[kbId]) byKB[kbId] = [];
      byKB[kbId].push(item);
    }
  }
  const conflicts = [];
  for (const [kbId, its] of Object.entries(byKB)) {
    if (its.length > 1) {
      const modKeys = new Set();
      let hasConflict = false;
      for (const it of its) {
        for (const k of Object.keys(it.changes?.modified || {})) {
          if (modKeys.has(k)) { hasConflict = true; break; }
          modKeys.add(k);
        }
        if (hasConflict) break;
      }
      if (hasConflict) {
        conflicts.push({
          kbEntityId: kbId, draftIds: its.map(i => i.draftId),
          description: `Multiple drafts (${its.map(i => i.draftName).join(', ')}) target same KB entity`
        });
      }
    }
  }
  return conflicts;
}

async function getDraftsForPromotion(workspaceId, options = {}) {
  const { draftIds, includePromoted } = options;
  let q = `MATCH (ws:WorkSpace {id: $wsId})-[:CONTAINS_DRAFT]->(d)`;
  const conditions = [];
  if (draftIds?.length) conditions.push('d.id IN $draftIds');
  if (!includePromoted) conditions.push("d.status IN ['VALIDATED', 'READY_TO_PROMOTE']");
  if (conditions.length) q += ` WHERE ${conditions.join(' AND ')}`;
  q += ' RETURN d ORDER BY d.type, d.name';

  const result = await mg().runQuery(q, { wsId: workspaceId, draftIds });
  console.log(`${LOG_PREFIX} getDraftsForPromotion: runQuery returned ${result.length} results`);
  if (result.length > 0) {
    const r0 = result[0];
    console.log(`${LOG_PREFIX} First result keys: ${Object.keys(r0)}, has d: ${!!r0.d}, type d: ${typeof r0.d}`);
    if (r0.d) console.log(`${LOG_PREFIX} d keys: ${Object.keys(r0.d)}, has properties: ${!!r0.d.properties}`);
  }
  return result.map(r => {
    // runQuery returns { d: <Neo4j Node with .properties> } or { d: <plain object> }
    const node = r.d;
    if (!node) return null;
    const props = node.properties || node;
    return { ...props, content: typeof props.content === 'string' ? JSON.parse(props.content) : props.content };
  }).filter(Boolean);
}

module.exports = {
  computeDiff, computeEnrichChanges, computeSupersedChanges,
  detectCrossDraftConflicts, PromotionAction, CONFIG
};
