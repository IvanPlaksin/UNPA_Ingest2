/**
 * Node Version Repository
 * Manages node versions with bi-temporal queries
 */

import { BaseRepository } from './base.repository';
import { MemgraphClient } from '../db/memgraph.client';
import {
  NodeVersion,
  NodeStatus,
  ChangeType,
  Namespace,
  EntityNotFoundError
} from '../types/immutable-graph.types';

export class NodeVersionRepository extends BaseRepository<NodeVersion> {
  protected label = 'NodeVersion';

  constructor(client: MemgraphClient) {
    super(client);
  }

  protected mapToEntity(record: Record<string, unknown>): NodeVersion {
    return {
      versionId: record.versionId as string,
      entityId: record.entityId as string,
      namespace: record.namespace as Namespace,
      sequenceNumber: BigInt(record.sequenceNumber as number),
      versionName: record.versionName as string,
      status: record.status as NodeStatus,
      ttStart: new Date(record.ttStart as string),
      ttEnd: record.ttEnd ? new Date(record.ttEnd as string) : null,
      vtStart: new Date(record.vtStart as string),
      vtEnd: record.vtEnd ? new Date(record.vtEnd as string) : null,
      previousVersionId: record.previousVersionId as string | null,
      supersededById: record.supersededById as string | null,
      mergedFromIds: (record.mergedFromIds as string[]) || [],
      splitIntoIds: (record.splitIntoIds as string[]) || [],
      changeType: record.changeType as ChangeType,
      changeReason: record.changeReason as string,
      changedBy: record.changedBy as string,
      changeSource: record.changeSource as string,
      extractionCycleId: record.extractionCycleId as string | null,
      contentHash: record.contentHash as string,
      previousHash: record.previousHash as string | null,
      chainHash: record.chainHash as string,
      signature: record.signature as string | null,
      properties: typeof record.properties === 'string'
        ? JSON.parse(record.properties)
        : (record.properties as Record<string, unknown>) || {},
      nodeType: record.nodeType as string
    };
  }

  protected mapToParams(entity: Partial<NodeVersion>): Record<string, unknown> {
    return {
      versionId: entity.versionId,
      entityId: entity.entityId,
      namespace: entity.namespace,
      sequenceNumber: entity.sequenceNumber ? Number(entity.sequenceNumber) : 0,
      versionName: entity.versionName,
      status: entity.status,
      ttStart: entity.ttStart?.toISOString(),
      ttEnd: entity.ttEnd?.toISOString() || null,
      vtStart: entity.vtStart?.toISOString(),
      vtEnd: entity.vtEnd?.toISOString() || null,
      previousVersionId: entity.previousVersionId || null,
      supersededById: entity.supersededById || null,
      mergedFromIds: entity.mergedFromIds || [],
      splitIntoIds: entity.splitIntoIds || [],
      changeType: entity.changeType,
      changeReason: entity.changeReason,
      changedBy: entity.changedBy,
      changeSource: entity.changeSource,
      extractionCycleId: entity.extractionCycleId || null,
      contentHash: entity.contentHash,
      previousHash: entity.previousHash || null,
      chainHash: entity.chainHash,
      signature: entity.signature || null,
      properties: JSON.stringify(entity.properties || {}),
      nodeType: entity.nodeType
    };
  }

  async create(node: NodeVersion): Promise<NodeVersion> {
    const params = this.mapToParams(node);

    const cypher = `
      CREATE (n:NodeVersion {
        versionId: $versionId,
        entityId: $entityId,
        namespace: $namespace,
        sequenceNumber: $sequenceNumber,
        versionName: $versionName,
        status: $status,
        ttStart: $ttStart,
        ttEnd: $ttEnd,
        vtStart: $vtStart,
        vtEnd: $vtEnd,
        previousVersionId: $previousVersionId,
        supersededById: $supersededById,
        mergedFromIds: $mergedFromIds,
        splitIntoIds: $splitIntoIds,
        changeType: $changeType,
        changeReason: $changeReason,
        changedBy: $changedBy,
        changeSource: $changeSource,
        extractionCycleId: $extractionCycleId,
        contentHash: $contentHash,
        previousHash: $previousHash,
        chainHash: $chainHash,
        signature: $signature,
        properties: $properties,
        nodeType: $nodeType
      })
      RETURN n
    `;

    const results = await this.client.executeWrite<{ n: Record<string, unknown> }>(cypher, params);
    return this.mapToEntity(results[0].n);
  }

  async findByVersionId(versionId: string): Promise<NodeVersion | null> {
    return this.findById(versionId, 'versionId');
  }

  async findActiveByEntityId(entityId: string): Promise<NodeVersion | null> {
    const cypher = `
      MATCH (n:NodeVersion {entityId: $entityId, status: 'ACTIVE'})
      RETURN n
    `;
    const results = await this.client.executeQuery<{ n: Record<string, unknown> }>(cypher, { entityId });
    if (results.length === 0) return null;
    return this.mapToEntity(results[0].n);
  }

  async findAllVersionsByEntityId(entityId: string): Promise<NodeVersion[]> {
    const cypher = `
      MATCH (n:NodeVersion {entityId: $entityId})
      RETURN n
      ORDER BY n.sequenceNumber ASC
    `;
    const results = await this.client.executeQuery<{ n: Record<string, unknown> }>(cypher, { entityId });
    return results.map(r => this.mapToEntity(r.n));
  }

  async findByNamespace(namespace: Namespace, status?: NodeStatus, limit: number = 100): Promise<NodeVersion[]> {
    let cypher: string;
    let params: Record<string, unknown>;

    if (status) {
      cypher = `
        MATCH (n:NodeVersion {namespace: $namespace, status: $status})
        RETURN n
        ORDER BY n.sequenceNumber DESC
        LIMIT $limit
      `;
      params = { namespace, status, limit };
    } else {
      cypher = `
        MATCH (n:NodeVersion {namespace: $namespace})
        RETURN n
        ORDER BY n.sequenceNumber DESC
        LIMIT $limit
      `;
      params = { namespace, limit };
    }

    const results = await this.client.executeQuery<{ n: Record<string, unknown> }>(cypher, params);
    return results.map(r => this.mapToEntity(r.n));
  }

  async updateStatus(versionId: string, status: NodeStatus, supersededById?: string): Promise<NodeVersion> {
    const cypher = `
      MATCH (n:NodeVersion {versionId: $versionId})
      SET n.status = $status,
          n.ttEnd = CASE WHEN $status IN ['SUPERSEDED', 'DEPRECATED', 'MERGED', 'DELETED'] THEN datetime() ELSE n.ttEnd END,
          n.supersededById = $supersededById
      RETURN n
    `;

    const results = await this.client.executeWrite<{ n: Record<string, unknown> }>(cypher, {
      versionId,
      status,
      supersededById: supersededById || null
    });

    if (results.length === 0) {
      throw new EntityNotFoundError(versionId, 'NodeVersion');
    }

    return this.mapToEntity(results[0].n);
  }

  async setSupersededBy(versionId: string, supersededById: string): Promise<void> {
    const cypher = `
      MATCH (n:NodeVersion {versionId: $versionId})
      SET n.supersededById = $supersededById, n.ttEnd = datetime()
    `;
    await this.client.executeWrite(cypher, { versionId, supersededById });
  }

  async createVersionOfRelationship(fromVersionId: string, toVersionId: string): Promise<void> {
    const cypher = `
      MATCH (from:NodeVersion {versionId: $fromVersionId})
      MATCH (to:NodeVersion {versionId: $toVersionId})
      CREATE (from)-[:VERSION_OF]->(to)
    `;
    await this.client.executeWrite(cypher, { fromVersionId, toVersionId });
  }

  async createSupersedesRelationship(fromVersionId: string, toVersionId: string, reason: string): Promise<void> {
    const cypher = `
      MATCH (from:NodeVersion {versionId: $fromVersionId})
      MATCH (to:NodeVersion {versionId: $toVersionId})
      CREATE (from)-[:SUPERSEDES {supersededAt: datetime(), reason: $reason}]->(to)
    `;
    await this.client.executeWrite(cypher, { fromVersionId, toVersionId, reason });
  }

  async createMergedFromRelationship(resultVersionId: string, sourceVersionId: string, mergeId: string, weight: number): Promise<void> {
    const cypher = `
      MATCH (result:NodeVersion {versionId: $resultVersionId})
      MATCH (source:NodeVersion {versionId: $sourceVersionId})
      CREATE (result)-[:MERGED_FROM {mergeId: $mergeId, contributionWeight: $weight}]->(source)
    `;
    await this.client.executeWrite(cypher, { resultVersionId, sourceVersionId, mergeId, weight });
  }

  async queryAtValidTime(namespace: Namespace, validTime: Date, filters?: Record<string, unknown>): Promise<NodeVersion[]> {
    const params: Record<string, unknown> = {
      namespace,
      validTime: validTime.toISOString()
    };

    const cypher = `
      MATCH (n:NodeVersion {namespace: $namespace})
      WHERE n.vtStart <= datetime($validTime)
        AND (n.vtEnd IS NULL OR n.vtEnd > datetime($validTime))
        AND n.ttEnd IS NULL
      RETURN n
      ORDER BY n.sequenceNumber DESC
    `;

    const results = await this.client.executeQuery<{ n: Record<string, unknown> }>(cypher, params);
    return results.map(r => this.mapToEntity(r.n));
  }

  async queryAtTransactionTime(namespace: Namespace, transactionTime: Date): Promise<NodeVersion[]> {
    const cypher = `
      MATCH (n:NodeVersion {namespace: $namespace})
      WHERE n.ttStart <= datetime($transactionTime)
        AND (n.ttEnd IS NULL OR n.ttEnd > datetime($transactionTime))
      RETURN n
      ORDER BY n.sequenceNumber DESC
    `;

    const results = await this.client.executeQuery<{ n: Record<string, unknown> }>(cypher, {
      namespace,
      transactionTime: transactionTime.toISOString()
    });
    return results.map(r => this.mapToEntity(r.n));
  }

  async queryAtBothTimes(namespace: Namespace, validTime: Date, transactionTime: Date): Promise<NodeVersion[]> {
    const cypher = `
      MATCH (n:NodeVersion {namespace: $namespace})
      WHERE n.vtStart <= datetime($validTime)
        AND (n.vtEnd IS NULL OR n.vtEnd > datetime($validTime))
        AND n.ttStart <= datetime($transactionTime)
        AND (n.ttEnd IS NULL OR n.ttEnd > datetime($transactionTime))
      RETURN n
      ORDER BY n.sequenceNumber DESC
    `;

    const results = await this.client.executeQuery<{ n: Record<string, unknown> }>(cypher, {
      namespace,
      validTime: validTime.toISOString(),
      transactionTime: transactionTime.toISOString()
    });
    return results.map(r => this.mapToEntity(r.n));
  }

  async getLineage(entityId: string): Promise<NodeVersion[]> {
    const cypher = `
      MATCH (n:NodeVersion {entityId: $entityId})
      OPTIONAL MATCH path = (n)-[:VERSION_OF*]->(ancestor:NodeVersion)
      WITH n, ancestor
      ORDER BY CASE WHEN ancestor IS NULL THEN n.sequenceNumber ELSE ancestor.sequenceNumber END ASC
      RETURN DISTINCT CASE WHEN ancestor IS NULL THEN n ELSE ancestor END as version
    `;

    const results = await this.client.executeQuery<{ version: Record<string, unknown> }>(cypher, { entityId });
    return results.map(r => this.mapToEntity(r.version));
  }
}
