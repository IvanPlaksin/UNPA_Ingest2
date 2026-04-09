/**
 * Unit tests for HashService
 */

import { HashService } from '../hash.service';
import { NodeVersion, EdgeVersion, Namespace } from '../../../types/immutable-graph.types';

describe('HashService', () => {
  describe('calculateContentHash', () => {
    it('should generate consistent hash for same node content', () => {
      const node: Partial<NodeVersion> = {
        entityId: 'test-123',
        nodeType: 'Function',
        namespace: Namespace.PROJECT,
        properties: { name: 'calculateDiscount', complexity: 12 }
      };

      const hash1 = HashService.calculateContentHash(node);
      const hash2 = HashService.calculateContentHash(node);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should generate different hash for different properties', () => {
      const node1: Partial<NodeVersion> = {
        entityId: 'test-123',
        nodeType: 'Function',
        namespace: Namespace.PROJECT,
        properties: { name: 'func1' }
      };

      const node2: Partial<NodeVersion> = {
        entityId: 'test-123',
        nodeType: 'Function',
        namespace: Namespace.PROJECT,
        properties: { name: 'func2' }
      };

      expect(HashService.calculateContentHash(node1))
        .not.toBe(HashService.calculateContentHash(node2));
    });

    it('should handle edge content hash', () => {
      const edge: Partial<EdgeVersion> = {
        sourceEntityId: 'node-1',
        targetEntityId: 'node-2',
        edgeType: 'CALLS',
        properties: { weight: 0.8 }
      };

      const hash = HashService.calculateContentHash(edge);
      expect(hash).toHaveLength(64);
    });

    it('should sort properties for deterministic hash', () => {
      const node1: Partial<NodeVersion> = {
        entityId: 'test-123',
        nodeType: 'Function',
        namespace: Namespace.PROJECT,
        properties: { b: 2, a: 1 }
      };

      const node2: Partial<NodeVersion> = {
        entityId: 'test-123',
        nodeType: 'Function',
        namespace: Namespace.PROJECT,
        properties: { a: 1, b: 2 }
      };

      expect(HashService.calculateContentHash(node1))
        .toBe(HashService.calculateContentHash(node2));
    });

    it('should handle nested properties', () => {
      const node: Partial<NodeVersion> = {
        entityId: 'test-123',
        nodeType: 'Function',
        namespace: Namespace.PROJECT,
        properties: {
          config: { nested: { deep: 'value' } },
          name: 'test'
        }
      };

      const hash = HashService.calculateContentHash(node);
      expect(hash).toHaveLength(64);
    });

    it('should handle array properties', () => {
      const node: Partial<NodeVersion> = {
        entityId: 'test-123',
        nodeType: 'Function',
        namespace: Namespace.PROJECT,
        properties: {
          tags: ['api', 'service', 'core'],
          params: [{ name: 'a', type: 'string' }]
        }
      };

      const hash = HashService.calculateContentHash(node);
      expect(hash).toHaveLength(64);
    });

    it('should handle empty properties', () => {
      const node: Partial<NodeVersion> = {
        entityId: 'test-123',
        nodeType: 'Function',
        namespace: Namespace.PROJECT,
        properties: {}
      };

      const hash = HashService.calculateContentHash(node);
      expect(hash).toHaveLength(64);
    });

    it('should generate different hashes for different entity types', () => {
      const node: Partial<NodeVersion> = {
        entityId: 'test-123',
        nodeType: 'Function',
        namespace: Namespace.PROJECT,
        properties: { name: 'test' }
      };

      const edge: Partial<EdgeVersion> = {
        sourceEntityId: 'test-123',
        targetEntityId: 'test-456',
        edgeType: 'CALLS',
        properties: { name: 'test' }
      };

      expect(HashService.calculateContentHash(node))
        .not.toBe(HashService.calculateContentHash(edge));
    });
  });

  describe('calculateChainHash', () => {
    it('should generate genesis hash without previous', () => {
      const contentHash = 'abc123def456';
      const chainHash = HashService.calculateChainHash(contentHash, null);

      expect(chainHash).toHaveLength(64);
      expect(chainHash).not.toBe(contentHash);
    });

    it('should chain with previous hash', () => {
      const contentHash = 'abc123def456';
      const previousChainHash = 'def456ghi789';

      const chainHash = HashService.calculateChainHash(contentHash, previousChainHash);

      expect(chainHash).toHaveLength(64);
      expect(chainHash).not.toBe(contentHash);
      expect(chainHash).not.toBe(previousChainHash);
    });

    it('should produce different hashes for different previous hashes', () => {
      const contentHash = 'abc123';

      const chain1 = HashService.calculateChainHash(contentHash, 'prev1');
      const chain2 = HashService.calculateChainHash(contentHash, 'prev2');

      expect(chain1).not.toBe(chain2);
    });

    it('should be deterministic', () => {
      const contentHash = 'abc123';
      const previousHash = 'def456';

      const chain1 = HashService.calculateChainHash(contentHash, previousHash);
      const chain2 = HashService.calculateChainHash(contentHash, previousHash);

      expect(chain1).toBe(chain2);
    });
  });

  describe('verifyChain', () => {
    it('should verify valid genesis chain', () => {
      const contentHash = HashService.calculateContentHash({
        entityId: 'test',
        nodeType: 'Test',
        namespace: Namespace.CORE,
        properties: {}
      });

      const version = {
        contentHash,
        chainHash: HashService.calculateChainHash(contentHash, null)
      } as NodeVersion;

      expect(HashService.verifyChain(version, null)).toBe(true);
    });

    it('should verify valid chained version', () => {
      const contentHash1 = HashService.calculateContentHash({
        entityId: 'test',
        nodeType: 'Test',
        namespace: Namespace.CORE,
        properties: { v: 1 }
      });

      const version1 = {
        contentHash: contentHash1,
        chainHash: HashService.calculateChainHash(contentHash1, null)
      } as NodeVersion;

      const contentHash2 = HashService.calculateContentHash({
        entityId: 'test',
        nodeType: 'Test',
        namespace: Namespace.CORE,
        properties: { v: 2 }
      });

      const version2 = {
        contentHash: contentHash2,
        chainHash: HashService.calculateChainHash(contentHash2, version1.chainHash)
      } as NodeVersion;

      expect(HashService.verifyChain(version2, version1)).toBe(true);
    });

    it('should detect tampered chain hash', () => {
      const version = {
        contentHash: 'abc',
        chainHash: 'tampered-hash'
      } as NodeVersion;

      expect(HashService.verifyChain(version, null)).toBe(false);
    });

    it('should detect tampered content', () => {
      const originalContent = HashService.calculateContentHash({
        entityId: 'test',
        nodeType: 'Test',
        namespace: Namespace.CORE,
        properties: { v: 1 }
      });

      const version = {
        contentHash: 'tampered-content-hash',
        chainHash: HashService.calculateChainHash(originalContent, null)
      } as NodeVersion;

      expect(HashService.verifyChain(version, null)).toBe(false);
    });

    it('should detect broken chain link', () => {
      const version1 = {
        chainHash: 'version1-chain'
      } as NodeVersion;

      const version2 = {
        contentHash: 'content2',
        chainHash: HashService.calculateChainHash('content2', 'wrong-previous-hash')
      } as NodeVersion;

      expect(HashService.verifyChain(version2, version1)).toBe(false);
    });
  });

  describe('calculateSubgraphHash', () => {
    it('should combine node and edge hashes', () => {
      const nodeHashes = ['hash1', 'hash2'];
      const edgeHashes = ['hash3', 'hash4'];

      const subgraphHash = HashService.calculateSubgraphHash(nodeHashes, edgeHashes);

      expect(subgraphHash).toHaveLength(64);
    });

    it('should be order-independent', () => {
      const hash1 = HashService.calculateSubgraphHash(['a', 'b'], ['c', 'd']);
      const hash2 = HashService.calculateSubgraphHash(['b', 'a'], ['d', 'c']);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different subgraphs', () => {
      const hash1 = HashService.calculateSubgraphHash(['a', 'b'], ['c']);
      const hash2 = HashService.calculateSubgraphHash(['a', 'b'], ['d']);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty arrays', () => {
      const hash = HashService.calculateSubgraphHash([], []);
      expect(hash).toHaveLength(64);
    });

    it('should handle only nodes', () => {
      const hash = HashService.calculateSubgraphHash(['a', 'b', 'c'], []);
      expect(hash).toHaveLength(64);
    });

    it('should handle only edges', () => {
      const hash = HashService.calculateSubgraphHash([], ['x', 'y', 'z']);
      expect(hash).toHaveLength(64);
    });
  });

  describe('calculateAuditRecordHash', () => {
    it('should generate genesis hash for first audit record', () => {
      const record = {
        actionType: 'DELETE',
        entityId: 'test-123',
        reason: 'test deletion'
      };

      const hash = HashService.calculateAuditRecordHash(record, null);
      expect(hash).toHaveLength(64);
    });

    it('should chain audit records', () => {
      const record1 = { action: 'first' };
      const record2 = { action: 'second' };

      const hash1 = HashService.calculateAuditRecordHash(record1, null);
      const hash2 = HashService.calculateAuditRecordHash(record2, hash1);

      expect(hash1).not.toBe(hash2);
      expect(hash2).toHaveLength(64);
    });

    it('should be deterministic', () => {
      const record = { action: 'test', timestamp: '2024-01-01' };
      const prevHash = 'previous-hash';

      const hash1 = HashService.calculateAuditRecordHash(record, prevHash);
      const hash2 = HashService.calculateAuditRecordHash(record, prevHash);

      expect(hash1).toBe(hash2);
    });
  });
});
