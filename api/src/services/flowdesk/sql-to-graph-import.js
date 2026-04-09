'use strict';

/**
 * TASK-FLOWDESK-001 Phase 3: SQL Server → Memgraph Import Pipeline
 *
 * Imports FlowDesk master data from SQL Server into Memgraph as a knowledge graph
 * for AI-driven service request routing.
 *
 * Usage: node api/src/services/flowdesk/sql-to-graph-import.js [--dry-run]
 */

const sql = require('mssql');
const neo4j = require('neo4j-driver');
const { MSSQL_CONFIG, MEMGRAPH_CONFIG, IMPORT_CONFIG } = require('./import-config');
const { NODE_LABELS, REL_TYPES, LOCATION_TYPES, INDEX_STATEMENTS } = require('./graph-schema');

const DRY_RUN = process.argv.includes('--dry-run');
const NOW = new Date().toISOString();

// ─── Stats & Error Tracking ───

const stats = { nodes: {}, edges: {}, errors: [] };

function incStat(category, label, count = 1) {
  if (!stats[category][label]) stats[category][label] = 0;
  stats[category][label] += count;
}

function trackError(phase, message, detail) {
  stats.errors.push({ phase, message, detail: String(detail).slice(0, 200) });
}

// ─── Memgraph Helpers ───

let driver;

function getSession() {
  return driver.session({ defaultAccessMode: neo4j.session.WRITE });
}

/**
 * Run a Cypher query in a write transaction.
 */
async function runCypher(cypher, params = {}) {
  if (DRY_RUN) return { records: [] };
  const session = getSession();
  try {
    const result = await session.executeWrite(tx => tx.run(cypher, params));
    return result;
  } finally {
    await session.close();
  }
}

/**
 * Batch-MERGE nodes. Sends `rows` in chunks of batchSize.
 * `cypherTemplate` must use $rows as UNWIND parameter.
 */
async function batchMerge(label, rows, cypherTemplate) {
  const { batchSize, logEvery } = IMPORT_CONFIG;
  let processed = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    try {
      await runCypher(cypherTemplate, { rows: chunk });
    } catch (err) {
      trackError(`batch-${label}`, `Batch ${i}-${i + chunk.length} failed`, err.message);
    }
    processed += chunk.length;
    if (processed % logEvery === 0 || processed === rows.length) {
      console.log(`  [${label}] ${processed}/${rows.length}`);
    }
  }
  incStat('nodes', label, rows.length);
}

/**
 * Batch-MERGE edges.
 */
async function batchMergeEdges(label, rows, cypherTemplate) {
  const { batchSize, logEvery } = IMPORT_CONFIG;
  let processed = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    try {
      await runCypher(cypherTemplate, { rows: chunk });
    } catch (err) {
      trackError(`edge-${label}`, `Batch ${i}-${i + chunk.length} failed`, err.message);
    }
    processed += chunk.length;
    if (processed % logEvery === 0 || processed === rows.length) {
      console.log(`  [${label}] ${processed}/${rows.length} edges`);
    }
  }
  incStat('edges', label, rows.length);
}

// ─── SQL Fetch Helpers ───

let sqlPool;

async function fetchSql(query) {
  const result = await sqlPool.request().query(query);
  return result.recordset;
}

// ─── Import Functions ───

async function importLocationsRegion() {
  console.log('\n── Importing Location(Region) ──');
  const rows = await fetchSql('SELECT RegionId, RegionCode, Name FROM LK_Regions');
  const mapped = rows.map(r => ({
    id: `reg-${r.RegionId}`,
    name: r.Name,
    location_type: LOCATION_TYPES.REGION,
    code: r.RegionCode,
    source_table: 'LK_Regions',
    source_id: String(r.RegionId),
    imported_at: NOW,
  }));
  await batchMerge('Location:Region', mapped, `
    UNWIND $rows AS r
    MERGE (l:Location {id: r.id})
    SET l.name = r.name, l.location_type = r.location_type, l.code = r.code,
        l.source_table = r.source_table, l.source_id = r.source_id, l.imported_at = r.imported_at
  `);
  return mapped;
}

async function importLocationsSubRegion() {
  console.log('\n── Importing Location(SubRegion) ──');
  const rows = await fetchSql('SELECT SubRegionId, RegionId, SubRegionCode, Name FROM LK_SubRegions');
  const mapped = rows.map(r => ({
    id: `sub-${r.SubRegionId}`,
    name: r.Name,
    location_type: LOCATION_TYPES.SUB_REGION,
    code: r.SubRegionCode,
    parent_id: `reg-${r.RegionId}`,
    source_table: 'LK_SubRegions',
    source_id: String(r.SubRegionId),
    imported_at: NOW,
  }));
  await batchMerge('Location:SubRegion', mapped, `
    UNWIND $rows AS r
    MERGE (l:Location {id: r.id})
    SET l.name = r.name, l.location_type = r.location_type, l.code = r.code,
        l.source_table = r.source_table, l.source_id = r.source_id, l.imported_at = r.imported_at
  `);
  return mapped;
}

async function importLocationsCountry() {
  console.log('\n── Importing Location(Country) ──');
  const rows = await fetchSql(`
    SELECT CountryId, Name, ISO2_Code, ISO3_Code, RegionId, SubRegionId
    FROM LK_Countries_ISO WHERE Active = 1
  `);
  const mapped = rows.map(r => ({
    id: `cty-${r.CountryId}`,
    name: r.Name,
    location_type: LOCATION_TYPES.COUNTRY,
    iso2_code: r.ISO2_Code,
    iso3_code: r.ISO3_Code,
    parent_id: r.SubRegionId ? `sub-${r.SubRegionId}` : (r.RegionId ? `reg-${r.RegionId}` : null),
    source_table: 'LK_Countries_ISO',
    source_id: String(r.CountryId),
    imported_at: NOW,
  }));
  await batchMerge('Location:Country', mapped, `
    UNWIND $rows AS r
    MERGE (l:Location {id: r.id})
    SET l.name = r.name, l.location_type = r.location_type,
        l.iso2_code = r.iso2_code, l.iso3_code = r.iso3_code,
        l.source_table = r.source_table, l.source_id = r.source_id, l.imported_at = r.imported_at
  `);
  return mapped;
}

async function importLocationsDutyStation() {
  console.log('\n── Importing Location(DutyStation) ──');
  // JOIN through City to get country ISO3 code for PART_OF linking
  const rows = await fetchSql(`
    SELECT ds.DutyStationId, ds.Name, ds.TimeZoneId,
           c.Country_ISO3_Code, ci.CountryId as CityCountryId
    FROM LK_DutyStations ds
    LEFT JOIN LK_City c ON ds.CityId = c.CityId
    LEFT JOIN LK_Countries_ISO ci ON c.Country_ISO3_Code = ci.ISO3_Code AND ci.Active = 1
    WHERE ds.IsActive = 1
  `);
  const mapped = rows.map(r => ({
    id: `ds-${r.DutyStationId}`,
    name: r.Name,
    location_type: LOCATION_TYPES.DUTY_STATION,
    timezone_id: r.TimeZoneId,
    country_iso3: r.Country_ISO3_Code || null,
    parent_id: r.CityCountryId ? `cty-${r.CityCountryId}` : null,
    source_table: 'LK_DutyStations',
    source_id: String(r.DutyStationId),
    imported_at: NOW,
  }));
  await batchMerge('Location:DutyStation', mapped, `
    UNWIND $rows AS r
    MERGE (l:Location {id: r.id})
    SET l.name = r.name, l.location_type = r.location_type,
        l.timezone_id = r.timezone_id, l.country_iso3 = r.country_iso3,
        l.source_table = r.source_table, l.source_id = r.source_id, l.imported_at = r.imported_at
  `);
  return mapped;
}

async function importLocationPartOfEdges(subRegions, countries, dutyStations) {
  console.log('\n── Creating Location PART_OF edges ──');

  // SubRegion → Region
  const subRegionEdges = subRegions.map(r => ({ from: r.id, to: r.parent_id }));
  await batchMergeEdges('PART_OF:SubRegion→Region', subRegionEdges, `
    UNWIND $rows AS r
    MATCH (child:Location {id: r.from}), (parent:Location {id: r.to})
    MERGE (child)-[:PART_OF]->(parent)
  `);

  // Country → SubRegion/Region
  const countryEdges = countries.filter(r => r.parent_id).map(r => ({ from: r.id, to: r.parent_id }));
  await batchMergeEdges('PART_OF:Country→SubRegion', countryEdges, `
    UNWIND $rows AS r
    MATCH (child:Location {id: r.from}), (parent:Location {id: r.to})
    MERGE (child)-[:PART_OF]->(parent)
  `);

  // DutyStation → Country
  const dsEdges = dutyStations.filter(r => r.parent_id).map(r => ({ from: r.id, to: r.parent_id }));
  await batchMergeEdges('PART_OF:DS→Country', dsEdges, `
    UNWIND $rows AS r
    MATCH (child:Location {id: r.from}), (parent:Location {id: r.to})
    MERGE (child)-[:PART_OF]->(parent)
  `);
}

async function importRoles() {
  console.log('\n── Importing Roles ──');
  const rows = await fetchSql(`
    SELECT r.RoleId, r.RoleCode, r.RoleName, r.Description, r.IsAdmin, r.IsActive,
           rt.RoleTypeName
    FROM Roles r
    JOIN RoleTypes rt ON r.RoleTypeId = rt.RoleTypeId
    WHERE r.IsActive = 1
  `);
  const mapped = rows.map(r => ({
    id: String(r.RoleId),
    code: r.RoleCode,
    name: r.RoleName,
    description: r.Description,
    role_type: r.RoleTypeName,
    is_admin: r.IsAdmin,
    source_table: 'Roles',
    source_id: String(r.RoleId),
    imported_at: NOW,
  }));
  await batchMerge('Role', mapped, `
    UNWIND $rows AS r
    MERGE (role:Role {id: r.id})
    SET role.code = r.code, role.name = r.name, role.description = r.description,
        role.role_type = r.role_type, role.is_admin = r.is_admin,
        role.source_table = r.source_table, role.source_id = r.source_id, role.imported_at = r.imported_at
  `);
}

async function importPermissions() {
  console.log('\n── Importing Permissions ──');
  const rows = await fetchSql(`
    SELECT p.PermissionId, p.PermissionCode, p.PermissionName, p.Description,
           p.IsModal, p.Visible, p.Executable,
           pc.CategoryName
    FROM Permissions p
    JOIN PermissionCategories pc ON p.PermissionCategoryId = pc.PermissionCategoryId
  `);
  const mapped = rows.map(r => ({
    id: String(r.PermissionId),
    code: r.PermissionCode,
    name: r.PermissionName,
    description: r.Description,
    category: r.CategoryName,
    is_modal: r.IsModal,
    visible: r.Visible,
    executable: r.Executable,
    source_table: 'Permissions',
    source_id: String(r.PermissionId),
    imported_at: NOW,
  }));
  await batchMerge('Permission', mapped, `
    UNWIND $rows AS r
    MERGE (p:Permission {id: r.id})
    SET p.code = r.code, p.name = r.name, p.description = r.description,
        p.category = r.category, p.is_modal = r.is_modal,
        p.visible = r.visible, p.executable = r.executable,
        p.source_table = r.source_table, p.source_id = r.source_id, p.imported_at = r.imported_at
  `);
}

async function importRoleGrantsEdges() {
  console.log('\n── Creating Role GRANTS Permission edges ──');
  const rows = await fetchSql(`
    SELECT RoleId, PermissionId, Visible, Executable FROM RolePermissions
  `);
  const mapped = rows.map(r => ({
    from: String(r.RoleId),
    to: String(r.PermissionId),
    visible: r.Visible,
    executable: r.Executable,
  }));
  await batchMergeEdges('GRANTS', mapped, `
    UNWIND $rows AS r
    MATCH (role:Role {id: r.from}), (perm:Permission {id: r.to})
    MERGE (role)-[g:GRANTS]->(perm)
    SET g.visible = r.visible, g.executable = r.executable
  `);
}

async function importOrganizationUnits() {
  console.log('\n── Importing OrganizationUnits ──');
  const activeFilter = IMPORT_CONFIG.activeOnly ? 'WHERE IsActive = 1' : '';
  const rows = await fetchSql(`
    SELECT OrgUnitId, ParentOrgUnitId, UnitCode, UnitName, UnitType,
           Level, HierarchyPath, IsMission, IsActive
    FROM OrganizationUnits ${activeFilter}
  `);
  // Pass 1: Create all nodes
  const mapped = rows.map(r => ({
    id: String(r.OrgUnitId),
    code: r.UnitCode,
    name: r.UnitName,
    unit_type: r.UnitType,
    level: r.Level,
    hierarchy_path: r.HierarchyPath,
    is_mission: r.IsMission,
    is_active: r.IsActive,
    source_table: 'OrganizationUnits',
    source_id: String(r.OrgUnitId),
    imported_at: NOW,
  }));
  await batchMerge('OrganizationUnit', mapped, `
    UNWIND $rows AS r
    MERGE (o:OrganizationUnit {id: r.id})
    SET o.code = r.code, o.name = r.name, o.unit_type = r.unit_type,
        o.level = r.level, o.hierarchy_path = r.hierarchy_path,
        o.is_mission = r.is_mission, o.is_active = r.is_active,
        o.source_table = r.source_table, o.source_id = r.source_id, o.imported_at = r.imported_at
  `);

  // Pass 2: PARENT_OF edges
  console.log('\n── Creating OrgUnit PARENT_OF edges ──');
  const edges = rows
    .filter(r => r.ParentOrgUnitId != null)
    .map(r => ({ parent: String(r.ParentOrgUnitId), child: String(r.OrgUnitId) }));
  await batchMergeEdges('PARENT_OF:OrgUnit', edges, `
    UNWIND $rows AS r
    MATCH (parent:OrganizationUnit {id: r.parent}), (child:OrganizationUnit {id: r.child})
    MERGE (parent)-[:PARENT_OF]->(child)
  `);

  // MANAGED_BY edges (OrgUnit → User, where ManagerUserId exists)
  console.log('\n── Creating OrgUnit MANAGED_BY User edges ──');
  const mgrRows = await fetchSql(`
    SELECT OrgUnitId, ManagerUserId FROM OrganizationUnits
    WHERE ManagerUserId IS NOT NULL AND IsActive = 1
  `);
  const mgrEdges = mgrRows.map(r => ({
    org: String(r.OrgUnitId),
    user: String(r.ManagerUserId),
  }));
  if (mgrEdges.length > 0) {
    await batchMergeEdges('MANAGED_BY', mgrEdges, `
      UNWIND $rows AS r
      MATCH (o:OrganizationUnit {id: r.org}), (u:User {id: r.user})
      MERGE (o)-[:MANAGED_BY]->(u)
    `);
  }
}

async function importServiceCatalog() {
  console.log('\n── Importing ServiceCatalog ──');
  const rows = await fetchSql(`
    SELECT ServiceId, ParentServiceId, ServiceCode, DisplayName,
           BriefDescription, DetailedDescription, HierarchyLevel, HierarchyPath,
           IsRequestable, IsBundle, DefaultSlaHours, ApprovalRequired
    FROM ServiceCatalog WHERE IsActive = 1
  `);

  // Derive default_handler_code from ServiceCode prefix
  function deriveHandlerCode(code) {
    const prefix = code.split('-')[0];
    const handlerMap = {
      IT: 'ICTS', HR: 'OHRM', FAC: 'DGACM', FIN: 'DM',
      SEC: 'DSS', COM: 'DGC', LOG: 'DOS', LEG: 'OLA',
    };
    return handlerMap[prefix] || null;
  }

  const mapped = rows.map(r => ({
    id: String(r.ServiceId),
    code: r.ServiceCode,
    name: r.DisplayName,
    description: r.BriefDescription || '',
    detailed_description: r.DetailedDescription || '',
    level: r.HierarchyLevel,
    hierarchy_path: r.HierarchyPath,
    is_requestable: r.IsRequestable,
    is_bundle: r.IsBundle,
    sla_hours: r.DefaultSlaHours,
    approval_required: r.ApprovalRequired,
    gxe_graph_id: null,
    default_handler_code: deriveHandlerCode(r.ServiceCode),
    parent_id: r.ParentServiceId ? String(r.ParentServiceId) : null,
    source_table: 'ServiceCatalog',
    source_id: String(r.ServiceId),
    imported_at: NOW,
  }));

  // Pass 1: Create all nodes
  await batchMerge('ServiceCatalogItem', mapped, `
    UNWIND $rows AS r
    MERGE (s:ServiceCatalogItem {id: r.id})
    SET s.code = r.code, s.name = r.name, s.description = r.description,
        s.level = r.level, s.hierarchy_path = r.hierarchy_path,
        s.is_requestable = r.is_requestable, s.is_bundle = r.is_bundle,
        s.sla_hours = r.sla_hours, s.approval_required = r.approval_required,
        s.gxe_graph_id = r.gxe_graph_id, s.default_handler_code = r.default_handler_code,
        s.source_table = r.source_table, s.source_id = r.source_id, s.imported_at = r.imported_at
  `);

  // Pass 2: PARENT_OF edges
  console.log('\n── Creating ServiceCatalog PARENT_OF edges ──');
  const edges = mapped
    .filter(r => r.parent_id)
    .map(r => ({ parent: r.parent_id, child: r.id }));
  await batchMergeEdges('PARENT_OF:Service', edges, `
    UNWIND $rows AS r
    MATCH (parent:ServiceCatalogItem {id: r.parent}), (child:ServiceCatalogItem {id: r.child})
    MERGE (parent)-[:PARENT_OF]->(child)
  `);
}

async function importUsers() {
  console.log('\n── Importing Users ──');
  const rows = await fetchSql(`
    SELECT UserId, Email, DisplayName, FunctionalTitle,
           PrimaryOrgUnitId, IsVip
    FROM Users WHERE IsActive = 1
  `);
  const mapped = rows.map(r => ({
    id: String(r.UserId),
    email: r.Email,
    display_name: r.DisplayName || '',
    functional_title: r.FunctionalTitle || '',
    is_vip: r.IsVip,
    org_unit_id: r.PrimaryOrgUnitId ? String(r.PrimaryOrgUnitId) : null,
    source_table: 'Users',
    source_id: String(r.UserId),
    imported_at: NOW,
  }));
  await batchMerge('User', mapped, `
    UNWIND $rows AS r
    MERGE (u:User {id: r.id})
    SET u.email = r.email, u.display_name = r.display_name,
        u.functional_title = r.functional_title, u.is_vip = r.is_vip,
        u.source_table = r.source_table, u.source_id = r.source_id, u.imported_at = r.imported_at
  `);

  // BELONGS_TO edges
  console.log('\n── Creating User BELONGS_TO OrgUnit edges ──');
  const edges = mapped.filter(r => r.org_unit_id).map(r => ({
    user: r.id,
    org: r.org_unit_id,
  }));
  await batchMergeEdges('BELONGS_TO', edges, `
    UNWIND $rows AS r
    MATCH (u:User {id: r.user}), (o:OrganizationUnit {id: r.org})
    MERGE (u)-[:BELONGS_TO]->(o)
  `);
}

async function importOrgDutyStationEdges() {
  console.log('\n── Creating OrgUnit LOCATED_AT DutyStation edges ──');
  const rows = await fetchSql(`
    SELECT OrgUnitId, DutyStationId
    FROM LK_Organization_DutyStation WHERE IsActive = 1
  `);
  const mapped = rows.map(r => ({
    org: String(r.OrgUnitId),
    ds: `ds-${r.DutyStationId}`,
  }));
  await batchMergeEdges('LOCATED_AT', mapped, `
    UNWIND $rows AS r
    MATCH (o:OrganizationUnit {id: r.org}), (l:Location {id: r.ds})
    MERGE (o)-[:LOCATED_AT]->(l)
  `);
}

async function importUserRoles() {
  console.log('\n── Creating User HAS_ROLE edges ──');
  const rows = await fetchSql(`
    SELECT UserId, RoleId, RegionId, SubRegionId, CountryId,
           OrgUnitId, DutyStationId, AreaId, BuildingId, RoomId
    FROM UserRoles WHERE IsActive = 1
  `);
  const mapped = rows.map(r => {
    // Determine scope type and scope_id
    let scope_type = 'global';
    let scope_id = null;
    if (r.RoomId) { scope_type = 'Room'; scope_id = String(r.RoomId); }
    else if (r.BuildingId) { scope_type = 'Building'; scope_id = String(r.BuildingId); }
    else if (r.AreaId) { scope_type = 'Area'; scope_id = String(r.AreaId); }
    else if (r.DutyStationId) { scope_type = 'DutyStation'; scope_id = `ds-${r.DutyStationId}`; }
    else if (r.OrgUnitId) { scope_type = 'OrgUnit'; scope_id = String(r.OrgUnitId); }
    else if (r.CountryId) { scope_type = 'Country'; scope_id = `cty-${r.CountryId}`; }
    else if (r.SubRegionId) { scope_type = 'SubRegion'; scope_id = `sub-${r.SubRegionId}`; }
    else if (r.RegionId) { scope_type = 'Region'; scope_id = `reg-${r.RegionId}`; }
    return {
      user: String(r.UserId),
      role: String(r.RoleId),
      scope_type,
      scope_id,
    };
  });
  if (mapped.length > 0) {
    await batchMergeEdges('HAS_ROLE', mapped, `
      UNWIND $rows AS r
      MATCH (u:User {id: r.user}), (role:Role {id: r.role})
      MERGE (u)-[hr:HAS_ROLE {scope_type: r.scope_type}]->(role)
      SET hr.scope_id = r.scope_id
    `);
  }
}

async function createIndexes() {
  console.log('\n── Creating Indexes ──');
  // Memgraph requires auto-commit (implicit) transactions for DDL/index operations
  for (const stmt of INDEX_STATEMENTS) {
    const session = getSession();
    try {
      await session.run(stmt);
      console.log(`  OK: ${stmt}`);
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('Equivalent index')) {
        console.log(`  SKIP (exists): ${stmt}`);
      } else {
        trackError('index', stmt, err.message);
        console.log(`  WARN: ${stmt} — ${err.message}`);
      }
    } finally {
      await session.close();
    }
  }
}

// ─── Main ───

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  FlowDesk SQL → Memgraph Import Pipeline        ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE IMPORT'}                            ║`);
  console.log(`║  Time: ${NOW.slice(0, 19)}                    ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  // Connect SQL
  console.log('\nConnecting to SQL Server...');
  sqlPool = await sql.connect(MSSQL_CONFIG);
  console.log(`  Connected: ${MSSQL_CONFIG.server}:${MSSQL_CONFIG.port}/${MSSQL_CONFIG.database}`);

  // Connect Memgraph
  console.log('Connecting to Memgraph...');
  driver = neo4j.driver(
    MEMGRAPH_CONFIG.uri,
    neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password),
    { disableLosslessIntegers: true, maxConnectionPoolSize: 10 }
  );
  await driver.verifyConnectivity();
  console.log(`  Connected: ${MEMGRAPH_CONFIG.uri}`);

  try {
    // ── Pass 1: Independent nodes ──
    const regions = await importLocationsRegion();
    const subRegions = await importLocationsSubRegion();
    const countries = await importLocationsCountry();
    const dutyStations = await importLocationsDutyStation();
    await importRoles();
    await importPermissions();

    // ── Pass 2: Dependent nodes (OrgUnits before Users for BELONGS_TO) ──
    await importOrganizationUnits();
    await importServiceCatalog();
    await importUsers();

    // ── Pass 3: Edges ──
    await importLocationPartOfEdges(subRegions, countries, dutyStations);
    await importOrgDutyStationEdges();
    await importUserRoles();
    await importRoleGrantsEdges();

    // ── Indexes ──
    await createIndexes();

  } finally {
    // Cleanup
    await sqlPool.close();
    await driver.close();
  }

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  IMPORT SUMMARY                                  ║');
  console.log('╚══════════════════════════════════════════════════╝');

  console.log('\nNodes created/updated:');
  let totalNodes = 0;
  for (const [label, count] of Object.entries(stats.nodes)) {
    console.log(`  ${label}: ${count}`);
    totalNodes += count;
  }
  console.log(`  TOTAL: ${totalNodes}`);

  console.log('\nEdges created/updated:');
  let totalEdges = 0;
  for (const [label, count] of Object.entries(stats.edges)) {
    console.log(`  ${label}: ${count}`);
    totalEdges += count;
  }
  console.log(`  TOTAL: ${totalEdges}`);

  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.phase}] ${e.message}: ${e.detail}`);
    });
  } else {
    console.log('\nErrors: 0');
  }

  console.log('\nHANDLED_BY edges: 0 (ServiceProviders table empty — requires manual population)');
  console.log(`\nDone. ${DRY_RUN ? '(DRY RUN — no data written)' : ''}`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
