/**
 * Edge Version Repository
 * Manages edge versions with orphan cascade support
 */

import { BaseRepository } from './base.repository';
import { MemgraphClient } from '../db/memgraph.client';
import {
  EdgeVersion,
  EdgeStatus,
  OrphanedReason,
  ChangeType,
  Namespace,
  EntityNotFoundError
} from '../types/immutable-graph.types';

export class EdgeVersionRepository extends BaseRepository<EdgeVersion> {
  protected label = 'EdgeVersion';

  constructor(client: MemgraphClient) {
    super(client);
  }

  protected mapToEntity(record: Record<string, unknown>): EdgeVersion {
    return {
      versionId: record.versionId as string,
      edgeId: record.edgeId as string,
      sourceEntityId: record.sourceEntityId as string,
      targetEntityId: record.targetEntityId as string,
      edgeType: record.edgeType as string,
      namespace: record.namespace as Namespace,
      sequenceNumber: BigInt(record.sequenceNumber as number),
      versionName: record.versionName as string,
      status: record.status as EdgeStatus,
      orphanedReason: record.orphanedReason as OrphanedReason | null,
      orphanedAt: record.orphanedAt ? new Date(record.orphanedAt as string) : null,
      orphanedByNodeId: record.orphanedByNodeId as string | null,
      originalStatus: record.originalStatus as EdgeStatus | null,
      ttStart: new Date(record.ttStart as string),
      ttEnd: record.ttEnd ? new Date(record.ttEnd as string) : null,
      vtStart: new Date(record.vtStart as string),
      vtEnd: record.vtEnd ? new Date(record.vtEnd as string) : null,
      previousVersionId: record.previousVersionId as string | null,
      supersededById: record.supersededById as string | null,
      changeType: record.changeType as ChangeType,
      changeReason: record.changeReason as string,
      changedBy: record.changedBy as string,
      contentHash: record.contentHash as string,
      previousHash: record.previousHash as string | null,
      chainHash: record.chainHash as string,
      properties: typeof record.properties === 'string'
        ? JSON.parse(record.properties)
        : (record.properties as Record<string, unknown>) || {}
    };
  }

  protected mapToParams(entity: Partial<EdgeVersion>): Record<string, unknown> {
    return {
      versionId: entity.versionId,
      edgeId: entity.edgeId,
      sourceEntityId: entity.sourceEntityId,
      targetEntityId: entity.targetEntityId,
      edgeType: entity.edgeType,
      namespace: entity.namespace,
      sequenceNumber: entity.sequenceNumber ? Number(entity.sequenceNumber) : 0,
      versionName: entity.versionName,
      status: entity.status,
      orphanedReason: entity.orphanedReason || null,
      orphanedAt: entity.orphanedAt?.toISOString() || null,
      orphanedByNodeId: entity.orphanedByNodeId || null,
      originalStatus: entity.originalStatus || null,
      ttStart: entity.ttStart?.toISOString(),
      ttEnd: entity.ttEnd?.toISOString() || null,
      vtStart: entity.vtStart?.toISOString(),
      vtEnd: entity.vtEnd?.toISOString() || null,
      previousVersionId: entity.previousVersionId || null,
      supersededById: entity.supersededById || null,
      changeType: entity.changeType,
      changeReason: entity.changeReason,
      changedBy: entity.changedBy,
      contentHash: entity.contentHash,
      previousHash: entity.previousHash || null,
      chainHash: entity.chainHash,
      properties: JSON.stringify(entity.properties || {})
    };
  }

  async create(edge: EdgeVersion): Promise<EdgeVersion> {
    const params = this.mapToParams(edge);

    const cypher = `
      CREATE (e:EdgeVersion {
        versionId: $versionId,
        edgeId: $edgeId,
        sourceEntityId: $sourceEntityId,
        targetEntityId: $targetEntityId,
        edgeType: $edgeType,
        namespace: $namespace,
        sequenceNumber: $sequenceNumber,
        versionName: $versionName,
        status: $status,
        orphanedReason: $orphanedReason,
        orphanedAt: $orphanedAt,
        orphanedByNodeId: $orphanedByNodeId,
        originalStatus: $originalStatus,
        ttStart: $ttStart,
        ttEnd: $ttEnd,
        vtStart: $vtStart,
        vtEnd: $vtEnd,
        previousVersionId: $previousVersionId,
        supersededById: $supersededById,
        changeType: $changeType,
        changeReason: $changeReason,
        changedBy: $changedBy,
        contentHash: $contentHash,
        previousHash: $previousHash,
        chainHash: $chainHash,
        properties: $properties
      })
      RETURN e
    `;

    const results = await this.client.executeWrite<{ e: Record<string, unknown> }>(cypher, params);
    return this.mapToEntity(results[0].e);
  }

  async findByVersionId(versionId: string): Promise<EdgeVersion | null> {
    return this.findById(versionId, 'versionId');
  }

  async findActiveByEdgeId(edgeId: string): Promise<EdgeVersion | null> {
    const cypher = `
      MATCH (e:EdgeVersion {edgeId: $edgeId, status: 'ACTIVE'})
      RETURN e
    `;
    const results = await this.client.executeQuery<{ e: Record<string, unknown> }>(cypher, { edgeId });
    if (results.length === 0) return null;
    return this.mapToEntity(results[0].e);
  }

  async findBySourceEntityId(sourceEntityId: string, status?: EdgeStatus): Promise<EdgeVersion[]> {
    let cypher: string;
    let params: Record<string, unknown>;

    if (status) {
      cypher = `
        MATCH (e:EdgeVersion {sourceEntityId: $sourceEntityId, status: $status})
        RETURN e
        ORDER BY e.sequenceNumber DESC
      `;
      params = { sourceEntityId, status };
    } else {
      cypher = `
        MATCH (e:EdgeVersion {sourceEntityId: $sourceEntityId})
        RETURN e
        ORDER BY e.sequenceNumber DESC
      `;
      params = { sourceEntityId };
    }

    const results = await this.client.executeQuery<{ e: Record<string, unknown> }>(cypher, params);
    return results.map(r => this.mapToEntity(r.e));
  }

  async findByTargetEntityId(targetEntityId: string, status?: EdgeStatus): Promise<EdgeVersion[]> {
    let cypher: string;
    let params: Record<string, unknown>;

    if (status) {
      cypher = `
        MATCH (e:EdgeVersion {targetEntityId: $targetEntityId, status: $status})
        RETURN e
        ORDER BY e.sequenceNumber DESC
      `;
      params = { targetEntityId, status };
    } else {
      cypher = `
        MATCH (e:EdgeVersion {targetEntityId: $targetEntityId})
        RETURN e
        ORDER BY e.sequenceNumber DESC
      `;
      params = { targetEntityId };
    }

    const results = await this.client.executeQuery<{ e: Record<string, unknown> }>(cypher, params);
    return results.map(r => this.mapToEntity(r.e));
  }

  async findConnectedEdges(entityId: string, status?: EdgeStatus): Promise<EdgeVersion[]> {
    let cypher: string;
    let params: Record<string, unknown>;

    if (status) {
      cypher = `
        MATCH (e:EdgeVersion)
        WHERE (e.sourceEntityId = $entityId OR e.targetEntityId = $entityId)
          AND e.status = $status
        RETURN e
        ORDER BY e.sequenceNumber DESC
      `;
      params = { entityId, status };
    } else {
      cypher = `
        MATCH (e:EdgeVersion)
        WHERE e.sourceEntityId = $entityId OR e.targetEntityId = $entityId
        RETURN e
        ORDER BY e.sequenceNumber DESC
      `;
      params = { entityId };
    }

    const results = await this.client.executeQuery<{ e: Record<string, unknown> }>(cypher, params);
    return results.map(r => this.mapToEntity(r.e));
  }

  async updateStatus(versionId: string, status: EdgeStatus): Promise<EdgeVersion> {
    const cypher = `
      MATCH (e:EdgeVersion {versionId: $versionId})
      SET e.status = $status,
          e.ttEnd = CASE WHEN $status IN ['SUPERSEDED', 'ORPHANED', 'DEPRECATED', 'DELETED'] THEN datetime() ELSE e.ttEnd END
      RETURN e
    `;

    const results = await this.client.executeWrite<{ e: Record<string, unknown> }>(cypher, { versionId, status });
    if (results.length === 0) {
      throw new EntityNotFoundError(versionId, 'EdgeVersion');
    }
    return this.mapToEntity(results[0].e);
  }

  async orphanEdge(versionId: string, reason: OrphanedReason, orphanedByNodeId: string): Promise<EdgeVersion> {
    const cypher = `
      MATCH (e:EdgeVersion {versionId: $versionId})
      SET e.originalStatus = e.status,
          e.status = 'ORPHANED',
          e.orphanedReason = $reason,
          e.orphanedAt = datetime(),
          e.orphanedByNodeId = $orphanedByNodeId,
          e.ttEnd = datetime()
      RETURN e
    `;

    const results = await this.client.executeWrite<{ e: Record<string, unknown> }>(cypher, {
      versionId,
      reason,
      orphanedByNodeId
    });

    if (results.length === 0) {
      throw new EntityNotFoundError(versionId, 'EdgeVersion');
    }
    return this.mapToEntity(results[0].e);
  }

  async orphanEdgesByNodeId(nodeEntityId: string): Promise<number> {
    const cypher = `
      MATCH (e:EdgeVersion)
      WHERE e.status = 'ACTIVE'
        AND (e.sourceEntityId = $nodeEntityId OR e.targetEntityId = $nodeEntityId)
      SET e.originalStatus = e.status,
          e.status = 'ORPHANED',
          e.orphanedReason = CASE
            WHEN e.sourceEntityId = $nodeEntityId AND e.targetEntityId = $nodeEntityId THEN 'BOTH'
            WHEN e.sourceEntityId = $nodeEntityId THEN 'SOURCE_DEPRECATED'
            ELSE 'TARGET_DEPRECATED'
          END,
          e.orphanedAt = datetime(),
          e.orphanedByNodeId = $nodeEntityId,
          e.ttEnd = datetime()
      RETURN count(e) as orphanedCount
    `;

    const results = await this.client.executeWrite<{ orphanedCount: number }>(cypher, { nodeEntityId });
    return results[0]?.orphanedCount || 0;
  }

  async restoreOrphanedEdges(nodeEntityId: string): Promise<number> {
    const cypher = `
      MATCH (e:EdgeVersion)
      WHERE e.status = 'ORPHANED'
        AND e.orphanedByNodeId = $nodeEntityId
      SET e.status = e.originalStatus,
          e.orphanedReason = NULL,
          e.orphanedAt = NULL,
          e.orphanedByNodeId = NULL,
          e.originalStatus = NULL,
          e.ttEnd = NULL
      RETURN count(e) as restoredCount
    `;

    const results = await this.client.executeWrite<{ restoredCount: number }>(cypher, { nodeEntityId });
    return results[0]?.restoredCount || 0;
  }

  async createConnectsRelationship(edgeVersionId: string, nodeVersionId: string, role: 'SOURCE' | 'TARGET'): Promise<void> {
    const cypher = `
      MATCH (e:EdgeVersion {versionId: $edgeVersionId})
      MATCH (n:NodeVersion {versionId: $nodeVersionId})
      CREATE (e)-[:CONNECTS {role: $role}]->(n)
    `;
    await this.client.executeWrite(cypher, { edgeVersionId, nodeVersionId, role });
  }
}
