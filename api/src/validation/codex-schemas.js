/**
 * CODEX-VALID: JSON Schemas for Codex namespace
 *
 * Implements Information Contract from research:
 * - 5 semantic layers: Identity, Narrative, Normativity, Lifecycle, Traceability
 * - Supports both ConstitutiveRule and PrescriptiveRule
 * - Includes deonticState lifecycle (ODRL-inspired)
 *
 * @see docs/codex/standards/CODEX-VALID.md
 */

const CODEX_NODE_TYPES = [
  'CodexPrinciple',    // M3: immutable philosophical foundations
  'CodexRule',         // M2: prescriptive behavior rules
  'CodexDefinition',   // M2: constitutive term definitions
  'CodexConstraint',   // M2: executable constraints (Cypher/JSON Schema)
  'CodexPattern',      // M2: recommended patterns (SHOULD)
  'CodexSection',      // Grouping for navigation
  'CodexVersion',      // Snapshot of Codex state
  'CodexProposal',     // Change proposal from agent
  'CodexDecision',     // Accepted/rejected decision (ADR)
  'CodexStakeholder'   // Governance role
];

const RULE_KINDS = ['CONSTITUTIVE', 'PRESCRIPTIVE'];
const MODALITIES = ['MUST', 'SHOULD', 'MAY', 'MUST_NOT', 'SHOULD_NOT'];
const DEONTIC_STATES = ['NOT_SET', 'ACTIVE', 'VIOLATED', 'FULFILLED'];
const CHANGEABILITY_TIERS = ['FROZEN', 'ADMIN_ONLY', 'REVIEWED', 'AGENT_L2'];
const CODEX_STATUSES = ['ACTIVE', 'PROPOSED', 'DEPRECATED', 'SUPERSEDED'];

/**
 * Base schema for ALL Codex nodes - Information Contract
 */
const codexNodeBase = {
  $id: 'codex-node-base',
  type: 'object',
  required: [
    'id',
    'codexId',
    'namespace',
    'nodeType',
    'title',
    'summary',
    'rationale',
    'whyItExists',
    'status',
    'version',
    'createdAt',
    'createdBy',
    'contentHash'
  ],
  properties: {
    // === IDENTITY ===
    id: {
      type: 'string',
      pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      description: 'UUIDv7'
    },
    codexId: {
      type: 'string',
      pattern: '^CODEX-(PRINCIPLE|RULE|DEF|CONSTRAINT|PATTERN|SECTION|VERSION|PROPOSAL|DECISION|STAKEHOLDER)-[0-9]{3,4}$',
      description: 'Human-readable ID, e.g., CODEX-RULE-042'
    },
    namespace: {
      type: 'string',
      const: 'Codex'
    },
    nodeType: {
      type: 'string',
      enum: CODEX_NODE_TYPES
    },

    // === NARRATIVE (5 semantic layers - all required for documentability) ===
    title: {
      type: 'string',
      minLength: 3,
      maxLength: 200,
      description: 'Short title for headers'
    },
    summary: {
      type: 'string',
      minLength: 10,
      maxLength: 500,
      description: 'What this is (1-2 sentences)'
    },
    rationale: {
      type: 'string',
      minLength: 20,
      description: 'Why this rule/principle exists'
    },
    whyItExists: {
      type: 'string',
      minLength: 10,
      description: 'Event or problem that created this'
    },
    examples: {
      type: 'array',
      items: { type: 'string', minLength: 10 },
      minItems: 1,
      description: 'At least one concrete example required'
    },

    // === LIFECYCLE ===
    status: {
      type: 'string',
      enum: CODEX_STATUSES
    },
    version: {
      type: 'string',
      pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$',
      description: 'SemVer'
    },
    createdAt: {
      type: 'string',
      format: 'date-time'
    },
    createdBy: {
      type: 'string',
      description: 'admin or AgentId'
    },
    approvedBy: {
      type: 'string'
    },
    approvedAt: {
      type: 'string',
      format: 'date-time'
    },
    changeabilityTier: {
      type: 'string',
      enum: CHANGEABILITY_TIERS,
      default: 'ADMIN_ONLY'
    },

    // === TRACEABILITY ===
    sourceADR: {
      type: 'string',
      description: 'Reference to ADR in META namespace'
    },
    fallacyRisk: {
      type: 'string',
      description: 'Reference to BlackCodex entry if known failure exists'
    },
    contentHash: {
      type: 'string',
      pattern: '^[a-f0-9]{64}$',
      description: 'SHA-256 of canonical content'
    },
    chainHash: {
      type: 'string',
      pattern: '^[a-f0-9]{64}$',
      description: 'SHA-256(previousHash + contentHash)'
    },
    previousHash: {
      type: 'string',
      pattern: '^([a-f0-9]{64}|GENESIS)$'
    },

    // === MACHINE-READABLE ===
    tags: {
      type: 'array',
      items: { type: 'string' },
      default: []
    },
    applicableLabels: {
      type: 'array',
      items: { type: 'string' },
      description: 'Memgraph labels this rule applies to'
    },
    vectorId: {
      type: 'string',
      description: 'Qdrant point ID for semantic search'
    }
  }
};

/**
 * CodexPrinciple - M3 level immutable foundations
 */
const codexPrinciple = {
  $id: 'codex-principle',
  allOf: [
    { $ref: 'codex-node-base' },
    {
      type: 'object',
      properties: {
        nodeType: { const: 'CodexPrinciple' },
        ruleKind: { const: 'CONSTITUTIVE' },
        modality: { const: 'MUST' },
        changeabilityTier: { const: 'FROZEN' },
        philosophicalBasis: {
          type: 'string',
          description: 'Link to philosophical tradition or reasoning'
        }
      },
      required: ['philosophicalBasis']
    }
  ]
};

/**
 * CodexRule - M2 level prescriptive rules
 */
const codexRule = {
  $id: 'codex-rule',
  allOf: [
    { $ref: 'codex-node-base' },
    {
      type: 'object',
      properties: {
        nodeType: { const: 'CodexRule' },
        ruleKind: {
          type: 'string',
          enum: RULE_KINDS
        },
        modality: {
          type: 'string',
          enum: MODALITIES
        },
        deonticState: {
          type: 'string',
          enum: DEONTIC_STATES,
          default: 'NOT_SET',
          description: 'ODRL-inspired lifecycle state'
        },
        scope: {
          type: 'array',
          items: { type: 'string' },
          description: 'Operations or node types this applies to'
        },
        derivesFromPrinciple: {
          type: 'string',
          description: 'codexId of parent principle'
        }
      },
      required: ['ruleKind', 'modality', 'scope']
    }
  ]
};

/**
 * CodexDefinition - M2 level constitutive definitions
 */
const codexDefinition = {
  $id: 'codex-definition',
  allOf: [
    { $ref: 'codex-node-base' },
    {
      type: 'object',
      properties: {
        nodeType: { const: 'CodexDefinition' },
        ruleKind: { const: 'CONSTITUTIVE' },
        term: {
          type: 'string',
          description: 'The term being defined'
        },
        formalDefinition: {
          type: 'string',
          description: 'Precise formal definition'
        },
        relatedTerms: {
          type: 'array',
          items: { type: 'string' },
          description: 'codexIds of related definitions'
        }
      },
      required: ['term', 'formalDefinition']
    }
  ]
};

/**
 * CodexConstraint - Executable constraint (Cypher or JSON Schema)
 */
const codexConstraint = {
  $id: 'codex-constraint',
  allOf: [
    { $ref: 'codex-node-base' },
    {
      type: 'object',
      properties: {
        nodeType: { const: 'CodexConstraint' },
        constraintType: {
          type: 'string',
          enum: ['CYPHER', 'JSON_SCHEMA', 'CUSTOM']
        },
        constraintBody: {
          type: 'string',
          description: 'The actual constraint code/schema'
        },
        enforcesRule: {
          type: 'string',
          description: 'codexId of the rule this enforces'
        },
        isActive: {
          type: 'boolean',
          default: true
        }
      },
      required: ['constraintType', 'constraintBody', 'enforcesRule']
    }
  ]
};

/**
 * CodexPattern - Recommended pattern (SHOULD modality)
 */
const codexPattern = {
  $id: 'codex-pattern',
  allOf: [
    { $ref: 'codex-node-base' },
    {
      type: 'object',
      properties: {
        nodeType: { const: 'CodexPattern' },
        ruleKind: { const: 'PRESCRIPTIVE' },
        modality: { const: 'SHOULD' },
        implementsRule: {
          type: 'string',
          description: 'codexId of the rule this implements'
        },
        codeExample: {
          type: 'string',
          description: 'Code showing correct usage'
        },
        antiPatternRef: {
          type: 'string',
          description: 'Reference to BlackCodex anti-pattern if exists'
        }
      },
      required: ['implementsRule']
    }
  ]
};

/**
 * CodexProposal - Agent-submitted change proposal
 */
const codexProposal = {
  $id: 'codex-proposal',
  allOf: [
    { $ref: 'codex-node-base' },
    {
      type: 'object',
      properties: {
        nodeType: { const: 'CodexProposal' },
        proposalType: {
          type: 'string',
          enum: ['CREATE', 'MODIFY', 'DEPRECATE', 'SUPERSEDE']
        },
        targetCodexId: {
          type: 'string',
          description: 'codexId of target node (for MODIFY/DEPRECATE/SUPERSEDE)'
        },
        proposedChanges: {
          type: 'object',
          description: 'JSON diff of proposed changes'
        },
        agentConfidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Agent confidence in this proposal'
        },
        reviewStatus: {
          type: 'string',
          enum: ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
          default: 'PENDING'
        },
        reviewedBy: { type: 'string' },
        reviewedAt: { type: 'string', format: 'date-time' },
        reviewNotes: { type: 'string' }
      },
      required: ['proposalType', 'agentConfidence']
    }
  ]
};

/**
 * CodexStakeholder - Governance role definition
 */
const codexStakeholder = {
  $id: 'codex-stakeholder',
  allOf: [
    { $ref: 'codex-node-base' },
    {
      type: 'object',
      properties: {
        nodeType: { const: 'CodexStakeholder' },
        stakeholderType: {
          type: 'string',
          enum: ['ADMIN', 'REVIEWER', 'AGENT', 'OBSERVER']
        },
        autonomyLevel: {
          type: 'string',
          enum: ['L1', 'L2', 'L3', 'L4', 'L5'],
          description: 'Graduated autonomy level per research'
        },
        permittedScopes: {
          type: 'array',
          items: { type: 'string' },
          description: 'CodexSection codexIds this stakeholder can modify'
        },
        autonomyCertificate: {
          type: 'object',
          properties: {
            issuedAt: { type: 'string', format: 'date-time' },
            validUntil: { type: 'string', format: 'date-time' },
            maxChangeabilityTier: { type: 'string', enum: CHANGEABILITY_TIERS },
            successfulProposals: { type: 'integer', minimum: 0 },
            rejectedProposals: { type: 'integer', minimum: 0 }
          }
        }
      },
      required: ['stakeholderType', 'autonomyLevel']
    }
  ]
};

/**
 * BlackCodexEntry - Failed approaches and anti-patterns
 */
const BLACK_CODEX_TYPES = ['RejectedProposal', 'AntiPattern', 'FailedApproach', 'ResolvedContradiction'];

const blackCodexEntry = {
  $id: 'black-codex-entry',
  type: 'object',
  required: [
    'id', 'codexId', 'namespace', 'type', 'title', 'summary',
    'failureContext', 'symptom', 'rootCause', 'refactoringPlan',
    'createdAt', 'createdBy'
  ],
  properties: {
    id: { type: 'string' },
    codexId: {
      type: 'string',
      pattern: '^BLACKCODEX-[0-9]{3,4}$'
    },
    namespace: { const: 'BlackCodex' },
    type: {
      type: 'string',
      enum: BLACK_CODEX_TYPES
    },
    title: { type: 'string', minLength: 3 },
    summary: { type: 'string', minLength: 10 },
    failureContext: { type: 'string', description: 'Where and how this was attempted' },
    symptom: { type: 'string', description: 'How the problem manifested' },
    rootCause: { type: 'string', description: 'Why it failed (diagnosis)' },
    refactoringPlan: { type: 'string', description: 'Concrete path from wrong to right approach' },
    alternativeTo: { type: 'string', description: 'codexId of the correct rule/pattern' },
    confidenceInDiagnosis: { type: 'number', minimum: 0, maximum: 1 },
    status: { type: 'string', enum: ['ACTIVE', 'RESOLVED', 'ARCHIVED'], default: 'ACTIVE' },
    archivedAt: { type: 'string', format: 'date-time' },
    archivedBy: { type: 'string' },
    referenceCount: { type: 'integer', minimum: 0, default: 0 },
    createdAt: { type: 'string', format: 'date-time' },
    createdBy: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } }
  }
};

// Export all schemas and constants
module.exports = {
  // Constants
  CODEX_NODE_TYPES,
  RULE_KINDS,
  MODALITIES,
  DEONTIC_STATES,
  CHANGEABILITY_TIERS,
  CODEX_STATUSES,
  BLACK_CODEX_TYPES,

  // Schemas
  schemas: {
    codexNodeBase,
    codexPrinciple,
    codexRule,
    codexDefinition,
    codexConstraint,
    codexPattern,
    codexProposal,
    codexStakeholder,
    blackCodexEntry
  },

  // Schema map for registry integration
  schemaMap: {
    CodexPrinciple: codexPrinciple,
    CodexRule: codexRule,
    CodexDefinition: codexDefinition,
    CodexConstraint: codexConstraint,
    CodexPattern: codexPattern,
    CodexProposal: codexProposal,
    CodexStakeholder: codexStakeholder,
    BlackCodexEntry: blackCodexEntry
  }
};
