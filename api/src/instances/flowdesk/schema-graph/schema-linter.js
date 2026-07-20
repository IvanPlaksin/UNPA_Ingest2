'use strict';

/**
 * Schema-graph linter (C1). Enforces flow well-formedness before a SchemaSnapshot
 * is cached/served. Four rules (canonical, over a compiled snapshot) + a Cypher
 * structural subset for live graphs in Memgraph.
 *
 * Rules:
 *   R0 TREF_SYNTAX      — a trefCondition must parse in the tref dialect.
 *   R1 ACYCLIC          — dependsOn must be acyclic.
 *   R2 TREF_EARLY       — a slot's trefCondition may only reference slots in an
 *                         earlier phase/order (can't gate on not-yet-gathered info).
 *   R3 REQUIRED_REACHABLE — a required slot's dependsOn must reference existing,
 *                         earlier slots (no dead/unreachable required slot).
 *   R4 ENUM_DOMAIN      — an enum slot must have presentOptions or a resolverRef.
 *   R5 REQUIRED_WHEN_SYNTAX  — requiredWhen must parse and reference earlier slots.
 *   R6 OPTION_FILTER_SYNTAX  — each optionFilters[].condition must parse and
 *                         reference earlier slots.
 *   R7 OPTION_FILTER_VALUES  — an optionFilter may only name options the slot offers.
 *
 * R0 exists so a malformed condition surfaces here, at compile time, against the
 * same parser the runtime uses (IP-0a). evalTref now throws on a bad condition
 * rather than guessing, and a schema must never reach a live dialogue carrying
 * one — the linter is where that is caught.
 *
 * Numbering note: R5-R7 were specified as "R3/R4/R5", which collide with the
 * existing REQUIRED_REACHABLE and ENUM_DOMAIN. Violations are keyed by name, not
 * number, so the names are as ratified; only the doc numbering moved.
 *
 * @module instances/flowdesk/schema-graph/schema-linter
 */

const { read } = require('./driver');
const { parseTref, TrefParseError } = require('../contracts/draft-sr.reducer');
const { validate: validateTref } = require('../contracts/tref-parser');

const SLOT_REF_RE = /slots\.([a-zA-Z_][a-zA-Z0-9_]*)/g;

/**
 * Lint a compiled SchemaSnapshot. Pure — no I/O.
 * @returns {{ok: boolean, violations: Array<{rule, slotId?, message}>}}
 */
function lintSnapshot(snapshot) {
  const violations = [];
  const slots = snapshot.slots || [];
  const byId = new Map(slots.map((s) => [s.slotId, s]));
  const orderOf = new Map(slots.map((s, i) => [s.slotId, i]));
  const phaseIdx = (phase) => (snapshot.phases || []).indexOf(phase);

  // R1: acyclic dependsOn (DFS with colors)
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map(slots.map((s) => [s.slotId, WHITE]));
  const dfs = (id, stack) => {
    color.set(id, GREY);
    for (const dep of (byId.get(id)?.dependsOn) || []) {
      if (!byId.has(dep)) continue;
      if (color.get(dep) === GREY) {
        violations.push({ rule: 'ACYCLIC', slotId: id, message: `dependsOn cycle: ${[...stack, id, dep].join(' → ')}` });
        return;
      }
      if (color.get(dep) === WHITE) dfs(dep, [...stack, id]);
    }
    color.set(id, BLACK);
  };
  for (const s of slots) if (color.get(s.slotId) === WHITE) dfs(s.slotId, []);

  // R0 / R2 / R3 / R4 per slot
  for (const s of slots) {
    // R0: the condition must parse before any claim about what it references
    let trefParses = true;
    if (s.trefCondition) {
      try {
        parseTref(s.trefCondition);
      } catch (err) {
        if (!(err instanceof TrefParseError)) throw err;
        trefParses = false;
        violations.push({ rule: 'TREF_SYNTAX', slotId: s.slotId, message: err.message });
      }
    }

    // R2: tref references earlier slots only. Skipped when R0 failed — slot refs
    // read off an unparseable string would be guesswork, and R0 already reports it.
    if (s.trefCondition && trefParses) {
      let m;
      SLOT_REF_RE.lastIndex = 0;
      while ((m = SLOT_REF_RE.exec(s.trefCondition)) !== null) {
        const refId = m[1];
        const ref = byId.get(refId);
        if (!ref) {
          violations.push({ rule: 'TREF_EARLY', slotId: s.slotId, message: `trefCondition references unknown slot '${refId}'` });
          continue;
        }
        if (phaseIdx(ref.phase) > phaseIdx(s.phase) || orderOf.get(refId) >= orderOf.get(s.slotId)) {
          violations.push({ rule: 'TREF_EARLY', slotId: s.slotId, message: `trefCondition references slot '${refId}' in a later phase/position` });
        }
      }
    }

    // R3: required reachability
    if (s.required) {
      for (const dep of s.dependsOn || []) {
        if (!byId.has(dep)) {
          violations.push({ rule: 'REQUIRED_REACHABLE', slotId: s.slotId, message: `required slot depends on unknown slot '${dep}'` });
        } else if (orderOf.get(dep) > orderOf.get(s.slotId)) {
          violations.push({ rule: 'REQUIRED_REACHABLE', slotId: s.slotId, message: `required slot depends on later slot '${dep}' (unreachable)` });
        }
      }
      if (phaseIdx(s.phase) === -1) {
        violations.push({ rule: 'REQUIRED_REACHABLE', slotId: s.slotId, message: `required slot in undeclared phase '${s.phase}'` });
      }
    }

    // R4: enum must have a domain
    if (s.type === 'enum') {
      const hasOptions = Array.isArray(s.presentOptions) && s.presentOptions.length > 0;
      if (!hasOptions && !s.resolverRef) {
        violations.push({ rule: 'ENUM_DOMAIN', slotId: s.slotId, message: `enum slot has neither presentOptions nor resolverRef` });
      }
    }

    // R5: requiredWhen must parse, and may only look backwards — a slot whose
    // obligation depends on an answer that comes later can never be settled in
    // time, exactly as with trefCondition.
    if (s.requiredWhen) {
      if (checkTrefSyntax(s.requiredWhen, s.slotId, 'requiredWhen', violations, 'REQUIRED_WHEN_SYNTAX')) {
        checkTrefRefs(s.requiredWhen, s, 'requiredWhen', 'REQUIRED_WHEN_SYNTAX', { byId, orderOf, phaseIdx, violations });
      }
    }

    // R6 / R7: option filters
    for (let i = 0; i < (s.optionFilters || []).length; i++) {
      const f = s.optionFilters[i];
      const where = `optionFilters[${i}].condition`;

      // R6: the condition must parse and look backwards
      if (checkTrefSyntax(f.condition, s.slotId, where, violations, 'OPTION_FILTER_SYNTAX')) {
        checkTrefRefs(f.condition, s, where, 'OPTION_FILTER_SYNTAX', { byId, orderOf, phaseIdx, violations });
      }

      // R7: a filter may only name options the slot actually offers. Naming an
      // option that does not exist means the filter narrows to nothing (include)
      // or does nothing (exclude) — either way it is a typo, not an intention.
      const domain = new Set((s.presentOptions || []).map((o) => o.value));
      // A resolver-backed enum has no static domain to check against.
      if (domain.size > 0) {
        for (const value of [...(f.include || []), ...(f.exclude || [])]) {
          if (!domain.has(value)) {
            violations.push({
              rule: 'OPTION_FILTER_VALUES',
              slotId: s.slotId,
              message: `optionFilters[${i}] names option '${value}', which is not in presentOptions`,
            });
          }
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/** @returns {boolean} true when the expression parses (so ref-checking is meaningful) */
function checkTrefSyntax(condition, slotId, field, violations, rule) {
  const result = validateTref(condition);
  if (result.valid) return true;
  violations.push({ rule, slotId, message: `${field}: ${result.error.message}` });
  return false;
}

/** A tref expression may only reference slots that are gathered before this one. */
function checkTrefRefs(condition, slot, field, rule, { byId, orderOf, phaseIdx, violations }) {
  let m;
  SLOT_REF_RE.lastIndex = 0;
  while ((m = SLOT_REF_RE.exec(condition)) !== null) {
    const refId = m[1];
    const ref = byId.get(refId);
    if (!ref) {
      violations.push({ rule, slotId: slot.slotId, message: `${field} references unknown slot '${refId}'` });
      continue;
    }
    if (phaseIdx(ref.phase) > phaseIdx(slot.phase) || orderOf.get(refId) >= orderOf.get(slot.slotId)) {
      violations.push({ rule, slotId: slot.slotId, message: `${field} references slot '${refId}' in a later phase/position` });
    }
  }
}

/**
 * Cypher structural checks against the live graph (subset: cycle, enum-domain,
 * dead-required). Complements lintSnapshot for graphs in Memgraph.
 * @returns {{ok:boolean, violations:Array}}
 */
async function lintGraph(serviceId) {
  const violations = [];

  const cycles = await read(
    `MATCH (a:SlotDef {serviceId:$sid})-[:DEPENDS_ON*1..20]->(a) RETURN DISTINCT a.slotId AS slotId`,
    { sid: serviceId }
  );
  for (const r of cycles) violations.push({ rule: 'ACYCLIC', slotId: r.get('slotId'), message: 'dependsOn cycle' });

  const enums = await read(
    `MATCH (sl:SlotDef {serviceId:$sid, type:'enum'})
     WHERE NOT (sl)-[:HAS_OPTION]->() AND NOT (sl)-[:RESOLVED_BY]->()
     RETURN sl.slotId AS slotId`,
    { sid: serviceId }
  );
  for (const r of enums) violations.push({ rule: 'ENUM_DOMAIN', slotId: r.get('slotId'), message: 'enum without options or resolver' });

  const dead = await read(
    `MATCH (sl:SlotDef {serviceId:$sid, required:true})-[:DEPENDS_ON]->(d:SlotDef)
     WHERE d.order > sl.order RETURN DISTINCT sl.slotId AS slotId`,
    { sid: serviceId }
  );
  for (const r of dead) violations.push({ rule: 'REQUIRED_REACHABLE', slotId: r.get('slotId'), message: 'required depends on later slot' });

  return { ok: violations.length === 0, violations };
}

module.exports = { lintSnapshot, lintGraph, SLOT_REF_RE };
