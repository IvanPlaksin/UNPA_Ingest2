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

// System prompt for entity extraction (no MCP tools — single turn, fast)
const ENTITY_SYSTEM_PROMPT = `You are a UN document analysis expert. Extract structured knowledge from official UN documents. Respond ONLY with valid JSON — no markdown, no explanation.`;

// System prompt for relationship extraction (MCP tools allowed — multi-turn)
const RELATION_SYSTEM_PROMPT = `You are a UN document relationship analyst with access to the project knowledge base via MCP tools. Identify relationships between entities found in a UN document, enriched with knowledge base context. You may call MCP tools before answering. Your FINAL response must be ONLY valid JSON — no markdown fences, no explanation text.`;

/**
 * Build extraction prompt.
 * @param {string}   text               — document text (possibly pre-marked)
 * @param {object}   doc                — document metadata
 * @param {object[]} premarkedEntities  — entities already found by pre-marking [{id, name, type, count}]
 * @param {string}   extractionMode     — 'FULL' | 'SELECTIVE'
 */
function buildPrompt(text, doc, premarkedEntities = [], extractionMode = 'FULL') {
  const meta = [
    doc.documentTitle ? `Title: ${doc.documentTitle}` : '',
    doc.unSymbol      ? `UN Symbol: ${doc.unSymbol}`   : '',
    doc.documentType  ? `Type: ${doc.documentType}`    : '',
    doc.publishedDate ? `Published: ${doc.publishedDate}` : '',
  ].filter(Boolean).join('\n');

  const entityLegend = premarkedEntities.length > 0
    ? `\nKNOWN ENTITIES (already marked in text as [[ENT:id:type:name]]):\n` +
      premarkedEntities.slice(0, 40).map(e =>
        `  - id=${e.id} type=${e.type} name="${e.name}" (×${e.count})`
      ).join('\n') +
      `\n\nFor entities marked [[ENT:...]] in the text: include them in your "entities" array ` +
      `using the EXACT same "id" field value. Focus your discovery on NEW entities not yet marked.\n`
    : '';

  const modeNote = extractionMode === 'SELECTIVE'
    ? '\nNOTE: This text contains only the important/operative sections of the document.\n'
    : '';

  const textLimit = premarkedEntities.length > 0 ? 18000 : 14000; // marked text is longer

  return `${ENTITY_SYSTEM_PROMPT}

${meta ? `DOCUMENT METADATA:\n${meta}\n` : ''}${entityLegend}${modeNote}
DOCUMENT TEXT:
${text.slice(0, textLimit)}

Return a JSON object with this exact structure:
{
  "summary": "2-3 paragraph executive summary",
  "keyProvisions": ["array of key mandates/requirements, max 10, one sentence each"],
  "entities": [
    {
      "id": "existing-uuid-if-premarked-else-omit",
      "type": "Organization|System|DocumentRef|Person|WorkItem|Technology|Policy|Process",
      "name": "canonical name",
      "match": "exact text from document",
      "category": "short category",
      "relevance": "HIGH|MEDIUM|LOW",
      "isExisting": true
    }
  ],
  "topics": ["3-7 subject area tags"],
  "documentLanguage": "English|French|...",
  "confidence": 0.0-1.0
}

Entity rules: Include ALL UN orgs (UNDP, WFP, OIOS...), document symbols (A/RES/69/262...), IT systems (Umoja, iNeed...), named persons, project names. For [[ENT:id:type:name]] markers, extract the entity WITH the provided id and set isExisting=true. Max 80 entities total.`;
}

/**
 * Build relationship extraction prompt (used in a SEPARATE MCP-enabled subprocess).
 * Receives the entity names already extracted so Claude focuses on linking them.
 */
function buildRelationshipPrompt(entities, text, doc) {
  const docMeta = [
    doc.documentTitle ? `Title: ${doc.documentTitle}` : '',
    doc.unSymbol      ? `Symbol: ${doc.unSymbol}`     : '',
    doc.documentType  ? `Type: ${doc.documentType}`   : '',
  ].filter(Boolean).join(' | ');

  const entityList = entities.slice(0, 60)
    .map(e => `  - ${e.name} (${e.type})`)
    .join('\n');

  return `${RELATION_SYSTEM_PROMPT}

DOCUMENT: ${docMeta}

ENTITIES ALREADY IDENTIFIED IN THIS DOCUMENT:
${entityList}

DOCUMENT TEXT (excerpt):
${text.slice(0, 10000)}

YOUR TASK: Find relationships between the entities listed above.

WORKFLOW:
1. For 2-3 of the most important entities, call search_knowledge (e.g. search_knowledge("UNDP Security Council mandate")) to get knowledge-base background.
2. For suspected pairs, call query_knowledge_graph to confirm:
   MATCH (a)-[r]->(b) WHERE toLower(a.name) CONTAINS "entity_name" RETURN a.name, type(r), b.name LIMIT 8
3. Identify relationships from DOCUMENT TEXT (priority) and from KNOWLEDGE BASE (supplement).
4. Output ONLY the JSON below — no preamble, no explanation.

Return ONLY:
{
  "relationships": [
    {
      "sourceEntityName": "exact name from the entities list above",
      "targetEntityName": "exact name from the entities list above",
      "relationType": "AUTHORED_BY|REFERENCES|ESTABLISHED_BY|MANDATES|OVERSEES|REPORTS_TO|COOPERATES_WITH|FUNDED_BY|CHAIRED_BY|PART_OF|IMPLEMENTS|GOVERNS|RELATED_TO",
      "context": "verbatim sentence from document OR 'Source: knowledge base — <snippet>'",
      "confidence": 0.0-1.0
    }
  ]
}

Rules: sourceEntityName/targetEntityName must exactly match names in the list. Max 40 relationships. Include only relationships with clear textual or knowledge-base evidence.`;
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
function runClaudeCode(promptText, model, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const binary = findClaudeBinary();
    if (!binary) {
      reject(new Error(`Claude Code binary not found. Set CLAUDE_CODE_PATH or install @anthropic-ai/claude-code.`));
      return;
    }

    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--input-format',  'text',
      '--model',         model,
      '--no-session-persistence',
      '--verbose',
      '--max-turns',     '1',
    ];

    let proc;
    try {
      proc = spawn(binary, args, {
        env: { ...process.env },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
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
      proc.kill('SIGTERM');
      reject(new Error(`Claude Code timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      if (result !== null) { resolve(result); return; }
      if (hasError || code !== 0) {
        reject(new Error(`Claude Code failed (exit ${code}): ${stderr.slice(0, 600)}`));
        return;
      }
      resolve(stdoutBuf.trim());
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
    });

    proc.stdin.write(promptText, 'utf8');
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
    { model, maxTokens: 4096, temperature: 0.1 }
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

    const binary = findClaudeBinary();
    if (binary) {
      const raw = await runClaudeCode(entityPrompt, actualModel);
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
      .slice(0, 100)
      .map(e => ({
        id:         e.id && String(e.id).length > 8 ? String(e.id) : uuidv4(),
        type:       e.type,
        name:       String(e.name).trim(),
        match:      String(e.match || e.name).trim(),
        category:   e.category || null,
        relevance:  e.relevance || 'MEDIUM',
        isExisting: Boolean(e.isExisting),
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
          .slice(0, 40)
          .map(r => ({
            sourceEntityName: entityNameMap.get(String(r.sourceEntityName).trim().toLowerCase()),
            targetEntityName: entityNameMap.get(String(r.targetEntityName).trim().toLowerCase()),
            relationType:     String(r.relationType).trim().toUpperCase(),
            context:          String(r.context || '').trim().slice(0, 600),
            confidence:       typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.8,
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
    };
  }

  async persistResults(docId, result, doc) {
    const now = new Date().toISOString();

    for (const e of result.entities) {
      await this.mg.runQuery(
        `MATCH (d:Document {id: $docId})
         MERGE (em:EntityMention {type: $type, name: $name, documentId: $docId})
         ON CREATE SET em.id           = $id,
                       em.match        = $match,
                       em.category     = $cat,
                       em.relevance    = $relevance,
                       em.epistemicLayer = $layer,
                       em.extractedByAI  = true,
                       em.isExisting     = $isExisting,
                       em.createdAt    = $now
         ON MATCH  SET em.match        = $match,
                       em.relevance    = $relevance,
                       em.extractedByAI = true,
                       em.isExisting    = $isExisting
         MERGE (d)-[:MENTIONS]->(em)`,
        {
          docId, id: e.id, type: e.type, name: e.name, match: e.match,
          cat: e.category, relevance: e.relevance, isExisting: e.isExisting || false,
          layer: doc.epistemicLayer || null, now,
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
         ON CREATE SET r.context     = $context,
                       r.confidence  = $confidence,
                       r.extractedAt = $now
         ON MATCH  SET r.context     = $context,
                       r.confidence  = $confidence`,
        {
          docId,
          aName:      rel.sourceEntityName,
          bName:      rel.targetEntityName,
          relType:    rel.relationType,
          context:    rel.context,
          confidence: rel.confidence,
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
module.exports = { documentAIExtractionService, DocumentAIExtractionService, AVAILABLE_MODELS, DEFAULT_MODEL };
