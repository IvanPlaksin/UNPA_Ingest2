'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * PipelineContext — the single mutable object flowing through all 10 pipeline steps.
 *
 * DOCUMENT mode:  sourceRef is a Document node; adapter is document.adapter
 * WORKSPACE mode: sourceRef is a SourceReference node; adapter is workspace.adapter
 */

const PIPELINE_STEPS = [
  { name: 'load-source',        label: 'Load Source',           required: true  },
  { name: 'ocr-scan',           label: 'OCR Scan',              required: false },
  { name: 'chunk-text',         label: 'Chunk Text',            required: true  },
  { name: 'extract-entities',   label: 'Extract Entities',      required: true  },
  { name: 'extract-relations',  label: 'Extract Relations',     required: false },
  { name: 'extract-specialized',label: 'Extract Specialized',   required: false },
  { name: 'extract-temporal',   label: 'Extract Temporal',      required: false },
  { name: 'deduplicate',        label: 'Deduplicate',           required: true  },
  { name: 'persist-graph',      label: 'Persist Graph',         required: true  },
  { name: 'embed-and-index',    label: 'Embed & Index (Qdrant)',required: true  },
  { name: 'post-process',       label: 'Post-Process',          required: false },
  { name: 'store-result',       label: 'Store Result',          required: true  },
  { name: 'queue-refs',         label: 'Queue References',      required: false },
  { name: 'link-symbol-relations', label: 'Link Symbol Relations', required: false },
];

/**
 * @typedef {Object} PipelineContext
 * @property {string}   mode              - 'DOCUMENT' | 'WORKSPACE'
 * @property {string}   sourceId          - Document.id or SourceReference.id
 * @property {string}   [workspaceId]     - Workspaces only
 * @property {Object}   sourceRef         - Full source node from Memgraph
 * @property {Object}   adapter           - Adapter hooks object
 * @property {Object}   options           - Caller-supplied options
 * @property {string}   [jobId]           - BullMQ job ID (if queued)
 * @property {Object}   [bullJob]         - BullMQ Job instance (for updateProgress)
 * @property {string}   extractionJobId   - UUIDv4 for full traceability across nodes/edges/result
 * @property {string}   [methodologyId]   - Methodology.id used for this extraction (resolved by adapter)
 * @property {Object}   [methodology]     - Full Methodology object (prompts, config, hooks)
 *
 * -- populated by steps --
 * @property {string}   text
 * @property {string[]} chunks
 * @property {Object[]} chunkMetadata    - [{chunkIndex, charOffsetStart, charOffsetEnd, sourceLength}]
 * @property {Object[]} entities
 * @property {Object[]} relations
 * @property {Map}      specializedItems  - type → item[]
 * @property {Map}      persistedIds      - entityName → {nodeId, nodeLabel}
 * @property {Map}      vectorIds         - nodeId → qdrantPointId
 * @property {Object}   postProcessResults
 * @property {string}   resultId
 * @property {Object}   stats
 * @property {Object[]} log
 */

function createContext(mode, sourceId, adapter, options = {}, overrides = {}) {
  const steps = PIPELINE_STEPS.map(s => ({
    name: s.name,
    label: s.label,
    required: s.required,
    status: 'pending',
    startedAt: null,
    completedAt: null,
    duration: null,
    result: null,
    error: null,
  }));

  return {
    mode,
    sourceId,
    workspaceId: options.workspaceId || null,
    sourceRef: null,
    adapter,
    options,
    jobId: options.jobId || null,
    bullJob: options.bullJob || null,
    extractionJobId: options.extractionJobId || uuidv4(),

    // Populated by steps
    text: '',
    chunks: [],
    chunkMetadata: [],
    entities: [],
    relations: [],
    specializedItems: new Map(),
    persistedIds: new Map(),
    vectorIds: new Map(),
    postProcessResults: {},
    resultId: null,

    // Populated by extract-temporal step
    temporalData:      { documentDates: [], mandatePeriod: null },
    supersessionLinks: [],

    stats: {
      textChars: 0,
      chunksCount: 0,
      entitiesExtracted: 0,
      relationsFound: 0,
      specializedByType: {},
      deduplicated: 0,
      vectorsAttempted: 0,
      vectorsIndexed: 0,
      vectorsFailed: 0,
      graphNodesCreated: 0,
      durationMs: 0,
      errors: [],
    },

    log: [],
    steps,
    startedAt: new Date().toISOString(),

    ...overrides,
  };
}

function getStep(ctx, name) {
  return ctx.steps.find(s => s.name === name);
}

function startStep(ctx, name) {
  const s = getStep(ctx, name);
  if (s) { s.status = 'running'; s.startedAt = new Date().toISOString(); }
}

function completeStep(ctx, name, result = null) {
  const s = getStep(ctx, name);
  if (s) {
    s.status = 'completed';
    s.completedAt = new Date().toISOString();
    s.duration = s.startedAt ? Date.now() - new Date(s.startedAt).getTime() : null;
    s.result = result;
  }
}

function failStep(ctx, name, error) {
  const s = getStep(ctx, name);
  if (s) {
    s.status = 'failed';
    s.completedAt = new Date().toISOString();
    s.duration = s.startedAt ? Date.now() - new Date(s.startedAt).getTime() : null;
    s.error = error instanceof Error ? error.message : String(error);
  }
  ctx.stats.errors.push({ step: name, error: s?.error });
}

function skipStep(ctx, name, reason = '') {
  const s = getStep(ctx, name);
  if (s) { s.status = 'skipped'; s.result = { reason }; }
}

function addLog(ctx, step, message, level = 'info') {
  ctx.log.push({ timestamp: new Date().toISOString(), step, message, level });
  if (level === 'error') console.error(`[Pipeline:${ctx.mode}:${step}] ${message}`);
  else console.log(`[Pipeline:${ctx.mode}:${step}] ${message}`);
}

function overallProgress(ctx) {
  const completed = ctx.steps.filter(s => s.status === 'completed' || s.status === 'skipped').length;
  return Math.round((completed / ctx.steps.length) * 100);
}

module.exports = {
  PIPELINE_STEPS,
  createContext,
  getStep,
  startStep,
  completeStep,
  failStep,
  skipStep,
  addLog,
  overallProgress,
};
