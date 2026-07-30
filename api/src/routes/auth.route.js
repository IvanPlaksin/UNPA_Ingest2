'use strict';

/**
 * SPA auth routes — simple username/password login with JWT access + refresh.
 *
 *   POST /api/v1/auth/login    { username, password } -> { accessToken, refreshToken, ... }
 *   POST /api/v1/auth/refresh  { refreshToken }       -> { accessToken, refreshToken, ... }
 *   GET  /api/v1/auth/me       (Bearer access)        -> { user }
 *   POST /api/v1/auth/logout                          -> { ok: true }  (stateless)
 *
 * Credentials live in env: UNPA_ADMIN_USER + UNPA_ADMIN_PASSWORD_HASH (scrypt).
 * Tokens are signed with UNPA_AUTH_SECRET. See services/auth/auth-tokens.js.
 *
 * @module routes/auth.route
 */

const express = require('express');
const crypto = require('crypto');
const {
  signToken,
  verifyToken,
  verifyPassword,
} = require('../services/auth/auth-tokens');
const { requireAuth } = require('../middleware/auth-jwt.middleware');

const router = express.Router();

function cfg() {
  return {
    secret: process.env.UNPA_AUTH_SECRET || '',
    adminUser: process.env.UNPA_ADMIN_USER || 'unpaadmin',
    adminHash: process.env.UNPA_ADMIN_PASSWORD_HASH || '',
    accessTtl: parseInt(process.env.UNPA_AUTH_ACCESS_TTL || '900', 10),
    refreshTtl: parseInt(process.env.UNPA_AUTH_REFRESH_TTL || '604800', 10),
  };
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function issueTokens(username, c) {
  const accessToken = signToken({ sub: username, typ: 'access' }, c.secret, c.accessTtl);
  const refreshToken = signToken({ sub: username, typ: 'refresh' }, c.secret, c.refreshTtl);
  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: c.accessTtl,
    user: { username },
  };
}

// ── brute-force throttle (in-memory, per IP) ─────────────────────────
const attempts = new Map(); // ip -> { count, until }
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 5 * 60 * 1000;

function throttleKey(req) {
  return req.ip || req.headers['x-forwarded-for'] || 'unknown';
}

function isLockedOut(key) {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (rec.until && Date.now() < rec.until) return true;
  if (rec.until && Date.now() >= rec.until) {
    attempts.delete(key);
    return false;
  }
  return false;
}

function recordFailure(key) {
  const rec = attempts.get(key) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) rec.until = Date.now() + LOCKOUT_MS;
  attempts.set(key, rec);
}

function clearFailures(key) {
  attempts.delete(key);
}

// ── POST /login ──────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const c = cfg();
  if (!c.secret || !c.adminHash) {
    return res.status(503).json({ error: 'Auth not configured on server' });
  }
  const key = throttleKey(req);
  if (isLockedOut(key)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const userOk = safeEqual(username, c.adminUser);
  const passOk = verifyPassword(password, c.adminHash);
  if (!userOk || !passOk) {
    recordFailure(key);
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  clearFailures(key);
  return res.json(issueTokens(c.adminUser, c));
});

// ── POST /refresh ────────────────────────────────────────────────────
router.post('/refresh', (req, res) => {
  const c = cfg();
  if (!c.secret) return res.status(503).json({ error: 'Auth not configured on server' });

  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });

  let payload;
  try {
    payload = verifyToken(refreshToken, c.secret);
  } catch (err) {
    const expired = err && err.message === 'expired';
    return res.status(401).json({ error: expired ? 'Refresh token expired' : 'Invalid refresh token' });
  }
  if (payload.typ !== 'refresh') {
    return res.status(401).json({ error: 'Wrong token type' });
  }
  // Rotate: issue a fresh access + refresh pair.
  return res.json(issueTokens(payload.sub, c));
});

// ── GET /me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.authUser });
});

// ── POST /logout ─────────────────────────────────────────────────────
// Stateless: the client drops its tokens. Endpoint exists for symmetry and
// so a future denylist can be added without a client change.
router.post('/logout', (_req, res) => {
  return res.json({ ok: true });
});

module.exports = router;
