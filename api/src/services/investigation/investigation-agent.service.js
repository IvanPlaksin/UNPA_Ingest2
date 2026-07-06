'use strict';

/**
 * InvestigationAgentService — Three-phase agent
 *
 * Phase 1: CLASSIFY  — intent classification with ambiguity detection
 * Phase 2: RESOLVE   — entity name → ID with auto-select / clarification
 * Phase 3: EXECUTE   — primitive execution → saveProposed (user commits explicitly)
 */

const { getScopedProvider } = require('../llm-access-control.service');
const primitiveRegistry = require('./primitives/primitive-registry');
const { getInvestigationVersionService } = require('./investigation-version.service');
const { getInvestigationArtifactService } = require('./investigation-artifact.service');
const { getInvestigationStepService } = require('./investigation-step.service');

// ─── Parameter schemas (per primitive) ───────────────────────────────────────
//
// type: 'entityId'      — resolve single name → ID
// type: 'entityIdArray' — resolve array of names → IDs
// type: 'number'        — numeric with default
// type: 'string'        — verbatim string, extract from field

const PARAM_SCHEMAS = {
  LOCATE: [
    { name: 'query',        type: 'string',        extract: 'query' },
  ],
  CONNECT: [
    { name: 'fromEntityId', type: 'entityId',      nameField: 'fromEntityName' },
    { name: 'toEntityId',   type: 'entityId',      nameField: 'toEntityName' },
    { name: 'maxPaths',     type: 'number',        default: 5 },
    { name: 'maxHops',      type: 'number',        default: 6 },
  ],
  EXPAND: [
    { name: 'entityId',     type: 'entityId',      nameField: 'entityName' },
    { name: 'depth',        type: 'number',        default: 2 },
  ],
  MATRIX: [
    { name: 'rowEntityIds', type: 'entityIdArray', nameField: 'rowEntityNames' },
    { name: 'colEntityIds', type: 'entityIdArray', nameField: 'colEntityNames', optional: true },
  ],
  STRUCTURE: [
    { name: 'entityIds',    type: 'entityIdArray', nameField: 'entityNames' },
    { name: 'depth',        type: 'number',        default: 1 },
  ],
  TIMELINE: [
    { name: 'entityIds',    type: 'entityIdArray', nameField: 'entityNames' },
  ],
  RESOLVE: [
    { name: 'entityId',     type: 'entityId',      nameField: 'entityName' },
    { name: 'threshold',    type: 'number',        default: 0.6 },
  ],
  SYNTHESIZE: [
    { name: 'focus',        type: 'string',        optional: true, extract: 'focus' },
    { name: 'format',       type: 'string',        default: 'summary', extract: 'format' },
  ],
  TEXT: [
    { name: 'title',        type: 'string',        extract: 'title' },
    { name: 'body',         type: 'string',        extract: 'body' },
  ],
  PROFILE: [
    { name: 'entityId',     type: 'entityId',      nameField: 'entityName' },
  ],
  IMPACT: [
    { name: 'entityId',     type: 'entityId',      nameField: 'entityName' },
    { name: 'maxDepth',     type: 'number',        default: 5 },
  ],
};

// ─── Prompts ──────────────────────────────────────────────────────────────────

const CLASSIFICATION_PROMPT = `You are classifying user messages into UN investigation primitives.

## Primitives

LOCATE — find entities by search query
  Triggers: "find", "search", "list", "show all", "who is", "what is"

CONNECT — find paths between TWO named entities
  Triggers: "connection between X and Y", "how are X and Y related", "path from X to Y"
  REQUIRES: two specific entity names

EXPAND — explore connections OF ONE entity
  Triggers: "what is connected to X", "connections of X", "neighborhood of X"
  REQUIRES: one entity name + request for its connections

MATRIX — cross-analyze multiple entities (2+) in a relationship matrix
  Triggers: "matrix", "compare X and Y", "compare X, Y, Z", "relationship table", "for each of these", "cross-analysis"
  REQUIRES: 2+ entity names explicitly named OR the word "matrix"

STRUCTURE — graph structure analysis
  Triggers: "key nodes", "bridges", "central entities", "network structure"

TIMELINE — temporal projection
  Triggers: "timeline", "when", "chronology", "sequence of events"

RESOLVE — find duplicates/variants
  Triggers: "duplicates", "similar to", "same entity", "merge candidates"

SYNTHESIZE — narrative from collected evidence (no new KB queries)
  Triggers: "summarize findings", "what did we find", "report", "analysis", "conclusion"

TEXT — create a text note
  Triggers: "note", "record", "write down", "save this"

PROFILE — build a structured dossier for ONE entity (all attributes, relationships, provenance)
  Triggers: "досье на X", "профиль X", "карточка X", "всё про X", "profile X", "dossier for X", "tell me everything about X", "full profile"
  REQUIRES: one entity name; distinct from EXPAND (which shows topology, PROFILE shows semantic dossier)

IMPACT — reverse dependency analysis: what would be affected if X changed or was removed
  Triggers: "что затронет", "что зависит от", "impact of X", "dependencies on X", "who depends on X", "if X changes", "кто зависит от", "impacted by", "downstream of X"
  REQUIRES: one entity name; returns risk level, direct/transitive dependents, critical paths

FREEFORM — meta questions about session or system
  Triggers: "how does this work", "what have we found so far", "help", "what can you do"

## Priority Rules (applied before ambiguity check)

1. If the message starts with or explicitly contains the word "MATRIX" → always classify as MATRIX, confidence=1.0, ambiguous=false.
2. If the message starts with or explicitly contains the word "CONNECT" → always classify as CONNECT, confidence=1.0, ambiguous=false.
3. If the message starts with or explicitly contains the word "LOCATE" → always classify as LOCATE, confidence=1.0, ambiguous=false.
4. If the message starts with or explicitly contains the word "EXPAND" → always classify as EXPAND, confidence=1.0, ambiguous=false.

## Ambiguity Rule

Set ambiguous=true only when intent is genuinely unclear after applying priority rules (e.g. "show OICT" — no primitive named, could be LOCATE or EXPAND).
List 2–3 most likely candidates in ambiguousCandidates.
Do NOT set ambiguous=true if the user explicitly named a primitive type in their message.

## Output (JSON only, no prose)

{
  "primitive": "LOCATE|CONNECT|EXPAND|PROFILE|IMPACT|MATRIX|STRUCTURE|TIMELINE|RESOLVE|SYNTHESIZE|TEXT|FREEFORM",
  "confidence": 0.0-1.0,
  "ambiguous": false,
  "ambiguousCandidates": [],
  "reasoning": "one sentence"
}`;

const EXTRACTION_PROMPTS = {
  CONNECT:   'Extract TWO entity names for CONNECT.\nOutput JSON only: {"fromEntityName":"...","toEntityName":"...","maxPaths":5,"maxHops":6}',
  EXPAND:    'Extract ONE entity name for EXPAND.\nOutput JSON only: {"entityName":"...","depth":2}',
  LOCATE:    'Extract search query for LOCATE.\nOutput JSON only: {"query":"..."}',
  MATRIX:    'Extract entity names for MATRIX (2+ entities). Put all entity names into rowEntityNames. colEntityNames can be null unless the user explicitly says "rows" and "columns".\nOutput JSON only: {"rowEntityNames":["...","..."],"colEntityNames":null}',
  STRUCTURE: 'Extract entity names for STRUCTURE analysis.\nOutput JSON only: {"entityNames":["...","..."],"depth":1}',
  TIMELINE:  'Extract entity names for TIMELINE.\nOutput JSON only: {"entityNames":["...","..."]}',
  RESOLVE:   'Extract entity name for RESOLVE (anchor entity).\nOutput JSON only: {"entityName":"...","threshold":0.6}',
  SYNTHESIZE:'Extract scope and format for SYNTHESIZE.\nOutput JSON only: {"focus":null,"format":"summary"}',
  TEXT:      'Extract title and body for TEXT note.\nOutput JSON only: {"title":"...","body":"..."}',
  PROFILE:   'Extract ONE entity name for PROFILE dossier.\nOutput JSON only: {"entityName":"..."}',
  IMPACT:    'Extract ONE entity name for IMPACT analysis (reverse dependency analysis).\nOutput JSON only: {"entityName":"...","maxDepth":5}',
};

const PRIMITIVE_LABELS = {
  LOCATE:    'Find entities by search query',
  CONNECT:   'Show paths between two entities',
  EXPAND:    'Show all connections of one entity',
  MATRIX:    'Compare connections of multiple entities',
  STRUCTURE: 'Analyze graph structure (bridges, central nodes)',
  TIMELINE:  'Temporal projection of events',
  RESOLVE:   'Find duplicate entity candidates',
  SYNTHESIZE:'Analyze and summarize collected evidence',
  TEXT:      'Create a text note',
  PROFILE:   'Build a full dossier for one entity',
  IMPACT:    'Analyze what depends on one entity (reverse dependency / impact analysis)',
};

// ─── Service ──────────────────────────────────────────────────────────────────

class InvestigationAgentService {
  constructor() {
    this._llm = getScopedProvider('agent_service');
    this._versions = getInvestigationVersionService();
    this._artifacts = getInvestigationArtifactService();
    this._steps = getInvestigationStepService();
  }

  // ─── Main entry point ────────────────────────────────────────────────────

  /**
   * Process one user message in an investigation session.
   * Returns one of:
   *   { type: 'ARTIFACT_PROPOSED', primitiveType, artifact, message, ... }
   *   { type: 'CLARIFICATION',     message, clarificationOptions?, clarificationIssues? }
   *   { type: 'FREEFORM',          message }
   */
  async processMessage(sessionId, userMessage, context = {}, services = {}) {
    if (!services.entityStoreService) {
      try { services.entityStoreService = require('../knowledge/entity-store.service').entityStoreService; } catch {}
    }
    if (!services.impactAnalysisService) {
      try { services.impactAnalysisService = require('../knowledge/impact-analysis.service').impactAnalysisService; } catch {}
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: CLASSIFY
    // Pre-check: if message starts with an explicit primitive name, skip LLM
    // ═══════════════════════════════════════════════════════════════════════
    const PRIMITIVES = Object.keys(PARAM_SCHEMAS);
    const upperMsg = userMessage.trim().toUpperCase();
    let classification = null;
    for (const prim of PRIMITIVES) {
      if (upperMsg.startsWith(prim + ' ') || upperMsg === prim) {
        classification = { primitive: prim, confidence: 1.0, ambiguous: false, ambiguousCandidates: [] };
        break;
      }
    }
    if (!classification) {
      classification = await this._classifyIntent(userMessage, context);
    }

    if (classification.primitive === 'FREEFORM') {
      return {
        type: 'FREEFORM',
        primitiveType: 'FREEFORM',
        artifact: null,
        message: classification.freeformResponse || 'Could you clarify what you are looking for?',
      };
    }

    if (classification.ambiguous) {
      return {
        type: 'CLARIFICATION',
        primitiveType: null,
        artifact: null,
        message: this._formatIntentClarification(classification),
        clarificationOptions: classification.ambiguousCandidates || [],
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: RESOLVE PARAMETERS
    // ═══════════════════════════════════════════════════════════════════════
    const resolution = await this._resolveParameters(
      userMessage, classification.primitive, context, services
    );

    if (resolution.needsClarification) {
      return {
        type: 'CLARIFICATION',
        primitiveType: classification.primitive,
        artifact: null,
        message: this._formatEntityClarification(resolution.issues),
        clarificationIssues: resolution.issues,
        pendingParams: resolution.resolvedSoFar || {},
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: EXECUTE
    // ═══════════════════════════════════════════════════════════════════════
    return this._executePrimitive(
      sessionId, classification.primitive, resolution.params, context, services, userMessage
    );
  }

  // ─── Phase 1: Classification ─────────────────────────────────────────────

  async _classifyIntent(message, context) {
    const contextHint = context.artifactsSummary?.length
      ? `\nSession has ${context.artifactsSummary.length} collected artifact(s): ${context.artifactsSummary.map(a => a.primitiveType).join(', ')}.`
      : '';

    const raw = await this._llmCall(
      `${CLASSIFICATION_PROMPT}\n\nUser message: "${message}"${contextHint}\n\nRespond with JSON only.`,
      300
    );
    const parsed = this._parseJSON(raw);

    if (!parsed || !parsed.primitive) {
      return { primitive: 'FREEFORM', ambiguous: false, freeformResponse: 'Could not classify request. Please rephrase.' };
    }

    if (parsed.primitive === 'FREEFORM') {
      const freeformReply = await this._llmCall(
        `You are an investigation assistant helping UN analysts. Answer this question conversationally in 1–2 sentences (no JSON):\n"${message}"${contextHint}`,
        200
      );
      return { ...parsed, freeformResponse: freeformReply?.trim() };
    }

    return parsed;
  }

  _formatIntentClarification(classification) {
    const candidates = (classification.ambiguousCandidates || []).slice(0, 3);
    const lines = candidates.map((p, i) =>
      `${i + 1}. **${p}** — ${PRIMITIVE_LABELS[p] || p}`
    ).join('\n');
    return `What would you like to do?\n\n${lines}\n\nPlease specify or rephrase your request.`;
  }

  // ─── Phase 2: Parameter Resolution ──────────────────────────────────────

  async _resolveParameters(message, primitive, context, services) {
    const schema = PARAM_SCHEMAS[primitive] || [];
    const { entityStoreService } = services;

    // Extract raw params from message
    let extraction = {};
    const extractionPrompt = EXTRACTION_PROMPTS[primitive];
    if (extractionPrompt) {
      const raw = await this._llmCall(`${extractionPrompt}\n\nUser message: "${message}"`, 200);
      extraction = this._parseJSON(raw) || {};
    }

    const resolved = {};
    const issues = [];

    for (const field of schema) {
      if (field.type === 'entityId') {
        const name = extraction[field.nameField];
        if (!name) {
          if (!field.optional) {
            issues.push({ param: field.name, error: 'MISSING', message: `No entity specified for ${field.name}` });
          }
          continue;
        }
        const r = await this._resolveEntityName(name, entityStoreService, context);
        if (!r.resolved) {
          issues.push({ param: field.name, paramKey: field.name, name, ...r });
        } else {
          resolved[field.name] = r.entityId;
          this._cacheEntity(context, r.entity);
        }

      } else if (field.type === 'entityIdArray') {
        const names = extraction[field.nameField] || [];
        if (names.length === 0 && field.optional) continue;
        resolved[field.name] = [];
        for (let idx = 0; idx < names.length; idx++) {
          const name = names[idx];
          const r = await this._resolveEntityName(name, entityStoreService, context);
          if (!r.resolved) {
            // paramKey is unique per entity even within the same array param
            issues.push({ param: field.name, paramKey: `${field.name}_${idx}`, paramIndex: idx, name, ...r });
          } else {
            resolved[field.name].push(r.entityId);
            this._cacheEntity(context, r.entity);
          }
        }

      } else if (field.type === 'number') {
        const val = extraction[field.extract || field.name];
        resolved[field.name] = (val !== undefined && val !== null) ? val : field.default;

      } else if (field.type === 'string') {
        const val = extraction[field.extract || field.name];
        if (val !== undefined && val !== null) resolved[field.name] = val;
        else if (field.default !== undefined) resolved[field.name] = field.default;
      }
    }

    if (issues.length > 0) {
      return { needsClarification: true, issues, resolvedSoFar: resolved };
    }
    return { needsClarification: false, params: resolved };
  }

  /**
   * Resolve an entity name to an ID using:
   *   1. Session context cache (entities found earlier this session)
   *   2. Exact match in KB search results
   *   3. Auto-select if single result or high-confidence best match (score > 0.85)
   *   4. CLARIFICATION if ambiguous
   */
  async _resolveEntityName(name, entityStoreService, context) {
    // 1. Session context cache
    const cached = (context._entityCache || []).find(
      e => e.name.toLowerCase() === name.toLowerCase()
    );
    if (cached) return { resolved: true, entityId: cached.entityId, entity: cached, source: 'cache' };

    if (!entityStoreService) {
      return { resolved: false, error: 'NO_SERVICE', name, suggestion: 'Entity store not available.' };
    }

    // 2. Search KB
    let results;
    try {
      results = await entityStoreService.listEntities({ search: name, limit: 5 });
    } catch {
      return { resolved: false, error: 'SEARCH_FAILED', name };
    }

    const entities = (results || []).map(e => ({
      entityId: e.id || e.entityId,
      name: e.name,
      type: e.type,
      namespace: e.namespace,
      score: e.score,
    })).filter(e => e.entityId);

    if (entities.length === 0) {
      return {
        resolved: false, error: 'NOT_FOUND', name,
        suggestion: `Entity "${name}" not found in the Knowledge Base.`,
      };
    }

    // Single result — auto-accept
    if (entities.length === 1) {
      return { resolved: true, entityId: entities[0].entityId, entity: entities[0], source: 'single' };
    }

    // Exact name match
    const exact = entities.find(e => e.name.toLowerCase() === name.toLowerCase());
    if (exact) {
      return { resolved: true, entityId: exact.entityId, entity: exact, source: 'exact' };
    }

    // High-confidence auto-select (score > 0.85)
    if (entities[0].score && entities[0].score > 0.85) {
      return {
        resolved: true, entityId: entities[0].entityId, entity: entities[0],
        source: 'auto_select', confidence: entities[0].score,
      };
    }

    // Ambiguous — request clarification
    return { resolved: false, error: 'AMBIGUOUS', name, candidates: entities.slice(0, 5) };
  }

  _cacheEntity(context, entity) {
    if (!entity?.entityId) return;
    context._entityCache = context._entityCache || [];
    if (!context._entityCache.some(e => e.entityId === entity.entityId)) {
      context._entityCache.push(entity);
    }
  }

  _formatEntityClarification(issues) {
    const parts = issues.map(issue => {
      if (issue.error === 'NOT_FOUND') {
        return `❌ **${issue.name}**: not found in Knowledge Base. ${issue.suggestion || ''}`;
      }
      if (issue.error === 'AMBIGUOUS') {
        const opts = (issue.candidates || []).slice(0, 5).map((c, i) =>
          `   ${i + 1}. ${c.name} (${c.type || 'unknown'}${c.namespace ? ` · ${c.namespace}` : ''})`
        ).join('\n');
        return `⚠️ **${issue.name}**: multiple matches found:\n${opts}`;
      }
      if (issue.error === 'MISSING') {
        return `❓ ${issue.message}`;
      }
      return `❌ **${issue.name}**: ${issue.error}`;
    });
    return `Clarification needed:\n\n${parts.join('\n\n')}\n\nPlease specify the correct option or rephrase your request.`;
  }

  // ─── Phase 3: Execute ────────────────────────────────────────────────────

  async _executePrimitive(sessionId, primitive, params, context, services, userMessage) {
    const step = await this._steps.begin({
      sessionId,
      versionId: context.currentVersionId || 'pending',
      primitiveType: primitive,
      inputParams: params,
    });

    let result;
    try {
      const handler = primitiveRegistry.get(primitive);
      result = await handler.execute(params, context, services);
    } catch (e) {
      await this._steps.fail(step.stepId, e.message);
      throw e;
    }

    const evidenceEntityIds = (result.evidencedBy || []).filter(id => id && id !== '__no-evidence__');

    const artifact = await this._artifacts.saveProposed({
      sessionId,
      versionId: context.currentVersionId || 'pending',
      stepId: step.stepId,
      primitiveType: primitive,
      content: result.content,
      evidenceEntityIds,
      producedBy: 'AI',
    });

    await this._steps.complete(step.stepId, artifact.artifactId);

    return {
      type: 'ARTIFACT_PROPOSED',
      primitiveType: primitive,
      params,
      artifact,
      evidencedBy: evidenceEntityIds,
      message: this._generateMessage(primitive, result.content, userMessage),
      newEvidentiaryVersion: false,
      versionId: context.currentVersionId || null,
      stepId: step.stepId,
    };
  }

  // ─── Message generation ───────────────────────────────────────────────────

  _generateMessage(primitiveType, content, _originalQuery) {
    switch (primitiveType) {
      case 'LOCATE': {
        const n = content.results?.length || 0;
        return n === 0
          ? `No entities found matching "${content.query}".`
          : `Found ${n} entity(ies) matching "${content.query}": ${content.results.slice(0, 3).map(e => e.name).join(', ')}${n > 3 ? ` and ${n - 3} more` : ''}.`;
      }
      case 'CONNECT': {
        const n = content.paths?.length || 0;
        return n === 0
          ? 'No paths found between the specified entities.'
          : `Found ${n} path(s). Robustness: ${content.structuralAnalysis?.connectionRobustness || 'unknown'}.`;
      }
      case 'EXPAND':
        return `Expanded: ${content.nodeCount || 0} entities, ${content.edgeCount || 0} relationships at depth ${content.depth}.`;
      case 'SYNTHESIZE':
        return content.narrative ? content.narrative.slice(0, 200) + '…' : 'Synthesis complete.';
      case 'MATRIX': {
        const s = content.summary || {};
        return `Matrix: ${s.totalCells || 0} cells, ${s.directConnections || 0} direct, ${s.indirectConnections || 0} indirect connections.`;
      }
      case 'STRUCTURE': {
        const s = content.summary || {};
        const top = s.mostCentral;
        return `Structure: ${s.nodeCount || 0} nodes, ${s.edgeCount || 0} edges, ${s.bridgeCount || 0} bridges.${top ? ` Most central: ${top.name} (degree ${top.degree}).` : ''}`;
      }
      case 'TIMELINE': {
        const { summary, span } = content;
        return `Timeline: ${summary?.eventCount || 0} events${span?.earliest ? ` from ${span.earliest} to ${span.latest}` : ''}.`;
      }
      case 'RESOLVE': {
        const { summary, anchor } = content;
        return `Resolution for "${anchor?.name}": ${summary?.candidateCount || 0} candidate(s), ${summary?.highConfidenceMerges || 0} suggested merge(s).`;
      }
      case 'TEXT':
        return `Note saved: "${content.title || 'Untitled'}" (${content.wordCount || 0} words).`;
      default:
        return `${primitiveType} completed.`;
    }
  }

  // ─── AI Summary (called from route for lazy generation) ──────────────────

  async generateArtifactSummary(primitiveType, content) {
    const prompt = this._buildSummaryPrompt(primitiveType, content);
    if (!prompt) return null;
    const raw = (await this._llmCall(prompt, 2200, 'sonnet'))?.trim() || null;
    if (!raw) return null;

    // Parse ## sections → { paragraphs, keyInsight }
    const paragraphs = [];
    const parts = raw.split(/\n(?=##\s)/);
    for (const part of parts) {
      const headerMatch = part.match(/^##\s+(.+)/);
      if (!headerMatch) continue;
      const label = headerMatch[1].replace(/KEY_INSIGHT.*$/i, '').trim();
      if (!label) continue;
      const body = part.slice(headerMatch[0].length).replace(/^KEY_INSIGHT:[\s\S]*/im, '').trim();
      if (body.length > 20) paragraphs.push({ label, text: body });
    }
    const insightMatch = raw.match(/KEY_INSIGHT:\s*([\s\S]+?)$/i);
    const keyInsight = (insightMatch?.[1] || '').replace(/^##.*$/gm, '').trim();

    if (paragraphs.length > 0) return { paragraphs, keyInsight };
    // Fallback: return structured object with raw text as single paragraph
    return { paragraphs: [{ label: 'Analysis', text: raw.replace(/KEY_INSIGHT:[\s\S]*$/i, '').trim() }], keyInsight };
  }

  _buildSummaryPrompt(primitiveType, content) {
    const base = `You are a UN investigation analyst. Analyze the findings below and write a structured interpretation.

Rules:
- Write 3–5 sections. Derive section titles from the actual content — use specific descriptive names (e.g. "Mandate and Authority Chain", "Co-Sponsorship Patterns", "Structural Vulnerabilities"), NOT generic names like "Overview" or "Summary".
- Each section is a paragraph of 3–5 sentences. Cite specific evidence, entity names, relationship types, and documentary excerpts where available.
- At least one section must be grounded in documentary evidence (relationship context excerpts, quoted passages).
- Format: start each section with ## followed by the title on its own line, then a blank line, then the paragraph.
- End with: KEY_INSIGHT: [single most important finding — one sentence]
- No introductory text before the first ##.`;

    switch (primitiveType) {
      case 'LOCATE': {
        const names = (content.results || []).map(e => `${e.name} (${e.type})`).join(', ');
        if (!names) return null;
        return `${base}\n\nSearch: "${content.query}"\nEntities found: ${names}`;
      }

      case 'CONNECT': {
        const entities = content.entities || [];
        // entity ID → full entity object
        const entityObj = Object.fromEntries(entities.map(e => [e.id || e.entityId, e]));
        const entityName = (id) => entityObj[id]?.name || id;

        // Entity roster — names, types, epistemic layers
        const entityRoster = entities.slice(0, 20).map(e =>
          `  • ${e.name} [${e.type || '?'}]${e.epistemicLayer ? ` (${e.epistemicLayer})` : ''}${e.description ? ` — ${e.description.slice(0, 120)}` : ''}`
        ).join('\n');

        // Full path chains — use segments when available (entity names are embedded)
        const pathChains = (content.paths || []).slice(0, 5).map((p, i) => {
          let chain;
          if (p.segments && p.segments.length > 0) {
            chain = p.segments.map(s => {
              const edgeAnnot = s.edge ? ` -[${s.edge.relType}${s.edge.direction !== 'forward' ? `(${s.edge.direction})` : ''}]→` : '';
              return `${s.name}${edgeAnnot}`;
            }).join(' ');
          } else {
            chain = (p.nodeIds || []).map(id => entityName(id)).join(' → ');
          }
          const meta = [
            p.hopCount != null && `${p.hopCount} hops`,
            p.pathStrength != null && `strength ${Math.round(p.pathStrength * 100)}%`,
            p.totalCost != null && `cost ${p.totalCost.toFixed(2)}`,
          ].filter(Boolean).join(', ');
          return `  Path ${i + 1} (${meta}): ${chain}`;
        }).join('\n');

        // Bundle relationships — nodeA/nodeB are entity IDs; resolve to names for AI clarity
        const relDetails = Object.values(content.bundles || {}).flatMap(b => {
          const nameA = entityName(b.nodeA);
          const nameB = entityName(b.nodeB);
          return (b.relationships || []).map(r => {
            const ctx = r.context ? `\n      Evidence: "${r.context.slice(0, 240)}"` : '';
            const doc = r.documentId ? `\n      Source doc: ${r.documentId}` : '';
            const conf = r.confidence != null ? ` [${Math.round(r.confidence * 100)}% conf]` : '';
            const dir = r.direction && r.direction !== 'forward' ? ` (${r.direction})` : '';
            return `  • ${nameA} --[${r.relType}${dir}]--> ${nameB}${conf}${ctx}${doc}`;
          });
        }).slice(0, 18).join('\n');

        // Bundle-level summary (entity pair → count + distinct types)
        const bundleSummary = Object.values(content.bundles || {}).map(b => {
          const nameA = entityName(b.nodeA);
          const nameB = entityName(b.nodeB);
          const types = [...new Set((b.relationships || []).map(r => r.relType))].join(', ');
          return `  ${nameA} ↔ ${nameB}: ${b.count} evidence link(s) — types: [${types}]`;
        }).join('\n');

        const structural = content.structuralAnalysis || {};
        // Use pre-computed structural summary strings if available
        const structuralBullets = (structural.summary || []).join(' ');
        const articulationNames = (structural.articulationPoints || []).map(entityName).join(', ');
        const structuralInfo = structuralBullets || [
          structural.connectionRobustness && `Connection robustness: ${structural.connectionRobustness}.`,
          structural.independentPathCount > 1 && `${structural.independentPathCount} independent paths exist.`,
          articulationNames && `Critical bottlenecks: ${articulationNames}.`,
        ].filter(Boolean).join(' ');

        return `${base}

Entities involved (${entities.length} total):
${entityRoster || '  None.'}

Paths found (${(content.paths || []).length} total):
${pathChains || '  No direct paths.'}

Relationship evidence (each entry = distinct documented context between two entities; multiple entries per pair = layered evidence):
${relDetails || '  No relationship evidence available.'}

Entity-pair evidence summary:
${bundleSummary || '  None.'}

${structuralInfo ? `Structural analysis: ${structuralInfo}` : ''}
${content.interpretation?.narrative ? `\nPre-computed interpretation: ${content.interpretation.narrative}` : ''}
${content.interpretation?.keyInsight ? `Key insight: ${content.interpretation.keyInsight}` : ''}`;
      }

      case 'EXPAND': {
        const nodes = content.nodes || [];
        const entityMap = Object.fromEntries(nodes.map(n => [n.entityId, n.name || n.entityId]));
        const center = nodes.find(n => n.entityId === content.entityId);

        // Group neighbours by relationship type
        const byRel = {};
        (content.edges || []).forEach(e => {
          const neighbourId = e.targetId === content.entityId ? e.sourceId : e.targetId;
          const node = nodes.find(n => n.entityId === neighbourId);
          if (!node) return;
          const rel = e.relType || 'RELATED';
          if (!byRel[rel]) byRel[rel] = [];
          byRel[rel].push(node.name || neighbourId);
        });
        const groupedStr = Object.entries(byRel).map(([rel, names]) =>
          `  ${rel}: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` +${names.length - 6} more` : ''}`
        ).join('\n');

        // Edge details with context
        const edgeDetails = (content.edges || []).filter(e => e.context).slice(0, 8).map(e => {
          const src = entityMap[e.sourceId] || e.sourceId;
          const tgt = entityMap[e.targetId] || e.targetId;
          return `  • ${src} --[${e.relType || 'RELATED'}]--> ${tgt}: "${e.context.slice(0, 160)}"`;
        }).join('\n');

        return `${base}

Entity under analysis: ${center?.name || content.entityId} (type: ${center?.type || 'UNKNOWN'})
Network scope: depth=${content.depth}, ${content.nodeCount} nodes, ${content.edgeCount} edges

Connections by relationship type:
${groupedStr || '  None found.'}

${edgeDetails ? `Relationship context (evidential excerpts):\n${edgeDetails}` : ''}`;
      }

      case 'MATRIX': {
        const direct = content.summary?.directConnections || 0;
        const indirect = content.summary?.indirectConnections || 0;
        const rows = (content.rowEntities || []).map(e => e.name).join(', ');
        const keyConnections = (content.cells || [])
          .filter(c => c.directRel && !c.self)
          .slice(0, 6)
          .map(c => {
            const row = content.rowEntities?.find(e => e.entityId === c.rowEntityId);
            const col = (content.colEntities || content.rowEntities || []).find(e => e.entityId === c.colEntityId);
            return `  ${row?.name || c.rowEntityId} ↔ ${col?.name || c.colEntityId}: ${c.relType || 'DIRECT'}`;
          }).join('\n');
        return `${base}\n\nMatrix entities: ${rows}\nDirect connections: ${direct}, Indirect: ${indirect}, No connection: ${content.summary?.noConnection || 0}\n\nKey direct connections:\n${keyConnections || '  None.'}`;
      }

      case 'STRUCTURE': {
        const nodes = content.nodes || [];
        const entityMap = Object.fromEntries(nodes.map(n => [n.entityId, n.name || n.entityId]));

        const top5 = (content.metrics || []).slice(0, 5).map(m =>
          `  • ${m.name} (${m.type || '?'}): degree=${m.degree}${m.isBridge ? ', STRUCTURAL BRIDGE' : ''}${m.betweennessProxy > 0 ? `, betweenness=${m.betweennessProxy.toFixed(3)}` : ''}`
        ).join('\n');

        const bridges = (content.bridges || []).slice(0, 5).map(b => {
          const src = entityMap[b.sourceId] || b.sourceId;
          const tgt = entityMap[b.targetId] || b.targetId;
          return `  • ${src} --[${b.relType || 'RELATED'}]--> ${tgt}`;
        }).join('\n');

        const edgeContexts = (content.edges || []).filter(e => e.context).slice(0, 6).map(e => {
          const src = entityMap[e.sourceId] || e.sourceId;
          const tgt = entityMap[e.targetId] || e.targetId;
          return `  • ${src} --[${e.relType}]--> ${tgt}: "${e.context.slice(0, 150)}"`;
        }).join('\n');

        return `${base}

Network overview: ${content.summary?.nodeCount} nodes, ${content.summary?.edgeCount || '?'} edges, ${content.summary?.bridgeCount} structural bridges.

Most central entities (by network degree):
${top5 || '  None.'}

Structural bridges (critical connections — removal disconnects the network):
${bridges || '  None found.'}

${edgeContexts ? `Key relationship contexts:\n${edgeContexts}` : ''}`;
      }

      case 'TIMELINE': {
        const events = (content.events || []).slice(0, 6).map(e => `  ${e.date || '?'} — ${e.name}: ${e.eventType || e.relType || ''}`).join('\n');
        return `${base}\n\nTimeline (${content.summary?.eventCount} events, ${content.span?.earliest} to ${content.span?.latest}):\n${events}`;
      }

      case 'RESOLVE': {
        const cands = (content.candidates || []).slice(0, 4).map(c =>
          `  ${c.name} (${Math.round(c.similarity * 100)}% match)${c.matchReasons?.length ? ` — ${c.matchReasons.slice(0, 2).join(', ')}` : ''}`
        ).join('\n');
        return `${base}\n\nAnchor entity: ${content.anchor?.name} (${content.anchor?.type || '?'})\n\nDuplicate candidates:\n${cands || '  None found.'}`;
      }

      case 'SYNTHESIZE':
        return null;
      case 'TEXT':
        return null;
      default:
        return null;
    }
  }

  // ─── LLM helpers ─────────────────────────────────────────────────────────

  async _llmCall(prompt, maxTokens = 400, model = 'haiku') {
    try {
      const response = await this._llm.chat(
        [{ role: 'user', content: prompt }],
        { model, maxTokens }
      );
      return response?.content?.[0]?.text || response?.text || '';
    } catch (e) {
      console.warn('[InvestigationAgent] LLM call failed:', e.message);
      return '';
    }
  }

  _parseJSON(text) {
    if (!text) return null;
    const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

let _instance = null;
function getInvestigationAgentService() {
  if (!_instance) _instance = new InvestigationAgentService();
  return _instance;
}

module.exports = { InvestigationAgentService, getInvestigationAgentService };
