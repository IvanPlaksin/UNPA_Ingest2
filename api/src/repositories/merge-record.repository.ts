/**
 * Merge Record Repository
 * Manages merge operations between nodes
 */

import { BaseRepository } from './base.repository';
import { MemgraphClient } from '../db/memgraph.client';
import {
  MergeRecord,
  Namespace,
  EntityNotFoundError
} from '../types/immutable-graph.types';

export class MergeRecordRepository extends BaseRepository<MergeRecord> {
  protected label = 'MergeRecord';

  constructor(client: MemgraphClient) {
    super(client);
  }

  protected mapToEntity(record: Record<string, unknown>): MergeRecord {
    return {
      mergeId: record.mergeId as string,
      namespace: record.namespace as Namespace,
      sourceEntityIds: record.sourceEntityIds as string[],
      sourceVersionIds: record.sourceVersionIds as string[],
      resultEntityId: record.resultEntityId as string,
      resultVersionId: record.resultVersionId as string,
      mergedAt: new Date(record.mergedAt as string),
      mergedBy: record.mergedBy as string,
      mergeReason: record.mergeReason as string,
      mergeStrategy: record.mergeStrategy as 'UNION' | 'INTERSECTION' | 'CUSTOM',
      conflictResolutions: typeof record.conflictResolutions === 'string'
        ? JSON.parse(record.conflictResolutions)
        : (record.conflictResolutions as Record<string, unknown>) || {},
      contributionWeights: typeof record.contributionWeights === 'string'
        ? JSON.parse(record.contributionWeights)
        : (record.contributionWeights as Record<string, number>) || {}
    };
  }

  protected mapToParams(entity: Partial<MergeRecord>): Record<string, unknown> {
    return {
      mergeId: entity.mergeId,
      namespace: entity.namespace,
      sourceEntityIds: entity.sourceEntityIds || [],
      sourceVersionIds: entity.sourceVersionIds || [],
      resultEntityId: entity.resultEntityId,
      resultVersionId: entity.resultVersionId,
      mergedAt: entity.mergedAt?.toISOString(),
      mergedBy: entity.mergedBy,
      mergeReason: entity.mergeReason,
      mergeStrategy: entity.mergeStrategy,
      conflictResolutions: JSON.stringify(entity.conflictResolutions || {}),
      contributionWeights: JSON.stringify(entity.contributionWeights || {})
    };
  }

  async create(merge: MergeRecord): Promise<MergeRecord> {
    const params = this.mapToParams(merge);

    const cypher = `
      CREATE (m:MergeRecord {
        mergeId: $mergeId,
        namespace: $namespace,
        sourceEntityIds: $sourceEntityIds,
        sourceVersionIds: $sourceVersionIds,
        resultEntityId: $resultEntityId,
        resultVersionId: $resultVersionId,
        mergedAt: $mergedAt,
        mergedBy: $mergedBy,
        mergeReason: $mergeReason,
        mergeStrategy: $mergeStrategy,
        conflictResolutions: $conflictResolutions,
        contributionWeights: $contributionWeights
      })
      RETURN m
    `;

    const results = await this.client.executeWrite<{ m: Record<string, unknown> }>(cypher, params);
    return this.mapToEntity(results[0].m);
  }

  async findByMergeId(mergeId: string): Promise<MergeRecord | null> {
    return this.findById(mergeId, 'mergeId');
  }

  async findByResultEntityId(resultEntityId: string): Promise<MergeRecord | null> {
    const cypher = `
      MATCH (m:MergeRecord {resultEntityId: $resultEntityId})
      RETURN m
    `;

    const results = await this.client.executeQuery<{ m: Record<string, unknown> }>(cypher, { resultEntityId });
    if (results.length === 0) return null;
    return this.mapToEntity(results[0].m);
  }

  async findBySourceEntityId(sourceEntityId: string): Promise<MergeRecord[]> {
    const cypher = `
      MATCH (m:MergeRecord)
      WHERE $sourceEntityId IN m.sourceEntityIds
      RETURN m
      ORDER BY m.mergedAt DESC
    `;

    const results = await this.client.executeQuery<{ m: Record<string, unknown> }>(cypher, { sourceEntityId });
    return results.map(r => this.mapToEntity(r.m));
  }

  async findByNamespace(namespace: Namespace, limit: number = 100): Promise<MergeRecord[]> {
    const cypher = `
      MATCH (m:MergeRecord {namespace: $namespace})
      RETURN m
      ORDER BY m.mergedAt DESC
      LIMIT $limit
    `;

    const results = await this.client.executeQuery<{ m: Record<string, unknown> }>(cypher, { namespace, limit });
    return results.map(r => this.mapToEntity(r.m));
  }

  async findByMergedBy(userId: string, limit: number = 50): Promise<MergeRecord[]> {
    const cypher = `
      MATCH (m:MergeRecord {mergedBy: $userId})
      RETURN m
      ORDER BY m.mergedAt DESC
      LIMIT $limit
    `;

    const results = await this.client.executeQuery<{ m: Record<string, unknown> }>(cypher, { userId, limit });
    return results.map(r => this.mapToEntity(r.m));
  }

  async findMergesInRange(startDate: Date, endDate: Date): Promise<MergeRecord[]> {
    const cypher = `
      MATCH (m:MergeRecord)
      WHERE datetime(m.mergedAt) >= datetime($startDate)
        AND datetime(m.mergedAt) <= datetime($endDate)
      RETURN m
      ORDER BY m.mergedAt DESC
    `;

    const results = await this.client.executeQuery<{ m: Record<string, unknown> }>(cypher, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });
    return results.map(r => this.mapToEntity(r.m));
  }

  async getMergeLineage(entityId: string): Promise<MergeRecord[]> {
    // Get all merges that led to this entity (recursive)
    const cypher = `
      MATCH path = (m:MergeRecord)-[:MERGED_INTO*0..]->(final:MergeRecord)
      WHERE final.resultEntityId = $entityId OR $entityId IN final.sourceEntityIds
      WITH m, length(path) as depth
      ORDER BY depth DESC
      RETURN DISTINCT m
    `;

    const results = await this.client.executeQuery<{ m: Record<string, unknown> }>(cypher, { entityId });
    return results.map(r => this.mapToEntity(r.m));
  }

  async countMergesByStrategy(namespace: Namespace): Promise<Record<string, number>> {
    const cypher = `
      MATCH (m:MergeRecord {namespace: $namespace})
      RETURN m.mergeStrategy as strategy, count(m) as count
    `;

    const results = await this.client.executeQuery<{ strategy: string; count: number }>(cypher, { namespace });
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r.strategy] = r.count;
    }
    return counts;
  }

  async createMergedIntoRelationship(sourceMergeId: string, targetMergeId: string): Promise<void> {
    const cypher = `
      MATCH (source:MergeRecord {mergeId: $sourceMergeId})
      MATCH (target:MergeRecord {mergeId: $targetMergeId})
      CREATE (source)-[:MERGED_INTO]->(target)
    `;
    await this.client.executeWrite(cypher, { sourceMergeId, targetMergeId });
  }
}
