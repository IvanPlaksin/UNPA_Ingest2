/**
 * Unit tests for VersionNamingService
 */

import { VersionNamingService } from '../version-naming.service';
import { Namespace, VersionCodename, ChangeType } from '../../../types/immutable-graph.types';

describe('VersionNamingService', () => {
  describe('generate', () => {
    it('should generate correct version name for CORE namespace', () => {
      const name = VersionNamingService.generate({
        namespace: Namespace.CORE,
        epoch: 9000,
        codename: VersionCodename.Genesis,
        type: 'node',
        sequence: 1
      });

      expect(name).toBe('CORE-9000-Genesis-node-001');
    });

    it('should generate correct version name for PROJECT with projectId', () => {
      const name = VersionNamingService.generate({
        namespace: Namespace.PROJECT,
        projectId: 'imis',
        epoch: 9000,
        codename: VersionCodename.FastForward,
        type: 'node',
        sequence: 127
      });

      expect(name).toBe('PRJ:imis-9000-FastForward-node-127');
    });

    it('should generate correct version name for META namespace', () => {
      const name = VersionNamingService.generate({
        namespace: Namespace.META,
        epoch: 9001,
        codename: VersionCodename.Learning,
        type: 'edge',
        sequence: 3
      });

      expect(name).toBe('META-9001-Learning-edge-003');
    });

    it('should generate correct version name for COMMON namespace', () => {
      const name = VersionNamingService.generate({
        namespace: Namespace.COMMON,
        epoch: 9000,
        codename: VersionCodename.Enrichment,
        type: 'subgraph',
        sequence: 42
      });

      expect(name).toBe('CMN-9000-Enrichment-subgraph-042');
    });

    it('should pad sequence to 3 digits', () => {
      const name1 = VersionNamingService.generate({
        namespace: Namespace.CORE,
        epoch: 9000,
        codename: VersionCodename.Genesis,
        type: 'node',
        sequence: 1
      });
      expect(name1).toContain('-001');

      const name2 = VersionNamingService.generate({
        namespace: Namespace.CORE,
        epoch: 9000,
        codename: VersionCodename.Genesis,
        type: 'node',
        sequence: 99
      });
      expect(name2).toContain('-099');

      const name3 = VersionNamingService.generate({
        namespace: Namespace.CORE,
        epoch: 9000,
        codename: VersionCodename.Genesis,
        type: 'node',
        sequence: 999
      });
      expect(name3).toContain('-999');
    });

    it('should handle PROJECT without projectId', () => {
      const name = VersionNamingService.generate({
        namespace: Namespace.PROJECT,
        epoch: 9000,
        codename: VersionCodename.Extraction,
        type: 'node',
        sequence: 1
      });

      expect(name).toBe('PRJ-9000-Extraction-node-001');
    });
  });

  describe('parse', () => {
    it('should parse valid CORE version name', () => {
      const parsed = VersionNamingService.parse('CORE-9000-Genesis-node-001');

      expect(parsed).toEqual({
        namespace: 'CORE',
        projectId: undefined,
        epoch: 9000,
        codename: 'Genesis',
        type: 'node',
        sequence: 1
      });
    });

    it('should parse version name with projectId', () => {
      const parsed = VersionNamingService.parse('PRJ:imis-9000-FastForward-node-127');

      expect(parsed).toEqual({
        namespace: 'PRJ',
        projectId: 'imis',
        epoch: 9000,
        codename: 'FastForward',
        type: 'node',
        sequence: 127
      });
    });

    it('should parse META version name', () => {
      const parsed = VersionNamingService.parse('META-9001-Learning-edge-003');

      expect(parsed).toEqual({
        namespace: 'META',
        projectId: undefined,
        epoch: 9001,
        codename: 'Learning',
        type: 'edge',
        sequence: 3
      });
    });

    it('should parse COMMON version name', () => {
      const parsed = VersionNamingService.parse('CMN-9000-Enrichment-subgraph-042');

      expect(parsed).toEqual({
        namespace: 'CMN',
        projectId: undefined,
        epoch: 9000,
        codename: 'Enrichment',
        type: 'subgraph',
        sequence: 42
      });
    });

    it('should return null for invalid format', () => {
      expect(VersionNamingService.parse('invalid-name')).toBeNull();
      expect(VersionNamingService.parse('')).toBeNull();
      expect(VersionNamingService.parse('CORE-9000')).toBeNull();
      expect(VersionNamingService.parse('CORE-9000-Genesis')).toBeNull();
      expect(VersionNamingService.parse('core-9000-genesis-node-001')).toBeNull(); // lowercase namespace
    });

    it('should handle edge type', () => {
      const parsed = VersionNamingService.parse('CORE-9000-Refinement-edge-005');
      expect(parsed?.type).toBe('edge');
    });

    it('should handle subgraph type', () => {
      const parsed = VersionNamingService.parse('CORE-9000-Consolidation-subgraph-010');
      expect(parsed?.type).toBe('subgraph');
    });
  });

  describe('codenameFromChangeType', () => {
    it('should map CREATE to Genesis', () => {
      expect(VersionNamingService.codenameFromChangeType(ChangeType.CREATE))
        .toBe(VersionCodename.Genesis);
    });

    it('should map UPDATE to Refinement', () => {
      expect(VersionNamingService.codenameFromChangeType(ChangeType.UPDATE))
        .toBe(VersionCodename.Refinement);
    });

    it('should map DEPRECATE to Refinement', () => {
      expect(VersionNamingService.codenameFromChangeType(ChangeType.DEPRECATE))
        .toBe(VersionCodename.Refinement);
    });

    it('should map MERGE to Consolidation', () => {
      expect(VersionNamingService.codenameFromChangeType(ChangeType.MERGE))
        .toBe(VersionCodename.Consolidation);
    });

    it('should map SPLIT to Refinement', () => {
      expect(VersionNamingService.codenameFromChangeType(ChangeType.SPLIT))
        .toBe(VersionCodename.Refinement);
    });

    it('should map RESTORE to Correction', () => {
      expect(VersionNamingService.codenameFromChangeType(ChangeType.RESTORE))
        .toBe(VersionCodename.Correction);
    });
  });

  describe('isExtractionCodename', () => {
    it('should return true for Extraction', () => {
      expect(VersionNamingService.isExtractionCodename(VersionCodename.Extraction)).toBe(true);
    });

    it('should return true for FastForward', () => {
      expect(VersionNamingService.isExtractionCodename(VersionCodename.FastForward)).toBe(true);
    });

    it('should return false for Genesis', () => {
      expect(VersionNamingService.isExtractionCodename(VersionCodename.Genesis)).toBe(false);
    });

    it('should return false for Refinement', () => {
      expect(VersionNamingService.isExtractionCodename(VersionCodename.Refinement)).toBe(false);
    });
  });

  describe('getCodenameDescription', () => {
    it('should return description for Genesis', () => {
      const desc = VersionNamingService.getCodenameDescription(VersionCodename.Genesis);
      expect(desc).toBe('Initial creation');
    });

    it('should return description for FastForward', () => {
      const desc = VersionNamingService.getCodenameDescription(VersionCodename.FastForward);
      expect(desc).toContain('migration');
    });

    it('should return description for all codenames', () => {
      Object.values(VersionCodename).forEach(codename => {
        const desc = VersionNamingService.getCodenameDescription(codename);
        expect(desc).toBeDefined();
        expect(desc.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getNextSequence', () => {
    it('should increment sequence normally', () => {
      const result = VersionNamingService.getNextSequence(1, 9000);
      expect(result).toEqual({
        sequence: 2,
        epoch: 9000,
        overflow: false
      });
    });

    it('should handle sequence at max', () => {
      const result = VersionNamingService.getNextSequence(999, 9000);
      expect(result).toEqual({
        sequence: 1,
        epoch: 9001,
        overflow: true
      });
    });

    it('should respect custom max', () => {
      const result = VersionNamingService.getNextSequence(50, 9000, 50);
      expect(result).toEqual({
        sequence: 1,
        epoch: 9001,
        overflow: true
      });
    });

    it('should not overflow before max', () => {
      const result = VersionNamingService.getNextSequence(998, 9000);
      expect(result).toEqual({
        sequence: 999,
        epoch: 9000,
        overflow: false
      });
    });
  });

  describe('isValidVersionName', () => {
    it('should return true for valid names', () => {
      expect(VersionNamingService.isValidVersionName('CORE-9000-Genesis-node-001')).toBe(true);
      expect(VersionNamingService.isValidVersionName('PRJ:imis-9000-FastForward-node-127')).toBe(true);
      expect(VersionNamingService.isValidVersionName('META-9001-Learning-edge-003')).toBe(true);
    });

    it('should return false for invalid names', () => {
      expect(VersionNamingService.isValidVersionName('invalid')).toBe(false);
      expect(VersionNamingService.isValidVersionName('')).toBe(false);
      expect(VersionNamingService.isValidVersionName('CORE-9000')).toBe(false);
    });
  });

  describe('compare', () => {
    it('should compare by epoch first', () => {
      const result = VersionNamingService.compare(
        'CORE-9000-Genesis-node-999',
        'CORE-9001-Genesis-node-001'
      );
      expect(result).toBe(-1);
    });

    it('should compare by sequence when epochs equal', () => {
      const result = VersionNamingService.compare(
        'CORE-9000-Genesis-node-001',
        'CORE-9000-Genesis-node-002'
      );
      expect(result).toBe(-1);
    });

    it('should return 0 for equal versions', () => {
      const result = VersionNamingService.compare(
        'CORE-9000-Genesis-node-001',
        'CORE-9000-Refinement-node-001'
      );
      expect(result).toBe(0);
    });

    it('should return 1 when first is greater', () => {
      const result = VersionNamingService.compare(
        'CORE-9001-Genesis-node-001',
        'CORE-9000-Genesis-node-999'
      );
      expect(result).toBe(1);
    });

    it('should throw for invalid version names', () => {
      expect(() => {
        VersionNamingService.compare('invalid', 'CORE-9000-Genesis-node-001');
      }).toThrow('Invalid version name format');
    });
  });

  describe('roundtrip generate->parse', () => {
    it('should parse what was generated', () => {
      const original = {
        namespace: Namespace.CORE,
        epoch: 9000,
        codename: VersionCodename.Genesis,
        type: 'node' as const,
        sequence: 42
      };

      const generated = VersionNamingService.generate(original);
      const parsed = VersionNamingService.parse(generated);

      expect(parsed).toEqual({
        namespace: 'CORE',
        projectId: undefined,
        epoch: 9000,
        codename: 'Genesis',
        type: 'node',
        sequence: 42
      });
    });

    it('should parse generated with projectId', () => {
      const original = {
        namespace: Namespace.PROJECT,
        projectId: 'test-project',
        epoch: 9001,
        codename: VersionCodename.Extraction,
        type: 'edge' as const,
        sequence: 123
      };

      const generated = VersionNamingService.generate(original);
      const parsed = VersionNamingService.parse(generated);

      expect(parsed?.projectId).toBe('test-project');
      expect(parsed?.epoch).toBe(9001);
      expect(parsed?.type).toBe('edge');
      expect(parsed?.sequence).toBe(123);
    });
  });
});
