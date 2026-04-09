/**
 * FlowDesk Production DataSources
 *
 * DataSources for UN FlowDesk forms:
 *   DS_UNDutyStations_v1  — UN duty stations (SQL)
 *   DS_StaffDirectory_v1  — Staff lookup (KB / Cypher)
 *   DS_EquipmentTypes_v1  — Equipment categories (KB / Cypher)
 *
 * Usage:
 *   node api/scripts/seed-flowdesk-datasources.js [--dry-run] [--verify]
 */

const {
  SQLDataSourceBuilder,
  KBDataSourceBuilder,
  CacheStrategy,
} = require('../../schemas/datasource-config.schema');

// ─── DS_UNDutyStations_v1 (SQL) ─────────────────────────────────────────────

const dutyStationsDS = new SQLDataSourceBuilder('DS_UNDutyStations_v1', {
  graphId: 'DS_UNDutyStations_v1',
  namespace: 'FLOWDESK',
  description: 'UN Duty Stations from iNeed database',
  valueField: 'station_code',
  labelField: 'station_name',
  metadataFields: ['region', 'country', 'timezone'],
  cacheStrategy: CacheStrategy.TTL,
  cacheTTL: 86400,
  defaultLimit: 200,
  maxLimit: 500,
})
  .setConnection('ineed')
  .setQuery(
    'SELECT station_code, station_name, region, country, timezone ' +
    'FROM duty_stations WHERE active = 1 ORDER BY station_name'
  )
  .setSearchQuery(
    'SELECT station_code, station_name, region, country, timezone ' +
    'FROM duty_stations WHERE active = 1 ' +
    'AND (station_name LIKE @searchText OR station_code LIKE @searchText) ' +
    'ORDER BY station_name',
    'station_name'
  )
  .setCountQuery('SELECT COUNT(*) as total FROM duty_stations WHERE active = 1')
  .build();

// ─── DS_StaffDirectory_v1 (KB / Cypher) ─────────────────────────────────────

const staffDirectoryDS = new KBDataSourceBuilder('DS_StaffDirectory_v1', {
  graphId: 'DS_StaffDirectory_v1',
  namespace: 'FLOWDESK',
  description: 'UN Staff Directory for beneficiary lookup',
  valueField: 'indexNumber',
  labelField: 'fullName',
  metadataFields: ['email', 'department', 'dutyStation', 'title'],
  cacheStrategy: CacheStrategy.NONE,
  defaultLimit: 20,
  maxLimit: 50,
})
  .setCypherQuery(
    'MATCH (s:StaffMember) WHERE s.active = true ' +
    'RETURN s.indexNumber AS indexNumber, s.fullName AS fullName, ' +
    's.email AS email, s.department AS department, ' +
    's.dutyStation AS dutyStation, s.title AS title ' +
    'ORDER BY s.fullName'
  )
  .setCypherSearchQuery(
    'MATCH (s:StaffMember) WHERE s.active = true ' +
    'AND (s.fullName =~ $searchPattern OR s.email =~ $searchPattern ' +
    'OR s.indexNumber =~ $searchPattern) ' +
    'RETURN s.indexNumber AS indexNumber, s.fullName AS fullName, ' +
    's.email AS email, s.department AS department, ' +
    's.dutyStation AS dutyStation, s.title AS title ' +
    'ORDER BY s.fullName LIMIT $limit'
  )
  .setNamespace('FLOWDESK')
  .build();

// ─── DS_EquipmentTypes_v1 (KB / Cypher) ─────────────────────────────────────

const equipmentTypesDS = new KBDataSourceBuilder('DS_EquipmentTypes_v1', {
  graphId: 'DS_EquipmentTypes_v1',
  namespace: 'FLOWDESK',
  description: 'Equipment types for hardware requests',
  valueField: 'code',
  labelField: 'name',
  metadataFields: ['category', 'requiresApproval'],
  cacheStrategy: CacheStrategy.TTL,
  cacheTTL: 604800, // 1 week
  defaultLimit: 100,
  maxLimit: 100,
})
  .setCypherQuery(
    'MATCH (e:EquipmentType) WHERE e.active = true ' +
    'RETURN e.code AS code, e.name AS name, ' +
    'e.category AS category, e.requiresApproval AS requiresApproval ' +
    'ORDER BY e.category, e.name'
  )
  .setCypherSearchQuery(
    'MATCH (e:EquipmentType) WHERE e.active = true ' +
    'AND (e.name =~ $searchPattern OR e.code =~ $searchPattern) ' +
    'RETURN e.code AS code, e.name AS name, ' +
    'e.category AS category, e.requiresApproval AS requiresApproval ' +
    'ORDER BY e.name LIMIT $limit'
  )
  .build();

// ─── Seed function ───────────────────────────────────────────────────────────

async function seedFlowDeskDataSources(dataSourceService) {
  const dataSources = [dutyStationsDS, staffDirectoryDS, equipmentTypesDS];
  const results = [];

  for (const ds of dataSources) {
    try {
      const existing = await dataSourceService.get(ds.graphId);
      if (existing) {
        await dataSourceService.update(ds.graphId, ds);
        results.push({ graphId: ds.graphId, action: 'updated' });
      } else {
        await dataSourceService.create(ds);
        results.push({ graphId: ds.graphId, action: 'created' });
      }
    } catch (error) {
      results.push({ graphId: ds.graphId, action: 'error', error: error.message });
    }
  }

  return results;
}

module.exports = {
  dutyStationsDS,
  staffDirectoryDS,
  equipmentTypesDS,
  seedFlowDeskDataSources,
};
