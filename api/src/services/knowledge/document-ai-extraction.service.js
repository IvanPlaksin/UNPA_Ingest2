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

const SYSTEM_PROMPT = `You are a UN document analysis expert. Extract structured knowledge from official UN documents. Respond ONLY with valid JSON — no markdown, no explanation.`;

function buildPrompt(text, doc) {
  const meta = [
    doc.documentTitle ? `Title: ${doc.documentTitle}` : '',
    doc.unSymbol      ? `UN Symbol: ${doc.unSymbol}`   : '',
    doc.documentType  ? `Type: ${doc.documentType}`    : '',
    doc.publishedDate ? `Published: ${doc.publishedDate}` : '',
  ].filter(Boolean).join('\n');

  return `${SYSTEM_PROMPT}

${meta ? `DOCUMENT METADATA:\n${meta}\n` : ''}
DOCUMENT TEXT (first 12000 chars):
${text.slice(0, 12000)}

Return a JSON object with this exact structure:
{
  "summary": "2-3 paragraph executive summary",
  "keyProvisions": ["array of key mandates/requirements, max 10, one sentence each"],
  "entities": [
    {
      "type": "Organization|System|DocumentRef|Person|WorkItem|Technology|Policy|Process",
      "name": "canonical name",
      "match": "exact text from document",
      "category": "short category",
      "relevance": "HIGH|MEDIUM|LOW"
    }
  ],
  "topics": ["3-7 subject area tags"],
  "documentLanguage": "English|French|...",
  "confidence": 0.0-1.0
}

Entity rules: Include all UN orgs (UNDP, WFP, OIOS...), document symbols (A/RES/69/262...), IT systems (Umoja, iNeed...), named persons, project names. Max 50 entities.`;
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

  async extractDocument(docId, text, doc, { model = DEFAULT_MODEL } = {}) {
    // 'claude-code' = subprocess with default model; specific IDs = subprocess with that model
    const isClaudeCode = model === 'claude-code';
    const actualModel  = isClaudeCode ? CLAUDE_CODE_MODEL : model;

    console.log(LOG_PREFIX, `doc=${docId} model=${model} actualModel=${actualModel} chars=${text.length} claudeExe=${this.isClaudeCodeAvailable()}`);

    const promptText = buildPrompt(text, doc);
    let parsed;

    const binary = findClaudeBinary();
    if (binary) {
      // Claude Code CLI subprocess — always preferred for any Claude model
      const raw = await runClaudeCode(promptText, actualModel);
      parsed    = parseClaudeOutput(raw);
      console.log(LOG_PREFIX, `Claude Code OK — ${(parsed.entities || []).length} entities`);
    } else {
      // claude.exe not found: fall back to direct API only for non-claude-code selections
      if (isClaudeCode) {
        throw new Error('Claude Code binary not found and no API fallback for claude-code mode. Install @anthropic-ai/claude-code.');
      }
      console.warn(LOG_PREFIX, `claude.exe not found, using API for model=${actualModel}`);
      parsed = await runViaAPI(promptText, actualModel);
    }

    const entities = (parsed.entities || [])
      .filter(e => e && e.name && e.type)
      .slice(0, 100)
      .map(e => ({
        id:       uuidv4(),
        type:     e.type,
        name:     String(e.name).trim(),
        match:    String(e.match || e.name).trim(),
        category: e.category || null,
        relevance: e.relevance || 'MEDIUM',
      }));

    return {
      entities,
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
                       em.createdAt    = $now
         ON MATCH  SET em.match        = $match,
                       em.relevance    = $relevance,
                       em.extractedByAI = true
         MERGE (d)-[:MENTIONS]->(em)`,
        {
          docId, id: e.id, type: e.type, name: e.name, match: e.match,
          cat: e.category, relevance: e.relevance,
          layer: doc.epistemicLayer || null, now,
        }
      ).catch(err => console.warn(LOG_PREFIX, 'entity persist:', err.message));
    }

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
