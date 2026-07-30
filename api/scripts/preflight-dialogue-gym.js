'use strict';

/**
 * Check that every service an arena run depends on is actually working.
 *
 *   node api/scripts/preflight-dialogue-gym.js
 *
 * Exit 0 = safe to run. Exit 1 = a critical dependency is down and any run
 * started now would produce failures that look like prompt defects but are not.
 *
 * run-gepa.js and run-arena.js call this automatically; use it directly to
 * diagnose, or before opening the Arena tab in the UI.
 *
 * @module scripts/preflight-dialogue-gym
 */

require('dotenv').config();

const preflight = require('../src/services/dialogue-gym/preflight.service');

preflight.runPreflight()
  .then(async (result) => {
    console.log(preflight.formatReport(result));
    try { await require('../src/services/memgraph.service').close(); } catch { /* ignore */ }
    process.exit(result.ok ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('[preflight] crashed:', err.message);
    try { await require('../src/services/memgraph.service').close(); } catch { /* ignore */ }
    process.exit(2);
  });
