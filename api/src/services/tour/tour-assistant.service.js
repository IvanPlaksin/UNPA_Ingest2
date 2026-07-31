'use strict';

/**
 * The tour assistant — a question asked mid-tour, answered from the tour's knowledge.
 *
 * GROUNDED, OR SILENT. The model is given retrieved passages and told to answer from
 * them; when nothing was retrieved it is not called at all. That is the whole safety
 * property: this assistant sits inside an admin tool and explains how to change a
 * production prompt, so an invented answer here is not an amusing hallucination, it is
 * an instruction someone follows.
 *
 * WHY THE CURRENT STEP IS PART OF THE QUESTION. "What does this do?" means different
 * things on different steps, and a retrieval that ignores where the user is standing
 * answers a question nobody asked.
 *
 * WHY IT IS NOT THE PROMPT-EDITOR ASSISTANT. That one is a Claude Code agent wired to
 * the rules store, able to MUTATE the graph. A visitor asking what a button does must
 * not reach a tool that can edit the system prompt. Different job, different blast
 * radius, different service.
 *
 * @module services/tour/tour-assistant.service
 */

const knowledge = require('./tour-knowledge.service');

const MODEL = process.env.TOUR_ASSISTANT_MODEL || 'claude-haiku-4-5';
const MAX_ANSWER_CHARS = 700;   // it may be spoken; see the narration limits
/**
 * Cosine floor below which a hit is not evidence.
 *
 * A vector store has no concept of "nothing here" — it always returns its top N. So
 * the floor was measured against this corpus rather than guessed:
 *
 *   on-topic   "find a rule by its text" 0.884 · "why give a reason" 0.870 ·
 *              "what does the scope tab show" 0.849 · "what does in force mean" 0.844
 *   off-topic  "kubernetes ingress" 0.788 · "bake sourdough bread" 0.783 ·
 *              "weather in geneva" 0.756
 *
 * The gap is 0.788–0.844, and 0.82 sits in the middle of it. Note how narrow the band
 * is: e5 embeddings compress cosine into a small range, so a plausible-looking 0.75
 * would have admitted every unrelated question ever asked.
 */
const RELEVANCE_FLOOR = Number(process.env.TOUR_RELEVANCE_FLOOR || 0.82);

let _llm = null;
function llm() {
  if (!_llm) {
    // The same provider the chat uses; the tour is an explainer, not an agent, so it
    // gets the cheap fast model and no tools at all.
    _llm = require('../ai/llm-provider').getLLMProvider({
      provider: process.env.TOUR_ASSISTANT_PROVIDER || 'anthropic-api',
      model: MODEL,
    });
  }
  return _llm;
}
function _setDeps(d) { if (d.llm) _llm = d.llm; if (d.knowledge) Object.assign(knowledge, d.knowledge); }

const SYSTEM = [
  'You explain a software interface to someone who is taking a guided tour of it.',
  '',
  'Answer ONLY from the passages provided. They are the tour\'s own content and the',
  'documentation attached to it. If they do not contain the answer, say plainly that',
  'this tour does not cover it and suggest what the person could look at instead —',
  'never fill the gap from general knowledge about software. This assistant runs',
  'inside an administration tool, and a confident invention here becomes an',
  'instruction somebody follows on a live system.',
  '',
  'Be short. Two or three sentences.',
  '',
  'THE ANSWER IS READ ALOUD. Write it as speech, not as a document:',
  '- no markdown of any kind — asterisks and hashes are read out as noise;',
  '- never cite a passage by number. "As passage two states" is meaningless to',
  '  someone listening; the sources are shown beside your answer already;',
  '- no bullet lists and no code, unless the person asked for code.',
  '',
  'If the answer is "go and look at X", say so directly — the tour can take them there.',
].join('\n');

/**
 * @param {{question:string, lang?:string, scenarioId?:string, step?:{id:string,text:string},
 *          hits?:Array}} p
 * @returns {Promise<{answer:string|null, grounded:boolean, hits:Array, reason?:string, model?:string}>}
 */
async function ask(p = {}) {
  const question = String(p.question || '').trim();
  if (!question) { const e = new Error('question is required'); e.status = 400; throw e; }
  const lang = p.lang || 'en';

  // The client may already have searched (it renders the hits); re-using its results
  // keeps the answer and the sources on screen consistent.
  const found = Array.isArray(p.hits) && p.hits.length
    ? p.hits
    : await knowledge.search(question, { lang, limit: 5, scenarioId: p.scenarioId });

  // A relevance floor, because a vector store always returns SOMETHING. Without it,
  // "how do I configure kubernetes ingress" retrieves the five least-unrelated tour
  // steps and the model is asked to answer from them — it declines correctly, but at
  // the cost of a model call and a paragraph of hedging. Below the floor the refusal
  // is deterministic and instant.
  const hits = found.filter((hit) => (hit.score == null || hit.score >= RELEVANCE_FLOOR));

  if (!hits.length) {
    // Not calling the model at all is the point: with nothing retrieved, anything it
    // said would be invention.
    return {
      answer: null, grounded: false, hits: [],
      reason: 'Nothing in this tour covers that.',
    };
  }

  // Unnumbered: the provider's `completion` sends only a user message, so the
  // instructions ride at the top of the prompt — and numbering the passages taught the
  // model to answer "as passage two states", which is noise to someone listening.
  const passages = hits.map((h) => `- ${h.text}`).join('\n\n');
  const here = p.step && p.step.text
    ? `The person is looking at this step of the tour:\n"${p.step.text}"\n\n`
    : '';
  const prompt = `${SYSTEM}\n\n---\n\n${here}What the tour says:\n\n${passages}\n\n`
    + `Question: ${question}\n\nAnswer in ${lang}, in two or three spoken sentences.`;

  let text = null;
  try {
    // `system` is deliberately not passed: this provider's completion() ignores it,
    // and an instruction sent to nowhere is worse than one written into the prompt.
    const res = await llm().completion(prompt, {
      model: MODEL, maxTokens: 400, temperature: 0.2,
    });
    text = (res && (res.text || res.content || res)) || null;
    if (typeof text !== 'string') text = null;
  } catch (e) {
    // The retrieved passages are still worth showing — they are what the tour says.
    return { answer: null, grounded: false, hits, reason: `The assistant is unavailable: ${e.message}` };
  }

  if (text && text.length > MAX_ANSWER_CHARS) text = `${text.slice(0, MAX_ANSWER_CHARS).trimEnd()}…`;
  return { answer: text, grounded: true, hits, model: MODEL };
}

module.exports = { ask, _setDeps, SYSTEM, MODEL };
