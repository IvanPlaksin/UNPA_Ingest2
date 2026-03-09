/**
 * UN ProjectAdvisor — Multi-Domain Type Definitions
 * Version: 2.0.0
 *
 * Based on SWEBOK V4 Knowledge Areas adapted for
 * legacy UN system knowledge extraction.
 */

// ============================================================
// DOMAIN ENUMERATION
// ============================================================

export enum InformationDomain {
  STRUCTURAL = 'STRUCTURAL',           // D1: what exists (schema)
  BEHAVIORAL = 'BEHAVIORAL',           // D2: what happens (GXE-executable)
  SEMANTIC = 'SEMANTIC',               // D3: what it means (ontology)
  TEMPORAL = 'TEMPORAL',               // D4: how it changes (lifecycles)
  QUALITY_DATA = 'QUALITY_DATA',       // D5: data anomalies
  REQUIREMENTS = 'REQUIREMENTS',       // D6: what was required
  CONFIGURATION = 'CONFIGURATION',     // D7: versions and environments
  QUALITY_PROCESS = 'QUALITY_PROCESS', // D8: tests and defects
  CONSTRUCTION = 'CONSTRUCTION',       // D9: how it's implemented
  ARCHITECTURAL = 'ARCHITECTURAL',     // D10: system topology
  OPERATIONAL = 'OPERATIONAL',         // D11: runtime, incidents
  SECURITY = 'SECURITY',               // D12: access, permissions
  GNN_TRAINING = 'GNN_TRAINING',       // D13: ML training material
}

// Domain metadata for UI and API
export const DOMAIN_INFO: Record<InformationDomain, {
  label: string;
  shortLabel: string;
  description: string;
  sourceSystem: string[];
  swebokKA: string;
  color: string;
}> = {
  [InformationDomain.STRUCTURAL]: {
    label: 'Structural',
    shortLabel: 'D1',
    description: 'Database schema, entities, attributes, relationships',
    sourceSystem: ['MSSQL'],
    swebokKA: 'KA3 Software Design',
    color: '#3b82f6',
  },
  [InformationDomain.BEHAVIORAL]: {
    label: 'Behavioral',
    shortLabel: 'D2',
    description: 'Executable processes from stored procedures',
    sourceSystem: ['MSSQL'],
    swebokKA: 'KA4 Software Construction',
    color: '#22c55e',
  },
  [InformationDomain.SEMANTIC]: {
    label: 'Semantic',
    shortLabel: 'D3',
    description: 'Business concepts, rules, domain vocabulary',
    sourceSystem: ['MSSQL', 'ADO', 'SHAREPOINT'],
    swebokKA: 'KA1 Software Requirements',
    color: '#a855f7',
  },
  [InformationDomain.TEMPORAL]: {
    label: 'Temporal',
    shortLabel: 'D4',
    description: 'State machines, lifecycle transitions, temporal patterns',
    sourceSystem: ['MSSQL'],
    swebokKA: 'KA7 Software Maintenance',
    color: '#ec4899',
  },
  [InformationDomain.QUALITY_DATA]: {
    label: 'Quality (Data)',
    shortLabel: 'D5',
    description: 'Data anomalies, integrity violations, coverage gaps',
    sourceSystem: ['MSSQL'],
    swebokKA: 'KA12 Software Quality',
    color: '#ef4444',
  },
  [InformationDomain.REQUIREMENTS]: {
    label: 'Requirements',
    shortLabel: 'D6',
    description: 'User stories, epics, acceptance criteria',
    sourceSystem: ['ADO'],
    swebokKA: 'KA1 Software Requirements',
    color: '#f59e0b',
  },
  [InformationDomain.CONFIGURATION]: {
    label: 'Configuration',
    shortLabel: 'D7',
    description: 'Versions, environments, releases, deployments',
    sourceSystem: ['ADO', 'GIT'],
    swebokKA: 'KA8 Software Configuration Management',
    color: '#06b6d4',
  },
  [InformationDomain.QUALITY_PROCESS]: {
    label: 'Quality (Process)',
    shortLabel: 'D8',
    description: 'Test cases, defects, quality metrics',
    sourceSystem: ['ADO'],
    swebokKA: 'KA5 Software Testing',
    color: '#f97316',
  },
  [InformationDomain.CONSTRUCTION]: {
    label: 'Construction',
    shortLabel: 'D9',
    description: 'Code artifacts, commits, patterns, dependencies',
    sourceSystem: ['GIT', 'ADO'],
    swebokKA: 'KA4 Software Construction',
    color: '#84cc16',
  },
  [InformationDomain.ARCHITECTURAL]: {
    label: 'Architectural',
    shortLabel: 'D10',
    description: 'System components, interfaces, integration points',
    sourceSystem: ['GIT', 'ADO'],
    swebokKA: 'KA2 Software Architecture',
    color: '#6366f1',
  },
  [InformationDomain.OPERATIONAL]: {
    label: 'Operational',
    shortLabel: 'D11',
    description: 'SOPs, incidents, monitoring, performance patterns',
    sourceSystem: ['SHAREPOINT'],
    swebokKA: 'KA6 Software Engineering Operations',
    color: '#14b8a6',
  },
  [InformationDomain.SECURITY]: {
    label: 'Security',
    shortLabel: 'D12',
    description: 'Access roles, permissions, security policies, audit',
    sourceSystem: ['MSSQL', 'ADO', 'SHAREPOINT'],
    swebokKA: 'KA13 Software Security',
    color: '#dc2626',
  },
  [InformationDomain.GNN_TRAINING]: {
    label: 'GNN Training',
    shortLabel: 'D13',
    description: 'Feature-engineered graphs for PyTorch Geometric',
    sourceSystem: ['ALL'],
    swebokKA: 'N/A (ProjectAdvisor-specific)',
    color: '#8b5cf6',
  },
};

// ============================================================
// GRAPH LIFECYCLE STATUS
// ============================================================

export enum GraphStatus {
  DRAFT = 'DRAFT',                     // Created by agent, raw
  UNDER_REVIEW = 'UNDER_REVIEW',       // Awaiting SME approval
  APPROVED = 'APPROVED',               // Approved -> triggers GNN training
  REJECTED = 'REJECTED',               // Rejected -> needs rework
  VERSIONED = 'VERSIONED',             // Superseded by newer version
  DEPRECATED = 'DEPRECATED',           // Outdated but still in use
  OBSOLETE = 'OBSOLETE',               // No longer used
  ARCHIVED = 'ARCHIVED',               // Read-only historical
  EXPERIMENTAL = 'EXPERIMENTAL',       // Research/sandbox use
  QUARANTINED = 'QUARANTINED',         // Frozen due to issues
}

// Allowed status transitions
export const STATUS_TRANSITIONS: Record<GraphStatus, GraphStatus[]> = {
  [GraphStatus.DRAFT]:        [GraphStatus.UNDER_REVIEW, GraphStatus.EXPERIMENTAL],
  [GraphStatus.UNDER_REVIEW]: [GraphStatus.APPROVED, GraphStatus.REJECTED],
  [GraphStatus.APPROVED]:     [GraphStatus.VERSIONED, GraphStatus.DEPRECATED, GraphStatus.QUARANTINED],
  [GraphStatus.REJECTED]:     [GraphStatus.DRAFT],
  [GraphStatus.VERSIONED]:    [GraphStatus.ARCHIVED],
  [GraphStatus.DEPRECATED]:   [GraphStatus.OBSOLETE, GraphStatus.QUARANTINED],
  [GraphStatus.OBSOLETE]:     [GraphStatus.ARCHIVED],
  [GraphStatus.ARCHIVED]:     [],
  [GraphStatus.EXPERIMENTAL]: [GraphStatus.DRAFT, GraphStatus.ARCHIVED],
  [GraphStatus.QUARANTINED]:  [GraphStatus.DRAFT, GraphStatus.ARCHIVED],
};

// Status metadata for UI
export const STATUS_INFO: Record<GraphStatus, {
  label: string;
  color: string;
  icon: string;
  gnnTraining: boolean;
  executable: boolean;
  editable: boolean;
}> = {
  [GraphStatus.DRAFT]:        { label: 'Draft',        color: '#6b7280', icon: 'FileEdit',      gnnTraining: false, executable: false, editable: true },
  [GraphStatus.UNDER_REVIEW]: { label: 'Under Review', color: '#f59e0b', icon: 'Eye',           gnnTraining: false, executable: false, editable: false },
  [GraphStatus.APPROVED]:     { label: 'Approved',     color: '#22c55e', icon: 'CheckCircle',   gnnTraining: true,  executable: true,  editable: false },
  [GraphStatus.REJECTED]:     { label: 'Rejected',     color: '#ef4444', icon: 'XCircle',       gnnTraining: false, executable: false, editable: true },
  [GraphStatus.VERSIONED]:    { label: 'Versioned',    color: '#8b5cf6', icon: 'GitBranch',     gnnTraining: false, executable: false, editable: false },
  [GraphStatus.DEPRECATED]:   { label: 'Deprecated',   color: '#f97316', icon: 'AlertTriangle', gnnTraining: false, executable: true,  editable: false },
  [GraphStatus.OBSOLETE]:     { label: 'Obsolete',     color: '#6b7280', icon: 'Archive',       gnnTraining: false, executable: false, editable: false },
  [GraphStatus.ARCHIVED]:     { label: 'Archived',     color: '#374151', icon: 'FolderClosed',  gnnTraining: false, executable: false, editable: false },
  [GraphStatus.EXPERIMENTAL]: { label: 'Experimental', color: '#06b6d4', icon: 'Flask',         gnnTraining: true,  executable: true,  editable: true },
  [GraphStatus.QUARANTINED]:  { label: 'Quarantined',  color: '#dc2626', icon: 'ShieldAlert',   gnnTraining: false, executable: false, editable: false },
};

// ============================================================
// DOMAIN GRAPH INTERFACE
// ============================================================

export interface DomainGraphBase {
  id: string;
  globalId: string;                    // namespace:domain:localId

  // Domain classification
  domain: InformationDomain;
  domainVersion: number;

  // Lifecycle
  status: GraphStatus;
  statusChangedAt: Date;
  statusChangedBy: string;
  statusReason?: string;               // Required for REJECTED/QUARANTINED

  // Provenance
  extractionSessionId?: string;
  sourceSystem: 'MSSQL' | 'ADO' | 'GIT' | 'SHAREPOINT' | 'MANUAL';
  sourceReference?: string;

  // Quality
  confidence: number;                  // 0.0-1.0
  humanValidated: boolean;

  // Content
  title: string;
  description?: string;
  nodes: DomainNode[];
  edges: DomainEdge[];

  // Temporal
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// DOMAIN NODE INTERFACE
// ============================================================

export interface DomainNode {
  id: string;
  domain: InformationDomain;
  nodeType: string;                    // Domain-specific type
  label: string;

  // Domain-specific data
  data: Record<string, unknown>;

  // Quality
  confidence: number;

  // Embedding for GNN
  embedding?: number[];

  // Position for visualization
  position?: { x: number; y: number };
}

// ============================================================
// DOMAIN EDGE INTERFACE
// ============================================================

export interface DomainEdge {
  id: string;
  source: string;
  target: string;
  edgeType: string;
  label?: string;

  // Cross-domain flag
  isCrossDomain: boolean;
  sourceDomain?: InformationDomain;
  targetDomain?: InformationDomain;

  // Properties
  weight?: number;
  confidence?: number;
  data?: Record<string, unknown>;
}

// ============================================================
// D2: BEHAVIORAL — GXE-EXECUTABLE TYPES
// ============================================================

export enum BehavioralNodeType {
  READ = 'READ',                       // SELECT
  WRITE = 'WRITE',                     // INSERT/UPDATE/DELETE
  DECISION = 'DECISION',               // IF/CASE
  CALCULATION = 'CALCULATION',         // SET @var = expression
  LOOP = 'LOOP',                       // WHILE/CURSOR
  SUBPROCESS = 'SUBPROCESS',           // EXEC other SP
  ERROR = 'ERROR',                     // RAISERROR/THROW
  TRANSACTION = 'TRANSACTION',         // BEGIN/COMMIT/ROLLBACK
  INPUT = 'INPUT',                     // Procedure parameters
  OUTPUT = 'OUTPUT',                   // Return values
}

export interface BehavioralProcessGraph extends DomainGraphBase {
  domain: InformationDomain.BEHAVIORAL;

  // GXE integration
  gxeCatalogId?: string;
  isExecutable: boolean;
  executionCount: number;
  lastExecutedAt?: Date;

  // SQL source
  sourceProcedure: string;
  sourceSchema: string;
  sqlComplexity: number;
  translationConfidence: number;

  // GXE-compatible structure
  gxeNodes: GxeNode[];
  gxeEdges: GxeEdge[];
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
}

export interface GxeNode {
  id: string;
  type: BehavioralNodeType;
  data: {
    entity?: string;                   // Reference to D1 entity
    operation?: string;                // SQL operation details
    condition?: string;                // For DECISION nodes
    expression?: string;               // For CALCULATION nodes
    errorCode?: string;                // For ERROR nodes
    transactionType?: 'begin' | 'commit' | 'rollback';
    [key: string]: unknown;
  };
  position: { x: number; y: number };
  inputs?: string[];
  outputs?: string[];
}

export interface GxeEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: 'default' | 'success' | 'failure' | 'loop';
}

// ============================================================
// CROSS-DOMAIN EDGE TYPES
// ============================================================

export enum CrossDomainEdgeType {
  // D1 <-> D2
  OPERATES_ON = 'OPERATES_ON',             // D2->D1: Process uses Entity
  // D1 <-> D3
  DEFINED_BY = 'DEFINED_BY',               // D3->D1: Concept defined by Entity
  // D2 <-> D3
  ENFORCES = 'ENFORCES',                   // D2->D3: Process enforces Rule
  // D2 <-> D4
  TRIGGERS = 'TRIGGERS',                   // D2->D4: Process triggers Transition
  // D3 <-> D4
  GUARDED_BY = 'GUARDED_BY',               // D4->D3: Transition guarded by Rule
  // D1 <-> D4
  GOVERNS = 'GOVERNS',                     // D4->D1: StateMachine governs Entity
  // D5 -> D1/D2/D3
  AFFECTS = 'AFFECTS',                     // D5->D1: Anomaly affects Entity
  VIOLATES = 'VIOLATES',                   // D5->D3: Anomaly violates Rule
  SPAWNS_TASK = 'SPAWNS_TASK',             // D5->iNeed: Anomaly creates task
  // D6 -> D2/D9
  IMPLEMENTED_BY = 'IMPLEMENTED_BY',       // D6->D2: Requirement implemented by Process
  TRACES_TO = 'TRACES_TO',                 // D6->D9: Requirement traces to Code
  // D8 -> D2/D6
  VALIDATES = 'VALIDATES',                 // D8->D6: TestCase validates Requirement
  EXERCISES = 'EXERCISES',                 // D8->D2: TestCase exercises Process
  // D9 -> D2/D1
  IMPLEMENTS = 'IMPLEMENTS',               // D9->D2: Code implements Process
  USES = 'USES',                           // D9->D1: Code uses Entity
  // D11 -> D2
  WATCHED_BY = 'WATCHED_BY',               // D11->D2: MonitoringRule watches Process
  // D12 -> D1/D2
  APPLIES_TO = 'APPLIES_TO',               // D12->D1/D2: Permission applies to resource
  AUDITED_BY = 'AUDITED_BY',               // D12->D2: Security audit of Process
}

// ============================================================
// GNN TRAINING TYPES
// ============================================================

export interface GnnTrainingGraph {
  id: string;
  sessionId: string;

  // Source graphs
  sourceGraphIds: string[];
  sourceDomains: InformationDomain[];

  // Training data (PyTorch Geometric format)
  nodeFeatureMatrix: number[][];         // [num_nodes, feature_dim]
  edgeIndex: [number[], number[]];       // COO format
  edgeFeatures?: number[][];

  // Labels
  nodeLabels?: number[];
  edgeLabels?: number[];
  graphLabel?: Record<string, number>;

  // Split assignment
  trainMask?: boolean[];
  valMask?: boolean[];
  testMask?: boolean[];

  // Status
  trainingStatus: 'pending' | 'ready' | 'training' | 'trained' | 'failed';
  modelVersion?: string;
  trainedAt?: Date;
  metrics?: {
    aucLinkPrediction?: number;
    f1NodeClassification?: number;
    accuracy?: number;
  };
}

// ============================================================
// STATUS CHANGE RECORD
// ============================================================

export interface GraphStatusChangeRecord {
  id: string;
  graphId: string;
  fromStatus: GraphStatus;
  toStatus: GraphStatus;
  changedBy: string;
  reason?: string;
  timestamp: Date;

  // Side effects
  triggeredGnnTraining?: boolean;
  gnnTrainingJobId?: string;
}
