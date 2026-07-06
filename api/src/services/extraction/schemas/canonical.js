'use strict';

// ── Canonical Entity Types (13) ───────────────────────────────────────────────
const ENTITY_TYPES = [
  'PERSON', 'ORGANIZATION', 'ACTOR', 'DOCUMENT', 'DOCUMENTREF',
  'POLICY', 'SYSTEM', 'TECHNOLOGY', 'CONCEPT', 'PROCESS',
  'EVENT', 'LOCATION', 'WORK_ITEM',
];

const ENTITY_TYPE_DESCRIPTIONS = {
  PERSON:       'Individual mentioned by name or role (Secretary-General, Director, etc.)',
  ORGANIZATION: 'UN bodies, departments, external organizations, committees',
  ACTOR:        'Collective actor not a formal org (member states, civil society groups)',
  DOCUMENT:     'A specific identified document (resolution, bulletin, report with symbol)',
  DOCUMENTREF:  'A reference to a document not yet identified by symbol',
  POLICY:       'A policy, rule, mandate, or regulatory instrument',
  SYSTEM:       'An IT system, database, or information platform',
  TECHNOLOGY:   'A technology, framework, tool, or methodology',
  CONCEPT:      'An abstract concept, principle, term, or idea',
  PROCESS:      'A business process, procedure, or workflow',
  EVENT:        'A meeting, session, conference, or time-bound event',
  LOCATION:     'A geographic place, headquarters, duty station, or country',
  WORK_ITEM:    'A service request, ticket, case, action item, or task',
};

// ── Canonical Relation Types (18) ─────────────────────────────────────────────
const RELATION_TYPES = [
  'GOVERNS', 'MANDATES', 'IMPLEMENTS', 'OVERSEES', 'ESTABLISHED_BY',
  'ESTABLISHES', 'DEFINES', 'REQUIRES', 'REPORTS_TO', 'PART_OF',
  'AUTHORED_BY', 'CHAIRED_BY', 'FUNDED_BY', 'REFERENCES', 'SUPPORTS',
  'COOPERATES_WITH', 'MENTIONS', 'RELATED_TO',
];

// Semantic strength weights for graph traversal cost = -log(strength × confidence)
const RELATION_WEIGHTS = {
  GOVERNS:        1.00,
  MANDATES:       0.95,
  OVERSEES:       0.90,
  ESTABLISHED_BY: 0.90,
  ESTABLISHES:    0.90,
  IMPLEMENTS:     0.85,
  DEFINES:        0.85,
  REQUIRES:       0.80,
  REPORTS_TO:     0.80,
  PART_OF:        0.75,
  AUTHORED_BY:    0.75,
  CHAIRED_BY:     0.75,
  FUNDED_BY:      0.70,
  REFERENCES:     0.60,
  SUPPORTS:       0.55,
  COOPERATES_WITH:0.50,
  MENTIONS:       0.30,
  RELATED_TO:     0.20,
};

// ── Epistemic Layers ──────────────────────────────────────────────────────────
const EPISTEMIC_LAYERS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];

const EPISTEMIC_LAYER_DESCRIPTIONS = {
  L0: 'Constitutional — UN Charter, foundational instruments',
  L1: 'Structural — ST/SGB bulletins, organisational rules',
  L2: 'Operational — ST/AI administrative instructions',
  L3: 'Informational — manuals, guidelines, handbooks',
  L4: 'Empirical — audit reports, evaluations, assessments',
  L5: 'Strategic — SG reports, strategic plans, policy frameworks',
};

// ── Claude tool_use schema (guaranteed structured output) ─────────────────────
// Claude forces tool execution → 0% parse errors, no retry loops.
// Constraints: max 24 optional params, max 16 anyOf union types.
const EXTRACTION_TOOL = {
  name: 'extract_knowledge',
  description: 'Extract all entities and relations from a UN document into a structured knowledge graph.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'One-paragraph summary of the document',
      },
      keyProvisions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 10 key provisions, mandates, or findings',
      },
      entities: {
        type: 'array',
        description: 'All entities found in the document',
        items: {
          type: 'object',
          properties: {
            name:           { type: 'string', description: 'Exact name as it appears (or canonical form)' },
            type:           { type: 'string', enum: ENTITY_TYPES },
            epistemicLayer: { type: 'string', enum: EPISTEMIC_LAYERS, description: 'Governance layer (optional)' },
            confidence:     { type: 'number', description: '0.0–1.0 extraction confidence' },
            evidence:       { type: 'string', description: 'Short quote from text that supports this entity' },
          },
          required: ['name', 'type', 'confidence'],
        },
      },
      relations: {
        type: 'array',
        description: 'All relations between entities found in the document',
        items: {
          type: 'object',
          properties: {
            sourceEntity: { type: 'string', description: 'Name of the source entity (must match an extracted entity)' },
            targetEntity: { type: 'string', description: 'Name of the target entity (must match an extracted entity)' },
            type:         { type: 'string', enum: RELATION_TYPES },
            confidence:   { type: 'number', description: '0.0–1.0 extraction confidence' },
            evidence:     { type: 'string', description: 'Short quote from text that supports this relation' },
          },
          required: ['sourceEntity', 'targetEntity', 'type', 'confidence'],
        },
      },
    },
    required: ['entities', 'relations'],
  },
};

// ── System prompt ─────────────────────────────────────────────────────────────
const EXTRACTION_SYSTEM_PROMPT = `You are an expert UN document analyst extracting structured knowledge for a knowledge graph.

## Entity Types (13 canonical)
${ENTITY_TYPES.map(t => `- **${t}**: ${ENTITY_TYPE_DESCRIPTIONS[t]}`).join('\n')}

## Relation Types (18 canonical)
${RELATION_TYPES.map(r => `- **${r}**`).join(', ')}

## Epistemic Layers
${EPISTEMIC_LAYERS.map(l => `- **${l}**: ${EPISTEMIC_LAYER_DESCRIPTIONS[l]}`).join('\n')}

## Extraction Rules
1. Extract ALL entities and relations explicitly mentioned in the document
2. Use canonical entity names (full name, not abbreviations — except when abbreviation is the entity's primary name)
3. Assign confidence 0.0–1.0 based on how explicitly the entity/relation is stated
4. For relations, use the most specific type available (avoid RELATED_TO when a specific type fits)
5. Filter out relations with confidence < 0.25
6. Entities marked [[ENT:id:type:name]] are already known — use their canonical names
7. Epistemic layer is optional but valuable for governance documents`;

module.exports = {
  ENTITY_TYPES,
  ENTITY_TYPE_DESCRIPTIONS,
  RELATION_TYPES,
  RELATION_WEIGHTS,
  EPISTEMIC_LAYERS,
  EPISTEMIC_LAYER_DESCRIPTIONS,
  EXTRACTION_TOOL,
  EXTRACTION_SYSTEM_PROMPT,
};
