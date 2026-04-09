/**
 * Entity Transition Executor — config-driven state machine transitions
 *
 * Validates state transitions against a configurable state machine definition.
 * The state machine (states, transitions, onTransition) comes from the graph params,
 * not from code — making it fully project-agnostic.
 *
 * Example stateMachine config (in graph node params):
 * {
 *   states: ["open", "assigned", "in_progress", "resolved", "closed"],
 *   transitions: {
 *     "open": ["assigned", "closed"],
 *     "assigned": ["in_progress", "closed"],
 *     "in_progress": ["resolved", "assigned"],
 *     "resolved": ["closed", "open"]
 *   },
 *   onTransition: {
 *     "resolved->closed": { closedAt: "{{now}}" }
 *   }
 * }
 */

const { BaseExecutor } = require('../../plugin-base');

class EntityTransitionExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'entity.transition';
    this.displayName = 'Entity State Transition';
    this.description = 'Validate and apply a state machine transition on an entity';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        entityType: { type: 'string' },
        entityId: { type: 'string' },
        targetState: { type: 'string' },
        stateField: { type: 'string', default: 'status' },
        stateMachine: {
          type: 'object',
          description: 'State machine config: { states, transitions, onTransition }',
          properties: {
            states: { type: 'array', items: { type: 'string' } },
            transitions: { type: 'object' },
            onTransition: { type: 'object' },
          },
        },
        additionalUpdates: { type: 'object' },
        reason: { type: 'string', description: 'Reason for transition' },
      },
      required: ['entityType', 'entityId', 'targetState', 'stateMachine'],
    };
  }

  async execute(parameters, context) {
    const entityType = this.getRequiredParam(parameters, 'entityType');
    const entityId = this.getRequiredParam(parameters, 'entityId');
    const targetState = this.getRequiredParam(parameters, 'targetState');
    const stateMachine = this.getRequiredParam(parameters, 'stateMachine');
    const stateField = this.getParam(parameters, 'stateField', 'status');
    const additionalUpdates = this.getParam(parameters, 'additionalUpdates', {});
    const reason = this.getParam(parameters, 'reason', null);

    const sanitizedLabel = entityType.replace(/[^a-zA-Z0-9_]/g, '');

    try {
      const memgraph = require('../../../../../services/memgraph.service');

      // 1. Get current entity
      const currentResult = await memgraph.executeQuery(
        `MATCH (e:${sanitizedLabel} {id: $entityId}) RETURN e`,
        { entityId },
      );

      if (!currentResult.records || currentResult.records.length === 0) {
        return this.error('NOT_FOUND', `Entity not found: ${sanitizedLabel}/${entityId}`);
      }

      const record = currentResult.records[0];
      const node = record.get ? record.get('e') : record._fields?.[0];
      const entity = node?.properties || node;
      const currentState = entity[stateField];

      // 2. Validate target state exists
      if (stateMachine.states && !stateMachine.states.includes(targetState)) {
        return this.error(
          'INVALID_STATE',
          `Invalid state: ${targetState}. Allowed: ${stateMachine.states.join(', ')}`,
        );
      }

      // 3. Validate transition is allowed
      const allowed = stateMachine.transitions?.[currentState];
      if (allowed && allowed.length > 0 && !allowed.includes(targetState)) {
        return this.error(
          'TRANSITION_DENIED',
          `Transition not allowed: ${currentState} → ${targetState}. Allowed: ${allowed.join(', ')}`,
        );
      }

      // 4. Build updates
      const now = new Date().toISOString();
      const updates = {
        [stateField]: targetState,
        updatedAt: now,
        ...additionalUpdates,
      };

      // onTransition fields
      const transitionKey = `${currentState}->${targetState}`;
      const onTransition = stateMachine.onTransition?.[transitionKey];
      if (onTransition) {
        for (const [k, v] of Object.entries(onTransition)) {
          updates[k] = v === '{{now}}' ? now : v;
        }
      }

      if (reason) {
        updates.lastTransitionReason = reason;
      }

      // 5. Execute transition
      const setEntries = Object.keys(updates);
      const setClause = setEntries.map(k => `e.${k} = $upd_${k}`).join(', ');
      const queryParams = { entityId };
      for (const k of setEntries) {
        queryParams[`upd_${k}`] = updates[k];
      }

      await memgraph.executeQuery(
        `MATCH (e:${sanitizedLabel} {id: $entityId}) SET ${setClause}`,
        queryParams,
      );

      return this.success({
        entityId,
        entityType: sanitizedLabel,
        previousState: currentState,
        currentState: targetState,
        transition: `${currentState} → ${targetState}`,
        branch: targetState, // for graph branching
      });
    } catch (error) {
      if (error.message?.includes('Missing required')) throw error;
      return this.error('TRANSITION_FAILED', `Transition failed: ${error.message}`, true);
    }
  }
}

module.exports = { EntityTransitionExecutor };
