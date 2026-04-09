#!/usr/bin/env node
/**
 * Seed Priority 6 KG components into Memgraph
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
  const memgraph = require('../src/services/memgraph.service');

  const cypherFile = fs.readFileSync(path.join(__dirname, 'kg-seed-priority6.cypher'), 'utf8');

  // Split into individual statements (skip comments and empty lines)
  const statements = cypherFile
    .split(/;\s*\n/)
    .map(s => s.replace(/\/\/.*$/gm, '').trim())
    .filter(s => s.length > 10);

  console.log(`Executing ${statements.length} Cypher statements...`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.replace(/\s+/g, ' ').substring(0, 80);
    try {
      await memgraph.executeQuery(stmt);
      success++;
      console.log(`  [${i + 1}/${statements.length}] OK: ${preview}...`);
    } catch (err) {
      failed++;
      console.log(`  [${i + 1}/${statements.length}] FAIL: ${preview}...`);
      console.log(`    Error: ${err.message.substring(0, 150)}`);
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed out of ${statements.length}`);

  // Verify
  const result = await memgraph.executeQuery(
    "MATCH (c:CoreComponent) WHERE c.component_id STARTS WITH 'CORE-' RETURN count(c) as cnt"
  );
  const count = result.records?.[0]?.get('cnt') || 'unknown';
  console.log(`Total CoreComponent nodes: ${count}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(2);
});
