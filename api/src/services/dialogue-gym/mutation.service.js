'use strict';

/**
 * MutationService (ШАGA 7A) — proposes and applies prompt-graph mutations for the
 * GEPA loop.
 *
 * APPLY reuses the editor's deterministic applier `prompt-editor.applyMutations`
 * (ops: {op:'add',node} | {op:'update',key,patch} | {op:'remove',key}) so a
 * GEPA-mutated graph is byte-identical to one a human would produce in the editor.
 *
 * SUGGEST is reflective (GEPA core): an LLM reads the failure signal (judge
 * verdicts + notes + intent/ground-truth mismatches) and the current rules, then
 * proposes targeted ops with rationale — NOT a scalar reward, a textual diagnosis.
 *
 * @module services/dialogue-gym/mutation.service
 */

const MUTATION_OPS = ['add', 'update', 'remove'];

const MUTATION_SCHEMA = {
  type: 'object',
  description: 'Targeted edits to the chat system-prompt rules graph to fix observed failures.',
  properties: {
    reasoning: { type: 'string', description: 'Brief diagnosis of the dominant failure modes (English).' },
    mutations: {
      type: 'array',
      description: 'Ordered graph ops. Keep it small and targeted (1–5).',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          op: { type: 'string', enum: MUTATION_OPS },
          rationale: { type: 'string', description: 'Why this change (cite the failure it addresses).' },
          key: { type: 'string', description: 'Rule key (for update/remove).' },
          patch: { type: 'object', additionalProperties: true, description: 'Fields to change (for update): text, priority, appliesTo, enabled.' },
          node: {
            type: 'object', additionalProperties: true,
            description: 'New rule (for add).',
            properties: {
              key: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' },
              category: { type: 'string' }, appliesTo: { type: 'array', items: { type: 'string' } },
              priority: { type: 'number' }, enabled: { type: 'boolean' },
            },
          },
        },
        required: ['op'],
      },
    },
  },
  required: ['mutations'],
};

/** Apply ops to a graph (delegates to the editor's applier). */
function applyMutations(graph, ops) {
  return require('../../instances/flowdesk/services/prompt-editor.service').applyMutations(graph, ops);
}

/** A compact rule list for the reflection prompt. */
function summarizeRules(graph) {
  return ((graph && graph.nodes) || [])
    .filter((n) => n.data && n.data.kind !== 'section')
    .map((n) => `- key=${n.data.key} [${n.data.category}] applies=${(n.data.appliesTo || ['all']).join(',')} prio=${n.data.priority ?? 100}${n.data.enabled === false ? ' (disabled)' : ''}: ${n.data.text}`)
    .join('\n');
}

/** A compact failure summary for the reflection prompt. */
function summarizeEvaluations(evaluations) {
  return (evaluations || []).map((e, i) => [
    `#${i + 1} scenario="${e.scenarioName || e.scenarioId}" goal="${e.userGoal || ''}"`,
    `   expected=${e.expectedServiceCode || 'none'} identified=${e.identifiedServiceCode || 'none'} intentAccuracy=${e.intentAccuracy || '?'} verdict=${e.overallVerdict || '?'} (${e.overallScore != null ? e.overallScore.toFixed(2) : '?'})`,
    e.summaryNotes ? `   judge: ${e.summaryNotes}` : '',
    Array.isArray(e.problems) && e.problems.length ? `   problems: ${e.problems.map((p) => p.description || p).join(' | ')}` : '',
  ].filter(Boolean).join('\n')).join('\n');
}

function defaultLlm() {
  const { getLLMProvider } = require('../ai/llm-provider');
  return getLLMProvider({
    provider: process.env.FLOWDESK_LLM_PROVIDER || process.env.LLM_PROVIDER || 'claude-code',
    model: process.env.DIALOGUE_GYM_OPTIMIZER_MODEL || process.env.FLOWDESK_ADMIN_ANALYSIS_MODEL || 'claude-sonnet-4-6',
  });
}

const REFLECTION_INTRO = [
  'You optimize a chat system prompt for a UN IT/HR service-desk assistant.',
  'The prompt is a GRAPH of rules. Each rule: key, title, text, category',
  '(identity|domain|routing|dialogue|tone|safety|deflection|formatting|custom),',
  'appliesTo (subset of router|info_answer|question_planner|slot_extract|field_help|my_requests; [] or ["all"]=all),',
  'priority (1-100, lower emitted earlier within a category), enabled.',
  '',
  'You are given the current rules and a batch of evaluated dialogues (judge',
  'verdicts + notes + intent/ground-truth results). Propose a SMALL set of targeted',
  'graph edits (add/update/remove) to fix the dominant failure modes. Common levers:',
  'router misclassification (e.g. "how do I…" → INFO_QUESTION instead of NEW_INTENT),',
  'weak disambiguation, tone drift, hallucinated/unavailable services.',
  '',
  'For op="update" give key + patch (e.g. {"text":"…"}). For op="add" give a full',
  'node {key,title,text,category,appliesTo,priority}. For op="remove" give key.',
  'Prefer editing existing rules over adding new ones. Return via the structured tool only.',
].join('\n');

function createMutationService(deps = {}) {
  const getLlm = deps.llm ? () => deps.llm : defaultLlm;

  /**
   * Reflect on evaluated runs and propose graph mutations.
   * @param {object} p { graph:{nodes,edges}, evaluations:[{scenarioName,userGoal,expectedServiceCode,identifiedServiceCode,intentAccuracy,overallVerdict,overallScore,summaryNotes,problems}] }
   * @returns {Promise<{ reasoning, mutations:Array<{op,key?,patch?,node?,rationale?}>, tokens, costUsd }>}
   */
  async function suggestMutations(p = {}) {
    const graph = p.graph || { nodes: [], edges: [] };
    const prompt = [
      REFLECTION_INTRO,
      '',
      '## Current rules',
      summarizeRules(graph) || '(none)',
      '',
      '## Evaluated dialogues (failures & scores)',
      summarizeEvaluations(p.evaluations) || '(none)',
      '',
      'Propose the mutations now.',
    ].join('\n');

    // TASK-GEPA-ROBUST-001. Reflection is the one creative step in the loop, and
    // a creative step is allowed to come back empty — it is NOT allowed to end an
    // optimization that has already spent minutes of arena time and real tokens
    // producing a measured baseline. EXP-001 died exactly here: one Haiku reply
    // missing `mutations` aborted the whole run after the baseline was in hand.
    //
    // maxTokens 3000 (was 1500): one-to-five ops with rationales plus the
    // reasoning field fit into 1500 only barely, and a truncated reply is
    // indistinguishable from a schema violation — which is the symptom observed.
    let res = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        res = await getLlm().structuredOutput(prompt, MUTATION_SCHEMA, { temperature: 0.4, maxTokens: 3000 });
        break;
      } catch (err) {
        lastError = err;
        // The call is non-deterministic, so the same prompt often succeeds on a
        // second pass. One retry only: more would just spend tokens on a model
        // that is reliably failing this schema.
        if (attempt === 2) {
          return {
            reasoning: null,
            mutations: [],
            tokens: 0,
            costUsd: 0,
            model: null,
            error: String((lastError && lastError.message) || lastError),
          };
        }
      }
    }

    const data = (res && res.data) || {};
    // keep only well-formed ops
    const mutations = (Array.isArray(data.mutations) ? data.mutations : []).filter((m) => m && MUTATION_OPS.includes(m.op)
      && (m.op === 'add' ? m.node && m.node.text : m.key));
    return {
      reasoning: data.reasoning || null,
      mutations,
      tokens: (res.inputTokens || 0) + (res.outputTokens || 0),
      costUsd: res.costUsd || 0,
      model: res.model || null,
    };
  }

  return { suggestMutations, applyMutations, MUTATION_OPS, MUTATION_SCHEMA, summarizeRules, summarizeEvaluations };
}

const singleton = createMutationService();
module.exports = singleton;
module.exports.createMutationService = createMutationService;
module.exports.applyMutations = applyMutations;
module.exports.MUTATION_OPS = MUTATION_OPS;
module.exports.MUTATION_SCHEMA = MUTATION_SCHEMA;
