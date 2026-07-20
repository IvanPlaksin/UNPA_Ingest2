'use strict';

/**
 * Seed FlowDesk service intake flows as graphs in Memgraph (C1).
 *
 * Derives the graph representation directly from the ratified golden
 * SchemaSnapshot fixtures, guaranteeing the compiler round-trips them exactly.
 *
 * Model:
 *   (:ServiceDef {serviceId, version, title, slaHours?, approvalRequired, handlerRef?, phases[],
 *                 altioraOusId?, contentHash?})
 *   (:SlotDef {serviceId, slotId, type, required, phase, promptHint?, groupable?, order,
 *              requiredWhen?, altioraFieldId?})
 *   (:ResolverDef {resolverRef})
 *   (:EnumOption {serviceId, slotId, value, label, order})
 *   (:OptionFilter {serviceId, slotId, condition, include[]?, exclude[]?, order})
 *   (:SlotGroup {serviceId, groupId})
 * Edges:
 *   (ServiceDef)-[:HAS_SLOT]->(SlotDef)
 *   (SlotDef)-[:ACTIVATED_WHEN {condition}]->(ServiceDef)   // tref conditionality
 *   (SlotDef)-[:DEPENDS_ON]->(SlotDef)
 *   (SlotDef)-[:PRECEDES]->(SlotDef)                        // linear ask order
 *   (SlotDef)-[:RESOLVED_BY]->(ResolverDef)
 *   (SlotDef)-[:HAS_OPTION]->(EnumOption)
 *   (SlotDef)-[:FILTERED_BY]->(OptionFilter)                // conditional enum narrowing
 *   (SlotGroup)-[:INCLUDES]->(SlotDef)                      // groupable batching
 *
 * An OptionFilter is a node rather than a property because a property cannot hold
 * a list of maps — the same reason EnumOption is a node. `include`/`exclude` are
 * plain string lists, which properties do support.
 *
 * Run: node api/src/instances/flowdesk/schema-graph/seed-schema-graphs.js
 */

const fs = require('fs');
const path = require('path');
const { write, runAutocommit, close } = require('./driver');

const FIXTURE_DIR = path.join(__dirname, '..', 'contracts', 'fixtures');
// Auto-discover every golden fixture so adding a service is drop-in: create a new
// `schema-snapshot.<name>.json` and re-run this seed (F13a). Order is stable.
const FIXTURES = fs.readdirSync(FIXTURE_DIR)
  .filter((f) => /^schema-snapshot\..+\.json$/.test(f))
  .map((f) => f.replace(/^schema-snapshot\./, '').replace(/\.json$/, ''))
  .sort();

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `schema-snapshot.${name}.json`), 'utf8'));
}

/**
 * Create the label+property indexes the seed and compiler rely on (BACKLOG-0055).
 *
 * Memgraph does not index labels automatically: without these, every
 * `MATCH (n:SlotDef {serviceId})` scans the ENTIRE store — measured at 1.34M nodes
 * in this deployment — turning a handful of seed writes into seconds. An index on
 * `serviceId` narrows each match to the ~6 nodes of one service. This dominated
 * the seed time far more than the per-write round-trips did.
 *
 * Check-first: `CREATE INDEX ON` takes an exclusive storage lock, and this runs on
 * every storeSchema (IP-1c). Creating an index that already exists would take that
 * lock needlessly and, under concurrent test/API load, spike the "Cannot get read
 * only access to the storage" contention. So we read the existing indexes once and
 * only create the missing ones — after first setup that is none, and the hot path
 * takes no DDL lock at all. ResolverDef is indexed on the key its MERGE uses.
 */
async function ensureIndexes() {
  const wanted = [
    ...OWNED_LABELS.map((label) => ({ label, property: 'serviceId' })),
    { label: 'ResolverDef', property: 'resolverRef' },
    // The SchemaRegistry (IP-1c) looks up Altiora schemas by their ousId cache key.
    { label: 'ServiceDef', property: 'altioraOusId' },
  ];

  let existing = new Set();
  try {
    // SHOW INDEX INFO, like index DDL, is not allowed in a managed transaction —
    // it must run auto-commit.
    const recs = await runAutocommit('SHOW INDEX INFO');
    for (const r of recs) {
      const o = r.toObject();
      // Memgraph reports label + property (property may be an array for composites).
      const props = Array.isArray(o.property) ? o.property.join(',') : o.property;
      existing.add(`${o.label}|${props}`);
    }
  } catch {
    existing = new Set(); // if the probe fails, fall through and try to create all
  }

  // Auto-commit: Memgraph rejects index DDL inside the managed transactions write() uses.
  for (const { label, property } of wanted) {
    if (existing.has(`${label}|${property}`)) continue;
    await runAutocommit(`CREATE INDEX ON :${label}(${property})`);
  }
}

// Every node this seeder creates carries `serviceId` (ResolverDef is the sole
// exception — it is shared via MERGE and must survive). So a purge is one flat
// label+property scan per label, not a traversal. The previous single-statement
// purge chained several OPTIONAL MATCHes plus an unrelated SlotGroup match, which
// built a cartesian product and measured ~2.8s per service — the real cost in the
// seed, dwarfing the writes (BACKLOG-0055). These direct DETACH DELETEs run in
// milliseconds each. Labels cannot be parameterized in Cypher, hence the list.
const OWNED_LABELS = ['ServiceDef', 'SlotDef', 'EnumOption', 'OptionFilter', 'SlotGroup'];

/** Remove any existing graph for a service (idempotent re-seed). */
async function purge(serviceId) {
  for (const label of OWNED_LABELS) {
    await write(`MATCH (n:${label} {serviceId:$sid}) DETACH DELETE n`, { sid: serviceId });
  }
}

/**
 * Seed one service graph.
 *
 * Batched with UNWIND (BACKLOG-0055): the graph model is unchanged, but each kind
 * of node/edge is now one round-trip over a parameter list instead of one
 * round-trip per element. The previous per-node writes cost ~65s across the
 * fixtures; the count of Bolt round-trips is now a small constant per service
 * regardless of slot count.
 *
 * Phases are separate writes on purpose: an edge can only be created once both
 * endpoints exist, so nodes (ServiceDef → SlotDef → EnumOption/OptionFilter) are
 * committed before the edges that reference them. Determinism is preserved because
 * `order` is written as an explicit property, exactly as before — UNWIND keeps the
 * list order but the compiler sorts on the property, not on storage order.
 */
async function seedService(snap) {
  const sid = snap.serviceId;
  const slots = snap.slots;
  await purge(sid);

  // Flatten the snapshot into per-kind rows once, in JS, so every value that used
  // to be `?? null`-guarded per write still is. A missing key in an UNWIND row
  // would surface in Cypher as a Null map value, so each row carries every field.
  const slotRows = slots.map((sl, i) => ({
    slotId: sl.slotId, type: sl.type, required: sl.required, phase: sl.phase, order: i,
    promptHint: sl.promptHint ?? null, groupable: sl.groupable === true,
    requiredWhen: sl.requiredWhen ?? null, altioraFieldId: sl.altioraFieldId ?? null,
  }));

  const optionRows = [];
  const filterRows = [];
  const trefRows = [];
  const resolverRows = [];
  const dependsRows = [];
  const precedesRows = [];
  const groupable = [];

  for (let i = 0; i < slots.length; i++) {
    const sl = slots[i];
    (sl.presentOptions || []).forEach((o, j) =>
      optionRows.push({ slotId: sl.slotId, value: o.value, label: o.label, order: j }));
    (sl.optionFilters || []).forEach((f, j) =>
      filterRows.push({
        slotId: sl.slotId, condition: f.condition, order: j,
        include: f.include ?? null, exclude: f.exclude ?? null,
      }));
    if (sl.trefCondition) trefRows.push({ slotId: sl.slotId, cond: sl.trefCondition });
    if (sl.resolverRef) resolverRows.push({ slotId: sl.slotId, ref: sl.resolverRef });
    for (const dep of sl.dependsOn || []) dependsRows.push({ from: sl.slotId, to: dep });
    if (i + 1 < slots.length) precedesRows.push({ from: sl.slotId, to: slots[i + 1].slotId });
    if (sl.groupable === true) groupable.push(sl.slotId);
  }

  // 1. ServiceDef
  await write(
    `CREATE (s:ServiceDef {serviceId:$sid, version:$version, title:$title,
       approvalRequired:$approvalRequired, phases:$phases})
     SET s.slaHours = $slaHours, s.handlerRef = $handlerRef,
         s.altioraOusId = $altioraOusId, s.contentHash = $contentHash`,
    {
      sid, version: snap.version, title: snap.metadata.title,
      approvalRequired: snap.metadata.approvalRequired, phases: snap.phases,
      slaHours: snap.metadata.slaHours ?? null, handlerRef: snap.metadata.handlerRef ?? null,
      altioraOusId: snap.metadata.altioraOusId ?? null,
      contentHash: snap.metadata.contentHash ?? null,
    }
  );

  // 2. SlotDef + HAS_SLOT
  await write(
    `MATCH (s:ServiceDef {serviceId:$sid})
     UNWIND $rows AS row
     CREATE (sl:SlotDef {serviceId:$sid, slotId:row.slotId, type:row.type, required:row.required,
       phase:row.phase, order:row.order})
     SET sl.promptHint = row.promptHint, sl.groupable = row.groupable,
         sl.requiredWhen = row.requiredWhen, sl.altioraFieldId = row.altioraFieldId
     CREATE (s)-[:HAS_SLOT]->(sl)`,
    { sid, rows: slotRows }
  );

  // 3. EnumOption + HAS_OPTION
  if (optionRows.length) {
    await write(
      `UNWIND $rows AS row
       MATCH (sl:SlotDef {serviceId:$sid, slotId:row.slotId})
       CREATE (o:EnumOption {serviceId:$sid, slotId:row.slotId, value:row.value, label:row.label, order:row.order})
       CREATE (sl)-[:HAS_OPTION]->(o)`,
      { sid, rows: optionRows }
    );
  }

  // 4. OptionFilter + FILTERED_BY
  if (filterRows.length) {
    await write(
      `UNWIND $rows AS row
       MATCH (sl:SlotDef {serviceId:$sid, slotId:row.slotId})
       CREATE (f:OptionFilter {serviceId:$sid, slotId:row.slotId, condition:row.condition, order:row.order})
       SET f.include = row.include, f.exclude = row.exclude
       CREATE (sl)-[:FILTERED_BY]->(f)`,
      { sid, rows: filterRows }
    );
  }

  // 5. tref → ACTIVATED_WHEN
  if (trefRows.length) {
    await write(
      `MATCH (s:ServiceDef {serviceId:$sid})
       UNWIND $rows AS row
       MATCH (sl:SlotDef {serviceId:$sid, slotId:row.slotId})
       CREATE (sl)-[:ACTIVATED_WHEN {condition:row.cond}]->(s)`,
      { sid, rows: trefRows }
    );
  }

  // 6. resolver → RESOLVED_BY
  if (resolverRows.length) {
    await write(
      `UNWIND $rows AS row
       MATCH (sl:SlotDef {serviceId:$sid, slotId:row.slotId})
       MERGE (r:ResolverDef {resolverRef:row.ref})
       CREATE (sl)-[:RESOLVED_BY]->(r)`,
      { sid, rows: resolverRows }
    );
  }

  // 7. DEPENDS_ON
  if (dependsRows.length) {
    await write(
      `UNWIND $rows AS row
       MATCH (a:SlotDef {serviceId:$sid, slotId:row.from}), (b:SlotDef {serviceId:$sid, slotId:row.to})
       CREATE (a)-[:DEPENDS_ON]->(b)`,
      { sid, rows: dependsRows }
    );
  }

  // 8. PRECEDES (linear ask order)
  if (precedesRows.length) {
    await write(
      `UNWIND $rows AS row
       MATCH (a:SlotDef {serviceId:$sid, slotId:row.from}), (b:SlotDef {serviceId:$sid, slotId:row.to})
       CREATE (a)-[:PRECEDES]->(b)`,
      { sid, rows: precedesRows }
    );
  }

  // 9. SlotGroup + INCLUDES
  if (groupable.length) {
    await write(
      `CREATE (g:SlotGroup {serviceId:$sid, groupId:$gid})
       WITH g
       UNWIND $slotIds AS slotId
       MATCH (sl:SlotDef {serviceId:$sid, slotId:slotId})
       CREATE (g)-[:INCLUDES]->(sl)`,
      { sid, gid: `${sid}:grp`, slotIds: groupable }
    );
  }

  return sid;
}

async function seedAll() {
  await ensureIndexes();
  const done = [];
  for (const name of FIXTURES) {
    const snap = loadFixture(name);
    done.push(await seedService(snap));
    console.log(`+ seeded ServiceDef ${snap.serviceId} (${snap.slots.length} slots)`);
  }
  return done;
}

if (require.main === module) {
  seedAll()
    .then(async (ids) => { console.log(`\nSeeded ${ids.length} service graphs: ${ids.join(', ')}`); await close(); process.exit(0); })
    .catch(async (e) => { console.error(e); await close(); process.exit(1); });
}

module.exports = { seedAll, seedService, purge, ensureIndexes, loadFixture, FIXTURES };
