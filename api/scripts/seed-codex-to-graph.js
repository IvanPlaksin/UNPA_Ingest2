#!/usr/bin/env node
/**
 * CODEX-SEED-001: Seed Codex documentation into Memgraph
 *
 * Parses docs/codex/ MD files and creates graph hierarchy:
 *   CodexPart → HAS_SECTION → CodexSection → CONTAINS_RULE → CodexRule
 *   CodexPrinciple, CodexADR
 *
 * Usage:
 *   node scripts/seed-codex-to-graph.js           # Seed to Memgraph
 *   node scripts/seed-codex-to-graph.js --dry-run  # Parse only, no DB writes
 */

const path = require('path');
const { CodexParser } = require('../src/services/codex/codex-parser');

async function getMemgraph() {
  const memgraph = require('../src/services/memgraph.service');
  if (typeof memgraph.connect === 'function') {
    await memgraph.connect();
  }
  return memgraph;
}

async function seedCodexToGraph() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`=== CODEX-SEED-001: Seed Codex to Memgraph ${isDryRun ? '(DRY RUN)' : ''} ===\n`);

  // 1. Parse all Codex files
  console.log('📖 Parsing Codex files...');
  const parser = new CodexParser();
  const codex = await parser.parseAll();

  console.log(`   Parts:      ${codex.parts.length}`);
  console.log(`   Sections:   ${codex.sections.length}`);
  console.log(`   Rules:      ${codex.rules.length}`);
  console.log(`   Principles: ${codex.principles.length}`);
  console.log(`   ADRs:       ${codex.adrs.length}`);
  console.log();

  if (isDryRun) {
    console.log('🔍 DRY RUN — showing parsed data:\n');
    codex.parts.forEach(p => console.log(`  Part: ${p.partId} | order=${p.order} | ${p.title}`));
    console.log();
    codex.principles.forEach(p => console.log(`  Principle: ${p.principleId} | ${p.title}`));
    console.log();
    codex.adrs.forEach(a => console.log(`  ADR: ${a.adrId} | ${a.title}`));
    console.log();

    // Show rules distribution
    const rulesByPart = {};
    codex.rules.forEach(r => {
      rulesByPart[r.partId] = (rulesByPart[r.partId] || 0) + 1;
    });
    console.log('  Rules by Part:');
    Object.entries(rulesByPart).sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([partId, count]) => console.log(`    ${partId}: ${count} rules`));

    console.log('\n✅ Dry run complete. Use without --dry-run to seed Memgraph.');
    return;
  }

  // 2. Connect to Memgraph
  console.log('🔗 Connecting to Memgraph...');
  const memgraph = await getMemgraph();

  let success = 0;
  let errors = 0;

  async function runQuery(cypher, params = {}) {
    try {
      await memgraph.runQuery(cypher, params);
      success++;
    } catch (err) {
      errors++;
      console.error(`  ERROR: ${err.message}`);
    }
  }

  // 3. Clear existing Codex document nodes (not CodexRule from governance!)
  console.log('🗑️  Clearing existing Codex document nodes...');
  await runQuery(`
    MATCH (n)
    WHERE n:CodexPart OR n:CodexSection OR n:CodexPrinciple OR n:CodexADR OR n:CodexMetadata
    DETACH DELETE n
  `);
  // Clear only rules with source='codex-parser' to not delete governance rules
  await runQuery(`
    MATCH (r:CodexRule)
    WHERE r.source = 'codex-parser'
    DETACH DELETE r
  `);

  // 4. Create CodexPart nodes
  console.log('📚 Creating CodexPart nodes...');
  for (const part of codex.parts) {
    await runQuery(`
      MERGE (p:CodexPart {partId: $partId})
      ON CREATE SET
        p.codexId = $partId,
        p.title = $title,
        p.fileName = $fileName,
        p.order = $order,
        p.namespace = $namespace,
        p.hash = $hash,
        p.createdAt = datetime()
      ON MATCH SET
        p.title = $title,
        p.hash = $hash,
        p.updatedAt = datetime()
    `, part);
  }
  console.log(`   ✓ ${codex.parts.length} parts\n`);

  // 5. Create CodexSection nodes with HAS_SECTION relationships
  console.log('📑 Creating CodexSection nodes...');
  for (const section of codex.sections) {
    const params = {
      ...section,
      content: section.content || ''
    };
    await runQuery(`
      MATCH (p:CodexPart {partId: $partId})
      MERGE (s:CodexSection {sectionId: $sectionId})
      ON CREATE SET
        s.codexId = $sectionId,
        s.partId = $partId,
        s.title = $title,
        s.order = $order,
        s.content = $content,
        s.createdAt = datetime()
      ON MATCH SET
        s.title = $title,
        s.content = $content,
        s.updatedAt = datetime()
      MERGE (p)-[:HAS_SECTION]->(s)
    `, params);
  }
  console.log(`   ✓ ${codex.sections.length} sections\n`);

  // 6. Create CodexRule nodes with CONTAINS_RULE relationships
  console.log('📋 Creating CodexRule nodes...');
  for (const rule of codex.rules) {
    const params = {
      ...rule,
      code: rule.code || '',
      source: 'codex-parser'
    };
    await runQuery(`
      MATCH (s:CodexSection {sectionId: $sectionId})
      MERGE (r:CodexRule {ruleId: $ruleId})
      ON CREATE SET
        r.codexId = $ruleId,
        r.sectionId = $sectionId,
        r.partId = $partId,
        r.code = $code,
        r.title = $title,
        r.description = $description,
        r.scope = $scope,
        r.modality = $modality,
        r.status = $status,
        r.source = $source,
        r.createdAt = datetime()
      ON MATCH SET
        r.title = $title,
        r.description = $description,
        r.modality = $modality,
        r.updatedAt = datetime()
      MERGE (s)-[:CONTAINS_RULE]->(r)
    `, params);
  }
  console.log(`   ✓ ${codex.rules.length} rules\n`);

  // 7. Create CodexPrinciple nodes
  console.log('🎯 Creating CodexPrinciple nodes...');
  for (const principle of codex.principles) {
    const params = {
      ...principle,
      description: principle.description || ''
    };
    await runQuery(`
      MERGE (p:CodexPrinciple {principleId: $principleId})
      ON CREATE SET
        p.codexId = $principleId,
        p.title = $title,
        p.code = $code,
        p.order = $order,
        p.description = $description,
        p.namespace = $namespace,
        p.createdAt = datetime()
      ON MATCH SET
        p.title = $title,
        p.description = $description,
        p.updatedAt = datetime()
    `, params);
  }
  // Link principles to PART-0
  await runQuery(`
    MATCH (pr:CodexPrinciple), (p:CodexPart {partId: 'PART-0'})
    MERGE (pr)-[:DERIVED_FROM]->(p)
  `);
  console.log(`   ✓ ${codex.principles.length} principles\n`);

  // 8. Create CodexADR nodes
  console.log('📝 Creating CodexADR nodes...');
  for (const adr of codex.adrs) {
    const params = {
      ...adr,
      decision: adr.decision || ''
    };
    await runQuery(`
      MERGE (a:CodexADR {adrId: $adrId})
      ON CREATE SET
        a.title = $title,
        a.fileName = $fileName,
        a.status = $status,
        a.decision = $decision,
        a.hash = $hash,
        a.createdAt = datetime()
      ON MATCH SET
        a.title = $title,
        a.status = $status,
        a.decision = $decision,
        a.updatedAt = datetime()
    `, params);
  }
  console.log(`   ✓ ${codex.adrs.length} ADRs\n`);

  // 9. Create cross-references between parts
  console.log('🔗 Creating cross-references...');
  const crossRefs = [
    ['PART-IV', 'PART-IX', 'namespace implementation of domain types'],
    ['PART-III', 'PART-VII', 'version storage in polystore'],
    ['PART-I', 'PART-V', 'CRUD operations require validation'],
    ['PART-II', 'PART-III', 'metadata drives versioning'],
    ['PART-VI', 'PART-IX', 'catalog uses domain classification'],
  ];
  for (const [from, to, reason] of crossRefs) {
    await runQuery(`
      MATCH (p1:CodexPart {partId: $from}), (p2:CodexPart {partId: $to})
      MERGE (p1)-[:RELATED_TO {reason: $reason}]->(p2)
    `, { from, to, reason });
  }

  // Link ADRs to relevant parts
  const adrPartLinks = [
    ['ADR-001', 'PART-VII'],  // Memgraph → Polystore
    ['ADR-002', 'PART-VI'],   // GXE AOPEG → Catalog
    ['ADR-003', 'PART-IV'],   // Namespaces
    ['ADR-004', 'PART-III'],  // Versioning
    ['ADR-005', 'PART-VII'],  // Polystore
    ['ADR-006', 'PART-IX'],   // Information Types
  ];
  for (const [adrId, partId] of adrPartLinks) {
    await runQuery(`
      MATCH (a:CodexADR {adrId: $adrId}), (p:CodexPart {partId: $partId})
      MERGE (a)-[:IMPLEMENTS]->(p)
    `, { adrId, partId });
  }
  console.log('   ✓ cross-references created\n');

  // 10. Create CodexMetadata node (preserve existing version from governance bumps)
  console.log('📊 Creating CodexMetadata...');
  const existingMeta = await runQuery(`
    MATCH (m:CodexMetadata {id: 'codex-metadata'})
    RETURN m.version AS version
  `);
  const currentVersion = existingMeta[0]?.version || '0.1.3';
  await runQuery(`
    MERGE (m:CodexMetadata {id: 'codex-metadata'})
    SET m.version = $version,
        m.seededAt = datetime(),
        m.partsCount = $parts,
        m.sectionsCount = $sections,
        m.rulesCount = $rules,
        m.principlesCount = $principles,
        m.adrsCount = $adrs
  `, {
    version: currentVersion,
    parts: codex.parts.length,
    sections: codex.sections.length,
    rules: codex.rules.length,
    principles: codex.principles.length,
    adrs: codex.adrs.length
  });
  console.log(`   ✓ version: ${currentVersion}`);

  // 11. Verify
  console.log('🔍 Verifying...');
  const stats = await memgraph.runQuery(`
    MATCH (n)
    WHERE n:CodexPart OR n:CodexSection OR n:CodexRule OR n:CodexPrinciple OR n:CodexADR
    RETURN labels(n)[0] as label, count(n) as count
    ORDER BY label
  `);
  for (const row of stats) {
    console.log(`   ${row.label}: ${row.count}`);
  }

  const relStats = await memgraph.runQuery(`
    MATCH ()-[r]->()
    WHERE type(r) IN ['HAS_SECTION', 'CONTAINS_RULE', 'DERIVED_FROM', 'RELATED_TO', 'IMPLEMENTS']
    RETURN type(r) as relType, count(r) as count
    ORDER BY relType
  `);
  console.log('\n   Relationships:');
  for (const row of relStats) {
    console.log(`   ${row.relType}: ${row.count}`);
  }

  console.log(`\n✅ Seeding complete! ${success} succeeded, ${errors} errors`);

  // Close connection
  if (typeof memgraph.close === 'function') {
    await memgraph.close();
  }
  if (typeof memgraph.disconnect === 'function') {
    await memgraph.disconnect();
  }
  setTimeout(() => process.exit(0), 1000);
}

seedCodexToGraph().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
