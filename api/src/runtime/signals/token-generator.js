/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOKEN GENERATOR
 * Generates and validates HMAC-signed resume tokens for async signals.
 *
 * Token format: base64(payload).base64(hmac-sha256(payload, secret))
 * Payload: { eid, nid, exp, jti } (executionId, nodeId, expiresAt, unique id)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

// ────────────────────────────────────────────────────────────────────────────
// DEFAULTS
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_SECRET = process.env.SIGNAL_TOKEN_SECRET || 'gxe-signal-token-secret-change-in-production';
const SEPARATOR = '.';

// ────────────────────────────────────────────────────────────────────────────
// TOKEN GENERATOR
// ────────────────────────────────────────────────────────────────────────────

class TokenGenerator {
  /**
   * @param {string} [secret] - HMAC secret. Uses env SIGNAL_TOKEN_SECRET or default.
   */
  constructor(secret) {
    this._secret = secret || DEFAULT_SECRET;
  }

  /**
   * Generate a signed resume token.
   *
   * @param {string} executionId - Execution ID
   * @param {string} nodeId - Node ID that is waiting
   * @param {string} expiresAt - ISO datetime expiration
   * @returns {string} Signed token string
   */
  generate(executionId, nodeId, expiresAt) {
    const payload = {
      eid: executionId,
      nid: nodeId,
      exp: new Date(expiresAt).getTime(),
      jti: crypto.randomUUID(),
      iat: Date.now(),
    };

    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this._sign(payloadStr);

    return `${payloadStr}${SEPARATOR}${signature}`;
  }

  /**
   * Validate a resume token.
   *
   * @param {string} token - Token to validate
   * @returns {{ valid: boolean, payload?: object, error?: string }}
   */
  validate(token) {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token is required' };
    }

    const parts = token.split(SEPARATOR);
    if (parts.length !== 2) {
      return { valid: false, error: 'Invalid token format' };
    }

    const [payloadStr, signature] = parts;

    // Verify signature
    const expectedSig = this._sign(payloadStr);
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Decode payload
    let payload;
    try {
      payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8'));
    } catch {
      return { valid: false, error: 'Invalid payload encoding' };
    }

    // Check expiration
    if (payload.exp && Date.now() > payload.exp) {
      return { valid: false, error: 'Token expired', payload };
    }

    return {
      valid: true,
      payload: {
        executionId: payload.eid,
        nodeId: payload.nid,
        expiresAt: new Date(payload.exp).toISOString(),
        tokenId: payload.jti,
        issuedAt: new Date(payload.iat).toISOString(),
      },
    };
  }

  /**
   * Extract payload without validation (for logging/debugging).
   * @param {string} token
   * @returns {object|null}
   */
  decode(token) {
    try {
      const payloadStr = token.split(SEPARATOR)[0];
      return JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8'));
    } catch {
      return null;
    }
  }

  // ── Internal ──

  _sign(data) {
    return crypto.createHmac('sha256', this._secret)
      .update(data)
      .digest('base64url');
  }
}

module.exports = { TokenGenerator };
