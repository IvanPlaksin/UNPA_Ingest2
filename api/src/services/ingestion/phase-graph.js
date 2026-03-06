/**
 * PhaseDependencyGraph
 *
 * Dependency graph between extraction phases for safe restarts.
 * Knows which phases depend on which, allowing:
 *   - Validation of phase restart requests
 *   - Calculation of cascading invalidations
 *   - Minimum re-run set computation
 *
 * Part of A.7.
 */

const PHASE_DEPENDENCIES = {
  META_CONSULTATION:      [],
  RECONNAISSANCE:         ['META_CONSULTATION'],
  MASTER_DATA:            ['RECONNAISSANCE'],
  ENTITY_DISCOVERY:       ['MASTER_DATA'],
  RELATIONSHIP_INFERENCE: ['ENTITY_DISCOVERY'],
  TRANSACTION_ANALYSIS:   ['MASTER_DATA'],
  BUSINESS_LOGIC:         ['RECONNAISSANCE'],
  CROSS_VALIDATION:       ['ENTITY_DISCOVERY', 'RELATIONSHIP_INFERENCE', 'TRANSACTION_ANALYSIS', 'BUSINESS_LOGIC'],
  GRAPH_SYNTHESIS:        ['CROSS_VALIDATION'],
};

/**
 * Canonical phase order (same as PHASES array in mssql.agent.js).
 */
const PHASE_ORDER = [
  'META_CONSULTATION',
  'RECONNAISSANCE',
  'MASTER_DATA',
  'ENTITY_DISCOVERY',
  'RELATIONSHIP_INFERENCE',
  'TRANSACTION_ANALYSIS',
  'BUSINESS_LOGIC',
  'CROSS_VALIDATION',
  'GRAPH_SYNTHESIS',
];

class PhaseDependencyGraph {
  /**
   * Check if a phase can be restarted given the set of completed phases.
   * @param {string} phaseName
   * @param {string[]} completedPhases
   * @returns {boolean}
   */
  canRestart(phaseName, completedPhases) {
    const deps = PHASE_DEPENDENCIES[phaseName];
    if (!deps) return false;
    return deps.every(dep => completedPhases.includes(dep));
  }

  /**
   * Get all phases that become invalid when a phase is re-run.
   * @param {string} phaseName
   * @returns {string[]}
   */
  getInvalidated(phaseName) {
    const invalidated = [];

    const findDependents = (phase) => {
      for (const [name, deps] of Object.entries(PHASE_DEPENDENCIES)) {
        if (deps.includes(phase) && !invalidated.includes(name)) {
          invalidated.push(name);
          findDependents(name);
        }
      }
    };

    findDependents(phaseName);
    return invalidated.sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b));
  }

  /**
   * Get the minimum set of phases to re-run (including the target phase
   * and any downstream completed phases that would be invalidated).
   * @param {string} phaseName - Phase to restart
   * @param {string[]} completedPhases - Phases already completed
   * @returns {string[]} Ordered list of phases to re-run
   */
  getPhasesToRerun(phaseName, completedPhases) {
    const toRerun = new Set([phaseName]);
    const invalidated = this.getInvalidated(phaseName);

    for (const phase of invalidated) {
      if (completedPhases.includes(phase)) {
        toRerun.add(phase);
      }
    }

    return [...toRerun].sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b));
  }

  /**
   * Get direct dependencies of a phase.
   * @param {string} phaseName
   * @returns {string[]}
   */
  getDependencies(phaseName) {
    return PHASE_DEPENDENCIES[phaseName] || [];
  }

  /**
   * Get phases that directly depend on a given phase.
   * @param {string} phaseName
   * @returns {string[]}
   */
  getDependents(phaseName) {
    return Object.entries(PHASE_DEPENDENCIES)
      .filter(([, deps]) => deps.includes(phaseName))
      .map(([name]) => name);
  }

  /**
   * Validate a proposed execution order.
   * @param {string[]} phaseOrder
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateOrder(phaseOrder) {
    const errors = [];
    const completed = new Set();

    for (const phase of phaseOrder) {
      const deps = PHASE_DEPENDENCIES[phase];
      if (!deps) {
        errors.push(`Unknown phase: ${phase}`);
        continue;
      }
      for (const dep of deps) {
        if (!completed.has(dep)) {
          errors.push(`${phase} requires ${dep} to complete first`);
        }
      }
      completed.add(phase);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get all phases in canonical order.
   * @returns {string[]}
   */
  getPhaseOrder() {
    return [...PHASE_ORDER];
  }

  /**
   * Get parallel-eligible phases (phases whose dependencies are met
   * by the given completed set and that haven't been completed yet).
   * @param {string[]} completedPhases
   * @returns {string[]}
   */
  getRunnable(completedPhases) {
    const completed = new Set(completedPhases);
    return PHASE_ORDER.filter(phase => {
      if (completed.has(phase)) return false;
      const deps = PHASE_DEPENDENCIES[phase] || [];
      return deps.every(dep => completed.has(dep));
    });
  }
}

module.exports = { PhaseDependencyGraph, PHASE_DEPENDENCIES, PHASE_ORDER };
