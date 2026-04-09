/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH CLASSIFICATION SERVICE
 * Formal type system for graph definitions (EXECUTABLE, STRUCTURAL, etc.)
 *
 * NOT the same as GraphTypeService which manages node/edge types within
 * a graph. This service classifies GRAPHS THEMSELVES by their purpose.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// ENUMS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Graph types organized by dimension.
 *
 * EXECUTION dimension — graphs that represent runnable workflows:
 *   EXECUTABLE  — directly runnable DAG (dialog, business, extraction)
 *   TEMPLATE    — blueprint requiring instantiation before execution
 *   COMPOSITE   — orchestrates sub-graphs with isolated contexts
 *   PROCESS     — high-level process documentation, compiles to EXECUTABLE
 *
 * DATA dimension — graphs that represent data structures:
 *   STRUCTURAL  — schema definition (like a class/contract)
 *   STORABLE    — instance of a STRUCTURAL (like a class instance with values)
 *   PROJECTION  — derived/read-only view of another graph
 *
 * GOVERNANCE dimension — graphs that represent rules and audit:
 *   CONSTRAINT  — validation rules attached to a STRUCTURAL
 *   VALIDATION  — executable read-only check (can run but not mutate)
 *   EVENT       — append-only audit trail with Merkle DAG integrity
 */
const GraphType = {
  // Execution dimension
  EXECUTABLE: 'EXECUTABLE',
  TEMPLATE: 'TEMPLATE',
  COMPOSITE: 'COMPOSITE',
  PROCESS: 'PROCESS',

  // Data dimension
  STRUCTURAL: 'STRUCTURAL',
  STORABLE: 'STORABLE',
  PROJECTION: 'PROJECTION',

  // Governance dimension
  CONSTRAINT: 'CONSTRAINT',
  VALIDATION: 'VALIDATION',
  EVENT: 'EVENT',
};

const GraphDimension = {
  EXECUTION: 'EXECUTION',
  DATA: 'DATA',
  GOVERNANCE: 'GOVERNANCE',
};

const GraphSubType = {
  // For EXECUTABLE
  DIALOG: 'dialog',
  BUSINESS: 'business',
  EXTRACTION: 'extraction',
};

// ────────────────────────────────────────────────────────────────────────────
// TYPE METADATA
// ────────────────────────────────────────────────────────────────────────────

const GraphTypeMetadata = {
  [GraphType.EXECUTABLE]: {
    dimension: GraphDimension.EXECUTION,
    canExecute: true,
    requiresInstantiation: false,
    supportsCheckpoint: true,
    validSubTypes: [GraphSubType.DIALOG, GraphSubType.BUSINESS, GraphSubType.EXTRACTION],
  },
  [GraphType.TEMPLATE]: {
    dimension: GraphDimension.EXECUTION,
    canExecute: false,
    requiresInstantiation: true,
    supportsCheckpoint: false,
    validSubTypes: [],
  },
  [GraphType.COMPOSITE]: {
    dimension: GraphDimension.EXECUTION,
    canExecute: true,
    requiresInstantiation: false,
    supportsCheckpoint: true,
    requiresIsolation: true,
    validSubTypes: [],
  },
  [GraphType.PROCESS]: {
    dimension: GraphDimension.EXECUTION,
    canExecute: false,
    requiresCompilation: true,
    compilesTo: [GraphType.EXECUTABLE],
    validSubTypes: [],
  },
  [GraphType.STRUCTURAL]: {
    dimension: GraphDimension.DATA,
    canExecute: false,
    compilesTo: ['jsonSchema'],
    validSubTypes: [],
  },
  [GraphType.STORABLE]: {
    dimension: GraphDimension.DATA,
    canExecute: false,
    requiresConformsTo: true,
    validSubTypes: [],
  },
  [GraphType.PROJECTION]: {
    dimension: GraphDimension.DATA,
    canExecute: false,
    isDerived: true,
    validSubTypes: [],
  },
  [GraphType.CONSTRAINT]: {
    dimension: GraphDimension.GOVERNANCE,
    canExecute: false,
    compilesTo: ['zod', 'ajv', 'jsonSchema'],
    requiresConstrains: true,
    validSubTypes: [],
  },
  [GraphType.VALIDATION]: {
    dimension: GraphDimension.GOVERNANCE,
    canExecute: true,
    readOnly: true,
    validSubTypes: [],
  },
  [GraphType.EVENT]: {
    dimension: GraphDimension.GOVERNANCE,
    canExecute: false,
    appendOnly: true,
    requiresMerkleDAG: true,
    validSubTypes: [],
  },
};

// ────────────────────────────────────────────────────────────────────────────
// LEGACY TYPE MAPPING
// ────────────────────────────────────────────────────────────────────────────

const LEGACY_TYPE_MAP = {
  atomic: { graphType: GraphType.EXECUTABLE, subType: null },
  tool: { graphType: GraphType.EXECUTABLE, subType: null },
  business: { graphType: GraphType.EXECUTABLE, subType: GraphSubType.BUSINESS },
  composite: { graphType: GraphType.COMPOSITE, subType: null },
  template: { graphType: GraphType.TEMPLATE, subType: null },
  dialog: { graphType: GraphType.EXECUTABLE, subType: GraphSubType.DIALOG },
  extraction: { graphType: GraphType.EXECUTABLE, subType: GraphSubType.EXTRACTION },
};

// ────────────────────────────────────────────────────────────────────────────
// SERVICE CLASS
// ────────────────────────────────────────────────────────────────────────────

class GraphClassificationService {
  /**
   * Validate that a graphType value is a known type.
   * @param {string} graphType
   * @returns {boolean}
   * @throws {Error} if invalid
   */
  validateGraphType(graphType) {
    if (!GraphType[graphType]) {
      throw new Error(
        `Invalid graphType: '${graphType}'. Valid types: ${Object.keys(GraphType).join(', ')}`
      );
    }
    return true;
  }

  /**
   * Validate that a subType is valid for the given graphType.
   * @param {string} graphType
   * @param {string|null} subType
   * @returns {boolean}
   * @throws {Error} if invalid
   */
  validateSubType(graphType, subType) {
    if (!subType) return true;
    const meta = this.getMetadata(graphType);
    if (!meta.validSubTypes.includes(subType)) {
      throw new Error(
        `Invalid subType '${subType}' for graphType '${graphType}'. ` +
        `Valid: ${meta.validSubTypes.length ? meta.validSubTypes.join(', ') : '(none)'}`
      );
    }
    return true;
  }

  /**
   * Get full metadata for a graph type.
   * @param {string} graphType
   * @returns {object}
   */
  getMetadata(graphType) {
    this.validateGraphType(graphType);
    return GraphTypeMetadata[graphType];
  }

  /**
   * Get the dimension (EXECUTION/DATA/GOVERNANCE) for a graph type.
   * @param {string} graphType
   * @returns {string}
   */
  getDimension(graphType) {
    return this.getMetadata(graphType).dimension;
  }

  /**
   * Check if a graph type can be executed by RuntimeEngine.
   * EXECUTABLE, COMPOSITE, and VALIDATION return true.
   * @param {string} graphType
   * @returns {boolean}
   */
  canExecute(graphType) {
    return this.getMetadata(graphType).canExecute === true;
  }

  /**
   * Check if the graph type requires instantiation before use.
   * Only TEMPLATE returns true.
   * @param {string} graphType
   * @returns {boolean}
   */
  requiresInstantiation(graphType) {
    return this.getMetadata(graphType).requiresInstantiation === true;
  }

  /**
   * Check if the graph type requires compilation before execution.
   * Only PROCESS returns true.
   * @param {string} graphType
   * @returns {boolean}
   */
  requiresCompilation(graphType) {
    return this.getMetadata(graphType).requiresCompilation === true;
  }

  /**
   * Check if the graph type supports checkpoint/resume.
   * @param {string} graphType
   * @returns {boolean}
   */
  supportsCheckpoint(graphType) {
    return this.getMetadata(graphType).supportsCheckpoint === true;
  }

  /**
   * Check if the graph type is read-only (can execute but not mutate).
   * @param {string} graphType
   * @returns {boolean}
   */
  isReadOnly(graphType) {
    return this.getMetadata(graphType).readOnly === true;
  }

  /**
   * Check if the graph type must link to a STRUCTURAL via CONFORMS_TO.
   * Only STORABLE returns true.
   * @param {string} graphType
   * @returns {boolean}
   */
  requiresConformsTo(graphType) {
    return this.getMetadata(graphType).requiresConformsTo === true;
  }

  /**
   * Check if the graph type must link to a STRUCTURAL via CONSTRAINS.
   * Only CONSTRAINT returns true.
   * @param {string} graphType
   * @returns {boolean}
   */
  requiresConstrains(graphType) {
    return this.getMetadata(graphType).requiresConstrains === true;
  }

  /**
   * Map legacy CatalogEntry.type value to the formal graphType/subType.
   * Returns default EXECUTABLE for unknown types.
   * @param {string} legacyType
   * @returns {{ graphType: string, subType: string|null }}
   */
  mapLegacyType(legacyType) {
    return LEGACY_TYPE_MAP[legacyType] || { graphType: GraphType.EXECUTABLE, subType: null };
  }

  /**
   * Get all graph types for a given dimension.
   * @param {string} dimension
   * @returns {string[]}
   */
  getTypesByDimension(dimension) {
    return Object.entries(GraphTypeMetadata)
      .filter(([, meta]) => meta.dimension === dimension)
      .map(([type]) => type);
  }

  /**
   * Get all executable graph types.
   * @returns {string[]}
   */
  getExecutableTypes() {
    return Object.entries(GraphTypeMetadata)
      .filter(([, meta]) => meta.canExecute)
      .map(([type]) => type);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON EXPORT
// ────────────────────────────────────────────────────────────────────────────

const graphClassificationService = new GraphClassificationService();

module.exports = {
  GraphType,
  GraphDimension,
  GraphSubType,
  GraphTypeMetadata,
  GraphClassificationService,
  graphClassificationService,
};
