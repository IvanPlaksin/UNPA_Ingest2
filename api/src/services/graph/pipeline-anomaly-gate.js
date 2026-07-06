/**
 * Pipeline Anomaly Gate
 * Validates intermediate results at each stage of GXE graph generation pipelines.
 * When an anomaly is detected, halts the pipeline and optionally sends
 * stage context to Claude for diagnosis.
 */

'use strict';

const { getScopedProvider } = require('../llm-access-control.service');
const llmProvider = getScopedProvider('graph_services');

// ═══════════════════════════════════════════════════════════════════════════
// DAG GENERATION PIPELINE THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

const DAG_THRESHOLDS = {
  intent: {
    check(result) {
      if (!result) return { anomaly: true, reason: 'Intent classification returned null' };
      if (result.confidence < 0.4) {
        return { anomaly: true, reason: `Intent confidence too low: ${(result.confidence * 100).toFixed(1)}% (threshold: 40%)` };
      }
      return { anomaly: false };
    }
  },

  toolResolution: {
    check(result) {
      if (!result) return { anomaly: true, reason: 'Tool resolution returned null' };
      if (result.totalResolved === 0) return { anomaly: true, reason: 'No tools resolved for this intent' };
      if (result.completeness && result.completeness.score < 0.5) {
        return { anomaly: true, reason: `Tool completeness too low: ${(result.completeness.score * 100).toFixed(1)}% (threshold: 50%)` };
      }
      return { anomaly: false };
    }
  },

  taskPlanning: {
    check(taskPlan, planValidation) {
      if (!taskPlan) return { anomaly: true, reason: 'Task planning returned null' };
      if (!taskPlan.steps || taskPlan.steps.length === 0) {
        return { anomaly: true, reason: 'Task plan has no steps' };
      }
      if (planValidation && !planValidation.valid) {
        const critical = (planValidation.errors || []).filter(e =>
          e.code === 'CIRCULAR_DEPENDENCY' || e.code === 'NO_OUTPUTS'
        );
        if (critical.length > 0) {
          return { anomaly: true, reason: `Task plan critical errors: ${critical.map(e => e.message).join('; ')}` };
        }
      }
      const noOut = taskPlan.steps.filter(s => !s.outputs || s.outputs.length === 0);
      if (noOut.length > taskPlan.steps.length * 0.5) {
        return { anomaly: true, reason: `${noOut.length}/${taskPlan.steps.length} steps have no outputs` };
      }
      return { anomaly: false };
    }
  },

  generation: {
    check(result) {
      if (!result) return { anomaly: true, reason: 'Graph generation returned null' };
      if (!result.data) return { anomaly: true, reason: 'Graph generation data is null (JSON parse failure?)' };
      if ((result.data.nodes || []).length === 0) return { anomaly: true, reason: 'Generated graph has 0 nodes' };
      return { anomaly: false };
    }
  },

  compilation: {
    check(compiled) {
      if (!compiled) return { anomaly: true, reason: 'Graph compilation returned null' };
      if (!compiled.compiled) {
        return { anomaly: true, reason: `Graph compilation failed: ${compiled.error || 'unknown error'}` };
      }
      if (!compiled.nodes || compiled.nodes.length === 0) {
        return { anomaly: true, reason: 'Compiled graph has 0 nodes' };
      }
      return { anomaly: false };
    }
  },

  validation: {
    check(validation) {
      if (!validation) return { anomaly: true, reason: 'Validation returned null' };
      const criticalCodes = ['GRAPH_HAS_CYCLES', 'NO_ENTRY_NODE', 'NO_EXIT_NODE', 'EMPTY_GRAPH'];
      const critical = (validation.errors || []).filter(e => criticalCodes.includes(e.code));
      if (critical.length > 0) {
        return { anomaly: true, reason: `Critical validation errors: ${critical.map(e => `${e.code}: ${e.message}`).join('; ')}` };
      }
      return { anomaly: false };
    }
  },

  quality: {
    check(metrics) {
      if (!metrics) return { anomaly: true, reason: 'Quality metrics returned null' };
      if (metrics.overall && metrics.overall.score < 0.5) {
        return {
          anomaly: true,
          soft: true, // Graph still returned, anomaly is a warning
          reason: `Quality score too low: ${(metrics.overall.score * 100).toFixed(1)}% (grade: ${metrics.overall.grade}, threshold: 50%)`
        };
      }
      return { anomaly: false };
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// KNOWLEDGE GRAPH PIPELINE THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

const KG_THRESHOLDS = {
  parse: {
    check(parseResult, parseStats) {
      if (!parseStats) return { anomaly: true, reason: 'Parse stage returned no stats' };
      if (parseStats.sentences !== undefined && parseStats.sentences < 1 && !parseStats.fallback) {
        return { anomaly: true, reason: `Parse produced 0 sentences from ${parseStats.originalLength || 0} chars of input` };
      }
      return { anomaly: false };
    }
  },

  chunk: {
    check(chunks) {
      if (!chunks || chunks.length === 0) return { anomaly: true, reason: 'Chunking produced 0 chunks' };
      return { anomaly: false };
    }
  },

  extract: {
    check(allEntities, allRelations, extractStats) {
      if (allEntities.length === 0) {
        const hint = extractStats?.method === 'hybrid'
          ? ' — check that LLM backend (Ollama or Gemini) is reachable'
          : '';
        return { anomaly: true, reason: `Extraction produced 0 entities across ${extractStats?.chunks || 0} chunks${hint}` };
      }
      // Heuristic: detect garbage extraction — all entities same type (e.g., all "Person")
      if (allEntities.length >= 3) {
        const types = allEntities.map(e => (e.type || 'unknown').toLowerCase());
        const uniqueTypes = new Set(types);
        if (uniqueTypes.size === 1 && allEntities.length > 5) {
          return { anomaly: true, reason: `All ${allEntities.length} entities have the same type "${types[0]}" — likely misclassified extraction` };
        }
        // Heuristic: detect very short entity names (random text fragments)
        const shortNames = allEntities.filter(e => (e.name || '').trim().length <= 2);
        if (shortNames.length > allEntities.length * 0.5) {
          return { anomaly: true, reason: `${shortNames.length}/${allEntities.length} entities have names ≤2 chars — likely noisy extraction` };
        }
      }
      // Heuristic: entities without any relations suggests missed context
      if (allRelations.length === 0 && allEntities.length > 2) {
        return { anomaly: true, reason: `Extracted ${allEntities.length} entities but 0 relations — model failed to identify relationships` };
      }
      return { anomaly: false };
    }
  },

  deduplicate: {
    check(dedupStats) {
      if (!dedupStats) return { anomaly: true, reason: 'Dedup stats missing' };
      if (dedupStats.entitiesAfter === 0) {
        return { anomaly: true, reason: 'All entities removed during deduplication' };
      }
      if (dedupStats.entitiesBefore > 0) {
        const ratio = dedupStats.entitiesRemoved / dedupStats.entitiesBefore;
        if (ratio > 0.8) {
          return { anomaly: true, reason: `Deduplication removed ${(ratio * 100).toFixed(0)}% of entities (${dedupStats.entitiesRemoved}/${dedupStats.entitiesBefore}) — likely noisy input` };
        }
      }
      return { anomaly: false };
    }
  },

  graphBuild: {
    check(nodes, edges) {
      if (!nodes || nodes.length === 0) return { anomaly: true, reason: 'Graph build produced 0 nodes' };
      if (!edges || edges.length === 0) return { anomaly: true, reason: 'Graph build produced 0 edges (no relationships)' };
      return { anomaly: false };
    }
  },

  aiAnalysis: {
    check(analysis) {
      if (!analysis) return { anomaly: false }; // AI analysis is optional, skip if unavailable
      if (analysis.completenessScore != null && analysis.completenessScore < 20) {
        return {
          anomaly: true,
          soft: true,
          reason: `AI analysis completeness score critically low: ${analysis.completenessScore}% — ${analysis.summary || 'extraction quality unacceptable'}`
        };
      }
      // Check if AI explicitly flagged the extraction as failed
      if (analysis.missingEntities && analysis.incorrectEntities) {
        const incorrect = analysis.incorrectEntities.length;
        const total = (analysis.missingEntities.length + incorrect);
        if (incorrect > 0 && total > 0 && incorrect / total > 0.5) {
          return {
            anomaly: true,
            soft: true,
            reason: `AI analysis found ${incorrect} incorrect entities out of ${total} total issues — extraction produced mostly garbage`
          };
        }
      }
      return { anomaly: false };
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE ANOMALY ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

const ANALYSIS_TIMEOUT_MS = 15000;

/**
 * Analyze an anomaly with Claude to get diagnosis and suggestions.
 * @param {Object} context - { pipeline, stageName, anomalyReason, stageInput, stageOutput, taskDescription }
 * @param {Object} [config] - optional, { model } — provider resolved via LLMProviderService
 * @returns {Promise<Object>} { diagnosis, rootCause, suggestedFix, severity, analysisAvailable }
 */
async function analyzeAnomalyWithClaude(context, config = {}) {
  const model = config.model || 'haiku';

  const systemPrompt = `You are a pipeline diagnostics expert analyzing anomalies in a graph generation pipeline.
You receive context about a stage failure and must provide a structured diagnosis.

Respond ONLY in JSON format:
{
  "diagnosis": "<1-2 sentence explanation of what went wrong>",
  "rootCause": "<most likely root cause: 'bad_input' | 'model_failure' | 'threshold_mismatch' | 'data_quality' | 'configuration' | 'edge_case'>",
  "suggestedFix": "<actionable suggestion for the user>",
  "severity": "<'critical' | 'warning' | 'info'>"
}`;

  const userMessage = `Pipeline: ${context.pipeline.toUpperCase()} Graph Generation
Stage: ${context.stageName}
Anomaly: ${context.anomalyReason}

Task/Input text (truncated):
${(context.taskDescription || '').substring(0, 1500)}

Stage Input (truncated):
${JSON.stringify(context.stageInput, null, 2).substring(0, 2000)}

Stage Output (truncated):
${JSON.stringify(context.stageOutput, null, 2).substring(0, 2000)}

Diagnose what went wrong and suggest a fix.`;

  try {
    const charToTokens = (c) => Math.ceil(c / 4);
    const sysT = charToTokens(systemPrompt.length);
    const msgT = charToTokens(userMessage.length);
    console.log(`[AnomalyGate Stats] ── Anomaly Analysis ──`);
    console.log(`[AnomalyGate Stats]   Model: ${model}, System: ${sysT} tokens, Message: ${msgT} tokens, TOTAL: ≈${sysT + msgT} input tokens`);

    const llmResp = await Promise.race([
      llmProvider.chat([{ role: 'user', content: userMessage }], {
        model,
        maxTokens: 1024,
        system: systemPrompt,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Anomaly analysis timeout')), ANALYSIS_TIMEOUT_MS))
    ]);

    const text = llmResp.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { ...parsed, analysisAvailable: true };
    }

    return {
      diagnosis: text.substring(0, 500),
      rootCause: 'unknown',
      suggestedFix: 'Review the stage input and output data manually',
      severity: 'warning',
      analysisAvailable: true
    };
  } catch (err) {
    console.warn(`[AnomalyGate] Claude analysis failed: ${err.message}`);
    return {
      diagnosis: `Anomaly detected but Claude analysis failed: ${err.message}`,
      rootCause: 'unknown',
      suggestedFix: 'Review the anomaly reason and stage data manually',
      severity: 'warning',
      analysisAvailable: false,
      analysisError: err.message
    };
  }
}

module.exports = {
  DAG_THRESHOLDS,
  KG_THRESHOLDS,
  analyzeAnomalyWithClaude,
  ANALYSIS_TIMEOUT_MS
};
