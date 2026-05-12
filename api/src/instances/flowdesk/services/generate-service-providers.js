'use strict';

/**
 * TASK-FLOWDESK-003: Generate Granular Service Provider HANDLED_BY Edges
 *
 * Creates mission-level and regional HANDLED_BY edges with priority:
 *   priority 1 = mission-local handler
 *   priority 2 = regional handler (RSCE, etc.)
 *   priority 3 = global HQ fallback
 *
 * Usage: node api/src/services/flowdesk/generate-service-providers.js
 */

const neo4j = require('neo4j-driver');
const { MEMGRAPH_CONFIG } = require('./import-config.js');

let driver;

function getSession() {
  return driver.session({ defaultAccessMode: neo4j.session.WRITE });
}

async function run(cypher, params = {}) {
  const session = getSession();
  try {
    return await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

// ─── Global Handler Mapping (from TASK-002) ───
const GLOBAL_HANDLERS = {
  IT:  { orgId: '29',    code: 'OICT',    name: 'Office of ICT' },
  HR:  { orgId: '174',   code: 'dm ohrm', name: 'OHRM' },
  FAC: { orgId: '4',     code: 'UNHQ-DM', name: 'Department of Management' },
  FIN: { orgId: '4',     code: 'UNHQ-DM', name: 'Department of Management' },
  SEC: { orgId: '5',     code: 'DSS',     name: 'Department of Safety and Security' },
  COM: { orgId: '456',   code: 'dpi cpm', name: 'Communications Division' },
  LOG: { orgId: '4',     code: 'UNHQ-DM', name: 'Department of Management' },
  LEG: { orgId: '12025', code: 'OLA',     name: 'Office of Legal Affairs' },
};

// ─── Service provider patterns per domain ───
// Each pattern defines how to find mission-level service units
const DOMAIN_PATTERNS = {
  IT: {
    // ICT units: codes containing RICTS, ICTS, ICT (not DICT, EDICT, ICTR, ICTY)
    unitCodes: ['RICTS', 'ICTS-EBB', 'ICTS', 'REGICTOFF', 'RICTSERVMNGR', 'ICT', 'CRICTS', 'FICTSS'],
    namePatterns: ['ICT Section', 'ICT Unit', 'Information and Communications Technology'],
    minLevel: 7,
    maxLevel: 10,
    // Exclude false positives
    excludeIds: ['1318', '2520'], // ICTR, ICTY
  },
  HR: {
    unitCodes: ['HR', 'HRS', 'HRU', 'CIVPERS', 'PER', 'PERS', 'HR-RSCE', 'Human Resources'],
    namePatterns: ['Human Resources', 'Personnel Section'],
    minLevel: 7,
    maxLevel: 9,
    excludeIds: [],
  },
  FAC: {
    unitCodes: ['GSS', 'GS', 'FMU', 'ENG'],
    namePatterns: ['General Services', 'Facilities Management', 'Engineering Section'],
    minLevel: 7,
    maxLevel: 9,
    excludeIds: [],
  },
  SEC: {
    // UNDSS country offices are separate from DSS — they're missions at L4
    unitCodes: ['UNDSS-BFA', 'UNDSS-EQG', 'UNDSS-GIN', 'UNDSS-Mali', 'UNDSS-NER',
                'UNDSS-RWA', 'UNDSS-SEN', 'UNDSS-SDN', 'UNDSS-STP', 'UNDSS-UGA', 'UNDSS-ZWE'],
    namePatterns: [],
    minLevel: 3,
    maxLevel: 5,
    excludeIds: [],
  },
};

async function findMissionServiceUnits(domain) {
  const pattern = DOMAIN_PATTERNS[domain];
  if (!pattern) return [];

  // Build WHERE clause
  const conditions = [];
  if (pattern.unitCodes.length > 0) {
    conditions.push('o.code IN $codes');
  }
  for (let i = 0; i < pattern.namePatterns.length; i++) {
    conditions.push(`o.name CONTAINS $np${i}`);
  }
  const where = conditions.join(' OR ');

  const params = { codes: pattern.unitCodes };
  pattern.namePatterns.forEach((np, i) => { params[`np${i}`] = np; });

  const result = await run(`
    MATCH (o:OrganizationUnit)
    WHERE (${where})
      AND o.level >= $minLevel AND o.level <= $maxLevel
      AND o.is_active = true
      AND NOT o.id IN $excludeIds
    RETURN o.id AS id, o.code AS code, o.name AS name, o.level AS level,
           o.hierarchy_path AS path, o.is_mission AS is_mission
    ORDER BY o.level
  `, { ...params, minLevel: pattern.minLevel, maxLevel: pattern.maxLevel, excludeIds: pattern.excludeIds });

  return result.records.map(r => ({
    id: r.get('id'),
    code: r.get('code'),
    name: r.get('name'),
    level: r.get('level'),
    path: r.get('path'),
    isMission: r.get('is_mission'),
  }));
}

/**
 * For a service unit, find its parent mission (L5 ancestor) from hierarchy_path.
 */
async function resolveMissionForUnit(unit) {
  if (!unit.path) return null;
  const parts = unit.path.split('/');
  // L5 ancestor = parts[4], L4 ancestor = parts[3]
  // Try L5 first, then L4
  for (const idx of [4, 3]) {
    if (parts.length > idx) {
      const ancestorId = parts[idx];
      const r = await run(`
        MATCH (m:OrganizationUnit {id: $id})
        RETURN m.id AS id, m.code AS code, m.name AS name, m.is_mission AS is_mission
      `, { id: ancestorId });
      if (r.records.length > 0) {
        return {
          id: r.records[0].get('id'),
          code: r.records[0].get('code'),
          name: r.records[0].get('name'),
          isMission: r.records[0].get('is_mission'),
        };
      }
    }
  }
  return null;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Generate Granular Service Provider HANDLED_BY   ║');
  console.log('╚══════════════════════════════════════════════════╝');

  driver = neo4j.driver(
    MEMGRAPH_CONFIG.uri,
    neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password),
    { disableLosslessIntegers: true }
  );
  await driver.verifyConnectivity();

  // Step 1: Remove existing HANDLED_BY edges
  console.log('\n── Step 1: Remove existing HANDLED_BY edges ──');
  const deleted = await run('MATCH ()-[r:HANDLED_BY]->() DELETE r RETURN count(r) AS cnt');
  console.log(`  Deleted: ${deleted.records[0].get('cnt')} edges`);

  // Step 2: Discover mission-level service units per domain
  console.log('\n── Step 2: Discover mission-level service units ──');

  const missionHandlers = {}; // domain → [{serviceUnitId, missionId, missionCode, priority}]

  for (const domain of Object.keys(DOMAIN_PATTERNS)) {
    const units = await findMissionServiceUnits(domain);
    console.log(`\n  ${domain}: Found ${units.length} service units`);

    missionHandlers[domain] = [];

    // For SEC, the UNDSS units ARE the handlers themselves (they're missions)
    if (domain === 'SEC') {
      for (const unit of units) {
        missionHandlers[domain].push({
          serviceUnitId: unit.id,
          serviceUnitCode: unit.code,
          missionId: unit.id,
          missionCode: unit.code,
          priority: 1,
          scopeType: 'mission',
        });
        console.log(`    ${unit.code} → self (UNDSS country office)`);
      }
      continue;
    }

    // For other domains, resolve parent mission
    const seen = new Set(); // prevent duplicate mission+domain combos
    for (const unit of units) {
      const mission = await resolveMissionForUnit(unit);
      if (!mission) continue;

      const key = `${domain}-${mission.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Determine priority: RSCE Cluster = regional (priority 2), specific mission = local (priority 1)
      const isRegional = unit.code.includes('RSCE') || unit.code.includes('RICTS') || unit.code.includes('REGICTOFF');
      const priority = isRegional ? 2 : 1;
      const scopeType = isRegional ? 'regional' : 'mission';

      missionHandlers[domain].push({
        serviceUnitId: unit.id,
        serviceUnitCode: unit.code,
        missionId: mission.id,
        missionCode: mission.code,
        priority,
        scopeType,
      });
      console.log(`    ${unit.code} → mission: ${mission.code} (${scopeType}, priority:${priority})`);
    }
  }

  // Step 3: Create HANDLED_BY edges
  console.log('\n── Step 3: Create HANDLED_BY edges ──');

  let totalEdges = 0;

  // 3a: Mission/Regional HANDLED_BY (ServiceCatalogItem → mission service unit)
  for (const [domain, handlers] of Object.entries(missionHandlers)) {
    if (handlers.length === 0) continue;

    for (const handler of handlers) {
      const result = await run(`
        MATCH (s:ServiceCatalogItem)
        WHERE s.default_handler_code IS NOT NULL
          AND s.code STARTS WITH $domainPrefix
        MATCH (h:OrganizationUnit {id: $handlerId})
        MERGE (s)-[r:HANDLED_BY]->(h)
        SET r.scope_type = $scopeType,
            r.priority = $priority,
            r.handler_code = $handlerCode,
            r.mission_id = $missionId,
            r.auto_generated = true
        RETURN count(r) AS cnt
      `, {
        domainPrefix: domain + '-',
        handlerId: handler.serviceUnitId,
        scopeType: handler.scopeType,
        priority: handler.priority,
        handlerCode: handler.serviceUnitCode,
        missionId: handler.missionId,
      });
      totalEdges += result.records[0].get('cnt');
    }
    console.log(`  ${domain} mission/regional: created edges for ${handlers.length} handlers`);
  }

  // 3b: Also create edges for L1 and L2 categories to mission handlers
  for (const [domain, handlers] of Object.entries(missionHandlers)) {
    for (const handler of handlers) {
      await run(`
        MATCH (s:ServiceCatalogItem)
        WHERE s.default_handler_code IS NOT NULL
          AND s.code STARTS WITH $domainPrefix
          AND s.level < 3
        MATCH (h:OrganizationUnit {id: $handlerId})
        MERGE (s)-[r:HANDLED_BY]->(h)
        SET r.scope_type = $scopeType, r.priority = $priority, r.auto_generated = true
      `, {
        domainPrefix: domain + '-',
        handlerId: handler.serviceUnitId,
        scopeType: handler.scopeType,
        priority: handler.priority,
      });
    }
  }

  // 3c: Global fallback HANDLED_BY (all ServiceCatalogItems → global handler)
  console.log('\n  Creating global fallback handlers...');
  for (const [domain, handler] of Object.entries(GLOBAL_HANDLERS)) {
    const result = await run(`
      MATCH (s:ServiceCatalogItem)
      WHERE s.default_handler_code IS NOT NULL
        AND (s.code = $domain OR s.code STARTS WITH $domainPrefix)
      MATCH (h:OrganizationUnit {id: $handlerId})
      MERGE (s)-[r:HANDLED_BY]->(h)
      SET r.scope_type = 'global',
          r.priority = 3,
          r.handler_code = $handlerCode,
          r.auto_generated = true
      RETURN count(r) AS cnt
    `, {
      domain,
      domainPrefix: domain + '-',
      handlerId: handler.orgId,
      handlerCode: handler.code,
    });
    const cnt = result.records[0].get('cnt');
    totalEdges += cnt;
    console.log(`  ${domain} → ${handler.code} (global, priority:3): ${cnt} edges`);
  }

  // Step 4: Verify
  console.log('\n── Step 4: Verification ──');
  const totalHandledBy = await run('MATCH ()-[r:HANDLED_BY]->() RETURN count(r) AS cnt');
  console.log(`  Total HANDLED_BY edges: ${totalHandledBy.records[0].get('cnt')}`);

  const byScope = await run(`
    MATCH ()-[r:HANDLED_BY]->()
    WITH r.scope_type AS scope, r.priority AS priority, count(r) AS cnt
    RETURN scope, priority, cnt
    ORDER BY priority
  `);
  console.log('  By scope:');
  byScope.records.forEach(r => console.log(`    ${r.get('scope')} (priority ${r.get('priority')}): ${r.get('cnt')} edges`));

  // Verify every L3 requestable service has at least one global fallback
  const noFallback = await run(`
    MATCH (s:ServiceCatalogItem {level: 3, is_requestable: true})
    WHERE NOT (s)-[:HANDLED_BY {scope_type: 'global'}]->()
    RETURN s.code AS code, s.name AS name
  `);
  if (noFallback.records.length > 0) {
    console.log(`\n  WARNING: ${noFallback.records.length} services WITHOUT global fallback:`);
    noFallback.records.forEach(r => console.log(`    ${r.get('code')}: ${r.get('name')}`));
  } else {
    console.log('  All requestable services have global fallback handler ✓');
  }

  await driver.close();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
