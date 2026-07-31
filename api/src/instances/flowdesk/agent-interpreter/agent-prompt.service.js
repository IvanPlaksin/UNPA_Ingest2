'use strict';

/**
 * Agent system prompt (EXP-002) — compiled from the EVOLUTIO:PROMPT graph.
 *
 * This is where Phase 1 finally has a consumer. The graph compiles to the same
 * text the state machine's prompt would produce (parity was ratified), and this
 * module adds the two things an agent needs and a state machine does not: how to
 * use its tools, and the standing rules about not claiming what it has not done.
 *
 * CACHE KEY IS (graph version, language). Caching on version alone would pin the
 * first language a process happened to serve onto every later session — the
 * langInstruction is baked into the compiled text, so one key per language is
 * not an optimisation detail but a correctness requirement.
 *
 * @module instances/flowdesk/agent-interpreter/agent-prompt.service
 */

const crypto = require('crypto');
const { langInstruction } = require('../interpreter/templates/ui-strings');

const CACHE_MS = 30 * 1000;

/**
 * TWO HASHES, AND THEY ARE NOT INTERCHANGEABLE (P-3).
 *
 * The graph is only PART of this prompt: the compiled rules are followed by
 * AGENT_CONTRACT (written in this file), padded to the cache floor, then given a
 * language tail. So the compiler's `manifest.textHash` — a hash of the rules alone
 * — can never equal a hash of what the model was sent.
 *
 * Both are recorded on the turn, for two different questions:
 *   promptGraphTextHash  did the RULES change?  ← comparable to a rebuilt version
 *   promptTextHash       what did the model see? ← reproducibility, nothing else
 *
 * Conflating them is not academic. The editor is meant to warn "the rebuilt rules
 * differ from what ran"; compared against the final text that warning would fire on
 * every turn ever recorded, and an alarm that is always on is not an alarm.
 */
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

/**
 * Prompt-cache floor.
 *
 * Anthropic will not cache a prefix below a minimum length, and on
 * claude-haiku-4-5 that minimum is NOT the documented one. Measured against the
 * live API, twice: 4,009 not cached, 4,300 not cached, 4,518 cached. So the
 * target is set at 4,800 — comfortably past the highest length observed to fail,
 * because landing under it caches nothing at all while overshooting costs a few
 * hundred tokens read at a tenth of the price.
 *
 * (A first attempt aimed at 4,300, reasoning from a documented 4,096 floor. The
 * markers were placed correctly, the request was well formed, and the API simply
 * returned cache_creation 0 on every call — the failure is silent, which is why
 * the number here is measured rather than derived.)
 *
 * So the prefix is padded up to that target with inert filler. That reads like
 * gaming the meter, and it is worth saying why it is not: a cache READ costs a
 * tenth of an ordinary input token, and this prefix is identical for every user,
 * every language and every session — the write amortises across all traffic in
 * the cache window while every call after it reads at 10%. Buying ~1,200 tokens
 * of ballast pays for itself on the second call.
 *
 * Two properties are load-bearing:
 *   - DETERMINISTIC. The same bytes every time, in every process. Anything that
 *     varies — a timestamp, a counter, a random seed — changes the prefix, and a
 *     prefix that changes is never hit at all: worse than not padding.
 *   - INERT AND ANNOUNCED. The model reads this. It is fenced and labelled as
 *     meaningless so it cannot be mistaken for an instruction or an example.
 *
 * FLOWDESK_PROMPT_CACHE_PAD=0 switches it off; FLOWDESK_PROMPT_CACHE_FLOOR tunes
 * the target (in tokens) if a model with a different floor is adopted.
 */
const CACHE_FLOOR_TOKENS = Number(process.env.FLOWDESK_PROMPT_CACHE_FLOOR || 4800);
const PADDING_ENABLED = String(process.env.FLOWDESK_PROMPT_CACHE_PAD ?? '1') !== '0';

// Chars-per-token, measured against the real tokenizer on this prompt: prose ran
// 4.31, tool JSON 2.29. Rounded so the estimate UNDER-counts existing tokens and
// we pad a little too much — landing a few tokens short of the floor caches
// nothing at all, so the asymmetry matters.
const CHARS_PER_TOKEN_PROSE = 4.3;
const CHARS_PER_TOKEN_JSON = 2.29;
// The filler tokenizes slightly denser than English prose (measured 4.13).
const CHARS_PER_TOKEN_PAD = 4.1;

const PAD_NOTICE = [
  '',
  '## Padding — ignore',
  '',
  'Everything below this line is meaningless filler. It carries no instruction, no',
  'data and no example, and exists only so this prompt reaches the provider\'s',
  'minimum cacheable length. Do not read it, refer to it, or let it influence any',
  'answer. As far as you are concerned the prompt ends here.',
  '',
].join('\n');

// One fixed sentence, repeated: inert, plainly not English instruction, and — the
// point — byte-identical on every build.
const PAD_UNIT = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';

/**
 * Pad the cacheable prefix up to the floor. Returns it untouched when it is
 * already long enough, or when padding is switched off.
 */
/**
 * The prefix's size in tokens, by the SAME arithmetic the padder uses.
 *
 * Kept as one function because the alternative was tried and failed immediately: the
 * report recounted the padded text with the prose divisor while the padding had been
 * sized with the filler's own denser one, and the preview announced that a perfectly
 * healthy prompt would not be cached — 4,745 against a floor of 4,800. Two numbers
 * meaning one thing will always drift; this project has now proved it twice.
 */
function estimatePrefixTokens(prefix, toolSchemas) {
  const toolChars = toolSchemas && toolSchemas.length ? JSON.stringify(toolSchemas).length : 0;
  return Math.floor(String(prefix || '').length / CHARS_PER_TOKEN_PROSE)
    + Math.floor(toolChars / CHARS_PER_TOKEN_JSON);
}

function padToCacheFloor(prefix, toolSchemas) {
  if (!PADDING_ENABLED) return prefix;
  const estimated = estimatePrefixTokens(prefix, toolSchemas);
  const shortfall = CACHE_FLOOR_TOKENS - estimated;
  if (shortfall <= 0) return prefix;

  const repeats = Math.ceil((shortfall * CHARS_PER_TOKEN_PAD) / PAD_UNIT.length);
  return `${prefix}\n${PAD_NOTICE}${PAD_UNIT.repeat(repeats)}`;
}

/**
 * Rules that must hold regardless of what the prompt graph says. They are not in
 * the graph because they are properties of THIS runtime — the tools it has and
 * the promises it can keep — rather than of the service desk's dialogue policy.
 * Each one corresponds to a failure the arena recorded in the state machine.
 */
const AGENT_CONTRACT = [
  '## How you work',
  '',
  'You have tools. Use them; never describe an action you have not performed.',
  '',
  '- Before naming a service, call catalog_search; never name one it did not return.',
  '- If nothing fits, say so and say what you CAN do. Do not re-offer rejected options — ask what distinguishes their need, or widen the search.',
  '- Never say you are escalating unless escalation_create returned; then say REGISTERED, not that someone is on the line.',
  '- Never say a request was submitted unless draft_submit returned successfully.',
  '',
  '## Filling the form',
  '',
  'The form decides what is asked, not you. Every draft_create and draft_update',
  'returns `nextField` — the field due now — recomputed after each change.',
  '',
  '- FIRST record what the user just told you, THEN ask. An answer you do not record is one the user will be asked for twice.',
  '- To record the answer to the field you just asked, call draft_update with `value` alone; it lands on that field. Use `fields` only for something volunteered about a DIFFERENT field.',
  '- You do not choose which field to ask, and you never name one: emit_control with `target:"field"` asks whatever is due. Write the question about it in your own words, saying why it is needed.',
  '- A person or a duty station is picked from the directory, never typed. When the user names one, pass what they said as `searchHint` — the search opens pre-typed.',
  '- A field you were not shown must not be asked; conditions hide what does not apply, and the form fills some fields itself.',
  '- `required: false` means OFFERED. Say it is optional, accept "skip" at once, never raise it again.',
  '- A required field cannot be skipped or assumed. Say what it is for and ask again — or offer to park the request, or cancel it.',
  '- The lists change as answers arrive; read them again after every update.',
  '- Opening the form ENDS the conversation. That turn says what was handed over and stops — no question, no offer, nothing to reply to.',
  '',
  '## Always offer a control, never a menu in prose',
  '',
  'Whenever your reply asks the user to pick, confirm or supply anything, you MUST',
  'call emit_control in the SAME turn. Options written only as text cannot be',
  'clicked, and on the voice channel cannot be used at all.',
  '',
  '`target` says what the control is for, and it is the only choice you make:',
  '- `"field"` — the form field due now. You do not name it and you do not design it: the interface renders the right widget (date picker, people search, the form\'s own options). Any `type` you pass is ignored.',
  '- `"__service__"` — picking between services you found. Pass `type:"choice"` and one option per candidate.',
  '- `"__confirm__"` — a yes/no before acting. Pass `type:"confirm"`.',
  '',
  'Write the prose AND call the tool: the sentence explains, the control collects.',
  'A correct turn says',
  '  "Education Grant Claim(s) Queries is for claiming the grant; Education Grant',
  '   Queries answers policy questions. Which do you need?"',
  'and in the same turn calls',
  '  emit_control({target:"__service__", type:"choice", label:"Which service?",',
  '                options:[{value:"EO-...-EGC", label:"Education Grant Claim(s) Queries"},',
  '                         {value:"EO-...-EGQ", label:"Education Grant Queries"}]})',
  '',
  'You are writing to a person. Acknowledge what they said, explain what you did and why, and say what happens next.',
].join('\n');

function toolsSection(toolSchemas) {
  const lines = ['## Your tools', ''];
  for (const t of toolSchemas || []) lines.push(`- \`${t.name}\` — ${t.description}`);
  return lines.join('\n');
}

function createAgentPrompt(deps = {}) {
  const compile = deps.compile || require('../../../services/evolutio/evolutio-prompt.compiler').compile;
  const getGraph = deps.getGraph
    || (async (entryId, version) => require('../../../services/evolutio/evolutio-prompt.service').getGraph(entryId, version));
  const now = deps.now || (() => Date.now());

  const cache = new Map(); // `${entryId}@${version}:${lang}` -> {at, text}

  /**
   * @param {{entryId:string, version?:number, lang?:string, engineNode?:string, toolSchemas?:Array}} p
   * @returns {Promise<{text:string, manifest:object|null, cached:boolean}>}
   */
  async function build(p = {}) {
    const lang = p.lang || 'en';
    // EC-003: the compilation context is part of the cache key. Rules can now be
    // scoped to a phase, so two turns of the same session in different phases compile
    // to DIFFERENT prompts — caching them under one key would serve the wrong one and
    // nothing would report it. Absent context degrades to the old key.
    const ctx = p.context || null;
    const ctxKey = ctx ? `|${ctx.phase || '-'}|${(ctx.toolContext || []).join('+') || '-'}|${ctx.serviceCategory || '-'}|${ctx.channel || 'text'}` : '';
    const key = `${p.entryId || 'inline'}@${p.version ?? 'current'}:${lang}${ctxKey}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return { ...hit.value, cached: true };

    let graphText = '';
    let manifest = null;
    if (p.graph || p.entryId) {
      const loaded = p.graph ? { graph: p.graph, meta: {} } : await getGraph(p.entryId, p.version);
      if (loaded && loaded.graph) {
        // No engineNode: the agent is one conversational surface, not the state
        // machine's separate router/answerer/planner nodes, so it takes every rule.
        // The context decides which conditional rules apply (APPLIES_WHEN). Passing
        // only the language — as this did — meant every condition on a phase, route or
        // service evaluated FALSE, because `conditionHolds` treats a missing context
        // key as "does not hold". Adding a condition would have silently dropped the
        // rule from every prompt.
        const c = compile(loaded.graph, { language: lang, ...(ctx || {}) }, {
          graphEntryId: p.entryId || null,
          graphVersion: (loaded.meta && loaded.meta.versionNumber) ?? p.version ?? null,
          title: 'FlowDesk Assistant',
        });
        graphText = c.text;
        manifest = c.manifest;
      }
    }

    // Split at the point where the prompt stops being the same for everyone.
    //
    // `prefix` is identical across languages, users and sessions — it is what the
    // provider marks as the cacheable block. `tail` is the only part that varies
    // (the language instruction: 19 tokens against a 3,898-token prefix), so it
    // goes AFTER the marker. Cached together they would split one cache entry
    // into six, one per language, for nothing.
    //
    // The tools section is gone: every tool's name and description already reach
    // the model through the API's own `tools` field, and restating them in prose
    // sent the same 1,464 characters a second time on every model call.
    const realPrefix = [graphText, '', AGENT_CONTRACT]
      .filter((x) => x !== null && x !== undefined).join('\n').trim();
    // Padded up to the provider's minimum cacheable length — see padToCacheFloor.
    const prefix = padToCacheFloor(realPrefix, p.toolSchemas);
    const tail = String(langInstruction(lang) || '').trim();
    const text = tail ? `${prefix}\n\n${tail}` : prefix;

    // Hashed here rather than at the call site: `text` is assembled in this
    // function, and a caller that re-derived it would be hashing its own guess at
    // how the parts fit together.
    const value = { text, prefix, tail, manifest, textHash: sha256(text) };
    cache.set(key, { at: now(), value });
    return { ...value, cached: false };
  }

  const invalidate = () => cache.clear();

  return { build, invalidate, AGENT_CONTRACT, toolsSection };
}

/**
 * EC-006 — what the prompt is actually made of, for the compile preview.
 *
 * The operator edits the GRAPH, but what the provider caches is the whole prefix:
 * graph + AGENT_CONTRACT (written in this file) + padding. Showing only the graph's
 * size against the cache floor would light up red on a perfectly healthy prompt —
 * measured live, the graph core is 1,257 tokens against a floor of 4,800, and the
 * padding closes the gap on purpose.
 *
 * So all three numbers are reported, and the warnings are about the things that can
 * really go wrong:
 *   - the prefix falls under the floor only when padding is OFF, so warn only then;
 *   - the CONDITIONAL block is never cached and is billed on every single turn, which
 *     is the risk that actually grows as rules get scoped.
 *
 * @param {{graphText:string, conditionalText?:string, toolSchemas?:Array}} p
 */
function composition(p = {}) {
  const graphText = String(p.graphText || '');
  const conditionalText = String(p.conditionalText || '');
  const toolSchemas = p.toolSchemas || [];

  const asTokens = (text) => Math.floor(String(text || '').length / CHARS_PER_TOKEN_PROSE);
  const realPrefix = [graphText, '', AGENT_CONTRACT].filter(Boolean).join('\n').trim();

  const graphTokens = asTokens(graphText);
  const contractTokens = asTokens(AGENT_CONTRACT);
  // The padder's OWN arithmetic, not a recount of its output. Recounting was tried
  // and reported 4,745 against a floor of 4,800 on a healthy prompt — the filler is
  // sized with a denser chars-per-token than prose, so measuring it as prose loses
  // tokens that are really there.
  const beforePadding = estimatePrefixTokens(realPrefix, toolSchemas);
  const paddingTokens = PADDING_ENABLED ? Math.max(0, CACHE_FLOOR_TOKENS - beforePadding) : 0;
  const prefixTokens = beforePadding + paddingTokens;
  const conditionalTokens = asTokens(conditionalText);

  const warnings = [];
  if (!PADDING_ENABLED && prefixTokens < CACHE_FLOOR_TOKENS) {
    warnings.push({
      code: 'BELOW_CACHE_FLOOR',
      message: `The prefix is ${prefixTokens} tokens against a measured floor of ${CACHE_FLOOR_TOKENS}, `
        + 'and padding is disabled — nothing in this prompt will be cached.',
    });
  }
  // A quarter, not a third: this part is re-sent and re-billed on every turn, so the
  // warning should arrive before it is a habit.
  if (prefixTokens > 0 && conditionalTokens > prefixTokens * 0.25) {
    warnings.push({
      code: 'CONDITIONAL_TOO_LARGE',
      message: `Conditional rules are ${conditionalTokens} tokens, over a quarter of the cached prefix. `
        + 'They are not cached and are billed on every turn.',
    });
  }

  return {
    graphTokens, contractTokens, paddingTokens, prefixTokens, conditionalTokens,
    floor: CACHE_FLOOR_TOKENS,
    paddingEnabled: PADDING_ENABLED,
    cacheable: prefixTokens >= CACHE_FLOOR_TOKENS,
    warnings,
  };
}

module.exports = createAgentPrompt();
module.exports.composition = composition;
module.exports.createAgentPrompt = createAgentPrompt;
module.exports.AGENT_CONTRACT = AGENT_CONTRACT;
module.exports.toolsSection = toolsSection;
module.exports.padToCacheFloor = padToCacheFloor;
module.exports.CACHE_FLOOR_TOKENS = CACHE_FLOOR_TOKENS;
