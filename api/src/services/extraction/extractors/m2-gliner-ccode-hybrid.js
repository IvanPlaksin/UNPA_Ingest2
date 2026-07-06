'use strict';

/**
 * M2C GLiNER + Claude Code Hybrid Extractor
 *
 * Identical three-stage pipeline to M2, but Stage 3 LLM verification runs
 * through the Claude Code CLI subprocess instead of the Anthropic SDK.
 *
 * This avoids direct Anthropic API key usage and leverages the Claude Code
 * provider already configured in the project (.mcp.json / claude binary).
 *
 * Stage 1 — GLiNER: fast zero-shot NER → entity candidates with scores
 * Stage 2 — Confidence routing:
 *   score ≥ HIGH_CONFIDENCE (0.80)  → auto-accept
 *   score <  LOW_CONFIDENCE (0.40)  → discard
 *   middle zone                     → send to Claude Code for verification
 * Stage 3 — Claude Code CLI: verify mid-confidence candidates + new entities + relations
 */

const { v4: uuidv4 }  = require('uuid');
const { isAllowed }   = require('../../llm-access-control.service');
const { BaseExtractor } = require('./base-extractor');
const glinerClient      = require('../../../../services/gliner/gliner.client');
const { EXTRACTION_SYSTEM_PROMPT, RELATION_TYPES, ENTITY_TYPES, EPISTEMIC_LAYERS } = require('../schemas/canonical');

const DEFAULT_MODEL    = process.env.EXTRACTION_M2C_MODEL || 'claude-haiku-4-5-20251001';
const HIGH_CONFIDENCE  = parseFloat(process.env.M2_HIGH_CONFIDENCE || '0.80');
const LOW_CONFIDENCE   = parseFloat(process.env.M2_LOW_CONFIDENCE  || '0.40');

// Lazy-load runClaudeCode (and parseClaudeOutput) to avoid circular dep at startup
function _runClaudeCode(prompt, model) {
  const { runClaudeCode } = require('../../knowledge/document-ai-extraction.service');
  return runClaudeCode(prompt, model);
}

function _parseJson(raw) {
  // Strip markdown code block if Claude Code wraps output in ```json … ```
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) return JSON.parse(jsonMatch[1].trim());
  const trimmed  = raw.trim();
  const objStart = trimmed.indexOf('{');
  if (objStart !== -1) return JSON.parse(trimmed.slice(objStart));
  return JSON.parse(trimmed);
}

// ── M2C Extractor ─────────────────────────────────────────────────────────────

class M2GlinerCCodeHybridExtractor extends BaseExtractor {
  constructor(options = {}) {
    super(options);
    this.model       = options.model     || DEFAULT_MODEL;
    this.highConf    = options.highConfidence || HIGH_CONFIDENCE;
    this.lowConf     = options.lowConfidence  || LOW_CONFIDENCE;
    this.methodology = 'M2C';
  }

  async extract(docId, text, existing = []) {
    if (!isAllowed('direct:m2_gliner_ccode_hybrid')) {
      throw new Error('[LLMAccessControl] M2C GLiNER CCode Hybrid Extractor is disabled');
    }

    const startTotal = Date.now();

    // ── Stage 1: GLiNER NER ─────────────────────────────────────────────────
    const glinerStart = Date.now();
    let glinerCandidates = [];
    let glinerAvailable  = false;
    try {
      glinerCandidates = await glinerClient.extractEntities(text, { threshold: this.lowConf });
      glinerAvailable  = true;
    } catch {
      // GLiNER unavailable → all entities go to Claude Code
    }
    const glinerTimeMs = Date.now() - glinerStart;

    // ── Stage 2: Confidence routing ─────────────────────────────────────────
    const autoAccepted = [];
    const midZone      = [];
    for (const c of glinerCandidates) {
      (c.score >= this.highConf ? autoAccepted : midZone).push(c);
    }

    const inputText = text.slice(0, this.textLimit);
    const { processedText, markCount } = this._premark(inputText, existing);

    // ── Stage 3: Claude Code CLI verification ────────────────────────────────
    const llmStart = Date.now();

    const midDesc = midZone.length > 0
      ? midZone.map(c => `- "${c.text}" [${c.canonical_type || c.label}] score=${c.score.toFixed(2)}`).join('\n')
      : '(none — all candidates above threshold were auto-accepted)';

    const autoAcceptedDesc = autoAccepted.length > 0
      ? autoAccepted.map(c => `- "${c.text}" [${c.canonical_type || c.label}] score=${c.score.toFixed(2)}`).join('\n')
      : '(none)';

    const prompt = [
      EXTRACTION_SYSTEM_PROMPT,
      '',
      'TASK: Analyze the UN document below and do THREE things:',
      '1. Verify the mid-confidence GLiNER candidates (accept or reject each)',
      '2. Find any important entities that GLiNER missed',
      '3. Extract all meaningful relations between entities',
      '',
      'IMPORTANT: Respond with ONLY a valid JSON object — no explanation, no markdown, no code fences.',
      '',
      'Required JSON structure:',
      '{',
      '  "verified_entities": [{"name":"...","type":"...","epistemicLayer":"...","confidence":0.8,"evidence":"..."}],',
      '  "rejected_entity_names": ["name1"],',
      '  "new_entities": [{"name":"...","type":"...","epistemicLayer":"...","confidence":0.7,"evidence":"..."}],',
      '  "relations": [{"sourceEntity":"...","targetEntity":"...","type":"...","confidence":0.8,"evidence":"..."}]',
      '}',
      '',
      `Entity types: ${ENTITY_TYPES.join(', ')}`,
      `Relation types: ${RELATION_TYPES.join(', ')}`,
      `Epistemic layers: ${EPISTEMIC_LAYERS.join(', ')}`,
      '',
      '## Auto-accepted (high confidence, no review needed):',
      autoAcceptedDesc,
      '',
      '## Mid-confidence candidates needing verification:',
      midDesc,
      '',
      '## Document text:',
      processedText,
    ].join('\n');

    let raw;
    try {
      const responseText = await _runClaudeCode(prompt, this.model);
      raw = _parseJson(responseText);
    } catch (err) {
      throw new Error(`M2C: Claude Code verification failed: ${err.message}`);
    }

    const llmTimeMs = Date.now() - llmStart;

    return this._buildResult(docId, {
      autoAccepted,
      verifiedEntities:    raw.verified_entities    || [],
      rejectedEntityNames: raw.rejected_entity_names || [],
      newEntities:         raw.new_entities          || [],
      relations:           raw.relations             || [],
    }, {
      glinerTimeMs, llmTimeMs,
      truncated:       text.length > this.textLimit,
      markCount,
      glinerAvailable,
      glinerCandidates: glinerCandidates.length,
    });
  }

  // ── Result builder (mirrors M2 but tags sources as M2C) ──────────────────────

  _buildResult(docId, merged, meta) {
    const { autoAccepted, verifiedEntities, newEntities, relations, rejectedEntityNames } = merged;
    const rejectedSet = new Set((rejectedEntityNames || []).map(n => n.toLowerCase()));

    const fromGliner = autoAccepted.map(c => ({
      name:              String(c.text || '').trim(),
      type:              this._normalizeEntityType(c.canonical_type || c.label),
      epistemicLayer:    null,
      confidence:        c.score || this.highConf,
      evidence:          null,
      sourceMethodology: 'M2C:gliner',
    })).filter(e => e.name.length > 1 && !rejectedSet.has(e.name.toLowerCase()));

    const fromVerified = verifiedEntities.map(e => ({
      name:              String(e.name || '').trim(),
      type:              this._normalizeEntityType(e.type),
      epistemicLayer:    e.epistemicLayer || null,
      confidence:        Math.max(0, Math.min(1, Number(e.confidence) || 0.60)),
      evidence:          e.evidence || null,
      sourceMethodology: 'M2C:verified',
    })).filter(e => e.name.length > 1);

    const fromNew = newEntities.map(e => ({
      name:              String(e.name || '').trim(),
      type:              this._normalizeEntityType(e.type),
      epistemicLayer:    e.epistemicLayer || null,
      confidence:        Math.max(0, Math.min(1, Number(e.confidence) || 0.50)),
      evidence:          e.evidence || null,
      sourceMethodology: 'M2C:new',
    })).filter(e => e.name.length > 1 && e.confidence >= this.confidenceThreshold);

    const seenNames = new Set();
    const entities  = [];
    for (const e of [...fromGliner, ...fromVerified, ...fromNew]) {
      const key = e.name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      entities.push({ id: uuidv4(), ...e });
    }

    const nameMap        = this._buildNameMap(entities);
    const uniqueRelations = this._buildRelations(relations, nameMap);
    const totalTimeMs    = meta.glinerTimeMs + meta.llmTimeMs;

    return {
      docId,
      runId:      uuidv4(),
      methodology: 'M2C',
      summary:    null,
      keyProvisions: [],
      entities,
      relations:  uniqueRelations,
      metrics: {
        totalTimeMs,
        glinerTimeMs:     meta.glinerTimeMs,
        llmTimeMs:        meta.llmTimeMs,
        llmCalls:         1,
        inputTokens:      0,  // Claude Code CLI does not expose token counts
        outputTokens:     0,
        cost:             0,  // no direct API cost (Claude Code subscription)
        glinerEntities:   meta.glinerCandidates,
        autoAccepted:     fromGliner.length + (merged.rejectedEntityNames?.length || 0),
        verifiedEntities: fromVerified.length,
        rejectedEntities: merged.rejectedEntityNames?.length || 0,
        newEntities:      fromNew.length,
        entitiesFiltered: entities.length,
        relationsFiltered: uniqueRelations.length,
        textLength:       Math.min(meta.truncated ? this.textLimit : 99999, 99999),
        truncated:        meta.truncated,
        premarked:        meta.markCount,
        glinerAvailable:  meta.glinerAvailable,
      },
      metadata: {
        modelUsed:     this.model,
        provider:      'claude-code',
        schemaVersion: '1.0.0',
        extractedAt:   new Date().toISOString(),
        confidenceThreshold: this.confidenceThreshold,
        highConfThreshold:   this.highConf,
        lowConfThreshold:    this.lowConf,
      },
    };
  }
}

module.exports = { M2GlinerCCodeHybridExtractor };
