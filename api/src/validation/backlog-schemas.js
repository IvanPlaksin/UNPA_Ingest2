/**
 * BackLog JSON Schema + Validation
 *
 * Defines the BackLogItem node type for CORE namespace.
 * Used by agents and humans to track code modification tasks.
 */

const TASK_TYPES = ['IMPLEMENT', 'REFACTOR', 'FIX', 'DOCUMENT', 'TEST'];
const TARGET_TYPES = ['EXECUTOR', 'SERVICE', 'COMPONENT', 'GRAPH', 'API', 'UI', 'CONFIG'];
const STATUSES = ['PROPOSED', 'APPROVED', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE', 'REJECTED', 'CANCELLED'];
const PRIORITIES = ['P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_LOW'];
const EFFORTS = ['XS', 'S', 'M', 'L', 'XL'];

const VALID_TRANSITIONS = {
  PROPOSED: ['APPROVED', 'REJECTED'],
  APPROVED: ['IN_PROGRESS', 'REJECTED', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'REVIEW', 'CANCELLED', 'PROPOSED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  REVIEW: ['DONE', 'IN_PROGRESS'],
  DONE: [],
  REJECTED: [],
  CANCELLED: []
};

const BackLogItemSchema = {
  $id: 'backlog-item',
  type: 'object',
  required: ['title', 'taskType', 'targetType', 'description', 'acceptanceCriteria'],
  properties: {
    id: { type: 'string' },
    backlogId: { type: 'string', pattern: '^BACKLOG-\\d{4}$' },
    namespace: { type: 'string', const: 'CORE' },
    nodeType: { type: 'string', const: 'BackLogItem' },

    title: { type: 'string', minLength: 10, maxLength: 200 },
    description: { type: 'string', minLength: 20 },
    taskType: { type: 'string', enum: TASK_TYPES },
    targetType: { type: 'string', enum: TARGET_TYPES },
    targetPath: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' }, minItems: 1 },

    status: { type: 'string', enum: STATUSES, default: 'PROPOSED' },
    priority: { type: 'string', enum: PRIORITIES, default: 'P2_MEDIUM' },
    effort: { type: 'string', enum: EFFORTS },

    createdBy: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    assignedTo: { type: 'string' },
    updatedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time' },

    sourceContext: { type: 'string' },
    relatedCodexRules: { type: 'array', items: { type: 'string' } },
    addressesBlackCodex: { type: 'array', items: { type: 'string' } },
    dependencies: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },

    implementationNotes: { type: 'string' },
    implementedFiles: { type: 'array', items: { type: 'string' } },
    pullRequestUrl: { type: 'string' }
  }
};

module.exports = {
  TASK_TYPES,
  TARGET_TYPES,
  STATUSES,
  PRIORITIES,
  EFFORTS,
  VALID_TRANSITIONS,
  BackLogItemSchema
};
