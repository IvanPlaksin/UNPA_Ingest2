'use strict';

/**
 * Memgraph schema constants for FlowDesk import.
 * Defines node labels, relationship types, and index/constraint DDL.
 */

const NODE_LABELS = {
  SERVICE_CATALOG_ITEM: 'ServiceCatalogItem',
  ORGANIZATION_UNIT: 'OrganizationUnit',
  LOCATION: 'Location',
  ROLE: 'Role',
  PERMISSION: 'Permission',
  USER: 'User',
};

const REL_TYPES = {
  PARENT_OF: 'PARENT_OF',     // parent → child
  PART_OF: 'PART_OF',         // child → parent (geography)
  LOCATED_AT: 'LOCATED_AT',   // OrgUnit → Location(DutyStation)
  BELONGS_TO: 'BELONGS_TO',   // User → OrgUnit
  HAS_ROLE: 'HAS_ROLE',       // User → Role
  GRANTS: 'GRANTS',           // Role → Permission
  MANAGED_BY: 'MANAGED_BY',   // OrgUnit → User
  HANDLED_BY: 'HANDLED_BY',   // ServiceCatalogItem → OrgUnit (placeholder, 0 edges)
};

const LOCATION_TYPES = {
  REGION: 'Region',
  SUB_REGION: 'SubRegion',
  COUNTRY: 'Country',
  DUTY_STATION: 'DutyStation',
};

// Memgraph index/constraint DDL
// Memgraph uses CREATE INDEX ON :Label(property) syntax
const INDEX_STATEMENTS = [
  // Unique constraints (Memgraph: existence constraint + index)
  'CREATE INDEX ON :ServiceCatalogItem(id);',
  'CREATE INDEX ON :OrganizationUnit(id);',
  'CREATE INDEX ON :Location(id);',
  'CREATE INDEX ON :User(id);',
  'CREATE INDEX ON :Role(id);',
  'CREATE INDEX ON :Permission(id);',

  // Lookup indexes
  'CREATE INDEX ON :ServiceCatalogItem(code);',
  'CREATE INDEX ON :ServiceCatalogItem(level);',
  'CREATE INDEX ON :OrganizationUnit(code);',
  'CREATE INDEX ON :OrganizationUnit(level);',
  'CREATE INDEX ON :Location(location_type);',
  'CREATE INDEX ON :User(email);',
  'CREATE INDEX ON :Role(code);',
];

module.exports = { NODE_LABELS, REL_TYPES, LOCATION_TYPES, INDEX_STATEMENTS };
