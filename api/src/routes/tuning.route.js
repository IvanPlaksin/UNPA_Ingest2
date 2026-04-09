/**
 * @fileoverview API Routes for Pipeline Tuning
 * @module routes/tuning
 * @version 1.0.0
 */

'use strict';

const express = require('express');
const router = express.Router();

const { getTuningAgent, SESSION_STATES, OPTIMIZATION_STRATEGIES } = require('../services/extraction/tuning/tuning-agent');
const { getMetricsCollector } = require('../services/extraction/tuning/metrics-collector');
const { getQualityEvaluator } = require('../services/extraction/evaluation/quality-evaluator');
const { getConfigLoader, initConfigLoader } = require('../services/extraction/config/config-loader');
const { getTunableParameters, getConfig } = require('../services/extraction/config/pipeline-config');
const { validateConfig } = require('../services/extraction/config/parameter-schema');
const { getCachedConfig, invalidateConfig, CACHE_TTL } = require('../services/redis.service');

// Import extraction services
let EntityExtractor, extractRelationships;
try {
  const entityModule = require('../services/extraction/entity-extractor');
  EntityExtractor = entityModule.EntityExtractor;
  const relModule = require('../services/extraction/relationship-extractor');
  extractRelationships = relModule.extractRelationships;
} catch (e) {
  console.warn('[Tuning] Extraction services not available:', e.message);
}

// Import LLM provider manager
const {
  getStatus: getLLMStatus,
  forceProvider,
  getActiveProviderName,
  extractEntitiesWithLLM
} = require('../services/extraction/llm-provider');
const { getProviderMeta, checkAllProviders } = require('../services/extraction/providers');

// Initialize services
let tuningAgent;
let metricsCollector;
let qualityEvaluator;
let configLoader;

async function ensureInitialized() {
  if (!configLoader) {
    configLoader = await initConfigLoader();
  }
  if (!tuningAgent) {
    tuningAgent = getTuningAgent();
    metricsCollector = getMetricsCollector();
    qualityEvaluator = getQualityEvaluator();

    tuningAgent.setEvaluator(qualityEvaluator);
    tuningAgent.setMetricsCollector(metricsCollector);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TUNING SESSION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Start a new tuning session
 * POST /api/v1/tuning/start
 */
router.post('/start', async (req, res) => {
  try {
    await ensureInitialized();

    const {
      maxIterations = 50,
      targetMetric = 'f1_score',
      strategy = OPTIMIZATION_STRATEGIES.BAYESIAN,
      parameters = null,
      goldenDataset = null
    } = req.body;

    const session = await tuningAgent.startSession({
      maxIterations,
      targetMetric,
      strategy,
      parameters,
      goldenDataset
    });

    res.json({
      success: true,
      sessionId: session.id,
      state: session.state,
      config: {
        maxIterations: session.maxIterations,
        targetMetric: session.targetMetric,
        strategy: session.strategy,
        tunableParameters: session.tunableParameters.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Run one tuning iteration
 * POST /api/v1/tuning/:sessionId/iterate
 */
router.post('/:sessionId/iterate', async (req, res) => {
  try {
    await ensureInitialized();

    const status = tuningAgent.getStatus();
    if (!status.active || status.sessionId !== req.params.sessionId) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or not active'
      });
    }

    const result = await tuningAgent.iterate();

    res.json({
      success: true,
      result,
      status: tuningAgent.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Run automatic tuning
 * POST /api/v1/tuning/auto
 */
router.post('/auto', async (req, res) => {
  try {
    await ensureInitialized();

    const {
      maxIterations = 30,
      targetMetric = 'f1_score',
      strategy = OPTIMIZATION_STRATEGIES.BAYESIAN,
      goldenDataset = null,
      iterationDelay = 100
    } = req.body;

    // Always start a fresh session for /auto endpoint
    const status = tuningAgent.getStatus();
    if (status.active && status.state === 'running') {
      // Stop current running session first
      await tuningAgent.stop(false);
    }

    // Start new session
    await tuningAgent.startSession({
      maxIterations,
      targetMetric,
      strategy,
      goldenDataset
    });

    const results = await tuningAgent.runAutomatic({ iterationDelay });

    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get tuning session history
 * GET /api/v1/tuning/:sessionId/history
 */
router.get('/:sessionId/history', async (req, res) => {
  try {
    await ensureInitialized();

    const status = tuningAgent.getStatus();
    if (!status.active || status.sessionId !== req.params.sessionId) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      history: tuningAgent.getHistory()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Export tuning session results
 * GET /api/v1/tuning/:sessionId/export
 */
router.get('/:sessionId/export', async (req, res) => {
  try {
    await ensureInitialized();

    const sessionData = tuningAgent.exportSession();

    res.json({
      success: true,
      session: sessionData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Pause tuning session
 * POST /api/v1/tuning/:sessionId/pause
 */
router.post('/:sessionId/pause', async (req, res) => {
  try {
    await ensureInitialized();
    tuningAgent.pause();

    res.json({
      success: true,
      status: tuningAgent.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Resume tuning session
 * POST /api/v1/tuning/:sessionId/resume
 */
router.post('/:sessionId/resume', async (req, res) => {
  try {
    await ensureInitialized();
    tuningAgent.resume();

    res.json({
      success: true,
      status: tuningAgent.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Stop tuning session
 * POST /api/v1/tuning/:sessionId/stop
 */
router.post('/:sessionId/stop', async (req, res) => {
  try {
    await ensureInitialized();

    const { applyBest = true } = req.body;
    await tuningAgent.stop(applyBest);

    res.json({
      success: true,
      message: applyBest ? 'Best configuration applied' : 'Session stopped without applying changes',
      status: tuningAgent.getStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get current tuning status
 * GET /api/v1/tuning/status
 */
router.get('/status', async (req, res) => {
  try {
    await ensureInitialized();

    res.json({
      success: true,
      status: tuningAgent.getStatus(),
      availableStrategies: Object.values(OPTIMIZATION_STRATEGIES),
      sessionStates: Object.values(SESSION_STATES)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get current configuration (cached for 5 minutes)
 * GET /api/v1/tuning/config
 */
router.get('/config', async (req, res) => {
  try {
    await ensureInitialized();

    const computeConfig = async () => ({
      config: configLoader.getCurrent(),
      profile: configLoader.currentProfile
    });

    const { data, cached } = await getCachedConfig('tuning-config', computeConfig);

    res.json({
      success: true,
      ...data,
      cached,
      cacheInfo: cached ? 'Result from Redis cache (TTL: 300s)' : 'Fresh result'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update configuration
 * PUT /api/v1/tuning/config
 */
router.put('/config', async (req, res) => {
  try {
    await ensureInitialized();

    const { updates, persist = true } = req.body;

    // Validate updates
    const validation = validateConfig(updates);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid configuration',
        errors: validation.errors
      });
    }

    const updated = await configLoader.update(updates, persist);

    // Invalidate config cache
    await invalidateConfig('tuning-config');

    res.json({
      success: true,
      config: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get tunable parameters (cached for 5 minutes - static data)
 * GET /api/v1/tuning/parameters
 */
router.get('/parameters', async (req, res) => {
  try {
    const computeParams = async () => getTunableParameters();
    const { data, cached } = await getCachedConfig('tuning-parameters', computeParams);

    res.json({
      success: true,
      parameters: data,
      cached,
      cacheInfo: cached ? 'Result from Redis cache (TTL: 300s)' : 'Fresh result'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * List configuration profiles (cached for 2 minutes)
 * GET /api/v1/tuning/profiles
 */
router.get('/profiles', async (req, res) => {
  try {
    await ensureInitialized();

    const computeProfiles = async () => ({
      profiles: await configLoader.listProfiles(),
      currentProfile: configLoader.currentProfile
    });

    const { data, cached } = await getCachedConfig('tuning-profiles', computeProfiles, CACHE_TTL.CONFIG_LIST);

    res.json({
      success: true,
      ...data,
      cached,
      cacheInfo: cached ? 'Result from Redis cache (TTL: 120s)' : 'Fresh result'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Load configuration profile
 * POST /api/v1/tuning/profiles/:name/load
 */
router.post('/profiles/:name/load', async (req, res) => {
  try {
    await ensureInitialized();

    const config = await configLoader.loadProfile(req.params.name);

    // Invalidate config cache since active config changed
    await invalidateConfig('tuning-config');

    res.json({
      success: true,
      config,
      profile: req.params.name
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Save configuration profile
 * POST /api/v1/tuning/profiles/:name/save
 */
router.post('/profiles/:name/save', async (req, res) => {
  try {
    await ensureInitialized();

    const { config } = req.body;
    await configLoader.saveProfile(req.params.name, config || null);

    // Invalidate profiles cache
    await invalidateConfig('tuning-profiles');

    res.json({
      success: true,
      message: `Profile '${req.params.name}' saved`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Reset configuration to defaults
 * POST /api/v1/tuning/config/reset
 */
router.post('/config/reset', async (req, res) => {
  try {
    await ensureInitialized();

    const { persist = true } = req.body;
    const config = await configLoader.reset(persist);

    // Invalidate config cache
    await invalidateConfig('tuning-config');

    res.json({
      success: true,
      config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// METRICS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get metrics aggregates
 * GET /api/v1/tuning/metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    await ensureInitialized();

    res.json({
      success: true,
      aggregates: metricsCollector.getAggregates()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get metric trend
 * GET /api/v1/tuning/metrics/:metricName/trend
 */
router.get('/metrics/:metricName/trend', async (req, res) => {
  try {
    await ensureInitialized();

    const windowSize = parseInt(req.query.window) || 10;
    const trend = metricsCollector.getTrend(req.params.metricName, windowSize);

    res.json({
      success: true,
      metric: req.params.metricName,
      trend
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get best performing run
 * GET /api/v1/tuning/metrics/best
 */
router.get('/metrics/best', async (req, res) => {
  try {
    await ensureInitialized();

    const metric = req.query.metric || 'f1_score';
    const minimize = req.query.minimize === 'true';
    const bestRun = metricsCollector.getBestRun(metric, minimize);

    res.json({
      success: true,
      bestRun
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate current configuration
 * POST /api/v1/tuning/evaluate
 */
router.post('/evaluate', async (req, res) => {
  try {
    await ensureInitialized();

    const { goldenDataset, pipelineResult } = req.body;
    const config = configLoader.getCurrent();

    const evaluation = await qualityEvaluator.evaluate(config, {
      goldenDataset,
      pipelineResult
    });

    res.json({
      success: true,
      evaluation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get improvement recommendations
 * POST /api/v1/tuning/recommendations
 */
router.post('/recommendations', async (req, res) => {
  try {
    await ensureInitialized();

    const { evaluation } = req.body;

    if (!evaluation) {
      return res.status(400).json({
        success: false,
        error: 'Evaluation results required'
      });
    }

    const recommendations = qualityEvaluator.generateRecommendations(evaluation);

    res.json({
      success: true,
      recommendations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Compare two configurations
 * POST /api/v1/tuning/compare
 */
router.post('/compare', async (req, res) => {
  try {
    await ensureInitialized();

    const { config1, config2, goldenDataset } = req.body;

    if (!config1 || !config2) {
      return res.status(400).json({
        success: false,
        error: 'Both configurations required'
      });
    }

    const comparison = await qualityEvaluator.compareConfigs(config1, config2, goldenDataset);

    res.json({
      success: true,
      comparison
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXTRACTION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract entities and relationships from text
 * POST /api/v1/tuning/extract
 */
router.post('/extract', async (req, res) => {
  try {
    await ensureInitialized();

    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    if (!EntityExtractor || !extractRelationships) {
      return res.status(503).json({
        success: false,
        error: 'Extraction services not available'
      });
    }

    const config = configLoader.getCurrent();

    // Extract entities
    const entityExtractor = new EntityExtractor({
      useLLM: config?.entityExtraction?.llm?.enabled ?? true,
      minConfidence: config?.entityExtraction?.minConfidence ?? 0.6,
    });

    const extractionResult = await entityExtractor.extract(text);

    // EntityExtractor.extract() returns { entities: [], relationships: [], stats: {} }
    const entities = extractionResult.entities || [];

    // Extract additional relationships using the function
    const additionalRelationships = extractRelationships(text, entities, {
      minConfidence: config?.relationshipExtraction?.patterns?.minConfidence ?? 0.5,
    });

    // Merge relationships from entity extraction and relationship extraction
    const relationships = [
      ...(extractionResult.relationships || []),
      ...additionalRelationships
    ];

    res.json({
      success: true,
      entities,
      relationships,
      meta: {
        entityCount: entities.length,
        relationshipCount: relationships.length,
        textLength: text.length,
        stats: extractionResult.stats,
        config: {
          entityMinConfidence: config?.entityExtraction?.minConfidence,
          llmEnabled: config?.entityExtraction?.llm?.enabled,
        }
      }
    });

  } catch (error) {
    console.error('[Tuning] Extraction error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LLM PROVIDER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get LLM provider status (cached for 2 minutes)
 * GET /api/v1/tuning/providers
 */
router.get('/providers', async (req, res) => {
  try {
    const computeProviders = async () => {
      const status = await getLLMStatus();
      const meta = getProviderMeta();
      const availability = await checkAllProviders();

      return {
        active: status.active,
        lastCheck: status.lastCheck,
        providers: meta.map(p => ({
          ...p,
          available: availability[p.name] || false
        }))
      };
    };

    const { data, cached } = await getCachedConfig('tuning-providers', computeProviders, CACHE_TTL.CONFIG_LIST);

    res.json({
      success: true,
      ...data,
      cached,
      cacheInfo: cached ? 'Result from Redis cache (TTL: 120s)' : 'Fresh result'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Set active LLM provider
 * POST /api/v1/tuning/providers/:name/select
 */
router.post('/providers/:name/select', async (req, res) => {
  try {
    const { name } = req.params;
    const success = await forceProvider(name);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: `Provider '${name}' not available or not found`
      });
    }

    // Invalidate providers cache since active changed
    await invalidateConfig('tuning-providers');

    res.json({
      success: true,
      active: name,
      message: `Switched to ${name} provider`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test extraction with specific provider
 * POST /api/v1/tuning/providers/:name/test
 */
router.post('/providers/:name/test', async (req, res) => {
  try {
    const { name } = req.params;
    const { text } = req.body;

    if (!text || text.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Text is required (minimum 10 characters)'
      });
    }

    // Force select the provider
    const selected = await forceProvider(name);
    if (!selected) {
      return res.status(400).json({
        success: false,
        error: `Provider '${name}' not available`
      });
    }

    // Extract with the selected provider
    const startTime = Date.now();
    const result = await extractEntitiesWithLLM(text);
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      provider: result.provider,
      entities: result.entities,
      relationships: result.relationships,
      meta: {
        entityCount: result.entities.length,
        relationshipCount: result.relationships.length,
        durationMs: duration
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
