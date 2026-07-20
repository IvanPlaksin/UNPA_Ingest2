'use strict';

/**
 * AltioraSchemaRegistry (IP-1c) — the cache layer for materialized Altiora forms.
 *
 * Sits between the transformer (IP-1b) and Memgraph: it stores a SchemaSnapshot
 * as a schema-graph, retrieves it, and answers whether a cached copy is still
 * current. The cache is keyed by `OrganizationUnitServiceId` (the int the detect
 * call resolves) — the ONLY stable key: a service's catalog GUID is shared across
 * providers, and the schema row id changes on every edit, but the ousId is fixed
 * for a given service+provider+scope.
 *
 * A schema is never written unannounced: `storeSchema` runs the contract
 * validator AND the linter first, so a snapshot that would throw mid-dialogue
 * (an unparseable tref, a forward reference) is refused at the door rather than
 * cached and served. This is the lint-gate the IP-0a work called for.
 *
 * Invalidation is by `contentHash` (SHA256 of the source SchemaJson, from
 * Altiora's `/schema/version` probe): `checkFreshness` compares the stored hash
 * to the current one without recompiling the whole graph.
 *
 * Reuses the schema-graph machinery unchanged — seedService writes, compile
 * reads, purge deletes, lintSnapshot validates — so a stored snapshot round-trips
 * exactly (proven by the IP-1b round-trip test).
 *
 * Registry-stored ServiceDefs are tagged with a graph-only `namespace='Altiora'`
 * property (set here, not part of the SchemaSnapshot contract, so the round-trip
 * is unaffected). `invalidateAll` scopes to that tag — NOT to "has an
 * altioraOusId" — because a golden fixture may legitimately carry an altioraOusId
 * to exercise the round-trip, and a bulk invalidation must never reach it.
 *
 * @module instances/flowdesk/services/altiora-schema-registry
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const { read, write } = require('../schema-graph/driver');
const { seedService, purge, ensureIndexes } = require('../schema-graph/seed-schema-graphs');
const { compile } = require('../schema-graph/schema-compiler');
const { lintSnapshot } = require('../schema-graph/schema-linter');

const NAMESPACE = 'Altiora';

const SCHEMA = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'contracts', 'schema-snapshot.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateContract = ajv.compile(SCHEMA);

/** A snapshot that fails the JSON-schema contract. */
class SchemaContractError extends Error {
  constructor(errors) {
    super(`SchemaSnapshot fails the contract: ${ajv.errorsText(errors)}`);
    this.name = 'SchemaContractError';
    this.errors = errors;
  }
}
/** A snapshot that is contract-valid but fails a linter rule. */
class SchemaLintError extends Error {
  constructor(violations) {
    super(`SchemaSnapshot fails lint: ${violations.map((v) => `${v.rule}@${v.slotId || '-'}: ${v.message}`).join('; ')}`);
    this.name = 'SchemaLintError';
    this.violations = violations;
  }
}
/** A store that would corrupt the cache (e.g. a serviceId already bound elsewhere). */
class SchemaStoreError extends Error {
  constructor(message, detail = null) {
    super(message);
    this.name = 'SchemaStoreError';
    this.detail = detail;
  }
}

function assertOusId(ousId) {
  if (!Number.isInteger(ousId) || ousId <= 0) {
    throw new SchemaStoreError(`ousId must be a positive integer, got ${JSON.stringify(ousId)}`);
  }
}

/** serviceId currently bound to this ousId in the graph, or null. */
async function serviceIdForOus(ousId) {
  const recs = await read(
    'MATCH (s:ServiceDef {altioraOusId:$ousId}) RETURN s.serviceId AS serviceId LIMIT 1',
    { ousId },
  );
  return recs.length ? recs[0].get('serviceId') : null;
}

/**
 * Retrieve a cached schema by its ousId.
 * @param {number} ousId  OrganizationUnitServiceId
 * @returns {Promise<object|null>} SchemaSnapshot, or null when nothing is cached
 */
async function getSchema(ousId) {
  assertOusId(ousId);
  const serviceId = await serviceIdForOus(ousId);
  if (!serviceId) return null;
  return compile(serviceId);
}

/**
 * Store a schema, gated by contract validation and linting.
 *
 * Multi-provider (V2 semantics, ARCHITECT re:MULTI-PROVIDER): a catalog service
 * can be offered by several providers (ousIds) whose forms normalize to the SAME
 * serviceId. The graph keys a flow by serviceId, so only one can be cached at a
 * time — the last writer wins. When a store replaces a different provider's
 * cached form, that is reported via `replaced` (rather than logged here) so the
 * caller can surface it; the prior graph is removed by seedService's own
 * purge-by-serviceId. V3 will re-key the graph by ousId to hold all providers.
 *
 * @param {number} ousId  must equal snapshot.metadata.altioraOusId
 * @param {object} snapshot  a SchemaSnapshot (from the transformer)
 * @returns {Promise<{replaced: {oldOusId: number}|null}>}
 * @throws {SchemaContractError|SchemaLintError|SchemaStoreError}
 */
async function storeSchema(ousId, snapshot) {
  assertOusId(ousId);
  if (!snapshot || typeof snapshot !== 'object') {
    throw new SchemaStoreError('snapshot is required');
  }
  const metaOus = snapshot.metadata && snapshot.metadata.altioraOusId;
  if (metaOus !== ousId) {
    throw new SchemaStoreError(
      `ousId ${ousId} does not match snapshot.metadata.altioraOusId ${JSON.stringify(metaOus)}`,
      'ous-mismatch',
    );
  }

  // Gate 1: contract.
  if (!validateContract(snapshot)) {
    throw new SchemaContractError(validateContract.errors);
  }
  // Gate 2: lint — the same rules the runtime relies on.
  const lint = lintSnapshot(snapshot);
  if (!lint.ok) throw new SchemaLintError(lint.violations);

  // Multi-provider replace (V2): if a DIFFERENT provider's form is cached under
  // this serviceId, seedService's purge-by-serviceId will remove it. Detect that
  // first so we can report it — the last writer owns the cached form.
  const priorRecs = await read(
    'MATCH (s:ServiceDef {serviceId:$sid}) WHERE s.altioraOusId IS NOT NULL AND s.altioraOusId <> $ousId RETURN s.altioraOusId AS otherOus LIMIT 1',
    { sid: snapshot.serviceId, ousId },
  );
  const replaced = priorRecs.length ? { oldOusId: priorRecs[0].get('otherOus') } : null;

  await ensureIndexes();
  await seedService(snapshot); // purges the prior graph for this serviceId, then writes
  // Tag it as registry-managed so invalidateAll can scope to it without reaching
  // golden fixtures that merely carry an altioraOusId.
  await write('MATCH (s:ServiceDef {serviceId:$sid}) SET s.namespace=$ns', { sid: snapshot.serviceId, ns: NAMESPACE });
  return { replaced };
}

/**
 * Whether the cached schema for an ousId matches a given contentHash.
 * Cheaper than getSchema — no compile.
 * @returns {Promise<'fresh'|'stale'|'missing'>}
 */
async function checkFreshness(ousId, contentHash) {
  assertOusId(ousId);
  const recs = await read(
    'MATCH (s:ServiceDef {altioraOusId:$ousId}) RETURN s.contentHash AS hash, s.needsRefresh AS stale LIMIT 1',
    { ousId },
  );
  if (!recs.length) return 'missing';
  // A SignalR ServiceFormChanged (I-5) sets needsRefresh without deleting the cached
  // form, so the stale copy survives a failed re-materialize. The flag forces a
  // re-materialize on the next load regardless of hash; storeSchema clears it by
  // rewriting the ServiceDef.
  if (recs[0].get('stale') === true) return 'stale';
  return recs[0].get('hash') === contentHash ? 'fresh' : 'stale';
}

/**
 * Drop the cached schema for one ousId.
 * @returns {Promise<boolean>} true if something was removed
 */
async function invalidate(ousId) {
  assertOusId(ousId);
  const serviceId = await serviceIdForOus(ousId);
  if (!serviceId) return false;
  await purge(serviceId);
  return true;
}

/**
 * Mark a cached schema stale WITHOUT deleting it (I-5 lazy invalidation). The next
 * `loadSnapshot` sees `checkFreshness → 'stale'` and re-materializes; until then the
 * old form keeps serving, so a burst of ServiceFormChanged events (or an Altiora
 * outage during re-materialize) never leaves a service with no schema at all.
 * `storeSchema`'s rewrite clears the flag.
 * @returns {Promise<boolean>} true if a cached schema was flagged
 */
async function markStale(ousId) {
  assertOusId(ousId);
  const serviceId = await serviceIdForOus(ousId);
  if (!serviceId) return false;
  await write('MATCH (s:ServiceDef {altioraOusId:$ousId}) SET s.needsRefresh = true', { ousId });
  return true;
}

/**
 * Drop every registry-managed schema (namespace='Altiora'). Golden fixtures are
 * never tagged, so they survive even when they carry an altioraOusId.
 * @returns {Promise<number>} count removed
 */
async function invalidateAll() {
  const recs = await read(
    'MATCH (s:ServiceDef {namespace:$ns}) RETURN s.serviceId AS serviceId',
    { ns: NAMESPACE },
  );
  const serviceIds = recs.map((r) => r.get('serviceId'));
  for (const sid of serviceIds) await purge(sid);
  return serviceIds.length;
}

/**
 * List every registry-managed schema with its cache key and current hash, for the
 * sync service's polling pass (IP-1e) to compare against Altiora's `/schema/version`.
 * @returns {Promise<Array<{ousId:number, serviceId:string, contentHash:string|null}>>}
 */
async function listCached() {
  const recs = await read(
    'MATCH (s:ServiceDef {namespace:$ns}) WHERE s.altioraOusId IS NOT NULL RETURN s.altioraOusId AS ousId, s.serviceId AS serviceId, s.contentHash AS contentHash',
    { ns: NAMESPACE },
  );
  return recs.map((r) => ({ ousId: r.get('ousId'), serviceId: r.get('serviceId'), contentHash: r.get('contentHash') }));
}

module.exports = {
  getSchema,
  storeSchema,
  checkFreshness,
  invalidate,
  markStale,
  invalidateAll,
  listCached,
  SchemaContractError,
  SchemaLintError,
  SchemaStoreError,
};
