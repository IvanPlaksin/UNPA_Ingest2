/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AINFRA CONTROLLER
 * REST API endpoints for AI Infrastructure configuration management
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { getAINFRAService, DEFAULT_PROVIDER_CONFIGS } = require('../services/ai/ainfra.service');
const { getAIUsageMonitor } = require('../services/ai/ai-usage-monitor.service');
const { getCachedConfig, invalidateConfig, CACHE_TTL } = require('../services/redis.service');

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Timeout wrapper
// ────────────────────────────────────────────────────────────────────────────

function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Get default fallback status
// ────────────────────────────────────────────────────────────────────────────

function getDefaultStatus(currentUsage) {
  return {
    config: {
      name: 'default',
      description: 'Default AI Configuration (fallback)',
      providers: DEFAULT_PROVIDER_CONFIGS,
      isActive: true,
    },
    usage: currentUsage,
    alerts: [],
    timestamp: new Date().toISOString(),
    isFallback: true,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// CONFIGURATION SETS
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/ainfra/configs
 * List all configuration sets (cached for 2 minutes)
 */
exports.listConfigSets = async (req, res) => {
  try {
    const computeConfigList = async () => {
      const service = getAINFRAService();
      return service.listConfigSets();
    };

    const { data, cached } = await getCachedConfig('ainfra-config-list', computeConfigList, CACHE_TTL.CONFIG_LIST);

    res.json({
      success: true,
      data,
      cached,
      cacheInfo: cached ? 'Result from Redis cache (TTL: 120s)' : 'Fresh result',
    });
  } catch (error) {
    console.error('[AINFRA] Error listing config sets:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/ainfra/configs
 * Create new configuration set
 */
exports.createConfigSet = async (req, res) => {
  try {
    const { name, description, setActive } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
      });
    }

    const service = getAINFRAService();
    const config = await service.createConfigSet(name, description, setActive);

    // Invalidate config list cache
    await invalidateConfig('ainfra-config-list');
    if (setActive) {
      await invalidateConfig('ainfra-active-config');
    }

    res.status(201).json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('[AINFRA] Error creating config set:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/ainfra/configs/:name
 * Get configuration set by name
 */
exports.getConfigSet = async (req, res) => {
  try {
    const { name } = req.params;

    const service = getAINFRAService();
    const config = await service.getConfigSet(name);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuration set not found',
      });
    }

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('[AINFRA] Error getting config set:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/ainfra/configs/active
 * Get active configuration set (cached for 5 minutes)
 */
exports.getActiveConfig = async (req, res) => {
  try {
    const computeActiveConfig = async () => {
      const service = getAINFRAService();
      return service.getActiveConfigSet();
    };

    const { data, cached } = await getCachedConfig('ainfra-active-config', computeActiveConfig);

    res.json({
      success: true,
      data,
      cached,
      cacheInfo: cached ? 'Result from Redis cache (TTL: 300s)' : 'Fresh result',
    });
  } catch (error) {
    console.error('[AINFRA] Error getting active config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * PUT /api/v1/ainfra/configs/:name/activate
 * Set configuration set as active
 */
exports.activateConfigSet = async (req, res) => {
  try {
    const { name } = req.params;

    const service = getAINFRAService();
    await service.setActiveConfigSet(name);

    // Invalidate cached active config
    await invalidateConfig('ainfra-active-config');

    res.json({
      success: true,
      message: `Configuration '${name}' is now active`,
    });
  } catch (error) {
    console.error('[AINFRA] Error activating config set:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * PATCH /api/v1/ainfra/configs/:name/providers/:provider
 * Update provider configuration
 */
exports.updateProviderConfig = async (req, res) => {
  try {
    const { name, provider } = req.params;
    const updates = req.body;

    const service = getAINFRAService();
    await service.updateProviderConfig(name, provider, updates);

    // Invalidate related caches
    await invalidateConfig('ainfra-active-config');
    await invalidateConfig('ainfra-config-list');

    res.json({
      success: true,
      message: `Provider '${provider}' configuration updated`,
    });
  } catch (error) {
    console.error('[AINFRA] Error updating provider config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// USAGE & STATUS
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/ainfra/status
 * Get full AI infrastructure status
 *
 * Defense-in-depth timeout strategy:
 * 1. Database queries have 3-second timeout (returns stale cache on timeout)
 * 2. JavaScript Promise.race has 5-second timeout (returns default config)
 * 3. If both fail, catch block returns default status
 */
exports.getStatus = async (req, res) => {
  try {
    const monitor = getAIUsageMonitor();
    const currentUsage = monitor.getUsageStats();

    // Try to get status from database with timeout
    // Note: Primary timeout is at database level (3s), this is secondary fallback (5s)
    const ainfraService = getAINFRAService();
    const status = await withTimeout(
      ainfraService.getInfraStatus(currentUsage),
      5000, // 5 second timeout (secondary fallback after database timeout)
      getDefaultStatus(currentUsage) // fallback
    );

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('[AINFRA] Error getting status:', error);

    // Return fallback status even on error
    try {
      const monitor = getAIUsageMonitor();
      const currentUsage = monitor.getUsageStats();
      res.json({
        success: true,
        data: getDefaultStatus(currentUsage),
      });
    } catch (fallbackError) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
};

/**
 * POST /api/v1/ainfra/usage/snapshot
 * Save current usage as snapshot
 */
exports.saveUsageSnapshot = async (req, res) => {
  try {
    const monitor = getAIUsageMonitor();
    const currentUsage = monitor.getUsageStats();

    const service = getAINFRAService();
    await service.saveUsageSnapshot(currentUsage);

    res.json({
      success: true,
      message: 'Usage snapshot saved',
    });
  } catch (error) {
    console.error('[AINFRA] Error saving snapshot:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/ainfra/usage/history
 * Get usage history
 */
exports.getUsageHistory = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;

    const service = getAINFRAService();
    const history = await service.getUsageHistory(days);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('[AINFRA] Error getting usage history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// ALERTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/ainfra/alerts
 * Get recent alerts
 */
exports.getAlerts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const service = getAINFRAService();
    const alerts = await service.getRecentAlerts(limit);

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    console.error('[AINFRA] Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/ainfra/alerts/:id/acknowledge
 * Acknowledge alert
 */
exports.acknowledgeAlert = async (req, res) => {
  try {
    const { id } = req.params;

    const service = getAINFRAService();
    await service.acknowledgeAlert(id);

    res.json({
      success: true,
      message: 'Alert acknowledged',
    });
  } catch (error) {
    console.error('[AINFRA] Error acknowledging alert:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
