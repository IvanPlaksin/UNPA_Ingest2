'use strict';

/**
 * Check that the user/employee directory is reachable for the AI chats — the
 * same node→Altiora directory facade used by BOTH AltioraChat (text) and the
 * voice assistant. Tests directory SEARCH (resolveUser) and CURRENT-USER
 * resolution (getCurrentUser given an identity). Exit 0 = available, 2 = down.
 *
 *   node api/scripts/check-directory.js               # search only (service account)
 *   node api/scripts/check-directory.js --token=<jwt>  # + current-user from token
 *
 * @module scripts/check-directory
 */

require('dotenv').config();
const arena = require('../src/services/dialogue-gym/arena-runner.service');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
const token = args.token || process.env.DIALOGUE_GYM_ALTIORA_TOKEN || undefined;

async function main() {
  console.log(`Directory: ${process.env.FLOWDESK_DIRECTORY_PROVIDER || 'mock'} @ ${process.env.ALTIORA_API_BASE || 'http://localhost:5000'}`);
  const r = await arena.checkDirectory({ token });

  console.log('\n— Employee directory search (resolveUser) —');
  console.log(`  ${r.resolveUser.ok ? '✓ available' : '✗ UNAVAILABLE'}${r.resolveUser.ok ? ` (${r.resolveUser.count} results)` : ' — ' + r.resolveUser.error}`);

  console.log('\n— Current-user resolution (getCurrentUser) —');
  if (!r.getCurrentUser) console.log('  (skipped — no token/identity supplied; pass --token=<jwt>)');
  else if (r.getCurrentUser.ok) console.log(`  ✓ resolved: ${r.getCurrentUser.name || '(no name)'} <${r.getCurrentUser.email || '?'}>`);
  else console.log(`  ✗ FAILED — ${r.getCurrentUser.error}`);

  console.log('\nThis is the SAME directory path used by AltioraChat (text) and the voice assistant.');
  const ok = r.ok && (!r.getCurrentUser || r.getCurrentUser.ok);
  console.log(ok ? '\nRESULT: directory AVAILABLE for the AI chats.' : '\nRESULT: directory NOT fully available — chats/arena would hit "directory unavailable".');
  process.exitCode = ok ? 0 : 2;
}

main()
  .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(process.exitCode || 0); })
  .catch(async (err) => { console.error('[check-directory] FAILED:', err.message); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(1); });
