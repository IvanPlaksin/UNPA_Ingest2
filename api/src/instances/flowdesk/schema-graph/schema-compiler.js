'use strict';

/**
 * Schema-graph compiler (C1) — Memgraph flow graph → SchemaSnapshot JSON.
 *
 * Reads the ServiceDef/SlotDef/... graph seeded by seed-schema-graphs.js and
 * emits a SchemaSnapshot conforming to
 * instances/flowdesk/contracts/schema-snapshot.schema.json. Deterministic:
 * slots by SlotDef.order, options by EnumOption.order, dependsOn by target order.
 *
 * Every tref expression is parsed here (IP-0c). A condition that cannot parse
 * makes the whole snapshot unsafe — the runtime evaluator throws on it, mid-turn
 * — so compilation refuses rather than emitting a snapshot that is guaranteed to
 * fail later. The linter reports the same defects as a list; this is the backstop
 * for anything that reaches the compiler without being linted.
 *
 * @module instances/flowdesk/schema-graph/schema-compiler
 */

const { read } = require('./driver');
const { validate: validateTref } = require('../contracts/tref-parser');

/** A graph that cannot produce a valid SchemaSnapshot. */
class SchemaCompileError extends Error {
  constructor(message, { serviceId = null, slotId = null, field = null } = {}) {
    super(message);
    this.name = 'SchemaCompileError';
    this.serviceId = serviceId;
    this.slotId = slotId;
    this.field = field;
  }
}

/** Parse-check one tref expression, naming where it came from. */
function assertTref(condition, { serviceId, slotId, field }) {
  const result = validateTref(condition);
  if (!result.valid) {
    throw new SchemaCompileError(
      `${serviceId}.${slotId}: invalid ${field} — ${result.error.message}`,
      { serviceId, slotId, field },
    );
  }
}

/**
 * Compile one service graph into a SchemaSnapshot object.
 * @param {string} serviceId
 * @returns {Promise<Object|null>} SchemaSnapshot or null if not found
 */
async function compile(serviceId) {
  const svcRecs = await read(
    `MATCH (s:ServiceDef {serviceId:$sid})
     RETURN s.serviceId AS serviceId, s.version AS version, s.title AS title,
            s.slaHours AS slaHours, s.approvalRequired AS approvalRequired,
            s.handlerRef AS handlerRef, s.phases AS phases,
            s.altioraOusId AS altioraOusId, s.contentHash AS contentHash`,
    { sid: serviceId }
  );
  if (svcRecs.length === 0) return null;
  const s = svcRecs[0];

  const metadata = { title: s.get('title'), approvalRequired: s.get('approvalRequired') };
  const sla = s.get('slaHours');
  if (sla !== null && sla !== undefined) metadata.slaHours = sla;
  const handler = s.get('handlerRef');
  if (handler !== null && handler !== undefined) metadata.handlerRef = handler;
  // Altiora provenance — present only on graphs materialized from an Altiora form.
  const ousId = s.get('altioraOusId');
  if (ousId !== null && ousId !== undefined) metadata.altioraOusId = ousId;
  const contentHash = s.get('contentHash');
  if (contentHash !== null && contentHash !== undefined) metadata.contentHash = contentHash;

  const slotRecs = await read(
    `MATCH (s:ServiceDef {serviceId:$sid})-[:HAS_SLOT]->(sl:SlotDef)
     OPTIONAL MATCH (sl)-[:RESOLVED_BY]->(r:ResolverDef)
     OPTIONAL MATCH (sl)-[aw:ACTIVATED_WHEN]->(s)
     RETURN sl.slotId AS slotId, sl.type AS type, sl.required AS required, sl.phase AS phase,
            sl.promptHint AS promptHint, sl.groupable AS groupable, sl.order AS order,
            sl.requiredWhen AS requiredWhen, sl.altioraFieldId AS altioraFieldId,
            r.resolverRef AS resolverRef, aw.condition AS trefCondition
     ORDER BY sl.order`,
    { sid: serviceId }
  );

  const slots = [];
  // Accumulated from the slots, then published on metadata so a consumer can map
  // slotId → Altiora field id without walking every slot.
  const fieldIdMapping = {};
  for (const rec of slotRecs) {
    const slotId = rec.get('slotId');
    const slot = {
      slotId,
      type: rec.get('type'),
      required: rec.get('required'),
      phase: rec.get('phase'),
    };
    const tref = rec.get('trefCondition');
    if (tref) {
      assertTref(tref, { serviceId, slotId, field: 'trefCondition' });
      slot.trefCondition = tref;
    }
    const requiredWhen = rec.get('requiredWhen');
    if (requiredWhen) {
      assertTref(requiredWhen, { serviceId, slotId, field: 'requiredWhen' });
      slot.requiredWhen = requiredWhen;
    }
    const resolverRef = rec.get('resolverRef');
    if (resolverRef) slot.resolverRef = resolverRef;
    const altioraFieldId = rec.get('altioraFieldId');
    if (altioraFieldId) {
      slot.altioraFieldId = altioraFieldId;
      fieldIdMapping[slotId] = altioraFieldId;
    }

    // enum options
    if (rec.get('type') === 'enum') {
      const optRecs = await read(
        `MATCH (:SlotDef {serviceId:$sid, slotId:$slotId})-[:HAS_OPTION]->(o:EnumOption)
         RETURN o.value AS value, o.label AS label ORDER BY o.order`,
        { sid: serviceId, slotId }
      );
      slot.presentOptions = optRecs.map((o) => ({ value: o.get('value'), label: o.get('label') }));
    }

    // option filters (conditional narrowing of the enum domain)
    const filterRecs = await read(
      `MATCH (:SlotDef {serviceId:$sid, slotId:$slotId})-[:FILTERED_BY]->(f:OptionFilter)
       RETURN f.condition AS condition, f.include AS include, f.exclude AS exclude
       ORDER BY f.order`,
      { sid: serviceId, slotId }
    );
    if (filterRecs.length) {
      slot.optionFilters = filterRecs.map((f) => {
        const condition = f.get('condition');
        assertTref(condition, { serviceId, slotId, field: 'optionFilters.condition' });
        const filter = { condition };
        const include = f.get('include');
        const exclude = f.get('exclude');
        if (include && include.length) filter.include = include;
        if (exclude && exclude.length) filter.exclude = exclude;
        return filter;
      });
    }

    if (rec.get('groupable') === true) slot.groupable = true;

    // dependsOn (ordered by target slot order for determinism)
    const depRecs = await read(
      `MATCH (:SlotDef {serviceId:$sid, slotId:$slotId})-[:DEPENDS_ON]->(d:SlotDef)
       RETURN d.slotId AS dep ORDER BY d.order`,
      { sid: serviceId, slotId }
    );
    if (depRecs.length) slot.dependsOn = depRecs.map((d) => d.get('dep'));

    const promptHint = rec.get('promptHint');
    if (promptHint) slot.promptHint = promptHint;

    slots.push(slot);
  }

  if (Object.keys(fieldIdMapping).length) metadata.fieldIdMapping = fieldIdMapping;

  return {
    serviceId: s.get('serviceId'),
    version: s.get('version'),
    phases: s.get('phases'),
    metadata,
    slots,
  };
}

module.exports = { compile, SchemaCompileError };
