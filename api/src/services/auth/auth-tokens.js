'use strict';

/**
 * Self-contained auth primitives for the UNPA SPA login gate.
 *
 * No external dependencies (jsonwebtoken/bcrypt are not installed): tokens are
 * HS256 JWTs signed with Node's crypto HMAC, passwords are hashed with scrypt.
 * This keeps the delta Docker image buildable without an npm install.
 *
 * Token model:
 *   - access token  (typ=access, short TTL)  — sent as `Authorization: Bearer`
 *   - refresh token (typ=refresh, long TTL)  — exchanged at /auth/refresh
 *
 * @module services/auth/auth-tokens
 */

const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

// ── base64url helpers ────────────────────────────────────────────────
function b64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

// ── password hashing (scrypt) ────────────────────────────────────────
/** Produce a `scrypt:<saltHex>:<hashHex>` string for storage in env/config. */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Constant-time verify a plaintext password against a stored scrypt string. */
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  let actual;
  try {
    actual = crypto.scryptSync(String(password), salt, expected.length, SCRYPT_PARAMS);
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ── JWT (HS256) ──────────────────────────────────────────────────────
function signToken(payload, secret, ttlSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const encHeader = b64urlEncode(JSON.stringify(header));
  const encBody = b64urlEncode(JSON.stringify(body));
  const data = `${encHeader}.${encBody}`;
  const sig = b64urlEncode(crypto.createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

/** Verify signature + expiry. Throws Error('expired'|'invalid') on failure. */
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') throw new Error('invalid');
  const segs = token.split('.');
  if (segs.length !== 3) throw new Error('invalid');
  const [encHeader, encBody, sig] = segs;
  const data = `${encHeader}.${encBody}`;
  const expectedSig = b64urlEncode(crypto.createHmac('sha256', secret).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('invalid');
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(encBody).toString('utf8'));
  } catch {
    throw new Error('invalid');
  }
  if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) throw new Error('expired');
  return payload;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
};
