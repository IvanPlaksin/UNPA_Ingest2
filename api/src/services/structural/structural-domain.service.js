/**
 * Structural Domain Service (D1)
 *
 * Manages structural entities: tables, columns, foreign keys.
 * Bridges legacy entity format to new StructuralEntity nodes in Memgraph.
 */

const { v4: uuidv4 } = require('uuid');

const StructuralEntityType = {
  TABLE: 'table',
  VIEW: 'view',
  MASTER_DATA: 'master_data',
  TRANSACTION: 'transaction',
  JUNCTION: 'junction',
  LOOKUP: 'lookup',
  ENUMERATION: 'enumeration',
  LOG: 'log',
};

class StructuralDomainService {
  constructor(dependencies = {}) {
    this.memgraphService = dependencies.memgraphService;
    this.namespace = 'structural';
  }

  // ============================================================
  // ENTITY CREATION
  // ============================================================

  /**
   * Create a structural entity from table metadata.
   * Uses MERGE on (tableName, schemaName) to avoid duplicates.
   */
  async createEntity(entityData, context = {}) {
    if (!this.memgraphService) return null;

    const entityId = entityData.id || uuidv4();
    const now = new Date().toISOString();
    const tableName = entityData.tableName || entityData.table_name || entityData.name;
    const schemaName = entityData.schemaName || entityData.schema_name || entityData.schema || 'dbo';

    const query = `
      MERGE (e:StructuralEntity {
        tableName: $tableName,
        schemaName: $schemaName
      })
      ON CREATE SET
        e.id = $id,
        e.domain = 'STRUCTURAL',
        e.name = $name,
        e.fullName = $fullName,
        e.entityType = $entityType,
        e.description = $description,
        e.columnCount = $columnCount,
        e.rowCount = $rowCount,
        e.hasPrimaryKey = $hasPrimaryKey,
        e.primaryKeyColumns = $primaryKeyColumns,
        e.extractionSessionId = $sessionId,
        e.sourceDatabase = $sourceDatabase,
        e.createdAt = $now,
        e.updatedAt = $now
      ON MATCH SET
        e.updatedAt = $now,
        e.rowCount = $rowCount,
        e.extractionSessionId = $sessionId
      RETURN e.id as id
    `;

    const params = {
      id: entityId,
      tableName,
      schemaName,
      name: entityData.name || tableName,
      fullName: `${schemaName}.${tableName}`,
      entityType: entityData.entityType || this._inferEntityType(entityData),
      description: entityData.description || null,
      columnCount: entityData.columns?.length || entityData.columnCount || 0,
      rowCount: entityData.rowCount || entityData.row_count || 0,
      hasPrimaryKey: entityData.hasPrimaryKey || false,
      primaryKeyColumns: JSON.stringify(entityData.primaryKeyColumns || []),
      sessionId: context.sessionId || null,
      sourceDatabase: context.sourceDatabase || null,
      now,
    };

    try {
      const result = await this.memgraphService.runQuery(query, params);
      const finalId = result[0]?.id || entityId;

      // Create attribute/column nodes if provided
      if (entityData.columns && entityData.columns.length > 0) {
        await this._createAttributes(finalId, entityData.columns);
      }

      return { id: finalId, tableName, schemaName, fullName: params.fullName };
    } catch (error) {
      console.warn(`[D1] Failed to create StructuralEntity ${tableName}:`, error.message);
      return null;
    }
  }

  /**
   * Create multiple entities from a databaseMap.
   * Processes all classified tables.
   */
  async createEntitiesFromDatabaseMap(databaseMap, context = {}) {
    if (!this.memgraphService || !databaseMap) return { created: 0, failed: 0 };

    let created = 0;
    let failed = 0;
    const entityIndex = {}; // fqn -> entityId

    const allFqns = new Set();
    for (const category of ['reference', 'master', 'transaction', 'junction', 'log', 'unknown']) {
      const tables = databaseMap[category] || [];
      for (const t of tables) {
        allFqns.add(t.fqn);
      }
    }

    for (const fqn of allFqns) {
      const classification = databaseMap.classifications?.[fqn];
      if (!classification) continue;

      const entityData = {
        tableName: classification.tableName,
        schemaName: classification.schema,
        entityType: this._classificationToEntityType(classification.tableType),
        columns: classification.columns || [],
        rowCount: classification.rowCount || 0,
        hasPrimaryKey: (classification.columns || []).some(c => c.is_primary_key),
        primaryKeyColumns: (classification.columns || [])
          .filter(c => c.is_primary_key)
          .map(c => c.column_name || c.name),
      };

      const result = await this.createEntity(entityData, context);
      if (result) {
        created++;
        entityIndex[fqn] = result.id;
        entityIndex[classification.tableName] = result.id;
      } else {
        failed++;
      }
    }

    return { created, failed, entityIndex };
  }

  /**
   * Create StructuralAttribute nodes for an entity.
   */
  async _createAttributes(entityId, columns) {
    for (const col of columns) {
      const colName = col.column_name || col.name;
      if (!colName) continue;

      const query = `
        MATCH (e:StructuralEntity {id: $entityId})
        MERGE (a:StructuralAttribute {
          entityId: $entityId,
          columnName: $colName
        })
        ON CREATE SET
          a.id = $attrId,
          a.domain = 'STRUCTURAL',
          a.name = $colName,
          a.dataType = $dataType,
          a.maxLength = $maxLength,
          a.isNullable = $isNullable,
          a.isPrimaryKey = $isPrimaryKey,
          a.isForeignKey = $isForeignKey,
          a.referencedTable = $referencedTable,
          a.createdAt = $now
        MERGE (e)-[:HAS_ATTRIBUTE]->(a)
      `;

      await this.memgraphService.runQuery(query, {
        entityId,
        attrId: uuidv4(),
        colName,
        dataType: col.data_type || col.type || 'unknown',
        maxLength: col.max_length || col.maxLength || null,
        isNullable: col.is_nullable ?? col.nullable ?? true,
        isPrimaryKey: col.is_primary_key || col.isPK || false,
        isForeignKey: !!(col.referenced_table || col.isFK),
        referencedTable: col.referenced_table
          ? `${col.referenced_schema || 'dbo'}.${col.referenced_table}`
          : null,
        now: new Date().toISOString(),
      }).catch(() => {}); // Graceful fail for individual columns
    }
  }

  // ============================================================
  // FOREIGN KEY RELATIONSHIPS
  // ============================================================

  /**
   * Create foreign key edges between StructuralEntity nodes.
   * fkEdges: array from databaseMap.fkGraph.edges
   */
  async createForeignKeys(fkEdges, context = {}) {
    if (!this.memgraphService || !fkEdges) return { created: 0 };

    let created = 0;

    for (const fk of fkEdges) {
      // fkGraph edges have: from (fqn), to (fqn), column, referencedColumn, constraintName
      const fromParts = (fk.from || '').split('.');
      const toParts = (fk.to || '').split('.');

      const fromSchema = fromParts.length > 1 ? fromParts[0] : 'dbo';
      const fromTable = fromParts.length > 1 ? fromParts[1] : fromParts[0];
      const toSchema = toParts.length > 1 ? toParts[0] : 'dbo';
      const toTable = toParts.length > 1 ? toParts[1] : toParts[0];

      const query = `
        MATCH (src:StructuralEntity {tableName: $fromTable, schemaName: $fromSchema})
        MATCH (tgt:StructuralEntity {tableName: $toTable, schemaName: $toSchema})
        MERGE (src)-[r:RELATES_TO {
          fromColumn: $fromColumn,
          toColumn: $toColumn
        }]->(tgt)
        ON CREATE SET
          r.id = $fkId,
          r.type = 'FOREIGN_KEY',
          r.constraintName = $constraintName,
          r.createdAt = $now
        RETURN r.id as id
      `;

      try {
        await this.memgraphService.runQuery(query, {
          fkId: uuidv4(),
          fromTable,
          fromSchema,
          toTable,
          toSchema,
          fromColumn: fk.column || fk.fromColumn || '',
          toColumn: fk.referencedColumn || fk.toColumn || '',
          constraintName: fk.constraintName || fk.constraint_name || null,
          now: new Date().toISOString(),
        });
        created++;
      } catch (_) {
        // Source or target entity may not exist
      }
    }

    return { created };
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  /**
   * Find entity by table name.
   */
  async findByTableName(tableName, schemaName = 'dbo') {
    const result = await this.memgraphService.runQuery(
      `MATCH (e:StructuralEntity {tableName: $tableName, schemaName: $schemaName}) RETURN e`,
      { tableName, schemaName }
    );
    return result[0]?.e || null;
  }

  /**
   * Find entity by name (flexible match).
   */
  async findByName(name) {
    const result = await this.memgraphService.runQuery(
      `MATCH (e:StructuralEntity)
       WHERE e.name = $name OR e.tableName = $name OR e.fullName = $name
       RETURN e LIMIT 1`,
      { name }
    );
    return result[0]?.e || null;
  }

  /**
   * Get structural statistics.
   */
  async getStructuralStats() {
    const entities = await this.memgraphService.runQuery(
      'MATCH (e:StructuralEntity) RETURN count(e) as c'
    );
    const attrs = await this.memgraphService.runQuery(
      'MATCH (a:StructuralAttribute) RETURN count(a) as c'
    );
    const fks = await this.memgraphService.runQuery(
      'MATCH ()-[r:RELATES_TO {type: "FOREIGN_KEY"}]->() RETURN count(r) as c'
    );

    return {
      entities: entities[0]?.c || 0,
      attributes: attrs[0]?.c || 0,
      foreignKeys: fks[0]?.c || 0,
    };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  _classificationToEntityType(tableType) {
    const mapping = {
      reference: StructuralEntityType.LOOKUP,
      master: StructuralEntityType.MASTER_DATA,
      transaction: StructuralEntityType.TRANSACTION,
      junction: StructuralEntityType.JUNCTION,
      log: StructuralEntityType.LOG,
      unknown: StructuralEntityType.TABLE,
    };
    return mapping[tableType] || StructuralEntityType.TABLE;
  }

  _inferEntityType(entityData) {
    if (entityData.classification) {
      return this._classificationToEntityType(entityData.classification);
    }
    if (entityData.isView || entityData.type === 'VIEW') {
      return StructuralEntityType.VIEW;
    }
    return StructuralEntityType.TABLE;
  }
}

module.exports = {
  StructuralDomainService,
  StructuralEntityType,
};
