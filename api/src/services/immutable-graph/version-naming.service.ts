/**
 * Version Naming Service for Immutable Graph Architecture
 * Generates and parses version names following the naming convention:
 * {NAMESPACE}-{EPOCH}-{CODENAME}-{TYPE}-{SEQUENCE}
 */

import { Namespace, VersionCodename, ChangeType } from '../../types/immutable-graph.types';

export interface VersionNameComponents {
  namespace: Namespace;
  projectId?: string;
  epoch: number;
  codename: VersionCodename;
  type: 'node' | 'edge' | 'subgraph';
  sequence: number;
}

export class VersionNamingService {

  /**
   * Generate a version name from components
   * Example: CORE-9000-Genesis-node-001
   * Example with project: PRJ:imis-9000-FastForward-node-127
   */
  static generate(components: VersionNameComponents): string {
    const namespacePrefix = this.getNamespacePrefix(components.namespace, components.projectId);
    const paddedSequence = String(components.sequence).padStart(3, '0');

    return `${namespacePrefix}-${components.epoch}-${components.codename}-${components.type}-${paddedSequence}`;
  }

  /**
   * Parse a version name into components
   * Returns null if format is invalid
   */
  static parse(versionName: string): VersionNameComponents | null {
    const regex = /^([A-Z]+)(?::([a-z0-9-]+))?-(\d{4})-([A-Za-z]+)-(node|edge|subgraph)-(\d{3})$/;
    const match = versionName.match(regex);

    if (!match) return null;

    return {
      namespace: match[1] as Namespace,
      projectId: match[2] || undefined,
      epoch: parseInt(match[3], 10),
      codename: match[4] as VersionCodename,
      type: match[5] as 'node' | 'edge' | 'subgraph',
      sequence: parseInt(match[6], 10)
    };
  }

  /**
   * Map ChangeType to appropriate VersionCodename
   */
  static codenameFromChangeType(changeType: ChangeType): VersionCodename {
    const mapping: Record<ChangeType, VersionCodename> = {
      [ChangeType.CREATE]: VersionCodename.Genesis,
      [ChangeType.UPDATE]: VersionCodename.Refinement,
      [ChangeType.DEPRECATE]: VersionCodename.Refinement,
      [ChangeType.MERGE]: VersionCodename.Consolidation,
      [ChangeType.SPLIT]: VersionCodename.Refinement,
      [ChangeType.RESTORE]: VersionCodename.Correction
    };
    return mapping[changeType];
  }

  /**
   * Determine if a codename indicates automatic extraction
   */
  static isExtractionCodename(codename: VersionCodename): boolean {
    return codename === VersionCodename.Extraction || codename === VersionCodename.FastForward;
  }

  /**
   * Get human-readable description for codename
   */
  static getCodenameDescription(codename: VersionCodename): string {
    const descriptions: Record<VersionCodename, string> = {
      [VersionCodename.Genesis]: 'Initial creation',
      [VersionCodename.FastForward]: 'Bulk import or migration',
      [VersionCodename.Refinement]: 'Incremental improvements',
      [VersionCodename.Correction]: 'Error corrections',
      [VersionCodename.Enrichment]: 'Adding new attributes',
      [VersionCodename.Consolidation]: 'Merging duplicates',
      [VersionCodename.Extraction]: 'Automatic pipeline extraction',
      [VersionCodename.Learning]: 'Strategy pattern discovery'
    };
    return descriptions[codename];
  }

  /**
   * Generate next sequence number for a namespace
   */
  static getNextSequence(currentSequence: number, epoch: number, maxPerEpoch: number = 999): {
    sequence: number;
    epoch: number;
    overflow: boolean;
  } {
    if (currentSequence >= maxPerEpoch) {
      return {
        sequence: 1,
        epoch: epoch + 1,
        overflow: true
      };
    }
    return {
      sequence: currentSequence + 1,
      epoch,
      overflow: false
    };
  }

  /**
   * Validate version name format
   */
  static isValidVersionName(versionName: string): boolean {
    return this.parse(versionName) !== null;
  }

  /**
   * Compare two version names for ordering
   * Returns -1 if a < b, 0 if a == b, 1 if a > b
   */
  static compare(versionNameA: string, versionNameB: string): number {
    const a = this.parse(versionNameA);
    const b = this.parse(versionNameB);

    if (!a || !b) {
      throw new Error('Invalid version name format');
    }

    // Compare by epoch first
    if (a.epoch !== b.epoch) {
      return a.epoch < b.epoch ? -1 : 1;
    }

    // Then by sequence
    if (a.sequence !== b.sequence) {
      return a.sequence < b.sequence ? -1 : 1;
    }

    return 0;
  }

  /**
   * Get namespace prefix for version name
   */
  private static getNamespacePrefix(namespace: Namespace, projectId?: string): string {
    if (namespace === Namespace.PROJECT && projectId) {
      return `PRJ:${projectId}`;
    }

    const prefixes: Record<Namespace, string> = {
      [Namespace.CORE]: 'CORE',
      [Namespace.PROJECT]: 'PRJ',
      [Namespace.META]: 'META',
      [Namespace.COMMON]: 'CMN'
    };

    return prefixes[namespace];
  }
}
