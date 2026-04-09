'use strict';

/**
 * FlowDesk Graph-based Routing Service
 *
 * Provides routing functions for the AI Intake Layer.
 * Uses Memgraph knowledge graph for deterministic service resolution.
 *
 * Usage:
 *   const routing = require('./graph-routing');
 *   await routing.init();
 *   const result = await routing.resolveServiceHandler(userId, 'IT-HW-LAP');
 *   const services = await routing.findServicesByDomain('IT');
 */

const neo4j = require('neo4j-driver');
const { MEMGRAPH_CONFIG } = require('./import-config');

let driver;

/**
 * Initialize the routing service (connect to Memgraph).
 */
async function init() {
  if (driver) return;
  driver = neo4j.driver(
    MEMGRAPH_CONFIG.uri,
    neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password),
    { disableLosslessIntegers: true, maxConnectionPoolSize: 5 }
  );
  await driver.verifyConnectivity();
}

/**
 * Close the routing service connection.
 */
async function close() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

async function runRead(cypher, params = {}) {
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

/**
 * Resolve the handler for a specific service and user.
 *
 * @param {string} userId - User UUID
 * @param {string} serviceCode - Service code (e.g., 'IT-HW-LAP')
 * @returns {object|null} RoutingResult or null if not found
 */
async function resolveServiceHandler(userId, serviceCode) {
  // Step 1: Get user context
  const ctxRecords = await runRead(`
    MATCH (u:User {id: $userId})-[:BELONGS_TO]->(ou:OrganizationUnit)
    OPTIONAL MATCH (ou)-[:LOCATED_AT]->(ds:Location {location_type: 'DutyStation'})
    OPTIONAL MATCH (ds)-[:PART_OF*1..3]->(country:Location {location_type: 'Country'})
    OPTIONAL MATCH (country)-[:PART_OF*1..2]->(region:Location {location_type: 'Region'})
    RETURN u.id AS uid, ou.code AS org_code, ou.name AS org_name,
           ou.hierarchy_path AS org_path,
           ds.name AS duty_station, country.name AS country, region.name AS region
    LIMIT 1
  `, { userId });

  if (ctxRecords.length === 0) return null;
  const ctx = ctxRecords[0];
  const orgPath = ctx.get('org_path') || '';

  // Step 2: Find all handlers for this service, pick best by priority
  // Priority matching: check if handler's mission_id is in user's org hierarchy_path
  const handlerRecords = await runRead(`
    MATCH (s:ServiceCatalogItem {code: $serviceCode, is_requestable: true})
    MATCH (s)-[hb:HANDLED_BY]->(handler:OrganizationUnit)
    RETURN
      s.code AS service_code, s.name AS service_name,
      s.sla_hours AS sla_hours, s.approval_required AS approval_required,
      s.gxe_graph_id AS gxe_graph_id,
      handler.code AS handler_code, handler.name AS handler_name,
      hb.scope_type AS scope_type, hb.priority AS priority,
      hb.mission_id AS mission_id
    ORDER BY hb.priority ASC
  `, { serviceCode });

  if (handlerRecords.length === 0) return null;

  // Find best handler: prefer mission-local (check if mission_id is in user's hierarchy_path)
  let bestHandler = null;
  for (const r of handlerRecords) {
    const missionId = r.get('mission_id');
    const scopeType = r.get('scope_type');

    // Check if user is under this mission: path contains /missionId/ or ends with /missionId
    const inMission = missionId && (orgPath.includes('/' + missionId + '/') || orgPath.endsWith('/' + missionId));
    if (scopeType === 'mission' && inMission) {
      bestHandler = r; // User is in this mission → use local handler
      break;
    }
    if (scopeType === 'regional' && inMission) {
      bestHandler = r; // Regional handler for user's cluster
      break;
    }
    if (scopeType === 'global' && !bestHandler) {
      bestHandler = r; // Global fallback
    }
  }

  if (!bestHandler) bestHandler = handlerRecords[handlerRecords.length - 1]; // last resort

  return {
    service: {
      code: bestHandler.get('service_code'),
      name: bestHandler.get('service_name'),
      slaHours: bestHandler.get('sla_hours'),
      approvalRequired: bestHandler.get('approval_required'),
      gxeGraphId: bestHandler.get('gxe_graph_id'),
    },
    handler: {
      code: bestHandler.get('handler_code'),
      name: bestHandler.get('handler_name'),
      scope: bestHandler.get('scope_type') || 'global',
      priority: bestHandler.get('priority'),
    },
    userContext: {
      orgUnit: ctx.get('org_name'),
      orgUnitCode: ctx.get('org_code'),
      dutyStation: ctx.get('duty_station'),
      country: ctx.get('country'),
      region: ctx.get('region'),
    },
  };
}

/**
 * Find all requestable services in a domain.
 *
 * @param {string} domain - Domain code: 'IT', 'HR', 'FAC', 'FIN', 'SEC', 'COM', 'LOG', 'LEG'
 * @returns {Array} Array of service objects
 */
async function findServicesByDomain(domain) {
  const records = await runRead(`
    MATCH (root:ServiceCatalogItem {code: $domain})-[:PARENT_OF*]->(s:ServiceCatalogItem {level: 3, is_requestable: true})
    MATCH (s)-[:HANDLED_BY]->(handler:OrganizationUnit)
    RETURN
      s.code AS code,
      s.name AS name,
      s.description AS description,
      s.sla_hours AS sla_hours,
      s.approval_required AS approval_required,
      s.gxe_graph_id AS gxe_graph_id,
      s.default_handler_code AS default_handler_code,
      handler.code AS handler_code,
      handler.name AS handler_name
    ORDER BY s.code
  `, { domain });

  return records.map(r => ({
    code: r.get('code'),
    name: r.get('name'),
    description: r.get('description'),
    slaHours: r.get('sla_hours'),
    approvalRequired: r.get('approval_required'),
    gxeGraphId: r.get('gxe_graph_id'),
    defaultHandlerCode: r.get('default_handler_code'),
    handler: {
      code: r.get('handler_code'),
      name: r.get('handler_name'),
    },
  }));
}

/**
 * Find services matching a text query using the service catalog hierarchy.
 * Returns ranked results based on name/description matching.
 *
 * @param {string} query - Search text
 * @returns {Array} Matched services with scores
 */
async function searchServices(query) {
  const records = await runRead(`
    MATCH (s:ServiceCatalogItem {level: 3, is_requestable: true})
    WHERE s.name CONTAINS $query OR s.description CONTAINS $query OR s.code CONTAINS $query
    OPTIONAL MATCH (s)-[:HANDLED_BY]->(handler:OrganizationUnit)
    OPTIONAL MATCH (s)<-[:PARENT_OF]-(parent:ServiceCatalogItem)
    RETURN
      s.code AS code,
      s.name AS name,
      s.description AS description,
      s.sla_hours AS sla_hours,
      s.approval_required AS approval_required,
      parent.name AS category,
      handler.name AS handler_name
    ORDER BY s.code
    LIMIT 20
  `, { query });

  return records.map(r => ({
    code: r.get('code'),
    name: r.get('name'),
    description: r.get('description'),
    slaHours: r.get('sla_hours'),
    approvalRequired: r.get('approval_required'),
    category: r.get('category'),
    handlerName: r.get('handler_name'),
  }));
}

/**
 * Get user context for routing (org unit, location, role).
 *
 * @param {string} userId - User UUID
 * @returns {object|null} User context
 */
async function getUserContext(userId) {
  const records = await runRead(`
    MATCH (u:User {id: $userId})-[:BELONGS_TO]->(ou:OrganizationUnit)
    OPTIONAL MATCH (ou)-[:LOCATED_AT]->(ds:Location {location_type: 'DutyStation'})
    OPTIONAL MATCH (ds)-[:PART_OF*1..3]->(country:Location {location_type: 'Country'})
    OPTIONAL MATCH (country)-[:PART_OF*1..2]->(region:Location {location_type: 'Region'})
    OPTIONAL MATCH (u)-[hr:HAS_ROLE]->(role:Role)
    RETURN
      u.email AS email,
      u.display_name AS display_name,
      u.is_vip AS is_vip,
      ou.code AS org_code,
      ou.name AS org_name,
      ou.level AS org_level,
      ds.name AS duty_station,
      country.name AS country,
      region.name AS region,
      collect(DISTINCT role.code) AS roles
    LIMIT 1
  `, { userId });

  if (records.length === 0) return null;

  const r = records[0];
  return {
    email: r.get('email'),
    displayName: r.get('display_name'),
    isVip: r.get('is_vip'),
    orgUnit: { code: r.get('org_code'), name: r.get('org_name'), level: r.get('org_level') },
    location: {
      dutyStation: r.get('duty_station'),
      country: r.get('country'),
      region: r.get('region'),
    },
    roles: r.get('roles'),
  };
}

/**
 * Get all service domains (L1 categories) with service counts.
 */
async function getServiceDomains() {
  const records = await runRead(`
    MATCH (root:ServiceCatalogItem {level: 1})-[:PARENT_OF*]->(s:ServiceCatalogItem {level: 3, is_requestable: true})
    WITH root, s
    RETURN root.code AS code, root.name AS name, root.description AS description, count(s) AS service_count
    ORDER BY code
  `);
  return records.map(r => ({
    code: r.get('code'),
    name: r.get('name'),
    description: r.get('description'),
    serviceCount: r.get('service_count'),
  }));
}

module.exports = {
  init,
  close,
  resolveServiceHandler,
  findServicesByDomain,
  searchServices,
  getUserContext,
  getServiceDomains,
};
