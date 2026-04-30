/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIALOGUE PLUGIN
 * AOPEG plugin for aggregating, normalizing, and indexing development
 * dialogues from Claude Code (JSONL) and Claude.ai (JSON export).
 *
 * Namespace: DIALOGUE
 * Executors: 9 (scaffold — implementations added per task)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { PluginBase, createSimpleExecutor, createSuccessResult, createErrorResult } = require('../plugin-base');
const { dialogueIngestExecutor } = require('./executors/dialogue.ingest');
const { dialogueSanitizeExecutor } = require('./executors/dialogue.sanitize');
const { dialogueStoreExecutor } = require('./executors/dialogue.store');
const { dialogueSegmentExecutor } = require('./executors/dialogue.segment');
const { dialogueSummarizeExecutor } = require('./executors/dialogue.summarize');
const { dialogueEmbedExecutor } = require('./executors/dialogue.embed');
const { dialogueExtractDecisionsExecutor } = require('./executors/dialogue.extract_decisions');
const { dialogueLinkExecutor } = require('./executors/dialogue.link');

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN METADATA
// ────────────────────────────────────────────────────────────────────────────

const PLUGIN_METADATA = {
  name: 'dialogue',
  version: '1.0.0',
  description: 'Dialogue Aggregation Plugin — indexes development conversations for semantic search and ADR extraction',
  author: 'UNPA Team',
  domain: 'dialogue',
};

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR STUBS — real implementations added in Phase 1/2 tasks
// ────────────────────────────────────────────────────────────────────────────

// dialogue.ingest — real implementation from executors/
const ingestExecutor = dialogueIngestExecutor;

// dialogue.sanitize — real implementation
const sanitizeExecutor = dialogueSanitizeExecutor;

// dialogue.summarize — real implementation
const summarizeExecutor = dialogueSummarizeExecutor;

// dialogue.extract_decisions — real implementation
const extractDecisionsExecutor = dialogueExtractDecisionsExecutor;

// dialogue.link_entities — real implementation (dialogue.link)
const linkEntitiesExecutor = dialogueLinkExecutor;

// dialogue.embed — real implementation
const embedExecutor = dialogueEmbedExecutor;

// dialogue.store — real implementation
const storeExecutor = dialogueStoreExecutor;

// dialogue.segment — real implementation
const segmentExecutorReal = dialogueSegmentExecutor;

const searchExecutor = createSimpleExecutor({
  type: 'dialogue.search',
  displayName: 'Search Dialogue History',
  description: 'Hybrid semantic + keyword search across indexed dialogue corpus',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      topK: { type: 'number', default: 10, description: 'Number of results' },
      source: { type: 'string', enum: ['claude_code', 'claude_ai', 'all'], default: 'all' },
    },
  },
  async execute(_params, _context) {
    return createErrorResult('NOT_IMPLEMENTED', 'dialogue.search not yet implemented (TASK-DLG-P2-007)', true);
  },
});

const getContextExecutor = createSimpleExecutor({
  type: 'dialogue.get_context',
  displayName: 'Get Dialogue Context',
  description: 'Retrieve recent dialogue context relevant to current work (for agent pre-loading)',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Current work topic or task ID' },
      maxSessions: { type: 'number', default: 5, description: 'Maximum sessions to return' },
    },
  },
  async execute(_params, _context) {
    return createErrorResult('NOT_IMPLEMENTED', 'dialogue.get_context not yet implemented (TASK-DLG-P2-007)', true);
  },
});

// ────────────────────────────────────────────────────────────────────────────
// DIALOGUE PLUGIN CLASS
// ────────────────────────────────────────────────────────────────────────────

class DialoguePlugin extends PluginBase {
  constructor() {
    super(PLUGIN_METADATA);
  }

  async initialize() {
    console.log('[DialoguePlugin] Initializing...');

    this.addExecutor(ingestExecutor);
    this.addExecutor(sanitizeExecutor);
    this.addExecutor(summarizeExecutor);
    this.addExecutor(extractDecisionsExecutor);
    this.addExecutor(linkEntitiesExecutor);
    this.addExecutor(embedExecutor);
    this.addExecutor(storeExecutor);
    this.addExecutor(segmentExecutorReal);
    this.addExecutor(searchExecutor);
    this.addExecutor(getContextExecutor);

    console.log('[DialoguePlugin] Initialized with 10 executors (Phase 1 complete, P2-002 summarize done)');
  }

  async cleanup() {
    console.log('[DialoguePlugin] Cleaning up...');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

const dialoguePlugin = new DialoguePlugin();

module.exports = {
  DialoguePlugin,
  dialoguePlugin,
  executors: {
    ingest: ingestExecutor,
    sanitize: sanitizeExecutor,
    summarize: summarizeExecutor,
    extractDecisions: dialogueExtractDecisionsExecutor,
    linkEntities: linkEntitiesExecutor,
    embed: embedExecutor,
    store: storeExecutor,
    segment: segmentExecutorReal,
    search: searchExecutor,
    getContext: getContextExecutor,
  },
};
