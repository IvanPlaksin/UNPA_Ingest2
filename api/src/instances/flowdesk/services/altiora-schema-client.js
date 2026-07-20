'use strict';

/**
 * AltioraSchemaClient (IP-1a) — the domain client for schema materialization.
 * Wraps the transport-level AltioraClient (I-1) with the three catalog/schema
 * calls the chat needs, and normalizes Altiora's quirks so nothing downstream
 * has to know about them.
 *
 * Three endpoints, established by recon against D:\UN\Repos\FlowDesk:
 *   detectProviders  → POST /api/ServiceDistribution/detect
 *   getSchema        → GET  /api/ServiceDistribution/{ousId}/schema
 *   getSchemaVersion → GET  /api/ServiceDistribution/{ousId}/schema/version
 *
 * The two-level key: a service is a catalog GUID (`ServiceId`, "what"), but every
 * piece of executable configuration — the form schema included — hangs off
 * `OrganizationUnitServiceId` (int, "who provides it and how"). Detect maps the
 * first to the second, and it is 1:N, not 1:1 — one service can be offered by
 * several org units, and even by the same unit under non-overlapping location
 * scopes. Picking one is the caller's job, which is why `detectProviders` returns
 * the list already ranked (see `scoreProvider`).
 *
 * We do NOT trust Altiora's own `MatchScore`. Two defects make it unusable:
 *   1. Inverted specificity — a fully global provider scores 100 while a specific
 *      location match scores `50 + LEN(path)`. A typical path carries a GUID duty
 *      station and lands at ~45-50, so global ties or beats local. The code
 *      comment promises "ordered by specificity"; the arithmetic delivers the
 *      opposite.
 *   2. Random scope attribution — the ranking CTE partitions by
 *      OrganizationUnitServiceId and orders by a column constant within that
 *      partition, after a LEFT JOIN has already multiplied rows across
 *      scope x focal-point. The surviving row (and therefore MatchScore and
 *      MatchedLocationScope) is an arbitrary pick among the matched scopes.
 * Filtering upstream is still sound — it uses independent EXISTS subqueries — so
 * the returned SET of providers is correct even though the ORDER is not. We keep
 * the set and re-rank it here.
 *
 * @module instances/flowdesk/services/altiora-schema-client
 */

const { getAltioraClient, AltioraNotFoundError } = require('./altiora-client');

const DETECT_PATH = '/api/ServiceDistribution/detect';

/** Reads a value under any of the casings Altiora might serialize. */
function pick(obj, keys, dflt = undefined) {
  if (!obj) return dflt;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return dflt;
}

/**
 * Altiora normalizes scope paths with a trailing slash and `/detect` does the same
 * to its inputs, so we match its convention before any prefix comparison.
 */
function withTrailingSlash(path) {
  if (!path) return path;
  return path.endsWith('/') ? path : `${path}/`;
}

/** ProviderDetectionResponse (any casing) → our Provider shape. */
function mapProvider(p) {
  if (!p) return null;
  const ousId = pick(p, ['organizationUnitServiceId', 'OrganizationUnitServiceId']);
  return {
    organizationUnitServiceId: ousId != null ? Number(ousId) : null,
    providerOrgUnitId: pick(p, ['providerOrgUnitId', 'ProviderOrgUnitId'], null),
    providerName: pick(p, ['providerName', 'ProviderName'], null),
    serviceName: pick(p, ['serviceName', 'ServiceName'], null),
    matchedLocationScope: pick(p, ['matchedLocationScope', 'MatchedLocationScope'], null),
    matchedOrgScope: pick(p, ['matchedOrgScope', 'MatchedOrgScope'], null),
    // Kept for diagnostics only — never used for ordering. See module header.
    altioraMatchScore: pick(p, ['matchScore', 'MatchScore'], null),
    focalPoint: mapFocalPoint(p),
    useIneed: pick(p, ['useIneed', 'UseIneed'], false),
    ineedCode: pick(p, ['ineedCode', 'IneedCode'], null),
    managerOnly: pick(p, ['managerOnly', 'ManagerOnly'], false),
    managerOnlyDescription: pick(p, ['managerOnlyDescription', 'ManagerOnlyDescription'], null),
    requestTitleMode: pick(p, ['requestTitleMode', 'RequestTitleMode'], 'optional'),
    requestDescriptionMode: pick(p, ['requestDescriptionMode', 'RequestDescriptionMode'], 'optional'),
    info: pick(p, ['info', 'Info'], null),
  };
}

function mapFocalPoint(p) {
  const userId = pick(p, ['focalPointUserId', 'FocalPointUserId']);
  if (!userId) return null;
  const first = pick(p, ['focalPointFirstName', 'FocalPointFirstName'], '');
  const last = pick(p, ['focalPointLastName', 'FocalPointLastName'], '');
  return {
    userId: String(userId),
    name: [first, last].filter(Boolean).join(' ') || null,
    email: pick(p, ['focalPointEmail', 'FocalPointEmail'], null),
  };
}

/**
 * Our ranking, replacing Altiora's MatchScore. Specific beats global — the
 * inverse of Altiora's arithmetic — and among specific matches, the longer scope
 * path wins because a longer path is a deeper, narrower match.
 *
 * The third branch guards defect 2: `matchedLocationScope` may be an arbitrary
 * scope row that had nothing to do with why this provider passed the filter. If
 * it isn't actually a prefix of the user's location, we can't read specificity
 * off it, so the provider ranks above global (it is location-constrained and it
 * did pass Altiora's filter) but below any match we can positively verify.
 *
 * @param {object} provider  mapped provider
 * @param {string} [userLocationPath]  the location the user is requesting from
 * @returns {number} higher is better
 */
function scoreProvider(provider, userLocationPath) {
  if (!provider.matchedLocationScope) return 50; // AllLocations, or no location scopes at all
  // Normalize both sides: '/2/756' and '/2/756/' are the same scope and must score
  // the same, so depth is measured on the normalized form, never the raw string.
  const scope = withTrailingSlash(provider.matchedLocationScope);
  const loc = withTrailingSlash(userLocationPath);
  if (loc && loc.startsWith(scope)) return 100 + scope.length;
  return 60; // constrained, but the reported scope doesn't corroborate the match
}

/**
 * @param {object} [deps]
 * @param {object} [deps.client]  an AltioraClient; defaults to the service-account singleton
 */
function createAltioraSchemaClient({ client = null } = {}) {
  const http = client || getAltioraClient();

  /**
   * Resolve a catalog service + location to the providers that can serve it,
   * best first.
   *
   * Altiora answers 404 — not an empty 200 — when nothing matches. That is a
   * routine outcome (a service simply isn't offered at that duty station), not a
   * failure, so it maps to an empty list. Its own frontend does the same.
   *
   * @param {string} serviceId  catalog GUID
   * @param {object} [opts]
   * @param {string} [opts.locationPath]  e.g. '/1/840/<dutyStationGuid>/'
   * @param {string} [opts.beneficiaryOrgUnitPath]
   * @param {boolean} [opts.isSla=false]  selects the SLA channel over the catalog channel
   * @param {string} [opts.token]  act as this user instead of the service account
   * @returns {Promise<object[]>} providers ranked by our scoring, may be empty
   */
  async function detectProviders(serviceId, opts = {}) {
    if (!serviceId) throw new Error('AltioraSchemaClient.detectProviders: serviceId is required');
    const { locationPath, beneficiaryOrgUnitPath, isSla = false, token, signal } = opts;

    let raw;
    try {
      raw = await http.post(
        DETECT_PATH,
        {
          ServiceId: serviceId,
          LocationPath: withTrailingSlash(locationPath) || null,
          BeneficiaryOrgUnitPath: withTrailingSlash(beneficiaryOrgUnitPath) || null,
          IsSla: isSla,
        },
        { token, signal },
      );
    } catch (err) {
      if (err instanceof AltioraNotFoundError) return [];
      throw err;
    }

    const list = Array.isArray(raw) ? raw : [];
    return list
      .map(mapProvider)
      .filter((p) => p && p.organizationUnitServiceId != null)
      .map((p) => ({ ...p, score: scoreProvider(p, locationPath) }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Fetch the published form definition for a provider.
   *
   * The endpoint returns the bare deserialized SchemaJson — no envelope, no
   * version, no updatedAt. Pair it with `getSchemaVersion` when you need the
   * cache-invalidation metadata.
   *
   * @param {number} ousId  OrganizationUnitServiceId
   * @returns {Promise<object|null>} FormDefinition `{ tabs?, fields, rules? }`, or
   *   null when the provider has no published schema
   */
  async function getSchema(ousId, { token, signal } = {}) {
    requireOusId(ousId, 'getSchema');
    try {
      return await http.get(`/api/ServiceDistribution/${ousId}/schema`, { token, signal });
    } catch (err) {
      if (err instanceof AltioraNotFoundError) return null;
      throw err;
    }
  }

  /**
   * Fetch the cache-invalidation probe for a provider's published schema.
   *
   * Altiora added this endpoint for exactly this consumer — its own comment names
   * "FlowDesk Chat V2 schema-graph materialization" and pairs it with the SignalR
   * event as a poll-based fallback. `contentHash` is a SHA256 of the raw
   * SchemaJson and is the field to compare; `schemaId` is NOT stable across edits
   * (a schema change INSERTs a new row with a fresh IDENTITY), so it must not be
   * used as a cache key.
   *
   * @param {number} ousId  OrganizationUnitServiceId
   * @returns {Promise<object|null>} `{ organizationUnitServiceId, schemaId, version,
   *   updatedAt, contentHash }`, or null when there is no published schema
   */
  async function getSchemaVersion(ousId, { token, signal } = {}) {
    requireOusId(ousId, 'getSchemaVersion');
    let raw;
    try {
      raw = await http.get(`/api/ServiceDistribution/${ousId}/schema/version`, { token, signal });
    } catch (err) {
      if (err instanceof AltioraNotFoundError) return null;
      throw err;
    }
    if (!raw) return null;
    return {
      organizationUnitServiceId: Number(
        pick(raw, ['organizationUnitServiceId', 'OrganizationUnitServiceId'], ousId),
      ),
      schemaId: pick(raw, ['schemaId', 'SchemaId'], null),
      version: pick(raw, ['version', 'Version'], null),
      updatedAt: pick(raw, ['updatedAt', 'UpdatedAt'], null),
      contentHash: pick(raw, ['contentHash', 'ContentHash'], null),
    };
  }

  /**
   * Resolve a dictionary-backed LOV field's option set (spec §6b).
   *
   * The form schema references an option-source by BI entity/field id; the values
   * are never embedded in the schema and must be fetched here. Used by the LOV
   * baker (I-4b) to turn a `lov` descriptor into concrete `presentOptions`.
   *
   * @param {Object} request  a FormLookupRequest `{ EntityId, DisplayFieldIds[],
   *   ValueFieldId?, Filters?, FilterLogic?, Search?, MaxResults? }`
   * @returns {Promise<Array<{label:string, value:string}>>} rows, or [] on 404
   *   (unknown entity / missing source table — a routine "no such dictionary" that
   *   the baker treats as an empty, degrade-to-free-text result rather than a fault)
   */
  async function getLovValues(request, { token, signal } = {}) {
    if (!request || !request.EntityId) throw new Error('AltioraSchemaClient.getLovValues: request.EntityId is required');
    let raw;
    try {
      raw = await http.post('/api/FormLookup/values', request, { token, signal });
    } catch (err) {
      if (err instanceof AltioraNotFoundError) return [];
      throw err;
    }
    return Array.isArray(raw) ? raw : [];
  }

  return { detectProviders, getSchema, getSchemaVersion, getLovValues };
}

function requireOusId(ousId, method) {
  if (!Number.isInteger(Number(ousId)) || Number(ousId) <= 0) {
    throw new Error(
      `AltioraSchemaClient.${method}: a positive integer OrganizationUnitServiceId is required, got ${ousId}`,
    );
  }
}

let singleton = null;
/** Process-wide schema client bound to the service account. */
function getAltioraSchemaClient() {
  if (!singleton) singleton = createAltioraSchemaClient();
  return singleton;
}

module.exports = {
  createAltioraSchemaClient,
  getAltioraSchemaClient,
  scoreProvider,
};
