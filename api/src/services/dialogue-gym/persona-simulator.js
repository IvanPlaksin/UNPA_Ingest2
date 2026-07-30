'use strict';

/**
 * PersonaSimulator — the "user" side of the arena.
 *
 * An LLM (Haiku by default: fast + cheap) role-plays a Persona interacting with
 * the target chat agent. It generates the next user utterance from the running
 * conversation, and emits a control signal (continue / goal_achieved / gave_up /
 * confused) plus its self-tracked remaining patience.
 *
 * CRITICAL — the simulator must be *as limited as its persona*. If
 * domainKnowledge is "none" or "symptom_only", it must NOT guess service names
 * or form codes: eliciting the need from a vague user is exactly what the target
 * agent is being tested on (τ-bench benevolence-bias lesson). The system prompt
 * enforces this, and cooperativeness drives withholding / adversarial behaviour.
 *
 * @module services/dialogue-gym/persona-simulator
 */

const SIGNALS = ['continue', 'goal_achieved', 'gave_up', 'confused'];

const SIMULATOR_SCHEMA = {
  type: 'object',
  description: 'The simulated user\'s next move in the dialogue.',
  properties: {
    reasoning: { type: 'string', description: 'Brief internal thought (English) about what to say next and why.' },
    userMessage: { type: 'string', description: 'The actual message sent to the chatbot, written in the persona\'s language. When picking an offered choice, use that choice\'s text here.' },
    choiceIndex: { type: 'number', description: 'If the assistant offered a numbered list of choices and one matches your goal, set this to that choice\'s number (1-based). Set 0 (or omit) when no choices were offered or none fit.' },
    signal: { type: 'string', enum: SIGNALS, description: 'goal_achieved when the agent has clearly resolved the need; gave_up when patience is exhausted; confused when lost but still trying; otherwise continue.' },
    currentPatience: { type: 'number', description: 'Your remaining patience, 0..10.' },
  },
  // Only `signal` is required — when the persona picks an offered choice it may
  // return just choiceIndex, so userMessage must be optional (the arena uses the
  // chosen option's label as the message). Requiring it caused hard failures.
  required: ['signal'],
};

const KNOWLEDGE_RULES = {
  none: 'You do NOT know any service names, form codes, or internal procedures. You describe your need in everyday words only. Never invent or guess a service name.',
  symptom_only: 'You only know the SYMPTOM of your problem, not which service solves it. You describe what is wrong, never the solution or a service name.',
  partial: 'You have a rough idea of the area (e.g. "something in HR") but not the exact service or form. You may use approximate terms, sometimes wrong ones.',
  expert: 'You know exact service names and form codes and you use correct terminology.',
};

const COOP_RULES = {
  cooperative: 'You answer every question fully and honestly, volunteering relevant detail.',
  neutral: 'You answer exactly the question asked — no more, no less.',
  withholding: 'You reveal information only when asked for it directly, one piece at a time. Do not volunteer details.',
  adversarial: 'You are irritated. You sometimes rephrase your need with different or wrong terms, occasionally misunderstand the agent, and you show impatience.',
};

const VERBOSITY_RULES = {
  terse: 'Write very short, telegraphic messages — a few words, incomplete sentences are fine.',
  normal: 'Write normal, complete sentences.',
  verbose: 'Write longer messages with extra context and background.',
};

const LANG_NAME = { en: 'English', fr: 'French', es: 'Spanish', ar: 'Arabic', zh: 'Chinese', ru: 'Russian' };

function buildSystemPrompt(persona, scenario) {
  const lang = LANG_NAME[persona.language] || 'English';
  return [
    'You are simulating a real UN staff member using an internal IT/HR service-desk chatbot.',
    'You are the USER, not the assistant. Stay fully in character.',
    '',
    '## Your character',
    `Name: ${persona.name}`,
    `Background: ${persona.description || '(none)'}`,
    `Domain knowledge: ${persona.domainKnowledge} — ${KNOWLEDGE_RULES[persona.domainKnowledge] || ''}`,
    `Cooperativeness: ${persona.cooperativeness} — ${COOP_RULES[persona.cooperativeness] || ''}`,
    `Communication style: ${persona.verbosity} — ${VERBOSITY_RULES[persona.verbosity] || ''}`,
    `Patience: ${persona.patience}/10 (decrease it by ~1 each time the agent is unhelpful, repeats itself, or asks something you already answered; at 0 you give up).`,
    `Language: write your messages in ${lang}.`,
    persona.persona ? `\n## How you talk\n${persona.persona}` : '',
    '',
    '## Your goal (do NOT state it verbatim — reveal it the way your character would)',
    scenario.userGoal,
    '',
    '## Rules',
    '1. Never break character or mention that you are an AI or a simulation.',
    '2. Your knowledge is strictly limited to what your character would know (see Domain knowledge).',
    '3. Be realistic: real users are imprecise, make typos, give partial answers, sometimes go off-topic.',
    '4. Emit signal="goal_achieved" ONLY when the agent has genuinely resolved your need (identified the right service AND gathered what it needs, or answered your question).',
    '5. Emit signal="gave_up" when your patience hits 0 or you are too frustrated to continue.',
    '6. Emit signal="confused" when you do not understand what the agent wants but you have not given up.',
    '7. Otherwise signal="continue".',
    '',
    'Respond ONLY via the structured tool with fields: reasoning, userMessage, signal, currentPatience.',
  ].filter((l) => l !== undefined).join('\n');
}

function renderHistory(history) {
  if (!history || !history.length) return '(no messages yet — you are about to send the first one)';
  return history.map((m) => `${m.role === 'user' ? 'YOU (user)' : 'AGENT'}: ${m.content}`).join('\n');
}

/** Render the agent's offered choices as a numbered list the persona can pick from. */
function renderChoices(options) {
  if (!options || !options.length) return '';
  const lines = options.map((o, i) => `  ${i + 1}. ${o.label}${o.description ? ` (${o.description})` : ''}`).join('\n');
  return [
    '',
    '## The assistant is offering you these choices',
    lines,
    'If one of these matches what you need, set choiceIndex to its number and put its text in userMessage.',
    'If none fit (e.g. the right service is not listed), set choiceIndex=0 and say so in your own words.',
  ].join('\n');
}

function defaultLlm() {
  const { getLLMProvider } = require('../ai/llm-provider');
  return getLLMProvider({
    provider: process.env.FLOWDESK_LLM_PROVIDER || process.env.LLM_PROVIDER || 'claude-code',
    // Persona simulation is cheap/fast work — Haiku by default, overridable.
    model: process.env.DIALOGUE_GYM_PERSONA_MODEL || 'claude-haiku-4-5-20251001',
  });
}

function tokensOf(res) {
  const input = res.inputTokens ?? res.input_tokens ?? res.promptTokens ?? 0;
  const output = res.outputTokens ?? res.output_tokens ?? res.completionTokens ?? 0;
  const costUsd = res.costUsd ?? res.cost ?? 0;
  return { input, output, costUsd };
}

/**
 * Generate the persona's next user message.
 * @param {object} persona   DialogueGymPersona
 * @param {object} scenario  DialogueGymScenario
 * @param {Array<{role,content}>} history  conversation so far
 * @param {object} [opts]    { debug, llm, choices }  choices = [{value,label,description}] offered by the agent
 * @returns {Promise<{userMessage, signal, reasoning, patience, choiceIndex, tokens, latencyMs}>}
 */
async function generateNextMessage(persona, scenario, history, opts = {}) {
  const llm = opts.llm || defaultLlm();
  const choices = Array.isArray(opts.choices) ? opts.choices : [];
  const prompt = [
    buildSystemPrompt(persona, scenario),
    '',
    '## Conversation so far',
    renderHistory(history),
    renderChoices(choices),
    '',
    'Produce your next message now.',
  ].join('\n');

  const t0 = Date.now();
  const res = await llm.structuredOutput(prompt, SIMULATOR_SCHEMA, { temperature: 0.7, maxTokens: 700 });
  const latencyMs = Date.now() - t0;
  const data = res.data || {};
  const signal = SIGNALS.includes(data.signal) ? data.signal : 'continue';
  let choiceIndex = typeof data.choiceIndex === 'number' ? Math.round(data.choiceIndex) : 0;
  if (!(choiceIndex >= 1 && choiceIndex <= choices.length)) choiceIndex = 0; // guard hallucinated picks
  return {
    userMessage: String(data.userMessage || '').trim(),
    signal,
    reasoning: opts.debug ? (data.reasoning || null) : null,
    patience: typeof data.currentPatience === 'number' ? data.currentPatience : null,
    choiceIndex,
    tokens: tokensOf(res),
    latencyMs,
  };
}

/**
 * Produce the opening user message. By default it uses the scenario's scripted
 * initialMessage (deterministic, free) so every run starts from the same seed;
 * pass opts.vary=true to have the simulator phrase it in the persona's voice.
 * @returns {Promise<{userMessage, signal:'continue', reasoning:null, tokens, latencyMs}>}
 */
async function generateInitialMessage(persona, scenario, opts = {}) {
  if (!opts.vary) {
    return { userMessage: scenario.initialMessage, signal: 'continue', reasoning: null, tokens: { input: 0, output: 0, costUsd: 0 }, latencyMs: 0 };
  }
  const first = await generateNextMessage(persona, scenario, [], opts);
  return { ...first, signal: 'continue' };
}

module.exports = {
  generateNextMessage,
  generateInitialMessage,
  buildSystemPrompt,
  SIMULATOR_SCHEMA,
  SIGNALS,
};
