'use strict';
/**
 * test-source-catalog.js
 * Tests every SourceCatalog entry by calling browse() and reports results.
 *
 * Usage:
 *   node api/scripts/test-source-catalog.js
 *   node api/scripts/test-source-catalog.js --concurrency=3
 *   node api/scripts/test-source-catalog.js --id=<sourceId>   (test single source)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const args     = process.argv.slice(2);
const CONCUR   = parseInt((args.find(a => a.startsWith('--concurrency=')) || '').split('=')[1] || '3', 10);
const SINGLE   = (args.find(a => a.startsWith('--id=')) || '').split('=')[1];
const TIMEOUT  = 30000; // 30s per source

const RESET    = '\x1b[0m';
const GREEN    = '\x1b[32m';
const RED      = '\x1b[31m';
const YELLOW   = '\x1b[33m';
const CYAN     = '\x1b[36m';
const GRAY     = '\x1b[90m';
const BOLD     = '\x1b[1m';

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer);
    return result;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function testSource(svc, source) {
  const start = Date.now();
  try {
    const result = await withTimeout(
      svc.browse(source.id, { query: '', page: 1, limit: 10 }),
      TIMEOUT,
      source.name
    );
    const elapsed = Date.now() - start;
    const count = result?.results?.length ?? 0;
    const total = result?.total ?? count;
    return { ok: true, count, total, elapsed };
  } catch (err) {
    return { ok: false, error: err.message, elapsed: Date.now() - start };
  }
}

async function runBatch(svc, sources) {
  const results = [];
  // process CONCUR at a time
  for (let i = 0; i < sources.length; i += CONCUR) {
    const batch = sources.slice(i, i + CONCUR);
    const settled = await Promise.allSettled(batch.map(s => testSource(svc, s)));
    for (let j = 0; j < batch.length; j++) {
      const src = batch[j];
      const res = settled[j].status === 'fulfilled' ? settled[j].value : { ok: false, error: settled[j].reason?.message };
      results.push({ source: src, result: res });

      const icon   = res.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      const timing = `${GRAY}${res.elapsed ?? 0}ms${RESET}`;
      const detail = res.ok
        ? `${CYAN}${res.count} items${RESET} ${GRAY}(total: ${res.total})${RESET}`
        : `${RED}${res.error}${RESET}`;
      const typeTag = `${YELLOW}[${src.type}]${RESET}`;
      console.log(`  ${icon} ${typeTag} ${src.name}  ${timing}  ${detail}`);
    }
  }
  return results;
}

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');

  const allSources = await sourceCatalogService.list({ namespace: null, type: null });
  const sources = SINGLE
    ? allSources.filter(s => s.id === SINGLE)
    : allSources;

  if (!sources.length) {
    console.log('No sources found.');
    process.exit(0);
  }

  console.log(`\n${BOLD}Source Catalog — Browse Test${RESET}`);
  console.log(`  Sources   : ${sources.length}`);
  console.log(`  Concur.   : ${CONCUR}`);
  console.log(`  Timeout   : ${TIMEOUT}ms\n`);

  // Group by type for nicer output
  const byType = {};
  for (const s of sources) {
    if (!byType[s.type]) byType[s.type] = [];
    byType[s.type].push(s);
  }

  const allResults = [];

  for (const [type, group] of Object.entries(byType)) {
    console.log(`${BOLD}${CYAN}── ${type} (${group.length})${RESET}`);
    const res = await runBatch(sourceCatalogService, group);
    allResults.push(...res);
    console.log();
  }

  // Summary
  const passed  = allResults.filter(r => r.result.ok);
  const failed  = allResults.filter(r => !r.result.ok);
  const empty   = passed.filter(r => r.result.count === 0);
  const ok      = passed.filter(r => r.result.count > 0);

  console.log(`${BOLD}═══ Results ═══${RESET}`);
  console.log(`  ${GREEN}✓ Returning results : ${ok.length}${RESET}`);
  console.log(`  ${YELLOW}⊘ Empty (no results): ${empty.length}${RESET}`);
  console.log(`  ${RED}✗ Error             : ${failed.length}${RESET}`);
  console.log(`  Total               : ${allResults.length}\n`);

  if (failed.length > 0) {
    console.log(`${RED}${BOLD}Failed sources:${RESET}`);
    for (const { source: s, result: r } of failed) {
      console.log(`  [${s.type}] ${s.name}`);
      console.log(`    ${RED}${r.error}${RESET}`);
    }
    console.log();
  }

  if (empty.length > 0) {
    console.log(`${YELLOW}${BOLD}Empty sources (connected OK, no documents returned for blank query):${RESET}`);
    for (const { source: s, result: r } of empty) {
      console.log(`  [${s.type}] ${s.name}  ${GRAY}${r.elapsed}ms${RESET}`);
    }
    console.log();
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
