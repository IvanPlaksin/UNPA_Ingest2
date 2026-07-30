'use strict';

/**
 * Bearer-JWT guard for the UNPA SPA auth gate.
 *
 * Verifies `Authorization: Bearer <accessToken>` against UNPA_AUTH_SECRET and
 * requires `typ === 'access'`. On success attaches `req.authUser = { username }`.
 *
 * This is an OPT-IN guard: mount it on the routes you want to protect. It is not
 * applied globally, so server-to-server integrations (MCP, Altiora proxy, peer
 * graph-sync, document indexer) keep working without a JWT.
 *
 * @module middleware/auth-jwt.middleware
 */

const { verifyToken } = require('../services/auth/auth-tokens');

function getSecret() {
  return process.env.UNPA_AUTH_SECRET || '';
}

function extractBearer(req) {
  const header = req.headers['authorization'] || req.headers['Authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return m ? m[1].trim() : '';
}

function requireAuth(req, res, next) {
  const secret = getSecret();
  if (!secret) {
    // Auth not configured → treat the gate as disabled rather than bricking.
    return res.status(503).json({ error: 'Auth not configured on server' });
  }
  const token = extractBearer(req);
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = verifyToken(token, secret);
    if (payload.typ !== 'access') return res.status(401).json({ error: 'Wrong token type' });
    req.authUser = { username: payload.sub };
    return next();
  } catch (err) {
    const expired = err && err.message === 'expired';
    return res.status(401).json({ error: expired ? 'Token expired' : 'Invalid token' });
  }
}

module.exports = { requireAuth, extractBearer };
