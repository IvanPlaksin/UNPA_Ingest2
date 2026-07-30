'use strict';

/**
 * SchemaOrchestrator (IP-1d) — the runtime bridge that turns a resolved service
 * into an executable SchemaSnapshot by materializing it from Altiora on demand.
 *
 * It provides a `loadSnapshot(serviceId)` with the SAME signature the interpreter
 * engine already calls, so wiring is a one-line swap in chat-v2.service (behind
 * the FLOWDESK_SCHEMA_PROVIDER flag). The flow, per the ratified IP-1d contour:
 *
 *   serviceId (our code)
 *     → catalogLookup            → { guid, approvalRequired, title }   (Qdrant, I-3 sync)
 *     → detectProviders(guid,loc)→ best provider → ousId               (IP-1a scoring)
 *     → getSchemaVersion(ousId)  → contentHash
 *     → registry.checkFreshness  → fresh | stale | missing             (IP-1c)
 *         fresh → registry.getSchema(ousId)
 *         else  → getSchema(ousId) → materialize → registry.storeSchema (lint gate)
 *     → injectContextSlots       → beneficiary/location/author/approver
 *
 * Design choices that make this safe to land:
 *   - Non-Altiora services (golden fixtures, platform flows) have no catalog GUID;
 *     `loadSnapshot` falls back to the graph loader (compile) for them, so the flag
 *     being on does not break existing flows.
 *   - Context/routing slots are injected on EVERY load, never persisted — the graph
 *     holds only the Altiora detail slots, and the flow assembler adds the platform
 *     slots (beneficiary/location/author/approver) at read time.
 *   - Everything external is injected, so the orchestration logic is unit-tested
 *     with fakes; the concrete Altiora/Qdrant/acting-user bindings are thin.
 *
 * @module instances/flowdesk/services/schema-orchestrator
 */

/** A service that exists in the catalog but has no provider at the user's location. */
class ServiceNotAvailableError extends Error {
  constructor(serviceId, locationPath) {
    super(`No provider for service '${serviceId}' at location '${locationPath || '(none)'}'`);
    this.name = 'ServiceNotAvailableError';
    this.code = 'SERVICE_NOT_AVAILABLE';
    this.serviceId = serviceId;
    this.locationPath = locationPath;
  }
}

const RESERVED = new Set(['beneficiary', 'location', 'author', 'approver']);

/**
 * Prepend the platform context/routing slots and (when required) the approver.
 * Pure: takes the materialized detail-only snapshot, returns a new complete one.
 * An Altiora field that already occupies a reserved slotId wins — its slot is
 * kept and the same-named context slot is not injected, so no collision reaches
 * the engine.
 */
function injectContextSlots(snapshot, approvalRequired) {
  const present = new Set(snapshot.slots.map((s) => s.slotId));
  const context = [
    { slotId: 'beneficiary', type: 'user', required: true, phase: 'context', resolverRef: 'resolve.user', promptHint: 'Who is this request for?' },
    { slotId: 'location', type: 'location', required: true, phase: 'context', resolverRef: 'resolve.location', dependsOn: ['beneficiary'], promptHint: 'Which location or duty station?' },
    { slotId: 'author', type: 'user', required: true, phase: 'context', resolverRef: 'resolve.author', promptHint: 'Who is submitting this request?' },
  ].filter((s) => !present.has(s.slotId));

  const slots = [...context, ...snapshot.slots];

  if (approvalRequired && !present.has('approver')) {
    // Last, and only when the service needs approval — mirrors the golden fixtures.
    slots.push({ slotId: 'approver', type: 'user', required: true, phase: 'detail', resolverRef: 'resolve.approver', trefCondition: 'service.approvalRequired == true', promptHint: 'Who approves this request?' });
  }

  return {
    ...snapshot,
    phases: ['context', 'detail'],
    metadata: { ...snapshot.metadata, approvalRequired: !!approvalRequired },
    slots,
  };
}

/**
 * @param {object} deps
 * @param {Function} deps.detectProviders   (guid, {locationPath, beneficiaryOrgUnitPath?}) => Promise<provider[]>
 * @param {Function} deps.getSchema         (ousId) => Promise<FormDefinition>
 * @param {Function} deps.getSchemaVersion  (ousId) => Promise<{contentHash, version}|null>
 * @param {Function} deps.materialize       ({schemaJson, serviceCode, ousId, ...}) => {snapshot, warnings}
 * @param {object}   deps.registry          {checkFreshness, getSchema, storeSchema}
 * @param {Function} deps.graphLoad         (serviceId) => Promise<SchemaSnapshot|null>  (compile — fallback for non-Altiora)
 * @param {Function} deps.catalogLookup     (serviceCode) => Promise<{guid, approvalRequired, title?}|null>
 * @param {Function} deps.locationPathOf    () => string|null
 * @param {Function} [deps.onWarn]          (info) => void
 * @returns {{ loadSnapshot: (serviceId:string) => Promise<SchemaSnapshot> }}
 */
function createSchemaLoader(deps) {
  const {
    detectProviders, getSchema, getSchemaVersion, materialize,
    registry, graphLoad, catalogLookup, locationPathOf, onWarn = () => {},
    // I-4b: resolve dictionary-backed LOV slots into concrete options after
    // materialize and before storeSchema, so baked options persist in the graph.
    // Defaults to identity so callers without an Altiora LOV source (fakes/tests)
    // are unaffected.
    bakeLov = async (snapshot) => ({ snapshot, report: null }),
    // IP-KB: after a fresh materialize is stored, index it into the schema
    // knowledge base (vector + graph linkage). Best-effort and injectable; defaults
    // to a no-op so fakes/tests are unaffected.
    indexKnowledge = async () => {},
  } = deps;

  async function loadSnapshot(serviceId) {
    // Non-Altiora services (golden fixtures, platform flows) have no catalog GUID.
    const catalog = await catalogLookup(serviceId);
    if (!catalog || !catalog.guid) return graphLoad(serviceId);

    const locationPath = locationPathOf();
    const providers = await detectProviders(catalog.guid, { locationPath });
    if (!providers || providers.length === 0) {
      throw new ServiceNotAvailableError(serviceId, locationPath);
    }
    const ousId = providers[0].organizationUnitServiceId;

    const version = await getSchemaVersion(ousId);
    const contentHash = version && version.contentHash;

    let snapshot;
    const freshness = await registry.checkFreshness(ousId, contentHash);
    if (freshness === 'fresh') {
      snapshot = await registry.getSchema(ousId);
    } else {
      const formDef = await getSchema(ousId);
      const { snapshot: materialized, warnings } = materialize({
        schemaJson: formDef,
        serviceCode: serviceId,
        ousId,
        contentHash,
        title: catalog.title,
        approvalRequired: catalog.approvalRequired,
        version: version && version.version,
      });
      if (warnings && warnings.length) onWarn({ event: 'materialize_warnings', ousId, warnings });
      const { report: lovReport } = await bakeLov(materialized, { onWarn });
      if (lovReport && (lovReport.empty || lovReport.failed)) {
        onWarn({ event: 'lov_partial', ousId, baked: lovReport.baked, empty: lovReport.empty, failed: lovReport.failed });
      }
      const { replaced } = await registry.storeSchema(ousId, materialized);
      if (replaced) onWarn({ event: 'multi_provider_replace', serviceId, ousId, oldOusId: replaced.oldOusId });
      snapshot = await registry.getSchema(ousId);
      // IP-KB: index the freshly stored schema into the knowledge base (vector +
      // graph linkage). Best-effort — a KB failure must never break materialization
      // or the dialogue; the chat degrades to the pure-vector search path.
      try {
        await indexKnowledge(snapshot || materialized);
      } catch (err) {
        onWarn({ event: 'schema_kb_index_failed', serviceId, ousId, error: err.message });
      }
    }

    return injectContextSlots(snapshot, catalog.approvalRequired);
  }

  return { loadSnapshot };
}

// ── default (production) bindings ─────────────────────────────────────────────

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const SERVICE_COLLECTION = process.env.FLOWDESK_SERVICE_COLLECTION || 'flowdesk_services';

/**
 * Look the catalog entry up in Qdrant by service_code (indexed by the I-3 sync),
 * returning the GUID and approval flag detect/materialize need. Defensive: any
 * miss or transport failure returns null, which routes the service to the graph
 * loader instead of the Altiora flow.
 */
async function qdrantCatalogLookup(serviceCode) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${SERVICE_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ key: 'service_code', match: { value: serviceCode } }] },
        limit: 1,
        with_payload: true,
      }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const point = body && body.result && body.result.points && body.result.points[0];
    const payload = point && point.payload;
    if (!payload || !payload.service_guid) return null;
    return {
      guid: payload.service_guid,
      approvalRequired: !!payload.approval_required,
      title: payload.service_name || serviceCode,
      hierarchyPath: payload.hierarchy_path || null,
    };
  } catch {
    return null;
  }
}

/**
 * The acting user's location path for detect, from the request-scoped acting-user
 * context (populated by flowdesk-user.middleware). NOTE: detect matches on a
 * Region/Country/DutyStation path; where the acting user only carries a duty
 * station we pass that, and the composed path is an I-track directory concern.
 */
function defaultLocationPathOf() {
  try {
    const { getActingUser } = require('./acting-user.context');
    const u = getActingUser();
    if (u && u.location && u.location.dutyStation) return String(u.location.dutyStation);
    if (u && u.orgUnit && u.orgUnit.path) return String(u.orgUnit.path);
    return null;
  } catch {
    return null;
  }
}

/** Wire the orchestrator to the real Altiora client, materializer, registry and graph. */
function createDefaultAltioraLoader() {
  const { getAltioraSchemaClient } = require('./altiora-schema-client');
  const { materializeSchema } = require('./altiora-schema-materializer');
  const { bakeLov } = require('./altiora-lov.service');
  const registry = require('./altiora-schema-registry');
  const { compile } = require('../schema-graph/schema-compiler');
  const client = getAltioraSchemaClient();

  return createSchemaLoader({
    detectProviders: (guid, opts) => client.detectProviders(guid, opts),
    getSchema: (ousId) => client.getSchema(ousId),
    getSchemaVersion: (ousId) => client.getSchemaVersion(ousId),
    materialize: materializeSchema,
    bakeLov: (snapshot, opts) => bakeLov(snapshot, { fetchLovValues: (req) => client.getLovValues(req), ...opts }),
    registry: {
      checkFreshness: registry.checkFreshness,
      getSchema: registry.getSchema,
      storeSchema: registry.storeSchema,
    },
    graphLoad: compile,
    catalogLookup: qdrantCatalogLookup,
    locationPathOf: defaultLocationPathOf,
    indexKnowledge: (snapshot) => require('./schema-knowledge.service').indexSchemaKnowledge(snapshot),
    onWarn: (w) => console.warn('[schema-orchestrator]', JSON.stringify(w)),
  });
}

module.exports = {
  createSchemaLoader,
  createDefaultAltioraLoader,
  injectContextSlots,
  // The duty station provider detection is keyed on. Exported so callers that
  // memoise a snapshot key on the same value the loader used, rather than a
  // second, quietly-diverging definition of it.
  defaultLocationPathOf,
  qdrantCatalogLookup,
  ServiceNotAvailableError,
  RESERVED,
};
