/**
 * State Machine Service for Immutable Graph Architecture
 * Validates state transitions for nodes and edges
 * Enforces God Mode requirements for destructive operations
 */

import {
  NodeStatus,
  EdgeStatus,
  StateTransition,
  NODE_TRANSITIONS,
  EDGE_TRANSITIONS,
  InvalidStateTransitionError,
  GodModeRequiredError
} from '../../types/immutable-graph.types';

export interface TransitionResult {
  valid: boolean;
  action: string;
}

export interface TransitionInfo {
  from: NodeStatus | EdgeStatus;
  to: NodeStatus | EdgeStatus;
  action: string;
  requiresGodMode: boolean;
  description: string;
}

export class StateMachineService {

  /**
   * Validate a node state transition
   * Throws if transition is invalid or requires God Mode when not active
   */
  static validateNodeTransition(
    currentStatus: NodeStatus,
    targetStatus: NodeStatus,
    godModeActive: boolean
  ): TransitionResult {
    const transition = NODE_TRANSITIONS.find(
      t => t.from === currentStatus && t.to === targetStatus
    );

    if (!transition) {
      const allowed = NODE_TRANSITIONS
        .filter(t => t.from === currentStatus)
        .map(t => t.to as string);
      throw new InvalidStateTransitionError(currentStatus, targetStatus, allowed);
    }

    if (transition.requiresGodMode && !godModeActive) {
      const allowed = NODE_TRANSITIONS
        .filter(t => t.from === currentStatus && !t.requiresGodMode)
        .map(t => t.to as string);
      throw new InvalidStateTransitionError(currentStatus, targetStatus, allowed);
    }

    return { valid: true, action: transition.action };
  }

  /**
   * Validate an edge state transition
   * Throws if transition is invalid or requires God Mode when not active
   */
  static validateEdgeTransition(
    currentStatus: EdgeStatus,
    targetStatus: EdgeStatus,
    godModeActive: boolean
  ): TransitionResult {
    const transition = EDGE_TRANSITIONS.find(
      t => t.from === currentStatus && t.to === targetStatus
    );

    if (!transition) {
      const allowed = EDGE_TRANSITIONS
        .filter(t => t.from === currentStatus)
        .map(t => t.to as string);
      throw new InvalidStateTransitionError(currentStatus, targetStatus, allowed);
    }

    if (transition.requiresGodMode && !godModeActive) {
      const allowed = EDGE_TRANSITIONS
        .filter(t => t.from === currentStatus && !t.requiresGodMode)
        .map(t => t.to as string);
      throw new InvalidStateTransitionError(currentStatus, targetStatus, allowed);
    }

    return { valid: true, action: transition.action };
  }

  /**
   * Get all allowed node transitions from current state
   */
  static getAllowedNodeTransitions(currentStatus: NodeStatus, godModeActive: boolean): NodeStatus[] {
    return NODE_TRANSITIONS
      .filter(t => t.from === currentStatus && (!t.requiresGodMode || godModeActive))
      .map(t => t.to as NodeStatus);
  }

  /**
   * Get all allowed edge transitions from current state
   */
  static getAllowedEdgeTransitions(currentStatus: EdgeStatus, godModeActive: boolean): EdgeStatus[] {
    return EDGE_TRANSITIONS
      .filter(t => t.from === currentStatus && (!t.requiresGodMode || godModeActive))
      .map(t => t.to as EdgeStatus);
  }

  /**
   * Check if a transition requires God Mode
   */
  static requiresGodMode(from: NodeStatus | EdgeStatus, to: NodeStatus | EdgeStatus): boolean {
    const allTransitions = [...NODE_TRANSITIONS, ...EDGE_TRANSITIONS];
    const transition = allTransitions.find(t => t.from === from && t.to === to);
    return transition?.requiresGodMode ?? true;
  }

  /**
   * Get detailed transition information
   */
  static getTransitionInfo(from: NodeStatus | EdgeStatus, to: NodeStatus | EdgeStatus): TransitionInfo | null {
    const allTransitions = [...NODE_TRANSITIONS, ...EDGE_TRANSITIONS];
    const transition = allTransitions.find(t => t.from === from && t.to === to);

    if (!transition) return null;

    const descriptions: Record<string, string> = {
      'validate_and_publish': 'Validate draft and publish as active',
      'create_new_version': 'Create new version, mark current as superseded',
      'deprecate': 'Logically deprecate the entity',
      'merge_nodes': 'Merge with another node',
      'physical_delete': 'Permanently delete (God Mode only)',
      'restore': 'Restore deprecated/superseded entity (God Mode only)',
      'cascade_orphan': 'Mark as orphaned due to parent deprecation'
    };

    return {
      from: transition.from,
      to: transition.to,
      action: transition.action,
      requiresGodMode: transition.requiresGodMode,
      description: descriptions[transition.action] || transition.action
    };
  }

  /**
   * Get all possible states for nodes
   */
  static getAllNodeStates(): NodeStatus[] {
    return Object.values(NodeStatus);
  }

  /**
   * Get all possible states for edges
   */
  static getAllEdgeStates(): EdgeStatus[] {
    return Object.values(EdgeStatus);
  }

  /**
   * Check if a status indicates the entity is still "alive" (queryable by default)
   */
  static isActiveStatus(status: NodeStatus | EdgeStatus): boolean {
    const activeStatuses = [NodeStatus.ACTIVE, NodeStatus.DRAFT, EdgeStatus.ACTIVE];
    return activeStatuses.includes(status as NodeStatus | EdgeStatus);
  }

  /**
   * Check if a status indicates the entity has been removed
   */
  static isRemovedStatus(status: NodeStatus | EdgeStatus): boolean {
    const removedStatuses = [
      NodeStatus.DEPRECATED,
      NodeStatus.DELETED,
      NodeStatus.MERGED,
      EdgeStatus.DEPRECATED,
      EdgeStatus.DELETED,
      EdgeStatus.ORPHANED
    ];
    return removedStatuses.includes(status as NodeStatus | EdgeStatus);
  }

  /**
   * Check if a status indicates the entity has been superseded by a newer version
   */
  static isSupersededStatus(status: NodeStatus | EdgeStatus): boolean {
    return status === NodeStatus.SUPERSEDED || status === EdgeStatus.SUPERSEDED;
  }

  /**
   * Get the cascade actions needed when a node changes status
   */
  static getCascadeActions(nodeStatus: NodeStatus): {
    edgeAction: EdgeStatus | null;
    reason: string;
  } {
    if (nodeStatus === NodeStatus.DEPRECATED) {
      return {
        edgeAction: EdgeStatus.ORPHANED,
        reason: 'Node deprecated - cascading to orphan edges'
      };
    }
    if (nodeStatus === NodeStatus.MERGED) {
      return {
        edgeAction: EdgeStatus.ORPHANED,
        reason: 'Node merged - cascading to orphan edges'
      };
    }
    if (nodeStatus === NodeStatus.DELETED) {
      return {
        edgeAction: EdgeStatus.DELETED,
        reason: 'Node deleted - cascading to delete edges'
      };
    }
    return { edgeAction: null, reason: '' };
  }
}
