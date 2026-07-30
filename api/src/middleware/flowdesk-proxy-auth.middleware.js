'use strict';

/**
 * FlowDesk proxy authentication — shared-secret gate for the whole
 * /api/v1/flowdesk surface (config + admin + chat).
 *
 * The Node FlowDesk API is meant to be reachable only through Altiora's
 * UnpaProxyController, which enriches each request with authoritative
 * X-FlowDesk-User-* identity headers (see flowdesk-user.middleware). Until now
 * that trust relied on network topology alone. This gate adds a symmetric shared
 * secret: Altiora's proxy attaches `X-Flowdesk-Api-Key` (config `UnpaChat:ApiKey`)
 * on the outbound leg, and we validate it here against env FLOWDESK_PROXY_API_KEY.
 *
 * Fail-OPEN when FLOWDESK_PROXY_API_KEY is unset (mirrors flowdesk-admin.middleware):
 * the mcp/ frontend calls this API directly in local dev, and a closed default
 * would brick it out of the box. Set the env var (and Altiora's UnpaChat:ApiKey to
 * the same value) to enforce — e.g. in staging/production where the proxy is the
 * only access path.
 *
 * Health probes and CORS preflight are always allowed so uptime checks and
 * browsers work without the secret.
 *
 * @module middleware/flowdesk-proxy-auth.middleware
 */

const crypto = require('crypto');

const HEADER_NAME = 'x-flowdesk-api-key';
let _warned = false;

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function flowdeskProxyAuthMiddleware(req, res, next) {
  const expected = process.env.FLOWDESK_PROXY_API_KEY || '';

  // Fail-open when unset (local mcp dev / internal tooling).
  if (!expected) {
    if (!_warned) {
      _warned = true;
      console.warn('[flowdesk-proxy-auth] FLOWDESK_PROXY_API_KEY not set — FlowDesk API is OPEN (no proxy-key check). Set it (and Altiora UnpaChat:ApiKey to the same value) to enforce.');
    }
    return next();
  }

  // Never gate CORS preflight or health/uptime probes.
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/health' || req.path.endsWith('/health')) return next();

  const provided = req.headers[HEADER_NAME] || '';
  if (provided && timingSafeEqual(provided, expected)) return next();

  return res.status(401).json({ error: 'Invalid or missing FlowDesk proxy API key' });
}

module.exports = { flowdeskProxyAuthMiddleware, HEADER_NAME };
