'use strict';

/**
 * FlowDesk Admin authorization (ADMIN P0, ratified: env allowlist).
 *
 * Grants access to /api/v1/flowdesk/admin/* when EITHER:
 *   - header `X-FlowDesk-Admin-Token` matches env FLOWDESK_ADMIN_TOKEN
 *     (direct access from the Project Advisor UI / dev tooling), OR
 *   - the proxy-injected identity (req.flowdeskUser, set by
 *     flowdesk-user.middleware) has an email or userId listed in
 *     FLOWDESK_ADMIN_USERS (comma-separated, case-insensitive).
 *
 * When NEITHER env var is configured the gate is OPEN (with a one-time warning):
 * the whole mcp/ frontend is currently auth-less internal tooling, and a closed
 * default would brick the admin section out of the box. Configure either var to
 * enforce. Platform-wide RBAC is the follow-up (see design doc §4.5).
 *
 * @module middleware/flowdesk-admin.middleware
 */

let _warned = false;

function flowdeskAdminMiddleware(req, res, next) {
  const token = process.env.FLOWDESK_ADMIN_TOKEN || '';
  const users = (process.env.FLOWDESK_ADMIN_USERS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  if (!token && !users.length) {
    if (!_warned) {
      _warned = true;
      console.warn('[flowdesk-admin] FLOWDESK_ADMIN_TOKEN / FLOWDESK_ADMIN_USERS not set — admin API is OPEN. Configure one to enforce access.');
    }
    return next();
  }

  if (token && req.headers['x-flowdesk-admin-token'] === token) return next();

  const u = req.flowdeskUser;
  if (users.length && u) {
    const email = String(u.email || '').toLowerCase();
    const id = String(u.userId || '').toLowerCase();
    if ((email && users.includes(email)) || (id && users.includes(id))) return next();
  }

  return res.status(403).json({ error: 'FlowDesk admin access denied' });
}

module.exports = { flowdeskAdminMiddleware };
