#!/usr/bin/env node
/**
 * Seeds Priority 7 KG updates into Memgraph.
 * Usage: node api/scripts/seed-priority7.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const memgraph = require('../src/services/memgraph.service');
  const cypherFile = path.join(__dirname, 'kg-seed-priority7.cypher');
  const content = fs.readFileSync(cypherFile, 'utf-8');

  const statements = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//'));

  console.log(`[KG-Seed-P7] Executing ${statements.length} statements...\n`);

  let ok = 0;
  let fail = 0;

  for (const stmt of statements) {
    try {
      const result = await memgraph.executeQuery(stmt);
      const info = result.records?.[0]
        ? JSON.stringify(Object.fromEntries(
            result.records[0].keys.map((k, i) => [k, result.records[0]._fields[i]])
          ))
        : 'OK';
      console.log(`  OK: ${stmt.substring(0, 90)}...  => ${info}`);
      ok++;
    } catch (err) {
      console.log(`  FAIL: ${stmt.substring(0, 90)}...  => ${err.message}`);
      fail++;
    }
  }

  console.log(`\n[KG-Seed-P7] Done: ${ok} succeeded, ${fail} failed out of ${statements.length}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(2); });
