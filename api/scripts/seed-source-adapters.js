'use strict';
/**
 * seed-source-adapters.js
 *
 * For every SourceCatalog entry, matches it to its research descriptor
 * (source-adapters/research/<key>.json by name), then writes:
 *   - config.adapterKey            → binds the source to its per-source adapter
 *   - merged connection config     → researched endpoints / params / responseMapping
 *   - methodology                  → the researched per-source methodology (Markdown)
 *   - capabilities                 → the adapter's runtime capability descriptor
 *
 * Usage:
 *   node api/scripts/seed-source-adapters.js               # apply to all
 *   node api/scripts/seed-source-adapters.js --dry-run     # preview only
 *   node api/scripts/seed-source-adapters.js --only who-iris,world-bank
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');

const RESEARCH_DIR = path.resolve(__dirname, '../src/services/knowledge/source-adapters/research');

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const onlyArg = args.find(a => a.startsWith('--only'));
const ONLY    = onlyArg ? (onlyArg.split('=')[1] || args[args.indexOf(onlyArg) + 1] || '').split(',').filter(Boolean) : null;

function loadResearch() {
  const byName = new Map();
  const byKey  = new Map();
  for (const f of fs.readdirSync(RESEARCH_DIR).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, f), 'utf8'));
    if (!j.key) continue;
    byKey.set(j.key, j);
    if (j.name) byName.set(j.name.trim().toLowerCase(), j);
  }
  return { byName, byKey };
}

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');
  const { resolveAdapter }       = require('../src/services/knowledge/source-adapters/registry');

  const { byName, byKey } = loadResearch();
  const sources = await sourceCatalogService.list({});

  console.log(`\n🌱  Source Adapter Seeder`);
  console.log(`   Sources in catalog : ${sources.length}`);
  console.log(`   Research descriptors: ${byKey.size}`);
  console.log(`   Dry run            : ${DRY_RUN}`);
  if (ONLY) console.log(`   Only               : ${ONLY.join(', ')}`);
  console.log('');

  let updated = 0, skipped = 0, unmatched = [];

  for (const src of sources) {
    const research = byName.get((src.name || '').trim().toLowerCase());
    if (!research) { unmatched.push(src.name); continue; }
    if (ONLY && !ONLY.includes(research.key)) { skipped++; continue; }

    const mergedConfig = { ...(src.config || {}), ...(research.config || {}), adapterKey: research.key };

    // Capabilities exactly as the runtime adapter reports them.
    const adapter = resolveAdapter({ ...src, config: mergedConfig });
    const caps = adapter.getCapabilities();

    const label = `${research.key.padEnd(22)} ${research.family.padEnd(12)} caps=[${caps.capabilities.join(',')}]`;

    if (DRY_RUN) {
      console.log(`  ~ (dry) ${label}`);
      updated++;
      continue;
    }

    try {
      await sourceCatalogService.update(src.id, {
        config:       mergedConfig,
        methodology:  research.methodologyMarkdown || src.methodology || '',
        capabilities: caps,
      });
      console.log(`  ✓ ${label}`);
      updated++;
    } catch (err) {
      console.error(`  ✗ ${research.key}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n  ─────────────────────────────────────`);
  console.log(`  Updated   : ${updated}`);
  console.log(`  Skipped   : ${skipped}`);
  if (unmatched.length) {
    console.log(`  Unmatched : ${unmatched.length}`);
    unmatched.forEach(n => console.log(`     - ${n}`));
  }
  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message, err.stack);
  process.exit(1);
});
