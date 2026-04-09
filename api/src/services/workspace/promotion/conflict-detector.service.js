/**
 * Conflict Detector Service
 *
 * Detects conflicts between Draft and KB entity.
 * Types: VALUE_CONFLICT, TYPE_MISMATCH, SEMANTIC_CONTRADICTION, TEMPORAL_CONFLICT
 *
 * @module services/workspace/promotion/conflict-detector
 */

'use strict';

const ConflictType = {
  VALUE_CONFLICT: 'VALUE_CONFLICT',
  TYPE_MISMATCH: 'TYPE_MISMATCH',
  SEMANTIC_CONTRADICTION: 'SEMANTIC_CONTRADICTION',
  TEMPORAL_CONFLICT: 'TEMPORAL_CONFLICT',
  REFERENCE_CONFLICT: 'REFERENCE_CONFLICT'
};

const ConflictSeverity = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

/**
 * Detect conflicts between draft and KB entity
 */
async function detectConflicts(draft, kbEntity) {
  const conflicts = [];

  // Type mismatch
  const typeCon = checkTypeMismatch(draft, kbEntity);
  if (typeCon) conflicts.push(typeCon);

  // Value conflicts
  conflicts.push(...checkValueConflicts(draft, kbEntity));

  // Semantic contradictions (business rules)
  if (draft.type === 'business_rule') {
    conflicts.push(...checkSemanticContradictions(draft, kbEntity));
  }

  // Temporal
  const tempCon = checkTemporalConflict(draft, kbEntity);
  if (tempCon) conflicts.push(tempCon);

  return conflicts;
}

function checkTypeMismatch(draft, kb) {
  const d = (draft.type || '').toLowerCase().replace(/^draft/, '').replace(/_/g, '');
  const k = (kb.type || kb.labels?.[0] || '').toLowerCase().replace(/_/g, '');
  if (d && k && d !== k && !k.includes(d) && !d.includes(k)) {
    return {
      type: ConflictType.TYPE_MISMATCH, severity: ConflictSeverity.HIGH,
      field: 'type', draftValue: draft.type, kbValue: kb.type,
      description: `Type mismatch: draft=${draft.type}, kb=${kb.type}`,
      resolutionOptions: [
        { id: 'keep_draft', label: 'Create as new entity' },
        { id: 'keep_kb', label: 'Skip promotion' },
        { id: 'convert', label: 'Convert type' }
      ]
    };
  }
  return null;
}

function checkValueConflicts(draft, kb) {
  const conflicts = [];
  const dc = draft.content || {};
  const kc = kb.content || kb.properties || kb;
  const fields = ['condition', 'action', 'formula', 'definition', 'enforcement', 'priority', 'scope'];

  for (const f of fields) {
    if (f in dc && f in kc) {
      if (JSON.stringify(dc[f]) !== JSON.stringify(kc[f]) && !areCompatible(dc[f], kc[f])) {
        conflicts.push({
          type: ConflictType.VALUE_CONFLICT,
          severity: ['condition', 'action', 'formula'].includes(f) ? ConflictSeverity.HIGH : ConflictSeverity.MEDIUM,
          field: f, draftValue: dc[f], kbValue: kc[f],
          description: `Conflicting values for "${f}"`,
          resolutionOptions: [
            { id: 'use_draft', label: 'Use draft value' },
            { id: 'use_kb', label: 'Keep KB value' },
            { id: 'merge', label: 'Merge values' }
          ]
        });
      }
    }
  }
  return conflicts;
}

function areCompatible(v1, v2) {
  if (JSON.stringify(v1) === JSON.stringify(v2)) return true;
  if (typeof v1 === 'object' && typeof v2 === 'object' && !Array.isArray(v1)) {
    return Object.keys(v2).every(k => JSON.stringify(v1[k]) === JSON.stringify(v2[k]));
  }
  if (Array.isArray(v1) && Array.isArray(v2)) {
    const s1 = new Set(v1.map(JSON.stringify)), s2 = new Set(v2.map(JSON.stringify));
    return [...s2].every(x => s1.has(x)) || [...s1].every(x => s2.has(x));
  }
  return false;
}

function checkSemanticContradictions(draft, kb) {
  const conflicts = [];
  const dc = draft.content?.condition, da = draft.content?.action;
  const kc = kb.content?.condition || kb.condition, ka = kb.content?.action || kb.action;

  if (dc && kc && da && ka) {
    const condSimilar = areSimilar(dc?.expression || JSON.stringify(dc), kc?.expression || JSON.stringify(kc));
    const actOpposite = areOpposite(da?.type || da, ka?.type || ka);
    if (condSimilar && actOpposite) {
      conflicts.push({
        type: ConflictType.SEMANTIC_CONTRADICTION, severity: ConflictSeverity.CRITICAL,
        field: 'rule_logic', description: 'Similar conditions but contradictory actions',
        resolutionOptions: [
          { id: 'use_draft', label: 'Replace with draft rule' },
          { id: 'use_kb', label: 'Keep existing rule' },
          { id: 'create_exception', label: 'Create as exception' },
          { id: 'manual_review', label: 'Flag for review' }
        ]
      });
    }
  }
  return conflicts;
}

function areSimilar(s1, s2) {
  if (!s1 || !s2) return false;
  const a = String(s1).toLowerCase().replace(/\s+/g, ' ').trim();
  const b = String(s2).toLowerCase().replace(/\s+/g, ' ').trim();
  return a === b || a.includes(b) || b.includes(a);
}

function areOpposite(a1, a2) {
  const t1 = String(a1).toLowerCase(), t2 = String(a2).toLowerCase();
  const pairs = [['approve','reject'],['allow','deny'],['enable','disable'],['create','delete'],['add','remove']];
  return pairs.some(([x, y]) => (t1.includes(x) && t2.includes(y)) || (t1.includes(y) && t2.includes(x)));
}

function checkTemporalConflict(draft, kb) {
  const dd = draft.extractedAt || draft.createdAt;
  const kd = kb.updatedAt || kb.createdAt;
  if (!dd || !kd) return null;
  const week = 7 * 24 * 3600 * 1000;
  if (new Date(kd).getTime() > new Date(dd).getTime() + week) {
    return {
      type: ConflictType.TEMPORAL_CONFLICT, severity: ConflictSeverity.MEDIUM,
      field: 'timestamp', draftDate: dd, kbDate: kd,
      description: 'KB updated after draft extraction',
      resolutionOptions: [
        { id: 'use_draft', label: 'Override with draft' },
        { id: 'use_kb', label: 'Keep newer KB version' },
        { id: 'merge', label: 'Merge changes' }
      ]
    };
  }
  return null;
}

module.exports = {
  detectConflicts, checkTypeMismatch, checkValueConflicts,
  checkSemanticContradictions, checkTemporalConflict,
  ConflictType, ConflictSeverity
};
