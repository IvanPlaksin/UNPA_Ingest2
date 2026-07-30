'use strict';

/**
 * Shared vocabulary of the EVOLUTIO:PROMPT ontology (Suada Phase 1).
 *
 * Kept in one module because the schema, the validator, the compiler and the
 * migration all have to agree on these lists; three copies would drift, and the
 * defect this whole ontology replaces was exactly a list that drifted from the
 * code that read it (TASK-FLOWDESK-BUG-001).
 *
 * @module services/evolutio/evolutio-prompt.constants
 */

/** Version of the ontology schema. Recorded in every compiled manifest. */
const SCHEMA_VERSION = '1.0.0';

/** Namespace of prompt graphs in the platform graph-catalog. */
const NAMESPACE = 'EVOLUTIO:PROMPT';

/** Namespace of the versioned schema artifact itself. */
const SCHEMA_NAMESPACE = 'EVOLUTIO:PROMPT_SCHEMA';

const NODE_TYPES = ['Thesis', 'Narrative', 'Constraint', 'Exemplar', 'Persona', 'ToolContract'];
const EDGE_TYPES = ['REFINES', 'DEPENDS_ON', 'CONFLICTS_WITH', 'ILLUSTRATES', 'APPLIES_WHEN'];
const STATUSES = ['CANDIDATE', 'ACTIVE', 'DEPRECATED'];

/**
 * Engine LLM calls that generate PROSE, and therefore the only ones a prompt rule
 * may be scoped to (FLOWDESK-PROMPT-001). MUST stay in step with PROMPT_NODES in
 * instances/flowdesk/services/prompt-graph-compiler — a name here that the engine
 * does not read is a rule the operator writes and the system ignores.
 */
const ENGINE_NODES = ['router', 'info_answer', 'question_planner', 'field_help'];

/** Thesis categories, in prompt emission order. Carried over so migration is lossless. */
const CATEGORY_ORDER = [
  'identity', 'domain', 'routing', 'dialogue', 'tone', 'safety', 'deflection', 'formatting', 'custom',
];

const CATEGORY_HEADINGS = {
  identity: 'Identity & role',
  domain: 'Domain & scope',
  routing: 'Intent routing',
  dialogue: 'Dialogue conduct',
  tone: 'Tone & style',
  safety: 'Safety & boundaries',
  deflection: 'Out-of-scope handling',
  formatting: 'Answer formatting',
  custom: 'Additional guidance',
};

/**
 * Compilation bands, in emission order. Blocking constraints appear twice — see
 * SUADA-COMPILE-001: attention degrades in the middle of a long context, and the
 * instructions that must not be missed are exactly the ones that must not sit
 * there. This costs tokens and is a MEASURABLE choice: if an arena comparison
 * shows no behavioural difference, drop the repeat.
 */
const BANDS = [
  'narrative',
  'constraint_blocking',
  'persona',
  'thesis',
  'tool_contract',
  'exemplar',
  'constraint_blocking_repeat',
];

const LANGUAGES = ['en', 'fr', 'es', 'ar', 'zh', 'ru'];

module.exports = {
  SCHEMA_VERSION, NAMESPACE, SCHEMA_NAMESPACE,
  NODE_TYPES, EDGE_TYPES, STATUSES, ENGINE_NODES,
  CATEGORY_ORDER, CATEGORY_HEADINGS, BANDS, LANGUAGES,
};
