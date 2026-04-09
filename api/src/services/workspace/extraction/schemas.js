/**
 * Extraction Output Schemas
 *
 * JSON schemas for structured LLM output.
 * Used with Claude's structured output / tool_use.
 *
 * Based on Knowledge Object Model (5 families):
 * - Structural: Entity, Schema, APIContract
 * - Behavioral: BusinessRule, Workflow, Calculation
 * - Semantic: Concept, Relationship
 * - Operational: Policy
 * - Contextual: Decision, Requirement, Anomaly
 */

'use strict';

const EntitySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Entity name (e.g., Employee, Order, Invoice)' },
    type: {
      type: 'string',
      enum: ['BUSINESS_OBJECT', 'ACTOR', 'SYSTEM', 'DOCUMENT', 'LOCATION', 'EVENT', 'CONCEPT'],
      description: 'Entity classification'
    },
    description: { type: 'string', description: 'Brief description of what this entity represents' },
    attributes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          dataType: { type: 'string', enum: ['string', 'number', 'boolean', 'date', 'enum', 'object', 'array'] },
          required: { type: 'boolean' },
          description: { type: 'string' }
        },
        required: ['name', 'dataType']
      }
    },
    aliases: { type: 'array', items: { type: 'string' }, description: 'Alternative names' },
    domain: { type: 'string', description: 'Business domain (HR, Finance, IT, etc.)' }
  },
  required: ['name', 'type', 'description']
};

const RelationshipSchema = {
  type: 'object',
  properties: {
    sourceEntity: { type: 'string', description: 'Name of source entity' },
    targetEntity: { type: 'string', description: 'Name of target entity' },
    relationshipType: {
      type: 'string',
      enum: [
        'HAS', 'BELONGS_TO', 'CONTAINS', 'PART_OF',
        'CREATES', 'MODIFIES', 'DELETES', 'READS',
        'DEPENDS_ON', 'REFERENCES', 'IMPLEMENTS',
        'MANAGES', 'OWNS', 'APPROVES', 'REVIEWS',
        'TRIGGERS', 'CAUSES', 'PRECEDES', 'FOLLOWS',
        'SIMILAR_TO', 'OPPOSITE_OF', 'RELATED_TO'
      ]
    },
    cardinality: { type: 'string', enum: ['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_ONE', 'MANY_TO_MANY'] },
    description: { type: 'string' },
    bidirectional: { type: 'boolean' }
  },
  required: ['sourceEntity', 'targetEntity', 'relationshipType']
};

const BusinessRuleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Rule name' },
    description: { type: 'string' },
    ruleType: {
      type: 'string',
      enum: ['VALIDATION', 'CALCULATION', 'DERIVATION', 'CONSTRAINT', 'AUTHORIZATION', 'TRIGGER']
    },
    condition: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Condition in natural language or pseudo-code' },
        entities: { type: 'array', items: { type: 'string' } },
        fields: { type: 'array', items: { type: 'string' } },
        operator: { type: 'string', enum: ['EQUALS', 'NOT_EQUALS', 'GREATER', 'LESS', 'IN', 'NOT_IN', 'BETWEEN', 'CONTAINS', 'MATCHES'] }
      }
    },
    action: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['REJECT', 'APPROVE', 'CALCULATE', 'SET_VALUE', 'SEND_NOTIFICATION', 'CREATE_TASK', 'ESCALATE'] },
        description: { type: 'string' },
        target: { type: 'string' }
      }
    },
    exceptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { condition: { type: 'string' }, action: { type: 'string' } }
      }
    },
    enforcement: { type: 'string', enum: ['MANDATORY', 'RECOMMENDED', 'OPTIONAL'] },
    scope: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        systems: { type: 'array', items: { type: 'string' } },
        roles: { type: 'array', items: { type: 'string' } }
      }
    },
    priority: { type: 'number', description: 'Rule priority (1=highest)' }
  },
  required: ['name', 'description', 'ruleType', 'condition', 'action']
};

const WorkflowSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    triggerEvent: { type: 'string' },
    states: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['INITIAL', 'INTERMEDIATE', 'FINAL', 'ERROR'] },
          description: { type: 'string' }
        },
        required: ['name', 'type']
      }
    },
    transitions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          trigger: { type: 'string' },
          guard: { type: 'string' },
          action: { type: 'string' },
          actor: { type: 'string' }
        },
        required: ['from', 'to', 'trigger']
      }
    },
    actors: { type: 'array', items: { type: 'string' } },
    sla: {
      type: 'object',
      properties: {
        maxDuration: { type: 'string' },
        escalationAfter: { type: 'string' }
      }
    }
  },
  required: ['name', 'states', 'transitions']
};

const CalculationSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    formula: { type: 'string', description: 'Formula expression' },
    variables: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          unit: { type: 'string' },
          dataType: { type: 'string' },
          source: { type: 'string' }
        },
        required: ['name']
      }
    },
    result: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        unit: { type: 'string' },
        dataType: { type: 'string' }
      }
    },
    domain: { type: 'string' }
  },
  required: ['name', 'formula', 'variables']
};

const ConceptSchema = {
  type: 'object',
  properties: {
    term: { type: 'string' },
    definition: { type: 'string' },
    aliases: { type: 'array', items: { type: 'string' } },
    domain: { type: 'string' },
    parentConcept: { type: 'string' },
    relatedConcepts: { type: 'array', items: { type: 'string' } },
    examples: { type: 'array', items: { type: 'string' } }
  },
  required: ['term', 'definition']
};

const AnomalySchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    anomalyType: {
      type: 'string',
      enum: ['INCONSISTENCY', 'MISSING_DATA', 'CONTRADICTION', 'AMBIGUITY', 'OUTDATED', 'UNDEFINED_TERM', 'ORPHAN_REFERENCE']
    },
    description: { type: 'string' },
    severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    location: { type: 'string' },
    affectedEntities: { type: 'array', items: { type: 'string' } },
    suggestedResolution: { type: 'string' }
  },
  required: ['title', 'anomalyType', 'description', 'severity']
};

const PolicySchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    policyType: { type: 'string', enum: ['SECURITY', 'COMPLIANCE', 'OPERATIONAL', 'DATA_GOVERNANCE', 'ACCESS_CONTROL'] },
    applicability: { type: 'string', description: 'Who/what this policy applies to' },
    enforcementLevel: { type: 'string', enum: ['MANDATORY', 'RECOMMENDED', 'OPTIONAL'] },
    effectiveDate: { type: 'string' },
    expiryDate: { type: 'string' },
    owner: { type: 'string' },
    relatedRules: { type: 'array', items: { type: 'string' } }
  },
  required: ['name', 'description', 'policyType']
};

const RequirementSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    reqType: { type: 'string', enum: ['FUNCTIONAL', 'NON_FUNCTIONAL', 'CONSTRAINT', 'INTERFACE'] },
    priority: { type: 'string', enum: ['MUST', 'SHOULD', 'COULD', 'WONT'] },
    linkedEntities: { type: 'array', items: { type: 'string' } },
    linkedRules: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'description', 'reqType']
};

// Schema registry
const EXTRACTION_SCHEMAS = {
  entity: EntitySchema,
  relationship: RelationshipSchema,
  business_rule: BusinessRuleSchema,
  workflow: WorkflowSchema,
  calculation: CalculationSchema,
  concept: ConceptSchema,
  anomaly: AnomalySchema,
  policy: PolicySchema,
  requirement: RequirementSchema
};

function getSchema(type) {
  return EXTRACTION_SCHEMAS[type] || null;
}

function getSchemaTypes() {
  return Object.keys(EXTRACTION_SCHEMAS);
}

module.exports = {
  EntitySchema, RelationshipSchema, BusinessRuleSchema,
  WorkflowSchema, CalculationSchema, ConceptSchema,
  AnomalySchema, PolicySchema, RequirementSchema,
  EXTRACTION_SCHEMAS, getSchema, getSchemaTypes
};
