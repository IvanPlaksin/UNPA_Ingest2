/**
 * Namespace Config Repository
 * Manages namespace configurations for versioning
 */

import { BaseRepository } from './base.repository';
import { MemgraphClient } from '../db/memgraph.client';
import { NamespaceConfig, Namespace } from '../types/immutable-graph.types';

export class NamespaceConfigRepository extends BaseRepository<NamespaceConfig> {
  protected label = 'NamespaceConfig';

  constructor(client: MemgraphClient) {
    super(client);
  }

  protected mapToEntity(record: Record<string, unknown>): NamespaceConfig {
    return {
      namespaceId: record.namespaceId as Namespace,
      projectId: record.projectId as string | undefined,
      currentEpoch: record.currentEpoch as number,
      currentSequence: BigInt(record.currentSequence as number),
      lastVersionName: record.lastVersionName as string,
      godModeAllowed: record.godModeAllowed as boolean,
      description: record.description as string,
      createdAt: new Date(record.createdAt as string)
    };
  }

  protected mapToParams(entity: Partial<NamespaceConfig>): Record<string, unknown> {
    return {
      namespaceId: entity.namespaceId,
      projectId: entity.projectId || null,
      currentEpoch: entity.currentEpoch,
      currentSequence: entity.currentSequence ? Number(entity.currentSequence) : 0,
      lastVersionName: entity.lastVersionName || '',
      godModeAllowed: entity.godModeAllowed ?? true,
      description: entity.description || '',
      createdAt: entity.createdAt?.toISOString() || new Date().toISOString()
    };
  }

  async findByNamespaceId(namespaceId: Namespace, projectId?: string): Promise<NamespaceConfig | null> {
    let cypher: string;
    let params: Record<string, unknown>;

    if (projectId) {
      cypher = `MATCH (n:NamespaceConfig {namespaceId: $namespaceId, projectId: $projectId}) RETURN n`;
      params = { namespaceId, projectId };
    } else {
      cypher = `MATCH (n:NamespaceConfig {namespaceId: $namespaceId}) WHERE n.projectId IS NULL RETURN n`;
      params = { namespaceId };
    }

    const results = await this.client.executeQuery<{ n: Record<string, unknown> }>(cypher, params);
    if (results.length === 0) return null;
    return this.mapToEntity(results[0].n);
  }

  async create(config: Omit<NamespaceConfig, 'createdAt'>): Promise<NamespaceConfig> {
    const fullConfig: NamespaceConfig = { ...config, createdAt: new Date() };
    const params = this.mapToParams(fullConfig);

    const cypher = `
      CREATE (n:NamespaceConfig {
        namespaceId: $namespaceId,
        projectId: $projectId,
        currentEpoch: $currentEpoch,
        currentSequence: $currentSequence,
        lastVersionName: $lastVersionName,
        godModeAllowed: $godModeAllowed,
        description: $description,
        createdAt: $createdAt
      })
      RETURN n
    `;

    const results = await this.client.executeWrite<{ n: Record<string, unknown> }>(cypher, params);
    return this.mapToEntity(results[0].n);
  }

  async incrementSequence(namespaceId: Namespace, projectId?: string): Promise<{ epoch: number; sequence: bigint }> {
    let cypher: string;
    let params: Record<string, unknown>;

    if (projectId) {
      cypher = `
        MATCH (n:NamespaceConfig {namespaceId: $namespaceId, projectId: $projectId})
        SET n.currentSequence = n.currentSequence + 1
        RETURN n.currentEpoch as epoch, n.currentSequence as sequence
      `;
      params = { namespaceId, projectId };
    } else {
      cypher = `
        MATCH (n:NamespaceConfig {namespaceId: $namespaceId})
        WHERE n.projectId IS NULL
        SET n.currentSequence = n.currentSequence + 1
        RETURN n.currentEpoch as epoch, n.currentSequence as sequence
      `;
      params = { namespaceId };
    }

    const results = await this.client.executeWrite<{ epoch: number; sequence: number }>(cypher, params);
    return {
      epoch: results[0].epoch,
      sequence: BigInt(results[0].sequence)
    };
  }

  async incrementEpoch(namespaceId: Namespace, projectId?: string): Promise<{ epoch: number; sequence: bigint }> {
    let cypher: string;
    let params: Record<string, unknown>;

    if (projectId) {
      cypher = `
        MATCH (n:NamespaceConfig {namespaceId: $namespaceId, projectId: $projectId})
        SET n.currentEpoch = n.currentEpoch + 1, n.currentSequence = 0
        RETURN n.currentEpoch as epoch, n.currentSequence as sequence
      `;
      params = { namespaceId, projectId };
    } else {
      cypher = `
        MATCH (n:NamespaceConfig {namespaceId: $namespaceId})
        WHERE n.projectId IS NULL
        SET n.currentEpoch = n.currentEpoch + 1, n.currentSequence = 0
        RETURN n.currentEpoch as epoch, n.currentSequence as sequence
      `;
      params = { namespaceId };
    }

    const results = await this.client.executeWrite<{ epoch: number; sequence: number }>(cypher, params);
    return {
      epoch: results[0].epoch,
      sequence: BigInt(results[0].sequence)
    };
  }

  async updateLastVersionName(namespaceId: Namespace, versionName: string, projectId?: string): Promise<void> {
    let cypher: string;
    let params: Record<string, unknown>;

    if (projectId) {
      cypher = `
        MATCH (n:NamespaceConfig {namespaceId: $namespaceId, projectId: $projectId})
        SET n.lastVersionName = $versionName
      `;
      params = { namespaceId, projectId, versionName };
    } else {
      cypher = `
        MATCH (n:NamespaceConfig {namespaceId: $namespaceId})
        WHERE n.projectId IS NULL
        SET n.lastVersionName = $versionName
      `;
      params = { namespaceId, versionName };
    }

    await this.client.executeWrite(cypher, params);
  }

  async getOrCreateProjectNamespace(projectId: string): Promise<NamespaceConfig> {
    const existing = await this.findByNamespaceId(Namespace.PROJECT, projectId);
    if (existing) return existing;

    return this.create({
      namespaceId: Namespace.PROJECT,
      projectId,
      currentEpoch: 9000,
      currentSequence: BigInt(0),
      lastVersionName: '',
      godModeAllowed: true,
      description: `Project namespace for ${projectId}`
    });
  }
}
