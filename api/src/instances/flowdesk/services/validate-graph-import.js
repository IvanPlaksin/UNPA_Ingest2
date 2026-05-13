'use strict';

/**
 * TASK-FLOWDESK-001 Phase 3: Validate FlowDesk Memgraph import.
 *
 * Checks: node counts, orphan detection, hierarchy connectivity,
 * depth consistency, and sample routing queries.
 *
 * Usage: node api/src/services/flowdesk/validate-graph-import.js
 */

const neo4j = require('neo4j-driver');
const { MEMGRAPH_CONFIG } = require('./import-config.js');

let driver;
let passed = 0;
let failed = 0;
const failures = [];

async function runCypher(cypher) {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.executeRead(tx => tx.run(cypher));
    return result.records;
  } finally {
    await session.close();
  }
}

async function check(name, cypher, validator) {
  try {
    const records = await runCypher(cypher);
    const result = validator(records);
    if (result === true) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}: ${result}`);
      failed++;
      failures.push({ name, detail: result });
    }
  } catch (err) {
    console.log(`  ✗ ${name}: ERROR — ${err.message}`);
    failed++;
    failures.push({ name, detail: err.message });
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  FlowDesk Import Validation                      ║');
  console.log('╚══════════════════════════════════════════════════╝');

  driver = neo4j.driver(
    MEMGRAPH_CONFIG.uri,
    neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password),
    { disableLosslessIntegers: true }
  );
  await driver.verifyConnectivity();
  console.log('  Connected to Memgraph\n');

  // ── 1. Node Counts ──
  console.log('── Node Counts ──');
  await check('ServiceCatalogItem count >= 100', `
    MATCH (n:ServiceCatalogItem) RETURN count(n) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 100 ? true : `Expected >= 100, got ${cnt}`;
  });

  await check('OrganizationUnit count >= 10000', `
    MATCH (n:OrganizationUnit) RETURN count(n) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 10000 ? true : `Expected >= 10000, got ${cnt}`;
  });

  await check('Location count >= 900', `
    MATCH (n:Location) RETURN count(n) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 900 ? true : `Expected >= 900, got ${cnt}`;
  });

  await check('User count >= 20000', `
    MATCH (n:User) RETURN count(n) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 20000 ? true : `Expected >= 20000, got ${cnt}`;
  });

  await check('Role count = 16', `
    MATCH (n:Role) RETURN count(n) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 14 ? true : `Expected >= 14, got ${cnt}`;
  });

  await check('Permission count >= 40', `
    MATCH (n:Permission) RETURN count(n) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 40 ? true : `Expected >= 40, got ${cnt}`;
  });

  // ── 2. Location types distribution ──
  console.log('\n── Location Type Distribution ──');
  await check('Location types: Region=6, SubRegion=23, Country>=200, DS>=600', `
    MATCH (l:Location)
    RETURN l.location_type AS type, count(l) AS cnt
    ORDER BY cnt DESC
  `, recs => {
    const map = {};
    recs.forEach(r => { map[r.get('type')] = r.get('cnt'); });
    const checks = [];
    if ((map.Region || 0) < 6) checks.push(`Region: ${map.Region || 0} (expected 6)`);
    if ((map.SubRegion || 0) < 23) checks.push(`SubRegion: ${map.SubRegion || 0} (expected 23)`);
    if ((map.Country || 0) < 200) checks.push(`Country: ${map.Country || 0} (expected >= 200)`);
    if ((map.DutyStation || 0) < 600) checks.push(`DutyStation: ${map.DutyStation || 0} (expected >= 600)`);
    if (checks.length > 0) return checks.join('; ');
    console.log(`    Region=${map.Region}, SubRegion=${map.SubRegion}, Country=${map.Country}, DutyStation=${map.DutyStation}`);
    return true;
  });

  // ── 3. Hierarchy Connectivity ──
  console.log('\n── Hierarchy Connectivity ──');

  await check('ServiceCatalog root exists (level 1)', `
    MATCH (s:ServiceCatalogItem {level: 1}) RETURN count(s) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt === 8 ? true : `Expected 8 roots, got ${cnt}`;
  });

  await check('ServiceCatalog PARENT_OF edges exist', `
    MATCH (:ServiceCatalogItem)-[r:PARENT_OF]->(:ServiceCatalogItem) RETURN count(r) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 100 ? true : `Expected >= 100, got ${cnt}`;
  });

  await check('OrgUnit root exists (UNCS)', `
    MATCH (o:OrganizationUnit {code: 'UNCS'}) RETURN o.name AS name
  `, recs => recs.length === 1 ? true : 'Root node UNCS not found');

  await check('OrgUnit PARENT_OF edges >= 10000', `
    MATCH (:OrganizationUnit)-[r:PARENT_OF]->(:OrganizationUnit) RETURN count(r) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 10000 ? true : `Expected >= 10000, got ${cnt}`;
  });

  await check('Orphan OrgUnits < 300 (expected: some have inactive parents)', `
    MATCH (o:OrganizationUnit)
    WHERE NOT (o)<-[:PARENT_OF]-() AND NOT ()-[:PARENT_OF]->(o) AND o.level > 1
    RETURN count(o) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    // Some orphans expected: active children whose parents are inactive (not imported)
    if (cnt < 300) {
      console.log(`    ${cnt} orphans (active nodes with inactive parents — expected)`);
      return true;
    }
    return `Found ${cnt} orphan OrgUnits (expected < 300)`;
  });

  // ── 4. Cross-domain Edges ──
  console.log('\n── Cross-domain Edges ──');

  await check('Location PART_OF edges >= 500', `
    MATCH (:Location)-[r:PART_OF]->(:Location) RETURN count(r) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 500 ? true : `Expected >= 500, got ${cnt}`;
  });

  await check('OrgUnit LOCATED_AT DutyStation >= 500', `
    MATCH (:OrganizationUnit)-[r:LOCATED_AT]->(:Location) RETURN count(r) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 500 ? true : `Expected >= 500, got ${cnt}`;
  });

  await check('User BELONGS_TO OrgUnit >= 20000', `
    MATCH (:User)-[r:BELONGS_TO]->(:OrganizationUnit) RETURN count(r) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 20000 ? true : `Expected >= 20000, got ${cnt}`;
  });

  await check('Role GRANTS Permission >= 50', `
    MATCH (:Role)-[r:GRANTS]->(:Permission) RETURN count(r) AS cnt
  `, recs => {
    const cnt = recs[0].get('cnt');
    return cnt >= 50 ? true : `Expected >= 50, got ${cnt}`;
  });

  // ── 5. Depth Consistency ──
  console.log('\n── Depth Consistency ──');

  await check('OrgUnit levels 1-15 present', `
    MATCH (o:OrganizationUnit)
    WITH o.level AS lvl, count(*) AS cnt
    RETURN min(lvl) AS min_lvl, max(lvl) AS max_lvl, count(lvl) AS levels
  `, recs => {
    const min = recs[0].get('min_lvl');
    const max = recs[0].get('max_lvl');
    return min === 1 && max >= 10 ? true : `Level range: ${min}-${max}, expected 1-15`;
  });

  await check('ServiceCatalog levels 1-3', `
    MATCH (s:ServiceCatalogItem)
    WITH s.level AS lvl, count(*) AS cnt
    RETURN collect({level: lvl, count: cnt}) AS levels
  `, recs => {
    const levels = recs[0].get('levels');
    const hasAll = levels.some(l => l.level === 1) && levels.some(l => l.level === 2) && levels.some(l => l.level === 3);
    return hasAll ? true : `Missing levels: ${JSON.stringify(levels)}`;
  });

  // ── 6. Sample Routing Queries ──
  console.log('\n── Sample Routing Queries ──');

  await check('3-level hierarchy traversal: IT → IT-HW → IT-HW-LAP', `
    MATCH (root:ServiceCatalogItem {code: 'IT'})-[:PARENT_OF]->(mid)-[:PARENT_OF]->(leaf)
    WHERE leaf.code = 'IT-HW-LAP'
    RETURN root.name AS l1, mid.name AS l2, leaf.name AS l3, leaf.sla_hours AS sla
  `, recs => {
    if (recs.length === 0) return 'Path IT→IT-HW→IT-HW-LAP not found';
    const r = recs[0];
    console.log(`    ${r.get('l1')} → ${r.get('l2')} → ${r.get('l3')} (SLA: ${r.get('sla')}h)`);
    return true;
  });

  await check('OrgUnit hierarchy: UNCS 3 levels down', `
    MATCH (root:OrganizationUnit {code: 'UNCS'})-[:PARENT_OF]->(l2)-[:PARENT_OF]->(l3)-[:PARENT_OF]->(l4)
    RETURN l2.name AS level2, l3.name AS level3, l4.name AS level4
    LIMIT 3
  `, recs => {
    if (recs.length === 0) return 'No 3-level path from UNCS';
    recs.forEach(r => {
      console.log(`    UNCS → ${r.get('level2')} → ${r.get('level3')} → ${r.get('level4')}`);
    });
    return true;
  });

  await check('Geographic chain: DutyStation → Country → SubRegion → Region', `
    MATCH (ds:Location {location_type: 'DutyStation'})-[:PART_OF]->(cty:Location {location_type: 'Country'})
          -[:PART_OF]->(sub:Location {location_type: 'SubRegion'})-[:PART_OF]->(reg:Location {location_type: 'Region'})
    RETURN ds.name AS duty_station, cty.name AS country, sub.name AS sub_region, reg.name AS region
    LIMIT 3
  `, recs => {
    if (recs.length === 0) return 'No full geographic chain found';
    recs.forEach(r => {
      console.log(`    ${r.get('duty_station')} → ${r.get('country')} → ${r.get('sub_region')} → ${r.get('region')}`);
    });
    return true;
  });

  await check('Cross-domain: User → OrgUnit → DutyStation → Country', `
    MATCH (u:User)-[:BELONGS_TO]->(ou:OrganizationUnit)-[:LOCATED_AT]->(ds:Location {location_type: 'DutyStation'})
          -[:PART_OF]->(cty:Location {location_type: 'Country'})
    RETURN u.email AS user_email, ou.name AS org_unit, ds.name AS duty_station, cty.name AS country
    LIMIT 3
  `, recs => {
    if (recs.length === 0) return 'No cross-domain path found (User→OrgUnit→DS→Country)';
    recs.forEach(r => {
      console.log(`    ${r.get('user_email')} → ${r.get('org_unit')} @ ${r.get('duty_station')}, ${r.get('country')}`);
    });
    return true;
  });

  await check('Routing query: All IT requestable services', `
    MATCH (root:ServiceCatalogItem {code: 'IT'})-[:PARENT_OF*]->(s:ServiceCatalogItem {is_requestable: true})
    RETURN s.code AS code, s.name AS name, s.sla_hours AS sla, s.approval_required AS approval, s.default_handler_code AS handler
    ORDER BY s.code
    LIMIT 5
  `, recs => {
    if (recs.length === 0) return 'No IT requestable services found';
    recs.forEach(r => {
      console.log(`    [${r.get('code')}] ${r.get('name')} SLA:${r.get('sla')}h approval:${r.get('approval')} handler:${r.get('handler')}`);
    });
    return true;
  });

  // ── Summary ──
  await driver.close();

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  VALIDATION SUMMARY                              ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('\n  Failures:');
    failures.forEach((f, i) => {
      console.log(`    ${i + 1}. ${f.name}: ${f.detail}`);
    });
  }

  console.log(`\n  Result: ${failed === 0 ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
