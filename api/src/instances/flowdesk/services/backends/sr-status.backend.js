'use strict';

/**
 * SR_STATUS retrieval backend (C3) — unifies the fragmented request/ticket
 * status stores behind a single exact-ref lookup:
 *   1. (:ServiceRequest {srNumber})  — DraftSR materialization (C2)
 *   2. (:Ticket {ticketId})          — ManageTicketExecutor lifecycle
 *   3. in-memory create-service-request store (legacy)
 * First hit wins.
 *
 * @module instances/flowdesk/services/backends/sr-status.backend
 */

/**
 * @param {Object} [deps]
 * @param {Function} [deps.graphRead] - (cypher, params) => records
 * @param {Object}   [deps.requestStore] - { getRequest(id) }
 */
function makeSRStatusBackend(deps = {}) {
  const graphRead = deps.graphRead || (async (cypher, params) => {
    const { read } = require('../../schema-graph/driver');
    return read(cypher, params);
  });
  const requestStore = deps.requestStore || (() => {
    try { return require('../executors/create-service-request.js'); } catch { return null; }
  })();

  return async function getSRStatus(srNumber, _context = {}) {
    try {
      // 1. ServiceRequest (DraftSR materialization)
      const srRecs = await graphRead(
        `MATCH (sr:ServiceRequest {srNumber:$n})
         RETURN sr.srNumber AS srNumber, sr.status AS status, sr.serviceId AS serviceId,
                sr.createdAt AS createdAt, sr.updatedAt AS updatedAt`,
        { n: srNumber }
      );
      if (srRecs.length) {
        const r = srRecs[0];
        return {
          srNumber: r.get('srNumber'), status: r.get('status') || 'submitted',
          title: r.get('serviceId') || undefined,
          createdAt: r.get('createdAt') || undefined, updatedAt: r.get('updatedAt') || undefined,
        };
      }

      // 2. Ticket
      const tkRecs = await graphRead(
        `MATCH (t:Ticket {ticketId:$n})
         RETURN t.ticketId AS id, t.status AS status, t.title AS title,
                t.createdAt AS createdAt, t.updatedAt AS updatedAt`,
        { n: srNumber }
      );
      if (tkRecs.length) {
        const r = tkRecs[0];
        return {
          srNumber: r.get('id'), status: r.get('status') || 'OPEN', title: r.get('title') || undefined,
          createdAt: r.get('createdAt') || undefined, updatedAt: r.get('updatedAt') || undefined,
        };
      }

      // 3. in-memory legacy store
      if (requestStore && typeof requestStore.getRequest === 'function') {
        const req = requestStore.getRequest(srNumber);
        if (req) {
          return {
            srNumber, status: req.status || 'NEW', title: req.serviceCode || req.title || undefined,
            createdAt: req.createdAt || undefined, updatedAt: req.updatedAt || undefined,
          };
        }
      }
      return null;
    } catch (err) {
      console.warn('[resolve.search/SR_STATUS] degraded:', err.message);
      return null; // graceful degradation
    }
  };
}

module.exports = { makeSRStatusBackend };
