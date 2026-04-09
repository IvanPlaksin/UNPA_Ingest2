/**
 * Input Validation Middleware (PH-001)
 *
 * Zod-based request body validation for sensitive endpoints.
 * Strips unknown fields, enforces max lengths, rejects malformed input.
 *
 * Usage:
 *   router.post('/path', validate('catalogAssistantChat'), handler);
 *
 * @module middleware/input-validator
 */

'use strict';

const { z } = require('zod');

// ──────────────────────────────────────────────────────────────────
// Schemas
// ──────────────────────────────────────────────────────────────────

const MAX_QUERY_LEN = 10000;
const MAX_MESSAGE_LEN = 10000;
const MAX_HISTORY = 50;
const MAX_SELECTION = 100;

const schemas = {

  // POST /api/v1/graph-catalog/assistant/chat
  catalogAssistantChat: z.object({
    query: z.string().min(1).max(MAX_QUERY_LEN),
    sessionHistory: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(50000)
    })).max(MAX_HISTORY).optional().default([]),
    workspaceId: z.string().uuid().optional(),
    workspaceName: z.string().max(200).optional(),
    currentSelection: z.array(z.object({
      id: z.string(),
      name: z.string().max(500).optional(),
      type: z.string().max(100).optional()
    })).max(MAX_SELECTION).optional(),
    mode: z.enum(['tool_selection', 'pattern_analysis', 'graph_design', 'general']).optional(),
    language: z.string().max(20).optional()
  }).strict(),

  // POST /api/v1/workspaces/:id/agent/message
  workspaceAgentMessage: z.object({
    message: z.string().min(1).max(MAX_MESSAGE_LEN)
  }).strict(),

  // POST /api/v1/graph-catalog/patterns/analyze
  patternAnalyze: z.object({
    workspaceId: z.string().uuid(),
    threshold: z.number().min(0).max(1).optional(),
    minNodes: z.number().int().min(1).max(100).optional(),
    maxNodes: z.number().int().min(1).max(500).optional(),
    matchLimit: z.number().int().min(1).max(50).optional()
  }).strict(),

  // POST /api/v1/graph-catalog/patterns/execute-replacement
  patternExecuteReplacement: z.object({
    workspaceId: z.string().uuid(),
    subgraphId: z.string().min(1),
    catalogEntryId: z.string().min(1),
    confirm: z.literal(true)
  }).strict(),

  // POST /api/v1/graph-catalog/patterns/preview-replacement
  patternPreviewReplacement: z.object({
    workspaceId: z.string().uuid(),
    subgraphId: z.string().min(1),
    catalogEntryId: z.string().min(1)
  }).strict(),

  // POST /api/v1/graph-catalog/patterns/match
  patternMatch: z.object({
    subgraph: z.object({
      nodes: z.array(z.any()).optional(),
      edges: z.array(z.any()).optional(),
      textSummary: z.string().max(5000).optional(),
      features: z.record(z.any()).optional()
    }),
    threshold: z.number().min(0).max(1).optional(),
    limit: z.number().int().min(1).max(50).optional()
  }),

  // POST /api/v1/workspaces/:id/validate
  workspaceValidate: z.object({
    rules: z.array(z.string()).max(20).optional(),
    graphType: z.enum(['STRUCTURAL', 'EXECUTABLE', 'CONSTRAINT']).optional(),
    stopOnFirstError: z.boolean().optional()
  }),

  // POST /api/v1/workspaces/:id/contradictions/detect
  detectContradictions: z.object({
    similarityThreshold: z.number().min(0).max(1).optional()
  }),

  // POST /api/v1/workspaces/:id/promotion/execute
  promotionExecute: z.object({
    items: z.array(z.any()).optional(),
    resolutions: z.record(z.any()).optional(),
    targetNamespace: z.string().max(100).optional(),
    skipValidation: z.boolean().optional()
  }),

  // POST /api/v1/workspaces/:id/datasources
  workspaceCreateDataSource: z.object({
    name: z.string().min(1).max(200),
    sourceType: z.enum(['SQL', 'API', 'KB', 'FILE', 'COMPOSITE']),
    namespace: z.string().max(200).optional(),
    graphId: z.string().max(200).optional(),
    config: z.record(z.any()).optional(),
    sqlConfig: z.record(z.any()).optional().nullable(),
    apiConfig: z.record(z.any()).optional().nullable(),
    kbConfig: z.record(z.any()).optional().nullable(),
    fileConfig: z.record(z.any()).optional().nullable(),
    compositeConfig: z.record(z.any()).optional().nullable()
  }),

  // POST /api/v1/workspaces/:id/structural-import
  structuralImport: z.object({
    graphId: z.string().min(1).max(200)
  }).strict()
};

// ──────────────────────────────────────────────────────────────────
// Middleware factory
// ──────────────────────────────────────────────────────────────────

/**
 * Returns an Express middleware that validates req.body against
 * the named schema. Unknown fields are stripped (`.strict()` schemas
 * reject them; non-strict schemas ignore them).
 *
 * On validation failure: 400 with structured error.
 * On success: req.body is replaced with the parsed (sanitised) value.
 *
 * @param {string} schemaName  Key in the `schemas` map
 * @returns {Function} Express middleware
 */
function validate(schemaName) {
  const schema = schemas[schemaName];
  if (!schema) throw new Error(`Unknown validation schema: ${schemaName}`);

  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.issues.map(i => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code
          }))
        }
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate, schemas };
