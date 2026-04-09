/**
 * Hash Service for Immutable Graph Architecture
 * Provides content hashing and chain integrity verification
 */

import { createHash } from 'crypto';
import { NodeVersion, EdgeVersion } from '../../types/immutable-graph.types';

export class HashService {

  /**
   * Calculate content hash for a node or edge
   * Only hashes content properties, not metadata
   */
  static calculateContentHash(entity: Partial<NodeVersion> | Partial<EdgeVersion>): string {
    const isNode = 'nodeType' in entity;

    let hashInput: Record<string, unknown>;

    if (isNode) {
      const node = entity as Partial<NodeVersion>;
      hashInput = {
        id: node.entityId,
        type: node.nodeType,
        namespace: node.namespace,
        properties: this.sortObjectKeys(node.properties || {})
      };
    } else {
      const edge = entity as Partial<EdgeVersion>;
      hashInput = {
        sourceId: edge.sourceEntityId,
        targetId: edge.targetEntityId,
        type: edge.edgeType,
        properties: this.sortObjectKeys(edge.properties || {})
      };
    }

    // Sort keys and create canonical JSON representation
    const sortedInput = this.sortObjectKeys(hashInput);
    const canonical = JSON.stringify(sortedInput);
    return createHash('sha256').update(canonical).digest('hex');
  }

  /**
   * Calculate chain hash for Merkle chain integrity
   * Genesis versions use 'GENESIS:' prefix
   */
  static calculateChainHash(currentContentHash: string, previousChainHash: string | null): string {
    if (!previousChainHash) {
      return createHash('sha256').update(`GENESIS:${currentContentHash}`).digest('hex');
    }
    return createHash('sha256').update(`${previousChainHash}:${currentContentHash}`).digest('hex');
  }

  /**
   * Verify chain integrity between versions
   */
  static verifyChain(version: NodeVersion | EdgeVersion, previousVersion: NodeVersion | EdgeVersion | null): boolean {
    const expectedChainHash = this.calculateChainHash(
      version.contentHash,
      previousVersion?.chainHash || null
    );
    return version.chainHash === expectedChainHash;
  }

  /**
   * Calculate subgraph hash from node and edge hashes
   * Order-independent for deterministic hashing
   */
  static calculateSubgraphHash(nodeHashes: string[], edgeHashes: string[]): string {
    const allHashes = [...nodeHashes, ...edgeHashes].sort();
    const joined = allHashes.join(':');
    return createHash('sha256').update(joined).digest('hex');
  }

  /**
   * Calculate audit record hash for God Mode audit chain
   */
  static calculateAuditRecordHash(record: Record<string, unknown>, previousHash: string | null): string {
    const content = JSON.stringify(this.sortObjectKeys(record));
    if (!previousHash) {
      return createHash('sha256').update(`AUDIT_GENESIS:${content}`).digest('hex');
    }
    return createHash('sha256').update(`${previousHash}:${content}`).digest('hex');
  }

  /**
   * Sort object keys recursively for deterministic serialization
   */
  private static sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sorted[key] = this.sortObjectKeys(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        sorted[key] = value.map(item =>
          item && typeof item === 'object' ? this.sortObjectKeys(item as Record<string, unknown>) : item
        );
      } else {
        sorted[key] = value;
      }
    }
    return sorted;
  }
}
