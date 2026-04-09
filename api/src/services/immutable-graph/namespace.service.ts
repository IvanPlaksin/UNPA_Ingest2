/**
 * Namespace Service
 * Manages namespace configurations and version generation
 */

import { NamespaceConfigRepository } from '../../repositories/namespace-config.repository';
import { NamespaceConfig, Namespace, VersionCodename } from '../../types/immutable-graph.types';
import { VersionNamingService } from './version-naming.service';

export class NamespaceService {
  constructor(private namespaceRepo: NamespaceConfigRepository) {}

  async getOrCreate(namespace: Namespace, projectId?: string): Promise<NamespaceConfig> {
    const existing = await this.namespaceRepo.findByNamespaceId(namespace, projectId);
    if (existing) return existing;

    if (namespace === Namespace.PROJECT && projectId) {
      return this.namespaceRepo.getOrCreateProjectNamespace(projectId);
    }

    return this.namespaceRepo.create({
      namespaceId: namespace,
      projectId,
      currentEpoch: 9000,
      currentSequence: BigInt(0),
      lastVersionName: '',
      godModeAllowed: namespace === Namespace.PROJECT || namespace === Namespace.COMMON,
      description: this.getDefaultDescription(namespace, projectId)
    });
  }

  async getNextVersion(
    namespace: Namespace,
    entityType: 'node' | 'edge' | 'subgraph',
    codename: VersionCodename,
    projectId?: string
  ): Promise<{ versionName: string; epoch: number; sequence: bigint }> {
    await this.getOrCreate(namespace, projectId);
    const { epoch, sequence } = await this.namespaceRepo.incrementSequence(namespace, projectId);

    const versionName = VersionNamingService.generate({
      namespace,
      projectId,
      epoch,
      codename,
      type: entityType,
      sequence: Number(sequence)
    });

    await this.namespaceRepo.updateLastVersionName(namespace, versionName, projectId);

    return { versionName, epoch, sequence };
  }

  async incrementEpoch(namespace: Namespace, projectId?: string): Promise<{ epoch: number; sequence: bigint }> {
    return this.namespaceRepo.incrementEpoch(namespace, projectId);
  }

  async isGodModeAllowed(namespace: Namespace, projectId?: string): Promise<boolean> {
    const config = await this.getOrCreate(namespace, projectId);
    return config.godModeAllowed;
  }

  async getCurrentSequence(namespace: Namespace, projectId?: string): Promise<bigint> {
    const config = await this.getOrCreate(namespace, projectId);
    return config.currentSequence;
  }

  async getCurrentEpoch(namespace: Namespace, projectId?: string): Promise<number> {
    const config = await this.getOrCreate(namespace, projectId);
    return config.currentEpoch;
  }

  private getDefaultDescription(namespace: Namespace, projectId?: string): string {
    const descriptions: Record<Namespace, string> = {
      [Namespace.CORE]: 'UN ProjectAdvisor system knowledge',
      [Namespace.PROJECT]: projectId ? `Project namespace: ${projectId}` : 'Project namespace',
      [Namespace.META]: 'Methodological knowledge and extraction strategies',
      [Namespace.COMMON]: 'Shared vocabulary and terminology'
    };
    return descriptions[namespace];
  }
}
