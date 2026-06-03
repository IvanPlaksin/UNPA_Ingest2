'use strict';

/**
 * Reads X-FlowDesk-User-* headers injected by the FlowDesk API proxy and attaches
 * a structured userContext object to req.flowdeskUser.
 *
 * Shape mirrors the object returned by routing.getUserContext() so callers can use
 * either source transparently.
 *
 * Headers set by FlowDesk UnpaProxyController:
 *   X-FlowDesk-User-Id           — FlowDesk UserId (UUID)
 *   X-FlowDesk-User-Email        — user email
 *   X-FlowDesk-User-Display-Name — display name
 *   X-FlowDesk-User-Is-Vip       — "true" | "false"
 *   X-FlowDesk-User-Org-Code     — last org unit code segment (e.g. "ODSRSGFP")
 *   X-FlowDesk-User-Org-Name     — org unit full name
 *   X-FlowDesk-User-Org-Path     — full code path (e.g. "UNCS/DPKO/UNTMIS/ODSRSGFP")
 *                                   used for mission-scope handler matching
 *   X-FlowDesk-User-Duty-Station — duty station name
 */
function flowdeskUserMiddleware(req, res, next) {
  const userId = req.headers['x-flowdesk-user-id'];
  if (!userId) return next();

  req.flowdeskUser = {
    userId,
    email:       req.headers['x-flowdesk-user-email']        || null,
    displayName: req.headers['x-flowdesk-user-display-name'] || null,
    isVip:       req.headers['x-flowdesk-user-is-vip'] === 'true',
    orgUnit: {
      code:  req.headers['x-flowdesk-user-org-code'] || null,
      name:  req.headers['x-flowdesk-user-org-name'] || null,
      path:  req.headers['x-flowdesk-user-org-path'] || '',
      level: null,
    },
    location: {
      dutyStation: req.headers['x-flowdesk-user-duty-station'] || null,
      country:     null,
      region:      null,
    },
    roles: [],
  };

  next();
}

module.exports = { flowdeskUserMiddleware };
