/**
 * Temporal Domain Service (D4)
 *
 * Manages state machines, lifecycle states, and transitions.
 * Extracts temporal patterns from status columns and transition procedures.
 *
 * Node types:
 *   TemporalStateMachine — Lifecycle definition for an entity
 *   TemporalState        — Individual state (New, Processing, Shipped, etc.)
 *   TemporalTransition   — Transition between states with trigger + guard
 *
 * Cross-domain edges:
 *   GOVERNS:      TEMPORAL → STRUCTURAL (machine governs entity)
 *   TRIGGERED_BY: TEMPORAL → BEHAVIORAL (transition triggered by procedure)
 *   GUARDED_BY:   TEMPORAL → SEMANTIC   (transition guarded by rule)
 */

const { v4: uuidv4 } = require('uuid');

// State classification
const StateType = {
  INITIAL: 'initial',
  INTERMEDIATE: 'intermediate',
  TERMINAL: 'terminal',
  ERROR: 'error',
};

// What causes a transition
const TriggerType = {
  PROCEDURE: 'procedure',
  AUTOMATIC: 'automatic',
  MANUAL: 'manual',
  EXTERNAL: 'external',
};

/**
 * Temporal Domain Service
 */
class TemporalDomainService {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.memgraphService - MemgraphService with runQuery()
   * @param {Object} [dependencies.llmService] - LlmService with chat([messages])
   */
  constructor(dependencies = {}) {
    this.memgraphService = dependencies.memgraphService;
    this.llmService = dependencies.llmService;
    this.namespace = 'temporal';
  }

  // ============================================================
  // STATE MACHINES
  // ============================================================

  /**
   * Create a state machine for an entity.
   *
   * @param {Object} machineData
   * @param {string} machineData.entityName - Entity this machine governs
   * @param {string} [machineData.tableName] - Source table
   * @param {string} [machineData.stateColumn] - Column holding state values
   * @param {Object[]} [machineData.states] - Array of state definitions
   * @param {Object[]} [machineData.transitions] - Array of transitions
   * @param {string} [machineData.entityId] - StructuralEntity id for cross-domain link
   * @param {Object} context - { sessionId, sourceDatabase }
   * @returns {Promise<Object>}
   */
  async createStateMachine(machineData, context = {}) {
    const machineId = uuidv4();
    const now = new Date().toISOString();

    const query = `
      CREATE (m:TemporalStateMachine:TEMPORAL {
        id: $id,
        globalId: $globalId,
        domain: 'TEMPORAL',
        name: $name,
        entityName: $entityName,
        tableName: $tableName,
        stateColumn: $stateColumn,
        stateCount: $stateCount,
        transitionCount: $transitionCount,
        extractionSessionId: $sessionId,
        sourceDatabase: $sourceDatabase,
        confidence: $confidence,
        dataBasedDiscovery: $dataBasedDiscovery,
        createdAt: $now,
        updatedAt: $now
      })
      RETURN m.id as id
    `;

    const params = {
      id: machineId,
      globalId: `${this.namespace}:statemachine:${machineId}`,
      name: machineData.name || `${machineData.entityName}_lifecycle`,
      entityName: machineData.entityName,
      tableName: machineData.tableName || machineData.entityName,
      stateColumn: machineData.stateColumn || 'Status',
      stateCount: machineData.states?.length || 0,
      transitionCount: machineData.transitions?.length || 0,
      sessionId: context.sessionId || '',
      sourceDatabase: context.sourceDatabase || '',
      confidence: machineData.confidence || 0.8,
      dataBasedDiscovery: machineData.dataBasedDiscovery || false,
      now,
    };

    await this.memgraphService.runQuery(query, params);

    // Create states
    if (machineData.states && machineData.states.length > 0) {
      await this._createStates(machineId, machineData.states);
    }

    // Create transitions
    if (machineData.transitions && machineData.transitions.length > 0) {
      await this._createTransitions(machineId, machineData.transitions);
    }

    // Link to structural entity
    if (machineData.entityId) {
      await this._linkToStructuralEntity(machineId, machineData.entityId);
    }

    return {
      id: machineId,
      name: params.name,
      entityName: params.entityName,
      stateCount: machineData.states?.length || 0,
      transitionCount: machineData.transitions?.length || 0,
    };
  }

  /**
   * Create states for a state machine.
   */
  async _createStates(machineId, states) {
    for (const state of states) {
      const stateId = state.id || uuidv4();
      const now = new Date().toISOString();

      await this.memgraphService.runQuery(
        `MATCH (m:TemporalStateMachine {id: $machineId})
         CREATE (s:TemporalState:TEMPORAL {
           id: $stateId,
           machineId: $machineId,
           code: $code,
           name: $name,
           description: $description,
           stateType: $stateType,
           isInitial: $isInitial,
           isTerminal: $isTerminal,
           frequency: $frequency,
           avgDurationDays: $avgDurationDays,
           createdAt: $now
         })
         CREATE (m)-[:HAS_STATE]->(s)`,
        {
          machineId,
          stateId,
          code: state.code || state.value || String(state),
          name: state.name || this._humanizeStateName(state.code || state.value || String(state)),
          description: state.description || '',
          stateType: state.stateType || this._inferStateType(state),
          isInitial: state.isInitial || false,
          isTerminal: state.isTerminal || false,
          frequency: state.frequency || 0,
          avgDurationDays: state.avgDurationDays || 0,
          now,
        }
      );
    }
  }

  /**
   * Create transitions between states.
   */
  async _createTransitions(machineId, transitions) {
    for (const transition of transitions) {
      const transitionId = transition.id || uuidv4();
      const now = new Date().toISOString();
      const fromCode = transition.fromState || transition.from;
      const toCode = transition.toState || transition.to;

      try {
        await this.memgraphService.runQuery(
          `MATCH (m:TemporalStateMachine {id: $machineId})
           MATCH (fromState:TemporalState {machineId: $machineId, code: $fromCode})
           MATCH (toState:TemporalState {machineId: $machineId, code: $toCode})
           CREATE (t:TemporalTransition:TEMPORAL {
             id: $transitionId,
             machineId: $machineId,
             fromStateCode: $fromCode,
             toStateCode: $toCode,
             triggerType: $triggerType,
             triggerProcedure: $triggerProcedure,
             triggerCondition: $triggerCondition,
             frequency: $frequency,
             avgDurationHours: $avgDurationHours,
             guardExpression: $guardExpression,
             createdAt: $now
           })
           CREATE (fromState)-[:TRANSITIONS_TO {transitionId: $transitionId}]->(toState)
           CREATE (m)-[:HAS_TRANSITION]->(t)`,
          {
            machineId,
            transitionId,
            fromCode,
            toCode,
            triggerType: transition.triggerType || TriggerType.PROCEDURE,
            triggerProcedure: transition.triggerProcedure || transition.procedure || '',
            triggerCondition: transition.triggerCondition || '',
            frequency: transition.frequency || 0,
            avgDurationHours: transition.avgDurationHours || 0,
            guardExpression: transition.guardExpression || '',
            now,
          }
        );

        // Cross-domain links
        if (transition.triggerProcedure && transition.triggerProcessId) {
          await this._linkTransitionToBehavioral(transitionId, transition.triggerProcessId);
        }
        if (transition.guardRuleId) {
          await this._linkTransitionToSemantic(transitionId, transition.guardRuleId);
        }
      } catch (error) {
        // States might not exist — log warning
        console.warn(`[Temporal] Could not create transition ${fromCode} → ${toCode}: ${error.message}`);
      }
    }
  }

  /**
   * Infer state type from state name/code.
   */
  _inferStateType(state) {
    const name = (state.name || state.code || state.value || '').toLowerCase();

    if (['new', 'draft', 'created', 'pending', 'initial', 'open', 'submitted'].some(s => name.includes(s))) {
      return StateType.INITIAL;
    }
    if (['completed', 'done', 'closed', 'finished', 'archived', 'delivered', 'approved'].some(s => name.includes(s))) {
      return StateType.TERMINAL;
    }
    if (['cancelled', 'canceled', 'failed', 'rejected', 'error', 'deleted', 'expired'].some(s => name.includes(s))) {
      return StateType.ERROR;
    }
    return StateType.INTERMEDIATE;
  }

  /**
   * Convert state code to human-readable name.
   */
  _humanizeStateName(code) {
    if (typeof code !== 'string') return String(code);
    return code
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  }

  // ============================================================
  // CROSS-DOMAIN LINKS
  // ============================================================

  async _linkToStructuralEntity(machineId, entityId) {
    await this.memgraphService.runQuery(
      `MATCH (m:TemporalStateMachine {id: $machineId})
       MATCH (e:StructuralEntity {id: $entityId})
       MERGE (m)-[:CROSS_DOMAIN {
         edgeType: 'GOVERNS',
         sourceDomain: 'TEMPORAL',
         targetDomain: 'STRUCTURAL'
       }]->(e)`,
      { machineId, entityId }
    ).catch(() => {});
  }

  async _linkTransitionToBehavioral(transitionId, processId) {
    await this.memgraphService.runQuery(
      `MATCH (t:TemporalTransition {id: $transitionId})
       MATCH (p:DomainGraph {id: $processId, domain: 'BEHAVIORAL'})
       MERGE (t)-[:CROSS_DOMAIN {
         edgeType: 'TRIGGERED_BY',
         sourceDomain: 'TEMPORAL',
         targetDomain: 'BEHAVIORAL'
       }]->(p)`,
      { transitionId, processId }
    ).catch(() => {});
  }

  async _linkTransitionToSemantic(transitionId, ruleId) {
    await this.memgraphService.runQuery(
      `MATCH (t:TemporalTransition {id: $transitionId})
       MATCH (r:SemanticRule {id: $ruleId})
       MERGE (t)-[:CROSS_DOMAIN {
         edgeType: 'GUARDED_BY',
         sourceDomain: 'TEMPORAL',
         targetDomain: 'SEMANTIC'
       }]->(r)`,
      { transitionId, ruleId }
    ).catch(() => {});
  }

  // ============================================================
  // DISCOVERY — from table metadata
  // ============================================================

  /**
   * Discover potential state machines from table metadata.
   * Looks for status/state columns and infers machine definitions.
   *
   * @param {Object[]} tables - Table metadata with columns
   * @returns {Object[]} Discovered machine candidates
   */
  discoverStateMachines(tables) {
    const discovered = [];

    for (const table of tables) {
      const stateColumns = this._findStateColumns(table);

      for (const column of stateColumns) {
        const machineData = {
          entityName: table.name || table.tableName,
          tableName: table.fullName || table.schema ? `${table.schema}.${table.name}` : table.name,
          stateColumn: column.name,
          states: [],
          transitions: [],
          confidence: 0.7,
          dataBasedDiscovery: false,
        };

        // If we have enum/check constraint values
        if (column.enumValues && column.enumValues.length > 0) {
          machineData.states = column.enumValues.map((value, index) => ({
            code: String(value),
            name: this._humanizeStateName(String(value)),
            isInitial: index === 0,
            isTerminal: index === column.enumValues.length - 1,
          }));
          machineData.confidence = 0.85;
        }

        // If FK to a status/type table
        if (column.referencedTable) {
          machineData.stateSource = column.referencedTable;
        }

        discovered.push(machineData);
      }
    }

    return discovered;
  }

  /**
   * Find columns that likely represent states.
   */
  _findStateColumns(table) {
    const results = [];
    const statePatterns = [
      /status/i, /state/i, /phase/i, /stage/i,
      /workflow/i, /step/i, /lifecycle/i,
    ];

    const columns = table.columns || table.attributes || [];

    for (const column of columns) {
      const colName = typeof column === 'string' ? column : column.name;
      if (!colName) continue;

      if (statePatterns.some(p => p.test(colName))) {
        results.push({
          name: colName,
          dataType: column.dataType || column.type,
          enumValues: column.enumValues || column.checkConstraint?.values || null,
          referencedTable: column.referencedTable || column.fkTarget || null,
        });
      }
    }

    return results;
  }

  // ============================================================
  // ENRICHMENT — from actual data
  // ============================================================

  /**
   * Enrich a state machine with data-based analysis.
   * Updates frequencies, durations, and discovers transitions.
   */
  async enrichFromData(machineId, dataAnalysis) {
    const now = new Date().toISOString();

    // Update state frequencies
    if (dataAnalysis.stateDistribution) {
      for (const [stateCode, count] of Object.entries(dataAnalysis.stateDistribution)) {
        await this.memgraphService.runQuery(
          `MATCH (s:TemporalState {machineId: $machineId, code: $code})
           SET s.frequency = $count, s.updatedAt = $now`,
          { machineId, code: stateCode, count, now }
        );
      }
    }

    // Add discovered transitions
    if (dataAnalysis.transitions && dataAnalysis.transitions.length > 0) {
      await this._createTransitions(machineId, dataAnalysis.transitions);

      await this.memgraphService.runQuery(
        `MATCH (m:TemporalStateMachine {id: $machineId})
         SET m.transitionCount = $count, m.dataBasedDiscovery = true, m.updatedAt = $now`,
        { machineId, count: dataAnalysis.transitions.length, now }
      );
    }

    // Update average durations
    if (dataAnalysis.stateDurations) {
      for (const [stateCode, avgDays] of Object.entries(dataAnalysis.stateDurations)) {
        await this.memgraphService.runQuery(
          `MATCH (s:TemporalState {machineId: $machineId, code: $code})
           SET s.avgDurationDays = $avgDays, s.updatedAt = $now`,
          { machineId, code: stateCode, avgDays, now }
        );
      }
    }
  }

  /**
   * Infer transitions from stored procedures.
   * Checks which procedures modify the state column.
   */
  async inferTransitionsFromProcedures(machineId, procedures) {
    const inferred = [];

    // Get machine info
    const machineResult = await this.memgraphService.runQuery(
      `MATCH (m:TemporalStateMachine {id: $machineId})
       RETURN m.stateColumn as stateColumn, m.tableName as tableName`,
      { machineId }
    );
    if (!machineResult || machineResult.length === 0) return inferred;

    const { stateColumn, tableName } = machineResult[0];

    for (const procedure of procedures) {
      if (!this._procedureModifiesColumn(procedure, tableName, stateColumn)) {
        continue;
      }

      const transition = await this._extractTransitionFromProcedure(
        procedure, stateColumn
      );

      if (transition) {
        transition.triggerProcedure = `${procedure.schema || 'dbo'}.${procedure.name}`;
        transition.triggerProcessId = procedure.domainGraphId || null;
        inferred.push(transition);
      }
    }

    if (inferred.length > 0) {
      await this._createTransitions(machineId, inferred);
    }

    return inferred;
  }

  /**
   * Check if a procedure modifies a specific column.
   */
  _procedureModifiesColumn(procedure, tableName, columnName) {
    const sql = procedure.definition || procedure.sql || '';
    // Match UPDATE ... tableName ... SET ... columnName
    const shortTable = tableName.includes('.') ? tableName.split('.').pop() : tableName;
    const pattern = new RegExp(
      `UPDATE\\s+[^;]*${shortTable}[^;]*SET[^;]*${columnName}`,
      'is'
    );
    return pattern.test(sql);
  }

  /**
   * Use LLM to extract transition details from a procedure.
   */
  async _extractTransitionFromProcedure(procedure, stateColumn) {
    if (!this.llmService) return null;

    const definition = (procedure.definition || procedure.sql || '').substring(0, 2000);
    if (!definition) return null;

    try {
      const response = await this.llmService.chat([
        {
          role: 'system',
          content: `Analyze this stored procedure. If it changes the ${stateColumn} column, identify the from/to states and guard condition. Respond in JSON: {"changesState":true,"fromState":"value","toState":"value","guardExpression":"condition or null"}. If it doesn't change ${stateColumn}, respond {"changesState":false}.`,
        },
        {
          role: 'user',
          content: `Procedure: ${procedure.schema || 'dbo'}.${procedure.name}\nSQL:\n${definition}`,
        },
      ]);

      const content = response?.content || response;
      const parsed = this._parseJsonResponse(content);

      if (parsed && parsed.changesState && parsed.toState) {
        return {
          fromState: parsed.fromState || '*',
          toState: parsed.toState,
          guardExpression: parsed.guardExpression || null,
          triggerType: TriggerType.PROCEDURE,
          confidence: 0.7,
        };
      }
    } catch (error) {
      console.warn(`[Temporal] LLM extraction failed for ${procedure.name}: ${error.message}`);
    }

    return null;
  }

  _parseJsonResponse(content) {
    if (!content) return null;
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try { return JSON.parse(match[1].trim()); } catch { /* fall through */ }
      }
      const start = text.search(/[{[]/);
      if (start >= 0) {
        try { return JSON.parse(text.substring(start)); } catch { /* fall through */ }
      }
    }
    return null;
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  /**
   * Get a state machine with its states and transitions.
   * runQuery() returns plain objects [{key: value}].
   */
  async getStateMachine(machineId) {
    const [machineResult, statesResult, transitionsResult] = await Promise.all([
      this.memgraphService.runQuery(
        `MATCH (m:TemporalStateMachine {id: $machineId})
         RETURN m.id as id, m.name as name, m.entityName as entityName,
                m.tableName as tableName, m.stateColumn as stateColumn,
                m.confidence as confidence, m.dataBasedDiscovery as dataBasedDiscovery`,
        { machineId }
      ),
      this.memgraphService.runQuery(
        `MATCH (:TemporalStateMachine {id: $machineId})-[:HAS_STATE]->(s:TemporalState)
         RETURN s.id as id, s.code as code, s.name as name,
                s.stateType as stateType, s.isInitial as isInitial,
                s.isTerminal as isTerminal, s.frequency as frequency,
                s.avgDurationDays as avgDurationDays
         ORDER BY s.code`,
        { machineId }
      ),
      this.memgraphService.runQuery(
        `MATCH (:TemporalStateMachine {id: $machineId})-[:HAS_TRANSITION]->(t:TemporalTransition)
         RETURN t.id as id, t.fromStateCode as fromState, t.toStateCode as toState,
                t.triggerType as triggerType, t.triggerProcedure as triggerProcedure,
                t.frequency as frequency, t.guardExpression as guardExpression`,
        { machineId }
      ),
    ]);

    if (!machineResult || machineResult.length === 0) return null;

    return {
      ...machineResult[0],
      states: statesResult || [],
      transitions: transitionsResult || [],
    };
  }

  /**
   * Get all state machines for a session.
   */
  async getStateMachinesForSession(sessionId) {
    const result = await this.memgraphService.runQuery(
      `MATCH (m:TemporalStateMachine {extractionSessionId: $sessionId})
       RETURN m.id as id, m.name as name, m.entityName as entityName,
              m.stateColumn as stateColumn, m.stateCount as stateCount,
              m.transitionCount as transitionCount, m.confidence as confidence
       ORDER BY m.entityName`,
      { sessionId }
    );
    return result || [];
  }

  /**
   * Get temporal statistics.
   */
  async getTemporalStats() {
    const [machines, states, transitions] = await Promise.all([
      this.memgraphService.runQuery('MATCH (m:TemporalStateMachine) RETURN count(m) as cnt'),
      this.memgraphService.runQuery('MATCH (s:TemporalState) RETURN count(s) as cnt'),
      this.memgraphService.runQuery('MATCH (t:TemporalTransition) RETURN count(t) as cnt'),
    ]);

    const toNum = (r) => {
      const val = r?.[0]?.cnt;
      return typeof val === 'object' && val?.toNumber ? val.toNumber() : (val || 0);
    };

    return {
      machineCount: toNum(machines),
      stateCount: toNum(states),
      transitionCount: toNum(transitions),
    };
  }

  /**
   * Find state machines by entity name.
   */
  async findByEntityName(entityName) {
    const result = await this.memgraphService.runQuery(
      `MATCH (m:TemporalStateMachine)
       WHERE m.entityName = $entityName OR m.tableName CONTAINS $entityName
       RETURN m.id as id, m.name as name, m.entityName as entityName,
              m.stateColumn as stateColumn, m.stateCount as stateCount`,
      { entityName }
    );
    return result || [];
  }
}

module.exports = {
  TemporalDomainService,
  StateType,
  TriggerType,
};
