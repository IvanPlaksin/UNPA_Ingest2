'use strict';

/**
 * ResilientProvider (F11f) — the outermost DirectoryAdapter wrapper. It turns raw
 * backend failures (the Altiora API down, a timeout) into a controlled
 * `DirectoryUnavailableError` the interpreter handles with an ADCC-085 no-dead-end
 * path (retry / manual entry / park) instead of crashing the turn.
 *
 * Optional last-known-good fallback: on every success the value is written to a
 * long-TTL fallback store; on failure that store is consulted before giving up,
 * so a brief outage degrades to slightly-stale data rather than an interruption.
 *
 * @module instances/flowdesk/services/directory/providers/resilient.provider
 */

const { ADAPTER_METHODS, DirectoryUnavailableError } = require('../adapter.interface');
const { djb2 } = require('./cached.provider');

const LKG_TTL = Number(process.env.FLOWDESK_DIRECTORY_LKG_TTL) || 24 * 3600; // last-known-good: 24h

function fbKey(method, arg) { return `directory:lkg:${method}:${djb2(arg)}`; }

/**
 * @param {import('../adapter.interface').DirectoryAdapter} base
 * @param {Object} [deps]
 * @param {{get,set}} [deps.fallbackStore] - long-TTL last-known-good store (optional)
 * @param {Object} [deps.logger]
 */
function createResilientProvider(base, deps = {}) {
  const fallback = deps.fallbackStore || null;
  const log = deps.logger || console;
  const providerId = base.providerId;

  function wrap(method) {
    return async (arg) => {
      try {
        const v = await base[method](arg);
        if (fallback) { try { await fallback.set(fbKey(method, arg), v, LKG_TTL); } catch { /* best-effort */ } }
        return v;
      } catch (err) {
        try { log.warn(`[directory:${providerId}] ${method} failed: ${err.message}`); } catch { /* ignore */ }
        if (fallback) {
          try {
            const lkg = await fallback.get(fbKey(method, arg));
            if (lkg !== null && lkg !== undefined) { try { log.warn(`[directory:${providerId}] serving last-known-good for ${method}`); } catch { /* ignore */ } return lkg; }
          } catch { /* fall through to error */ }
        }
        throw new DirectoryUnavailableError(providerId, err.message);
      }
    };
  }

  const out = { providerId, resilient: true };
  for (const m of ADAPTER_METHODS) out[m] = wrap(m);
  return out;
}

module.exports = { createResilientProvider, LKG_TTL };
