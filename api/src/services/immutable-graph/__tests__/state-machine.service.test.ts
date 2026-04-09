/**
 * Unit tests for StateMachineService
 */

import { StateMachineService } from '../state-machine.service';
import {
  NodeStatus,
  EdgeStatus,
  InvalidStateTransitionError
} from '../../../types/immutable-graph.types';

describe('StateMachineService', () => {
  describe('validateNodeTransition', () => {
    it('should allow DRAFT to ACTIVE without god mode', () => {
      const result = StateMachineService.validateNodeTransition(
        NodeStatus.DRAFT,
        NodeStatus.ACTIVE,
        false
      );
      expect(result.valid).toBe(true);
      expect(result.action).toBe('validate_and_publish');
    });

    it('should allow ACTIVE to SUPERSEDED without god mode', () => {
      const result = StateMachineService.validateNodeTransition(
        NodeStatus.ACTIVE,
        NodeStatus.SUPERSEDED,
        false
      );
      expect(result.valid).toBe(true);
      expect(result.action).toBe('create_new_version');
    });

    it('should allow ACTIVE to DEPRECATED without god mode', () => {
      const result = StateMachineService.validateNodeTransition(
        NodeStatus.ACTIVE,
        NodeStatus.DEPRECATED,
        false
      );
      expect(result.valid).toBe(true);
      expect(result.action).toBe('deprecate');
    });

    it('should allow ACTIVE to MERGED without god mode', () => {
      const result = StateMachineService.validateNodeTransition(
        NodeStatus.ACTIVE,
        NodeStatus.MERGED,
        false
      );
      expect(result.valid).toBe(true);
      expect(result.action).toBe('merge_nodes');
    });

    it('should reject ACTIVE to DELETED without god mode', () => {
      expect(() => {
        StateMachineService.validateNodeTransition(
          NodeStatus.ACTIVE,
          NodeStatus.DELETED,
          false
        );
      }).toThrow(InvalidStateTransitionError);
    });

    it('should allow ACTIVE to DELETED with god mode', () => {
      const result = StateMachineService.validateNodeTransition(
        NodeStatus.ACTIVE,
        NodeStatus.DELETED,
        true
      );
      expect(result.valid).toBe(true);
      expect(result.action).toBe('physical_delete');
    });

    it('should reject DEPRECATED to ACTIVE without god mode (restore)', () => {
      expect(() => {
        StateMachineService.validateNodeTransition(
          NodeStatus.DEPRECATED,
          NodeStatus.ACTIVE,
          false
        );
      }).toThrow(InvalidStateTransitionError);
    });

    it('should allow DEPRECATED to ACTIVE with god mode (restore)', () => {
      const result = StateMachineService.validateNodeTransition(
        NodeStatus.DEPRECATED,
        NodeStatus.ACTIVE,
        true
      );
      expect(result.valid).toBe(true);
      expect(result.action).toBe('restore');
    });

    it('should reject invalid transitions even with god mode', () => {
      expect(() => {
        StateMachineService.validateNodeTransition(
          NodeStatus.SUPERSEDED,
          NodeStatus.DRAFT,
          true
        );
      }).toThrow(InvalidStateTransitionError);
    });

    it('should reject DELETED to any other state', () => {
      expect(() => {
        StateMachineService.validateNodeTransition(
          NodeStatus.DELETED,
          NodeStatus.ACTIVE,
          true
        );
      }).toThrow(InvalidStateTransitionError);
    });
  });

  describe('validateEdgeTransition', () => {
    it('should allow ACTIVE to SUPERSEDED without god mode', () => {
      const result = StateMachineService.validateEdgeTransition(
        EdgeStatus.ACTIVE,
        EdgeStatus.SUPERSEDED,
        false
      );
      expect(result.valid).toBe(true);
      expect(result.action).toBe('create_new_version');
    });

    it('should allow ACTIVE to ORPHANED without god mode', () => {
      const result = StateMachineService.validateEdgeTransition(
        EdgeStatus.ACTIVE,
        EdgeStatus.ORPHANED,
        false
      );
      expect(result.valid).toBe(true);
      expect(result.action).toBe('cascade_orphan');
    });

    it('should allow ACTIVE to DEPRECATED without god mode', () => {
      const result = StateMachineService.validateEdgeTransition(
        EdgeStatus.ACTIVE,
        EdgeStatus.DEPRECATED,
        false
      );
      expect(result.valid).toBe(true);
      expect(result.action).toBe('deprecate');
    });

    it('should reject ACTIVE to DELETED without god mode', () => {
      expect(() => {
        StateMachineService.validateEdgeTransition(
          EdgeStatus.ACTIVE,
          EdgeStatus.DELETED,
          false
        );
      }).toThrow(InvalidStateTransitionError);
    });

    it('should allow ACTIVE to DELETED with god mode', () => {
      const result = StateMachineService.validateEdgeTransition(
        EdgeStatus.ACTIVE,
        EdgeStatus.DELETED,
        true
      );
      expect(result.valid).toBe(true);
      expect(result.action).toBe('physical_delete');
    });

    it('should allow ORPHANED to DELETED with god mode', () => {
      const result = StateMachineService.validateEdgeTransition(
        EdgeStatus.ORPHANED,
        EdgeStatus.DELETED,
        true
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('getAllowedNodeTransitions', () => {
    it('should return allowed transitions from DRAFT without god mode', () => {
      const allowed = StateMachineService.getAllowedNodeTransitions(
        NodeStatus.DRAFT,
        false
      );
      expect(allowed).toContain(NodeStatus.ACTIVE);
      expect(allowed).not.toContain(NodeStatus.DELETED);
    });

    it('should return more transitions from DRAFT with god mode', () => {
      const allowed = StateMachineService.getAllowedNodeTransitions(
        NodeStatus.DRAFT,
        true
      );
      expect(allowed).toContain(NodeStatus.ACTIVE);
      expect(allowed).toContain(NodeStatus.DELETED);
    });

    it('should return allowed transitions from ACTIVE without god mode', () => {
      const allowed = StateMachineService.getAllowedNodeTransitions(
        NodeStatus.ACTIVE,
        false
      );
      expect(allowed).toContain(NodeStatus.SUPERSEDED);
      expect(allowed).toContain(NodeStatus.DEPRECATED);
      expect(allowed).toContain(NodeStatus.MERGED);
      expect(allowed).not.toContain(NodeStatus.DELETED);
    });

    it('should include DELETED from ACTIVE with god mode', () => {
      const allowed = StateMachineService.getAllowedNodeTransitions(
        NodeStatus.ACTIVE,
        true
      );
      expect(allowed).toContain(NodeStatus.DELETED);
    });

    it('should return restore option from DEPRECATED with god mode', () => {
      const allowed = StateMachineService.getAllowedNodeTransitions(
        NodeStatus.DEPRECATED,
        true
      );
      expect(allowed).toContain(NodeStatus.ACTIVE);
      expect(allowed).toContain(NodeStatus.DELETED);
    });

    it('should return empty array from DELETED', () => {
      const allowed = StateMachineService.getAllowedNodeTransitions(
        NodeStatus.DELETED,
        true
      );
      expect(allowed).toHaveLength(0);
    });
  });

  describe('getAllowedEdgeTransitions', () => {
    it('should return allowed transitions from ACTIVE without god mode', () => {
      const allowed = StateMachineService.getAllowedEdgeTransitions(
        EdgeStatus.ACTIVE,
        false
      );
      expect(allowed).toContain(EdgeStatus.SUPERSEDED);
      expect(allowed).toContain(EdgeStatus.DEPRECATED);
      expect(allowed).toContain(EdgeStatus.ORPHANED);
      expect(allowed).not.toContain(EdgeStatus.DELETED);
    });

    it('should include DELETED with god mode', () => {
      const allowed = StateMachineService.getAllowedEdgeTransitions(
        EdgeStatus.ACTIVE,
        true
      );
      expect(allowed).toContain(EdgeStatus.DELETED);
    });
  });

  describe('requiresGodMode', () => {
    it('should return true for delete operations', () => {
      expect(StateMachineService.requiresGodMode(
        NodeStatus.ACTIVE,
        NodeStatus.DELETED
      )).toBe(true);
    });

    it('should return false for normal operations', () => {
      expect(StateMachineService.requiresGodMode(
        NodeStatus.ACTIVE,
        NodeStatus.DEPRECATED
      )).toBe(false);
    });

    it('should return true for restore operations', () => {
      expect(StateMachineService.requiresGodMode(
        NodeStatus.DEPRECATED,
        NodeStatus.ACTIVE
      )).toBe(true);
    });

    it('should return false for supersede operations', () => {
      expect(StateMachineService.requiresGodMode(
        NodeStatus.ACTIVE,
        NodeStatus.SUPERSEDED
      )).toBe(false);
    });

    it('should return true for unknown transitions', () => {
      expect(StateMachineService.requiresGodMode(
        NodeStatus.DELETED,
        NodeStatus.ACTIVE
      )).toBe(true);
    });
  });

  describe('getTransitionInfo', () => {
    it('should return info for valid transition', () => {
      const info = StateMachineService.getTransitionInfo(
        NodeStatus.ACTIVE,
        NodeStatus.DEPRECATED
      );
      expect(info).not.toBeNull();
      expect(info?.action).toBe('deprecate');
      expect(info?.requiresGodMode).toBe(false);
      expect(info?.description).toBeDefined();
    });

    it('should return null for invalid transition', () => {
      const info = StateMachineService.getTransitionInfo(
        NodeStatus.DELETED,
        NodeStatus.ACTIVE
      );
      expect(info).toBeNull();
    });

    it('should include description for god mode operations', () => {
      const info = StateMachineService.getTransitionInfo(
        NodeStatus.ACTIVE,
        NodeStatus.DELETED
      );
      expect(info?.requiresGodMode).toBe(true);
      expect(info?.description).toContain('God Mode');
    });
  });

  describe('getAllNodeStates', () => {
    it('should return all node states', () => {
      const states = StateMachineService.getAllNodeStates();
      expect(states).toContain(NodeStatus.DRAFT);
      expect(states).toContain(NodeStatus.ACTIVE);
      expect(states).toContain(NodeStatus.SUPERSEDED);
      expect(states).toContain(NodeStatus.DEPRECATED);
      expect(states).toContain(NodeStatus.MERGED);
      expect(states).toContain(NodeStatus.DELETED);
      expect(states).toHaveLength(6);
    });
  });

  describe('getAllEdgeStates', () => {
    it('should return all edge states', () => {
      const states = StateMachineService.getAllEdgeStates();
      expect(states).toContain(EdgeStatus.ACTIVE);
      expect(states).toContain(EdgeStatus.SUPERSEDED);
      expect(states).toContain(EdgeStatus.ORPHANED);
      expect(states).toContain(EdgeStatus.DEPRECATED);
      expect(states).toContain(EdgeStatus.DELETED);
      expect(states).toHaveLength(5);
    });
  });

  describe('isActiveStatus', () => {
    it('should return true for ACTIVE node', () => {
      expect(StateMachineService.isActiveStatus(NodeStatus.ACTIVE)).toBe(true);
    });

    it('should return true for DRAFT node', () => {
      expect(StateMachineService.isActiveStatus(NodeStatus.DRAFT)).toBe(true);
    });

    it('should return true for ACTIVE edge', () => {
      expect(StateMachineService.isActiveStatus(EdgeStatus.ACTIVE)).toBe(true);
    });

    it('should return false for DEPRECATED', () => {
      expect(StateMachineService.isActiveStatus(NodeStatus.DEPRECATED)).toBe(false);
    });

    it('should return false for DELETED', () => {
      expect(StateMachineService.isActiveStatus(NodeStatus.DELETED)).toBe(false);
    });
  });

  describe('isRemovedStatus', () => {
    it('should return true for DEPRECATED', () => {
      expect(StateMachineService.isRemovedStatus(NodeStatus.DEPRECATED)).toBe(true);
    });

    it('should return true for DELETED', () => {
      expect(StateMachineService.isRemovedStatus(NodeStatus.DELETED)).toBe(true);
    });

    it('should return true for MERGED', () => {
      expect(StateMachineService.isRemovedStatus(NodeStatus.MERGED)).toBe(true);
    });

    it('should return true for ORPHANED edge', () => {
      expect(StateMachineService.isRemovedStatus(EdgeStatus.ORPHANED)).toBe(true);
    });

    it('should return false for ACTIVE', () => {
      expect(StateMachineService.isRemovedStatus(NodeStatus.ACTIVE)).toBe(false);
    });
  });

  describe('isSupersededStatus', () => {
    it('should return true for SUPERSEDED node', () => {
      expect(StateMachineService.isSupersededStatus(NodeStatus.SUPERSEDED)).toBe(true);
    });

    it('should return true for SUPERSEDED edge', () => {
      expect(StateMachineService.isSupersededStatus(EdgeStatus.SUPERSEDED)).toBe(true);
    });

    it('should return false for other statuses', () => {
      expect(StateMachineService.isSupersededStatus(NodeStatus.ACTIVE)).toBe(false);
      expect(StateMachineService.isSupersededStatus(NodeStatus.DEPRECATED)).toBe(false);
    });
  });

  describe('getCascadeActions', () => {
    it('should return ORPHANED for DEPRECATED node', () => {
      const result = StateMachineService.getCascadeActions(NodeStatus.DEPRECATED);
      expect(result.edgeAction).toBe(EdgeStatus.ORPHANED);
      expect(result.reason).toContain('deprecated');
    });

    it('should return ORPHANED for MERGED node', () => {
      const result = StateMachineService.getCascadeActions(NodeStatus.MERGED);
      expect(result.edgeAction).toBe(EdgeStatus.ORPHANED);
      expect(result.reason).toContain('merged');
    });

    it('should return DELETED for DELETED node', () => {
      const result = StateMachineService.getCascadeActions(NodeStatus.DELETED);
      expect(result.edgeAction).toBe(EdgeStatus.DELETED);
      expect(result.reason).toContain('deleted');
    });

    it('should return null for ACTIVE node', () => {
      const result = StateMachineService.getCascadeActions(NodeStatus.ACTIVE);
      expect(result.edgeAction).toBeNull();
    });

    it('should return null for SUPERSEDED node', () => {
      const result = StateMachineService.getCascadeActions(NodeStatus.SUPERSEDED);
      expect(result.edgeAction).toBeNull();
    });
  });
});
