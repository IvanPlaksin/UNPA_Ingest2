'use strict';
/**
 * DocumentAIExtractionService
 *
 * Extracts structured knowledge from UN documents using Claude Code CLI
 * (claude.exe -p) — NOT the Anthropic SDK directly.
 *
 * Falls back to LLMProviderService (API) only when claude.exe is unavailable.
 */

const { v4: uuidv4 } = require('uuid');
const { spawn }      = require('child_process');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

const LOG_PREFIX = '[DocumentAIExtraction]';

// Project root — where .mcp.json lives, needed for Claude Code to load MCP servers.
// __dirname = api/src/services/knowledge → ../../../../ = UNPA_Ingest/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Resolve claude.exe relative to this file (api/node_modules/...)
const CLAUDE_BIN = path.resolve(
  __dirname, '..', '..', '..', '..', 'api',
  'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'
);

const DEFAULT_MODEL = 'claude-code';
const CLAUDE_CODE_MODEL = 'claude-sonnet-4-6'; // actual model passed to claude.exe for 'claude-code' option

const AVAILABLE_MODELS = [
  {
    id:          'claude-code',
    displayName: 'Claude Code',
    description: 'Claude Code CLI (subprocess) — рекомендуется, как в анализе диалогов',
    tier:        'recommended',
    isDefault:   true,
    provider:    'claude-code',
  },
  {
    id:          'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    description: 'Claude Sonnet напрямую через Claude Code — оптимальное соотношение качества и скорости',
    tier:        'sonnet',
    isDefault:   false,
    provider:    'claude-code',
  },
  {
    id:          'claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    description: 'Наиболее мощная модель — для сложных многоязычных документов',
    tier:        'premium',
    isDefault:   false,
    provider:    'claude-code',
  },
  {
    id:          'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    description: 'Самая быстрая — для коротких документов без глубокого анализа',
    tier:        'fast',
    isDefault:   false,
    provider:    'claude-code',
  },
  {
    id:          'regex',
    displayName: 'Pattern Matching (без AI)',
    description: 'Regex-экстракция на основе правил — offline, без API',
    tier:        'offline',
    isDefault:   false,
    provider:    'regex',
  },
];

// ─── Prompt ───────────────────────────────────────────────────────────────────

const ENTITY_SYSTEM_PROMPT = `You are a senior UN document knowledge engineer. Extract comprehensive structured knowledge from official UN documents into a knowledge graph. Be thorough — capture every significant entity and relationship. Respond ONLY with valid JSON — no markdown, no explanation.`;

const RELATION_SYSTEM_PROMPT = `You are a UN institutional knowledge analyst with access to the project knowledge base via MCP tools. Your goal is to build a dense, high-quality relationship graph from a UN document. Use MCP tools to enrich with existing knowledge. Your FINAL response must be ONLY valid JSON — no markdown fences, no explanation text.`;

// ── Entity type taxonomy (two-level) ─────────────────────────────────────────
const ENTITY_TYPE_GUIDE = `
ENTITY TYPES — choose the most specific:

AGENTS (who acts):
  Person       — named individual (Secretary-General, Ambassador, Dr. Jane Smith)
  Organization — institution, body, agency (UNDP, Security Council, ACABQ, ICC)
  Actor        — named role/position without specific person (Special Rapporteur, Chair, Focal Point)

ARTIFACTS (what is created):
  Document     — complete document (resolution, report, charter)
  DocumentRef  — reference/citation to another document (A/RES/77/1, S/2024/100)
  Policy       — normative rule, regulation, mandate (Staff Rule 1.2, IPSAS)
  System       — IT system, platform, tool (Umoja, iNeed, Oracle)
  Technology   — technology standard, framework, protocol (AI, blockchain, IPSAS)

CONCEPTS (abstract):
  Concept      — principle, doctrine, abstract idea (sustainable development, human rights)
  Process      — procedural workflow (procurement, recruitment, audit cycle)
  Event        — dated or named occurrence (World Summit, COP28, 79th GA session)

CONTEXT (where/when):
  Location     — geographic entity (New York, Geneva, Member States, Africa)

WORK (tracking):
  WorkItem     — specific task, project, deliverable (ICTS modernization project)`;

// ── Epistemic layer classification ────────────────────────────────────────────
const EPISTEMIC_LAYER_GUIDE = `
EPISTEMIC LAYER — classify based on text markers:

L0_NORMATIVE    — Rules, laws, mandates. Markers: "shall", "must", "requires", "mandates", "decides", "prohibits"
                  Examples: Charter articles, GA/SC resolutions with operative clauses, Staff Rules

L1_STRUCTURAL   — Org structure, hierarchy, composition. Markers: "reports to", "composed of", "established by", "led by", "member of"
                  Examples: Org charts, committee membership, reporting lines, budgetary structure

L2_OPERATIONAL  — Procedures, workflows, how-to. Markers: "procedure", "process", "steps", "workflow", "implement", "execute"
                  Examples: Procurement SOP, recruitment process, financial closure procedure

L3_INFORMATIONAL — Facts, data, outcomes, events. Markers: "reported", "occurred", "noted", "statistics", "as of", "during"
                  Examples: Meeting outcomes, budget figures, staffing numbers, incident reports

L4_ANALYTICAL   — Assessments, recommendations, analysis. Markers: "recommends", "suggests", "finds", "assesses", "gap", "risk"
                  Examples: Audit findings, JIU recommendations, strategic assessments, gap analysis`;

/**
 * Build entity extraction prompt (Phase 1 — no MCP, single turn).
 */
function buildPrompt(text, doc, premarkedEntities = [], extractionMode = 'FULL') {
  const meta = [
    doc.documentTitle ? `Title: ${doc.documentTitle}` : '',
    doc.unSymbol      ? `UN Symbol: ${doc.unSymbol}`   : '',
    doc.documentType  ? `Type: ${doc.documentType}`    : '',
    doc.publishedDate ? `Published: ${doc.publishedDate}` : '',
  ].filter(Boolean).join('\n');

  const entityLegend = premarkedEntities.length > 0
    ? `\nKNOWN ENTITIES (pre-marked in text as [[ENT:id:type:name]]):\n` +
      premarkedEntities.slice(0, 50).map(e =>
        `  - id=${e.id} type=${e.type} name="${e.name}" (×${e.count})`
      ).join('\n') +
      `\n\nFor [[ENT:...]] markers: include with EXACT same "id", set isExisting=true. ` +
      `Prioritize discovering NEW entities not yet marked.\n`
    : '';

  const modeNote = extractionMode === 'SELECTIVE'
    ? '\nNOTE: Text contains only operative/important sections.\n'
    : '';

  const textLimit = premarkedEntities.length > 0 ? 22000 : 18000;

  return `${ENTITY_SYSTEM_PROMPT}

${meta ? `DOCUMENT METADATA:\n${meta}\n` : ''}${ENTITY_TYPE_GUIDE}
${EPISTEMIC_LAYER_GUIDE}
${entityLegend}${modeNote}
DOCUMENT TEXT:
${text.slice(0, textLimit)}

Return a JSON object with EXACTLY this structure:
{
  "summary": "2-4 paragraph executive summary covering mandate, key actors, main outcomes",
  "keyProvisions": ["max 12 key mandates/requirements, one sentence each, verbatim or near-verbatim"],
  "entities": [
    {
      "id": "existing-uuid-if-premarked-else-OMIT-field",
      "type": "Person|Organization|Actor|Document|DocumentRef|Policy|System|Technology|Concept|Process|Event|Location|WorkItem",
      "name": "canonical name (official, full, consistent)",
      "match": "exact text phrase from document",
      "description": "1-2 sentences describing this entity's role/significance in this document",
      "category": "brief category label (e.g. UN Principal Organ, IT Platform, Mandate)",
      "epistemicLayer": "L0_NORMATIVE|L1_STRUCTURAL|L2_OPERATIONAL|L3_INFORMATIONAL|L4_ANALYTICAL",
      "relevance": "HIGH|MEDIUM|LOW",
      "temporal": "ISO year/period if entity is time-bound, else omit",
      "isExisting": false
    }
  ],
  "topics": ["4-8 subject area tags"],
  "documentLanguage": "English|French|Spanish|Arabic|Russian|Chinese",
  "confidence": 0.0-1.0
}

EXTRACTION RULES:
- Include ALL: UN bodies (GA, SC, ECOSOC, Secretariat depts), agencies (UNDP, WFP, UNICEF...), document citations (A/RES/..., S/2024/...), named persons, IT systems (Umoja, iNeed...), geographic regions, key policy concepts
- description: mandatory for HIGH relevance entities; brief for others
- epistemicLayer: use text markers above; default L3_INFORMATIONAL if ambiguous
- For [[ENT:id:type:name]] markers: exact id, isExisting=true
- Max 60 entities; prefer quality over quantity`;
}

/**
 * Build relationship extraction prompt (Phase 2 — MCP enabled, up to 8 turns).
 */
function buildRelationshipPrompt(entities, text, doc) {
  const docMeta = [
    doc.documentTitle ? `Title: ${doc.documentTitle}` : '',
    doc.unSymbol      ? `Symbol: ${doc.unSymbol}`     : '',
    doc.documentType  ? `Type: ${doc.documentType}`   : '',
  ].filter(Boolean).join(' | ');

  const entityList = entities.slice(0, 80)
    .map(e => `  [${e.type}] ${e.name}${e.description ? ` — ${e.description.slice(0, 80)}` : ''}`)
    .join('\n');

  return `${RELATION_SYSTEM_PROMPT}

DOCUMENT: ${docMeta}

ENTITIES EXTRACTED FROM THIS DOCUMENT (${entities.length} total):
${entityList}

DOCUMENT TEXT (full operative excerpt):
${text.slice(0, 14000)}

YOUR TASK: Build a comprehensive relationship graph between the entities above.

RELATIONSHIP TYPE GUIDE (semantic weight in parentheses):
  GOVERNS (1.0)        — direct regulatory authority over an entity
  MANDATES (0.95)      — formal mandate/authorization issued
  IMPLEMENTS (0.95)    — technical realization of a policy/mandate
  ESTABLISHES (0.85)   — creates or founds an entity
  ESTABLISHED_BY (0.85)— was created by an entity
  DEFINES (0.9)        — provides definitional authority
  REQUIRES (0.85)      — creates mandatory dependency
  OVERSEES (0.9)       — supervisory/oversight relationship
  REPORTS_TO (0.8)     — accountability/reporting chain
  PART_OF (0.75)       — structural containment or membership
  CHAIRED_BY (0.75)    — leadership/chairmanship
  AUTHORED_BY (0.7)    — document authorship/creation
  FUNDED_BY (0.65)     — financial dependency
  REFERENCES (0.6)     — explicit citation or reference
  COOPERATES_WITH (0.5)— collaborative relationship
  SUPPORTS (0.5)       — enabling/supporting relationship
  MENTIONS (0.3)       — weak mention without formal link
  RELATED_TO (0.2)     — generic/unclassified

WORKFLOW:
1. Scan document text for explicit relationship statements (parse operative clauses, preamble, annexes).
2. For 3-5 key entities (major orgs, key policies), call search_knowledge to enrich from knowledge base.
   Example: search_knowledge("Security Council OIOS oversight mandate")
3. For suspected institutional relationships, confirm via:
   MATCH (a:ESEntity)-[r]->(b:ESEntity) WHERE toLower(a.name) CONTAINS "entity" RETURN a.name, type(r), b.name, r.confidence LIMIT 10
4. Build relationships: document text first (higher confidence), knowledge base second (lower confidence).
5. Output ONLY the JSON — no preamble, no explanation.

Return ONLY:
{
  "relationships": [
    {
      "sourceEntityName": "exact name matching the list above",
      "targetEntityName": "exact name matching the list above",
      "relationType": "one of the relationship types above",
      "context": "verbatim sentence from document proving this relationship (up to 600 chars) OR 'KB: <knowledge base snippet>'",
      "confidence": 0.0-1.0,
      "bidirectional": false
    }
  ]
}

RULES:
- sourceEntityName / targetEntityName must EXACTLY match names in the list
- Include EVERY relationship you can find with evidence — be thorough
- Prefer specific types over RELATED_TO; use RELATED_TO only when no specific type fits
- confidence: 0.9+ for explicit text, 0.7-0.9 for clear implication, 0.5-0.7 for knowledge-base inference
- bidirectional: true only for peer relationships (COOPERATES_WITH, RELATED_TO)
- Max 60 relationships; no self-loops`;
}

// ─── Claude Code subprocess ────────────────────────────────────────────────────

function findClaudeBinary() {
  const candidates = [
    process.env.CLAUDE_CODE_PATH,
    CLAUDE_BIN,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'AnthropicClaude', 'claude.exe')
      : null,
    'claude',
  ].filter(Boolean);
  for (const p of candidates) {
    if (p === 'claude') return p;
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  return null;
}

// Entity extraction: max-turns 1, no MCP, fast and reliable.
function runClaudeCode(promptText, model, timeoutMs = 600000) {
  const t0 = Date.now();
  const tlog = (msg) => console.log(`[ClaudeCode][+${Date.now()-t0}ms] ${msg}`);
  return new Promise((resolve, reject) => {
    const binary = findClaudeBinary();
    if (!binary) {
      reject(new Error(`Claude Code binary not found. Set CLAUDE_CODE_PATH or install @anthropic-ai/claude-code.`));
      return;
    }
    tlog(`spawn: binary=${binary.slice(-20)} model=${model} promptLen=${promptText.length} cwd=${os.tmpdir()}`);

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--input-format',  'text',
      '--model',         model,
      '--no-session-persistence',
      '--verbose',
      '--max-turns',     '1',
      '--tools',         '',       // Disable all built-in tools — entity extraction must be text-only
      '--strict-mcp-config',       // Ignore all global MCP configs — no server init delays
    ];

    let proc;
    try {
      proc = spawn(binary, args, {
        env: { ...process.env },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: os.tmpdir(),
      });
    } catch (err) {
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
      return;
    }

    let stdoutBuf = '';
    let stderr    = '';
    let result    = null;
    let hasError  = false;

    proc.stdout.on('data', d => {
      stdoutBuf += d.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'result') {
            if (msg.subtype === 'success') result = msg.result || '';
            else hasError = true;
          }
        } catch { /* skip malformed */ }
      }
    });
    proc.stderr.on('data', d => { stderr += d.toString('utf8'); });

    const timer = setTimeout(() => {
      tlog(`TIMEOUT after ${timeoutMs}ms — killing`);
      proc.kill('SIGTERM');
      reject(new Error(`Claude Code timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on('close', code => {
      tlog(`close: code=${code} result=${result !== null ? 'OK' : 'null'} hasError=${hasError} stderr=${stderr.length}B`);
      clearTimeout(timer);
      if (result !== null) { resolve(result); return; }
      if (hasError || code !== 0) {
        reject(new Error(`Claude Code failed (exit ${code}): ${stderr.slice(0, 600)}`));
        return;
      }
      resolve(stdoutBuf.trim());
    });

    proc.on('error', err => {
      tlog(`error: ${err.message}`);
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
    });

    proc.stdin.write(promptText, 'utf8');
    tlog(`stdin written (${promptText.length} chars), waiting for response...`);
    proc.stdin.end();
  });
}

// Relationship extraction: max-turns 5, MCP enabled, --dangerously-skip-permissions
// to allow MCP tool calls without interactive prompts. Runs from PROJECT_ROOT so
// Claude Code can find .mcp.json and start the project-knowledge MCP server.
function runClaudeCodeMCP(promptText, model, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const binary = findClaudeBinary();
    if (!binary) {
      reject(new Error('Claude Code binary not found'));
      return;
    }

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--input-format',  'text',
      '--model',         model,
      '--no-session-persistence',
      '--verbose',
      '--max-turns',     '5',
      '--dangerously-skip-permissions',
    ];

    let proc;
    try {
      proc = spawn(binary, args, {
        env: { ...process.env },
        cwd: PROJECT_ROOT,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(new Error(`Failed to spawn Claude Code (MCP): ${err.message}`));
      return;
    }

    let stdoutBuf = '';
    let stderr    = '';
    let result    = null;
    let hasError  = false;

    proc.stdout.on('data', d => {
      stdoutBuf += d.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'result') {
            if (msg.subtype === 'success') result = msg.result || '';
            else hasError = true;
          }
        } catch { /* skip malformed */ }
      }
    });
    proc.stderr.on('data', d => { stderr += d.toString('utf8'); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Claude Code (MCP) timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      if (result !== null) { resolve(result); return; }
      if (hasError || code !== 0) {
        reject(new Error(`Claude Code (MCP) failed (exit ${code}): ${stderr.slice(0, 400)}`));
        return;
      }
      resolve(stdoutBuf.trim());
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Claude Code (MCP): ${err.message}`));
    });

    proc.stdin.write(promptText, 'utf8');
    proc.stdin.end();
  });
}

function parseClaudeOutput(rawOutput) {
  // Extract JSON from markdown code block if present
  const jsonMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1].trim());
  }
  // Try direct JSON parse
  const trimmed = rawOutput.trim();
  const objStart = trimmed.indexOf('{');
  if (objStart !== -1) {
    return JSON.parse(trimmed.slice(objStart));
  }
  return JSON.parse(trimmed);
}

// ─── API fallback ──────────────────────────────────────────────────────────────

async function runViaAPI(promptText, model) {
  const { getInstance } = require('../llm/LLMProviderService');
  const llm = getInstance();
  const result = await llm.chat(
    [{ role: 'user', content: promptText }],
    { model, maxTokens: 4096, temperature: 0.1, caller: 'extraction_pipeline' }
  );
  const content = Array.isArray(result.content)
    ? result.content.filter(b => b.type === 'text').map(b => b.text).join('')
    : (result.content || '');
  return parseClaudeOutput(content.trim());
}

// ─── Service ───────────────────────────────────────────────────────────────────

class DocumentAIExtractionService {

  get mg() { return require('../memgraph.service'); }

  getAvailableModels() { return AVAILABLE_MODELS; }

  isClaudeCodeAvailable() { return findClaudeBinary() !== null; }

  async extractDocument(docId, text, doc, { model = DEFAULT_MODEL, extractionMode = 'FULL', enablePremark = true } = {}) {
    const isClaudeCode = model === 'claude-code';
    const actualModel  = isClaudeCode ? CLAUDE_CODE_MODEL : model;

    console.log(LOG_PREFIX, `doc=${docId} model=${model} actualModel=${actualModel} chars=${text.length} mode=${extractionMode}`);

    // ── Selective extraction mode (filter to important segments) ────────────
    let effectiveText = text;
    if (extractionMode === 'SELECTIVE') {
      try {
        const { documentStructureService } = require('./document-structure.service');
        let structure = doc.documentStructure;
        if (typeof structure === 'string') {
          try { structure = JSON.parse(structure); } catch { structure = null; }
        }
        if (!structure) {
          structure = documentStructureService.analyzeStructure(text, doc.documentType);
        }
        const importantText = documentStructureService.getImportantText(structure);
        if (importantText) {
          effectiveText = importantText;
          console.log(LOG_PREFIX, `SELECTIVE: ${effectiveText.length}/${text.length} chars`);
        }
      } catch (e) {
        console.warn(LOG_PREFIX, 'Selective mode error, using FULL:', e.message);
      }
    }

    // ── Entity pre-marking ───────────────────────────────────────────────────
    let premarkedText     = effectiveText;
    let premarkedEntities = [];
    if (enablePremark && model !== 'regex') {
      try {
        const { entityPremarkService } = require('./entity-premark.service');
        const pm = await entityPremarkService.premarkText(effectiveText);
        premarkedText     = pm.markedText;
        premarkedEntities = pm.foundEntities;
      } catch (e) {
        console.warn(LOG_PREFIX, 'Pre-marking failed, using unmarked text:', e.message);
      }
    }

    // ── Phase 1: Entity extraction (max-turns 1, no MCP, fast + reliable) ───
    const entityPrompt = buildPrompt(premarkedText, doc, premarkedEntities, extractionMode);
    let parsed;

    let rawPhase1Output = null;
    const binary = findClaudeBinary();
    if (binary) {
      const raw = await runClaudeCode(entityPrompt, actualModel);
      rawPhase1Output = typeof raw === 'string' ? raw.slice(0, 10000) : null;
      if (!raw || (!raw.trim().startsWith('{') && !raw.trim().startsWith('['))) {
        console.error(LOG_PREFIX, `Phase 1 unexpected response (first 200 chars): ${String(raw).slice(0, 200)}`);
      }
      parsed    = parseClaudeOutput(raw);
      console.log(LOG_PREFIX, `Phase 1 OK — ${(parsed.entities || []).length} entities`);
    } else {
      if (isClaudeCode) {
        throw new Error('Claude Code binary not found. Install @anthropic-ai/claude-code.');
      }
      console.warn(LOG_PREFIX, `claude.exe not found, using API for model=${actualModel}`);
      parsed = await runViaAPI(entityPrompt, actualModel);
    }

    const entities = (parsed.entities || [])
      .filter(e => e && e.name && e.type)
      .slice(0, 60)
      .map(e => ({
        id:             e.id && String(e.id).length > 8 ? String(e.id) : uuidv4(),
        type:           e.type,
        name:           String(e.name).trim(),
        match:          String(e.match || e.name).trim(),
        description:    e.description ? String(e.description).trim().slice(0, 300) : null,
        category:       e.category || null,
        epistemicLayer: e.epistemicLayer || 'L3_INFORMATIONAL',
        relevance:      e.relevance || 'MEDIUM',
        temporal:       e.temporal ? String(e.temporal).trim() : null,
        isExisting:     Boolean(e.isExisting),
      }));

    // ── Phase 2: Relationship extraction (max-turns 5, with MCP, non-fatal) ─
    // Runs only if there are enough entities and we're not in regex mode.
    let relationships = [];
    if (binary && model !== 'regex' && entities.length >= 2) {
      try {
        const relPrompt = buildRelationshipPrompt(entities, effectiveText, doc);
        const relRaw    = await runClaudeCodeMCP(relPrompt, actualModel);
        const relParsed = parseClaudeOutput(relRaw);

        const entityNameMap = new Map(entities.map(e => [e.name.toLowerCase(), e.name]));
        relationships = (relParsed.relationships || [])
          .filter(r => r && r.sourceEntityName && r.targetEntityName && r.relationType)
          .filter(r => {
            const ok = entityNameMap.has(String(r.sourceEntityName).trim().toLowerCase())
                    && entityNameMap.has(String(r.targetEntityName).trim().toLowerCase())
                    && r.sourceEntityName.trim().toLowerCase() !== r.targetEntityName.trim().toLowerCase();
            if (!ok) console.warn(LOG_PREFIX, `Rel dropped: "${r.sourceEntityName}" → "${r.targetEntityName}"`);
            return ok;
          })
          .slice(0, 60)
          .map(r => ({
            sourceEntityName: entityNameMap.get(String(r.sourceEntityName).trim().toLowerCase()),
            targetEntityName: entityNameMap.get(String(r.targetEntityName).trim().toLowerCase()),
            relationType:     String(r.relationType).trim().toUpperCase(),
            context:          String(r.context || '').trim().slice(0, 1000),
            confidence:       typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.8,
            bidirectional:    Boolean(r.bidirectional),
          }));

        console.log(LOG_PREFIX, `Phase 2 OK — ${relationships.length} relationships`);
      } catch (e) {
        // Non-fatal: relationship extraction failure must never block entity results
        console.warn(LOG_PREFIX, `Phase 2 (relationships) failed — continuing without: ${e.message}`);
      }
    }

    return {
      entities,
      relationships,
      summary:          parsed.summary          || '',
      keyProvisions:    parsed.keyProvisions     || [],
      topics:           parsed.topics            || [],
      documentLanguage: parsed.documentLanguage  || null,
      confidence:       parsed.confidence        || 0.8,
      model,
      rawPhase1Output,
    };
  }

  async persistResults(docId, result, doc) {
    const now = new Date().toISOString();

    for (const e of result.entities) {
      await this.mg.runQuery(
        `MATCH (d:Document {id: $docId})
         MERGE (em:EntityMention {type: $type, name: $name, documentId: $docId})
         ON CREATE SET em.id             = $id,
                       em.match          = $match,
                       em.description    = $description,
                       em.category       = $cat,
                       em.relevance      = $relevance,
                       em.epistemicLayer = $layer,
                       em.temporal       = $temporal,
                       em.extractedByAI  = true,
                       em.isExisting     = $isExisting,
                       em.createdAt      = $now
         ON MATCH  SET em.match          = $match,
                       em.description    = $description,
                       em.relevance      = $relevance,
                       em.epistemicLayer = $layer,
                       em.extractedByAI  = true,
                       em.isExisting     = $isExisting
         MERGE (d)-[:MENTIONS]->(em)`,
        {
          docId, id: e.id, type: e.type, name: e.name, match: e.match,
          description: e.description || null,
          cat: e.category, relevance: e.relevance,
          layer: e.epistemicLayer || 'L3_INFORMATIONAL',
          temporal: e.temporal || null,
          isExisting: e.isExisting || false, now,
        }
      ).catch(err => console.warn(LOG_PREFIX, 'entity persist:', err.message));
    }

    // Persist entity-entity relationships as RELATED_TO edges between EntityMention nodes.
    // These are later transferred to ES_RELATED_TO edges during Entity Store import.
    for (const rel of (result.relationships || [])) {
      await this.mg.runQuery(
        `MATCH (a:EntityMention {name: $aName, documentId: $docId}),
               (b:EntityMention {name: $bName, documentId: $docId})
         MERGE (a)-[r:RELATED_TO {documentId: $docId, type: $relType}]->(b)
         ON CREATE SET r.context       = $context,
                       r.confidence   = $confidence,
                       r.bidirectional = $bidirectional,
                       r.extractedAt  = $now
         ON MATCH  SET r.context       = $context,
                       r.confidence   = $confidence,
                       r.bidirectional = $bidirectional`,
        {
          docId,
          aName:         rel.sourceEntityName,
          bName:         rel.targetEntityName,
          relType:       rel.relationType,
          context:       rel.context,
          confidence:    rel.confidence,
          bidirectional: rel.bidirectional || false,
          now,
        }
      ).catch(err => console.warn(LOG_PREFIX, 'relation persist:', err.message));
    }
    console.log(LOG_PREFIX, `Persisted ${(result.relationships || []).length} relationships for doc=${docId}`);

    await this.mg.runQuery(
      `MATCH (d:Document {id: $id})
       SET d.aiSummary          = $summary,
           d.aiKeyProvisions    = $provisions,
           d.aiTopics           = $topics,
           d.aiDocumentLanguage = $lang,
           d.aiModel            = $model,
           d.aiExtractedAt      = $now,
           d.updatedAt          = $now`,
      {
        id:         docId,
        summary:    result.summary,
        provisions: JSON.stringify(result.keyProvisions || []),
        topics:     JSON.stringify(result.topics        || []),
        lang:       result.documentLanguage,
        model:      result.model,
        now,
      }
    ).catch(err => console.warn(LOG_PREFIX, 'summary persist:', err.message));
  }
}

const documentAIExtractionService = new DocumentAIExtractionService();
module.exports = { documentAIExtractionService, DocumentAIExtractionService, AVAILABLE_MODELS, DEFAULT_MODEL, CLAUDE_CODE_MODEL, runClaudeCode };
