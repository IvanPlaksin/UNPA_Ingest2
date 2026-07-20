'use strict';

/**
 * Mock DirectoryAdapter (F11b) — the pilot/default provider. Wraps the existing
 * `user.mock.js` + `location.mock.js` data (5 users with org-hierarchy, 10 UN
 * duty stations) in the DirectoryAdapter contract. Behavior is identical to the
 * pre-F11 facade — this is a pure refactor to the interface.
 *
 * @module instances/flowdesk/services/directory/providers/mock.provider
 */

const userDir = require('../user.mock');
const locationDir = require('../location.mock');
const { mapSessionUser } = require('./altiora.provider');

function createMockProvider() {
  return {
    providerId: 'mock',

    // ── user resolution ──
    resolveUser: (query) => userDir.resolveUser(query),
    getUser: (userId) => userDir.getUser(userId),
    /**
     * Signed-in user. With F11d, `context.sessionUser` (the Altiora proxy-injected
     * identity, raw header shape) or `context.userId` carries the real user; the
     * header shape is normalized to our User shape (same mapper the Altiora
     * provider uses). Without any context we fall back to the pilot default.
     */
    async getCurrentUser(context = {}) {
      if (context && context.sessionUser && (context.sessionUser.userId || context.sessionUser.id)) {
        // Already a resolved User (has location.code) → use as-is; else map headers.
        return context.sessionUser.location && context.sessionUser.location.code
          ? context.sessionUser
          : mapSessionUser(context.sessionUser);
      }
      if (context && context.userId) {
        const u = await userDir.getUser(context.userId);
        if (u) return u;
      }
      return userDir.getCurrentUser();
    },

    // ── org hierarchy ──
    getManager: (userId) => userDir.getManager(userId),
    resolveApprover: (userId) => userDir.resolveApprover(userId),
    listManagers: () => userDir.listManagers(),

    // ── location ──
    listLocations: () => locationDir.listLocations(),
    resolveLocation: (code) => locationDir.resolveLocation(code),
    searchLocations: (query) => locationDir.searchLocations(query),
  };
}

module.exports = { createMockProvider };
