#!/usr/bin/env node
/**
 * Seed Priority 9 KG data: back-edge fix, double-flatten fix, test-full-meta, spawn-graph
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.chdir(path.join(__dirname, '..'));

(async () => {
  const memgraph = require('../src/services/memgraph.service');
  const cypher = fs.readFileSync(path.join(__dirname, 'kg-seed-priority9.cypher'), 'utf8');
  const statements = cypher
    .split('\n')
    .map(l => l.replace(/\/\/.*/, '').trim())
    .filter(l => l.length > 0);

  let ok = 0, fail = 0;
  for (const stmt of statements) {
    try {
      await memgraph.executeQuery(stmt);
      ok++;
      process.stdout.write('.');
    } catch (e) {
      fail++;
      console.error(`\n  FAIL: ${e.message}\n  stmt: ${stmt.substring(0, 80)}...`);
    }
  }
  console.log(`\n  Done: ${ok}/${ok + fail} succeeded`);

  // Final count
  const result = await memgraph.executeQuery('MATCH (c:CoreComponent) RETURN count(c) as cnt');
  const cnt = result.records?.[0]?._fields?.[0];
  console.log(`  Total CoreComponent nodes: ${cnt}`);

  process.exit(fail > 0 ? 1 : 0);
})();
