#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.chdir(path.join(__dirname, '..'));

(async () => {
  const memgraph = require('../src/services/memgraph.service');

  // Summary counts
  const q1 = await memgraph.executeQuery(
    "MATCH (n) WHERE n.namespace IN ['CORE', 'YOUNEED'] " +
    "WITH n.namespace as ns, labels(n)[0] as label " +
    "RETURN ns, label, count(*) as cnt ORDER BY ns, label"
  );
  console.log('=== Namespace Summary ===');
  for (const r of q1.records) {
    console.log('  ' + r._fields.join(' | '));
  }

  // Relationship counts
  const q2 = await memgraph.executeQuery(
    "MATCH (a)-[r]->(b) " +
    "WHERE a.namespace IN ['CORE', 'YOUNEED'] OR b.namespace IN ['CORE', 'YOUNEED'] " +
    "RETURN type(r) as rel_type, count(*) as cnt ORDER BY cnt DESC"
  );
  console.log('\n=== Relationships ===');
  for (const r of q2.records) {
    console.log('  ' + r._fields.join(' | '));
  }

  // Totals
  const q3 = await memgraph.executeQuery('MATCH (c:CoreComponent) RETURN count(c) as cnt');
  console.log('\nTotal CoreComponent:', q3.records[0]._fields[0]);

  const q4 = await memgraph.executeQuery("MATCH (n) WHERE n.namespace = 'YOUNEED' RETURN count(n) as cnt");
  console.log('Total YOUNEED:', q4.records[0]._fields[0]);

  // Component types breakdown
  const q5 = await memgraph.executeQuery(
    "MATCH (c:CoreComponent) RETURN c.type as type, count(*) as cnt ORDER BY cnt DESC"
  );
  console.log('\n=== CoreComponent Types ===');
  for (const r of q5.records) {
    console.log('  ' + r._fields.join(' | '));
  }

  // YOUNEED label breakdown
  const q6 = await memgraph.executeQuery(
    "MATCH (n) WHERE n.namespace = 'YOUNEED' " +
    "WITH labels(n)[0] as label RETURN label, count(*) as cnt ORDER BY cnt DESC"
  );
  console.log('\n=== YOUNEED Labels ===');
  for (const r of q6.records) {
    console.log('  ' + r._fields.join(' | '));
  }

  process.exit(0);
})();
