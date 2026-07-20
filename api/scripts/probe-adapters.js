'use strict';
/**
 * probe-adapters.js — verification for the source-adapter framework.
 *
 * Phase A (offline): resolve every source's adapter, validate its capability
 *   descriptor, and assert that undeclared capabilities are hard stubs
 *   (enrich throws CapabilityNotSupportedError where not declared).
 * Phase B (live): run search() (and one enrich()) against the API-backed
 *   sources and report pass/fail + result counts. WAF/JS sources are expected
 *   to degrade gracefully (0 results or a clear error), not crash the run.
 *
 * Usage:
 *   node api/scripts/probe-adapters.js            # offline + live
 *   node api/scripts/probe-adapters.js --offline  # offline only
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const path = require('path');
const fs   = require('fs');

const OFFLINE_ONLY = process.argv.includes('--offline');
const RESEARCH_DIR = path.resolve(__dirname, '../src/services/knowledge/source-adapters/research');

const { resolveAdapter } = require('../src/services/knowledge/source-adapters/registry');
const { CapabilityNotSupportedError, ALL_CAPABILITIES } = require('../src/services/knowledge/source-adapters/capabilities');

// Live-probe subset: sources with real, reachable query APIs.
const LIVE = [
  { key: 'world-bank', query: 'climate', filters: { dateFrom: '2022-01-01' } },
  { key: 'who-iris',   query: 'malaria', filters: { docType: 'Publications' } },
  { key: 'unesco',     query: 'education', filters: { language: 'eng' } },
  { key: 'eclac',      query: 'poverty', filters: {} },
  { key: 'fao',        query: 'agriculture', filters: {} },
  { key: 'escap',      query: 'trade', filters: {} },
  { key: 'un-news-all', query: 'security', filters: {} },
];

function loadResearch() {
  const byKey = new Map();
  for (const f of fs.readdirSync(RESEARCH_DIR).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, f), 'utf8'));
    if (j.key) byKey.set(j.key, j);
  }
  return byKey;
}

async function offline(byKey) {
  console.log('── Phase A: offline capability checks ─────────────────');
  let pass = 0, fail = 0;
  for (const [key, r] of byKey) {
    const source = { name: r.name, type: 'REST_API', config: { adapterKey: key } };
    try {
      const a = resolveAdapter(source);
      const c = a.getCapabilities();
      if (a.constructor.key !== key) throw new Error(`resolved to ${a.constructor.key}`);
      if (!Array.isArray(c.capabilities)) throw new Error('capabilities not array');
      for (const cap of c.capabilities) {
        if (!ALL_CAPABILITIES.includes(cap)) throw new Error(`unknown capability ${cap}`);
      }
      // Undeclared enrich must be a hard stub.
      if (!c.capabilities.includes('enrich')) {
        let threw = false;
        try { await a.enrich({ id: 'x' }); } catch (e) { threw = e instanceof CapabilityNotSupportedError; }
        if (!threw) throw new Error('enrich stub did not throw when undeclared');
      }
      pass++;
    } catch (e) {
      console.log(`  ✗ ${key}: ${e.message}`);
      fail++;
    }
  }
  console.log(`  ${pass}/${pass + fail} adapters valid\n`);
  return fail === 0;
}

async function live() {
  console.log('── Phase B: live API probe ────────────────────────────');
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');
  const all = await sourceCatalogService.list({});
  const byKey = new Map(all.map(s => [s.config?.adapterKey, s]));

  let ok = 0, empty = 0, err = 0;
  for (const t of LIVE) {
    const s = byKey.get(t.key);
    if (!s) { console.log(`  ? ${t.key}: not in catalog`); continue; }
    try {
      const r = await sourceCatalogService.browse(s.id, { query: t.query, page: 1, limit: 3, filters: t.filters });
      const n = r.results?.length || 0;
      if (n > 0) {
        ok++;
        console.log(`  ✓ ${t.key.padEnd(12)} total=${String(r.total).padStart(7)} got=${n}  e.g. "${(r.results[0].title || '').slice(0, 50)}"`);
        // enrich probe on the first result if supported
        if (r.capabilities?.capabilities?.includes('enrich')) {
          try {
            const adapter = require('../src/services/knowledge/source-adapters/registry').resolveAdapter(s);
            const en = await adapter.enrich(r.results[0]);
            console.log(`      enrich: ${en ? 'ok (' + Object.keys(en).filter(k => en[k] && (!Array.isArray(en[k]) || en[k].length)).join(',') + ')' : 'null'}`);
          } catch (e) { console.log(`      enrich: error ${e.message}`); }
        }
      } else {
        empty++;
        console.log(`  ○ ${t.key.padEnd(12)} total=${r.total} got=0 (empty — WAF/JS or no match)`);
      }
    } catch (e) {
      err++;
      console.log(`  ✗ ${t.key.padEnd(12)} ${e.message}`);
    }
  }
  console.log(`\n  live: ${ok} ok, ${empty} empty, ${err} error\n`);
}

async function main() {
  const byKey = loadResearch();
  const offlineOk = await offline(byKey);
  if (!OFFLINE_ONLY) await live();
  console.log(offlineOk ? '✅ offline checks passed' : '❌ offline checks FAILED');
  process.exit(offlineOk ? 0 : 1);
}

main().catch(e => { console.error('Fatal:', e.message, e.stack); process.exit(1); });
