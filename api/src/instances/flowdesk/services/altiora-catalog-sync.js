'use strict';

/**
 * AltioraCatalogSync (I-2) — mirrors Altiora's service catalog into the Qdrant
 * `flowdesk_services` collection that backs chat-side intent resolution.
 *
 * Why this exists: Altiora's own catalog search is SQL `LIKE` with no intent NLP
 * (spec §5), so semantic matching stays on our side. But the collection had drifted
 * completely from reality — it held ~1704 iNeed-era points plus fictional
 * hardware/badge/VPN services, while the real dev catalog is 79 requestable
 * EO-HR / EO-FIN services ("Advance Home Leave Queries", …). Queries for "laptop"
 * matched happily and resolved to a serviceId that does not exist in Altiora, so
 * nothing downstream (detect → schema → ticket) could ever succeed. This sync makes
 * Altiora the source of truth for *what can be requested*.
 *
 * Two things every synced point must carry that the old ones did not:
 *   - `service_guid` — the catalog GUID. `POST /ServiceDistribution/detect` (I-3)
 *     is keyed by it, and the code string alone cannot get you there.
 *   - `source: 'altiora'` — provenance, so stale points are identifiable (and
 *     purgeable) without guessing.
 *
 * Point id = the catalog GUID, so re-syncing is idempotent by construction
 * (upsert overwrites in place; no duplicate drift).
 *
 * Purging is OPT-IN (`purgeStale`). Additive by default: the legacy points keep
 * the fixture-based demo flows working until the schema materializer (I-4) can
 * serve real services, and deleting someone else's data on a whim is not this
 * module's call.
 *
 * @module instances/flowdesk/services/altiora-catalog-sync
 */

const COLLECTION = process.env.FLOWDESK_SERVICE_COLLECTION || 'flowdesk_services';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const EMBED_BATCH = Number(process.env.TEI_BATCH_SIZE) || 4;

/**
 * The text we embed for intent matching. Altiora gives us real prose
 * (`briefDescription` / `detailedDescription`), which carries far more semantic
 * signal than the formal `displayName` alone — "Advance Home Leave Queries" is
 * not what a user types. Duplicates are dropped so a service whose description
 * merely repeats its title is not weighted oddly.
 */
function buildText(svc) {
  const parts = [svc.displayName, svc.briefDescription, svc.detailedDescription]
    // Strip trailing sentence punctuation so the '. ' join does not double it up
    // ("…agreement.. Use this…") — Altiora authors these fields inconsistently.
    .map((p) => (p == null ? '' : String(p).trim().replace(/[.\s]+$/, '')))
    .filter(Boolean);
  const seen = new Set();
  const kept = parts.filter((p) => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return kept.length ? `${kept.join('. ')}.` : '';
}

/** `EO-FIN-GM-GA-ACA` → `EO-FIN` (domain), used for filtering/reporting. */
function domainOf(serviceCode) {
  const segs = String(serviceCode || '').split('-').filter(Boolean);
  return segs.slice(0, 2).join('-') || null;
}

/** Altiora catalog item → Qdrant payload (shape consumed by semantic-search.js). */
function mapPayload(svc) {
  return {
    // ── contract required by classifyUserIntent / service.backend ──
    text: buildText(svc),
    lang: 'en',
    service_code: svc.serviceCode,
    service_name: svc.displayName,
    domain_code: domainOf(svc.serviceCode),
    category: svc.parentDisplayName || null,
    // ── I-3 two-level key: detect is keyed by the catalog GUID ──
    service_guid: svc.serviceId,
    // ── useful metadata for snapshot/routing later ──
    approval_required: !!svc.approvalRequired,
    sla_hours: svc.defaultSlaHours ?? null,
    hierarchy_path: svc.hierarchyPath || null,
    manager_only: !!svc.managerOnly,
    source: 'altiora',
  };
}

async function qdrant(method, path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Qdrant ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/**
 * @param {Object} deps
 * @param {Object} deps.client         - AltioraClient (I-1); background job → service token
 * @param {(texts:string[]) => Promise<number[][]>} [deps.embed] - batch embedder (TEI)
 * @param {Function} [deps.qdrantFetch] - test seam over the Qdrant HTTP calls
 * @param {boolean}  [deps.purgeStale]  - delete points whose payload.source != 'altiora'
 * @param {Function} [deps.log]
 * @returns {Promise<{fetched:number, upserted:number, purged:number, services:Array}>}
 */
async function syncCatalog(deps = {}) {
  const client = deps.client || require('./altiora-client').getAltioraClient();
  const q = deps.qdrantFetch || qdrant;
  const log = deps.log || (() => {});
  const embed = deps.embed || (async (texts) => {
    const { embedViaTei } = require('../../../services/ai/llm-provider/embedding');
    const out = [];
    for (const t of texts) out.push(await embedViaTei(t));
    return out;
  });

  // 1. Altiora is the source of truth for what is requestable.
  const raw = await client.get('/api/servicecatalog/requestable');
  const services = (Array.isArray(raw) ? raw : raw.items || raw.data || [])
    .filter((s) => s && s.serviceId && s.serviceCode);
  log(`fetched ${services.length} requestable services from Altiora`);

  // 2. Embed in batches (TEI is the same 1024-dim model the collection uses).
  const points = [];
  for (let i = 0; i < services.length; i += EMBED_BATCH) {
    const chunk = services.slice(i, i + EMBED_BATCH);
    const vectors = await embed(chunk.map(buildText));
    chunk.forEach((svc, j) => {
      points.push({ id: svc.serviceId, vector: vectors[j], payload: mapPayload(svc) });
      log(`+ ${svc.serviceCode} — ${svc.displayName}`);
    });
  }

  // 3. Upsert (id = catalog GUID ⇒ idempotent).
  if (points.length) await q('PUT', `/collections/${COLLECTION}/points?wait=true`, { points });

  // 4. Optional purge of everything Altiora did not give us.
  let purged = 0;
  if (deps.purgeStale) {
    const before = await q('GET', `/collections/${COLLECTION}`);
    const total = before.result?.points_count ?? 0;
    // Keep Altiora catalog points AND AI-generated description companion points
    // (source:'ai_description', ADMIN P7) — only truly stale non-altiora points go.
    await q('POST', `/collections/${COLLECTION}/points/delete?wait=true`, {
      filter: { must_not: [{ key: 'source', match: { any: ['altiora', 'ai_description'] } }] },
    });
    const after = await q('GET', `/collections/${COLLECTION}`);
    purged = total - (after.result?.points_count ?? total);
    log(`purged ${purged} stale (non-altiora) points`);
  }

  return { fetched: services.length, upserted: points.length, purged, services };
}

module.exports = { syncCatalog, buildText, domainOf, mapPayload, COLLECTION };
