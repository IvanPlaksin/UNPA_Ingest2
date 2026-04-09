/**
 * Domain Routes
 * API endpoints for domain (project context) management.
 * Domains control namespace, Qdrant collection, and graph container labels.
 *
 * @module routes/domain
 */

const express = require('express');
const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════
// Lazy service initialization
// ═══════════════════════════════════════════════════════════════════════

const { getDomainService } = require('../services/domain');

// ═══════════════════════════════════════════════════════════════════════
// DOMAIN CRUD
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/domains
 * List all registered domains
 */
router.get('/', async (req, res) => {
  try {
    const domains = await getDomainService().listDomains();
    res.json({ success: true, domains });
  } catch (error) {
    console.error('[Domain API] List error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/domains/current
 * Get current active domain
 */
router.get('/current', async (req, res) => {
  try {
    const domain = getDomainService().getCurrentDomain();
    if (!domain) {
      return res.status(404).json({
        success: false,
        error: 'No active domain. Use POST /api/v1/domains/:domainId/switch'
      });
    }
    res.json({ success: true, domain });
  } catch (error) {
    console.error('[Domain API] Current error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/domains
 * Create a new domain
 * Body: { displayName, description, createdBy? }
 */
router.post('/', async (req, res) => {
  try {
    const { displayName, description, createdBy } = req.body;

    if (!displayName) {
      return res.status(400).json({
        success: false,
        error: 'displayName is required'
      });
    }

    const domain = await getDomainService().createDomain({
      displayName,
      description: description || '',
      createdBy: createdBy || 'api'
    });

    res.status(201).json({ success: true, domain });
  } catch (error) {
    console.error('[Domain API] Create error:', error);
    res.status(error.message.includes('already exists') ? 409 : 500)
       .json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/domains/:domainId/switch
 * Switch active domain context
 */
router.post('/:domainId/switch', async (req, res) => {
  try {
    const { domainId } = req.params;
    const domain = await getDomainService().switchDomain(domainId);
    res.json({ success: true, domain, message: `Switched to domain: ${domainId}` });
  } catch (error) {
    console.error('[Domain API] Switch error:', error);
    res.status(error.message.includes('not found') ? 404 : 500)
       .json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/v1/domains/:domainId
 * Update domain properties
 * Body: { displayName?, description?, isActive? }
 */
router.put('/:domainId', async (req, res) => {
  try {
    const { domainId } = req.params;
    const updates = req.body;

    const domain = await getDomainService().updateDomain(domainId, updates);
    res.json({ success: true, domain });
  } catch (error) {
    console.error('[Domain API] Update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// DATA SOURCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/domains/:domainId/datasources
 * List data sources (connections) for a domain
 */
router.get('/:domainId/datasources', async (req, res) => {
  try {
    const { domainId } = req.params;
    const service = getDomainService();
    const domains = await service.listDomains();
    const domain = domains.find(d => d.domainId === domainId);
    if (!domain) return res.status(404).json({ success: false, error: `Domain '${domainId}' not found` });
    res.json({ success: true, dataSources: domain.dataSources || [] });
  } catch (error) {
    console.error('[Domain API] List datasources error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/v1/domains/:domainId/datasources/:connectionName
 * Update data source connection params and/or credentials
 * Body: { connectionParams?, credentials? }
 */
router.put('/:domainId/datasources/:connectionName', async (req, res) => {
  try {
    const { domainId, connectionName } = req.params;
    const { connectionParams, credentials } = req.body;
    const service = getDomainService();

    // Re-save with updated params (addDataSource does upsert)
    if (connectionParams) {
      await service.addDataSource(domainId, {
        connectionName,
        sourceType: 'MSSQL',
        connectionParams,
      }, credentials);
    } else if (credentials) {
      await service.credentialStore.store(domainId, connectionName, credentials);
    }

    res.json({ success: true, message: `Data source '${connectionName}' updated` });
  } catch (error) {
    console.error('[Domain API] Update datasource error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/domains/:domainId/datasources
 * Add data source to domain
 * Body: { connectionName, sourceType, connectionParams, credentials? }
 */
router.post('/:domainId/datasources', async (req, res) => {
  try {
    const { domainId } = req.params;
    const { connectionName, sourceType, connectionParams, credentials } = req.body;

    if (!connectionName || !sourceType || !connectionParams) {
      return res.status(400).json({
        success: false,
        error: 'connectionName, sourceType, and connectionParams are required'
      });
    }

    await getDomainService().addDataSource(
      domainId,
      { connectionName, sourceType, connectionParams },
      credentials
    );

    res.status(201).json({
      success: true,
      message: `Data source '${connectionName}' added to domain '${domainId}'`
    });
  } catch (error) {
    console.error('[Domain API] Add datasource error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/v1/domains/:domainId/datasources/:connectionName
 * Remove data source from domain
 */
router.delete('/:domainId/datasources/:connectionName', async (req, res) => {
  try {
    const { domainId, connectionName } = req.params;

    await getDomainService().removeDataSource(domainId, connectionName);

    res.json({
      success: true,
      message: `Data source '${connectionName}' removed from domain '${domainId}'`
    });
  } catch (error) {
    console.error('[Domain API] Remove datasource error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/domains/:domainId/datasources/:connectionName/has-credentials
 * Check if credentials exist for a data source (does NOT return the credentials)
 */
router.get('/:domainId/datasources/:connectionName/has-credentials', async (req, res) => {
  try {
    const { domainId, connectionName } = req.params;
    const service = getDomainService();
    const hasCredentials = await service.credentialStore.exists(domainId, connectionName);
    res.json({ success: true, hasCredentials });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/domains/:domainId/datasources/:connectionName/test
 * Test data source connection
 */
router.post('/:domainId/datasources/:connectionName/test', async (req, res) => {
  try {
    const { domainId, connectionName } = req.params;

    // Switch to domain if needed
    const service = getDomainService();
    if (!service.getCurrentDomain() || service.getCurrentDomain().domainId !== domainId) {
      await service.switchDomain(domainId);
    }

    const { config, credentials } = await service.getDataSourceWithCredentials(connectionName);

    if (config.sourceType !== 'MSSQL') {
      return res.status(400).json({
        success: false,
        error: `Connection test not implemented for sourceType: ${config.sourceType}`
      });
    }

    // Test MSSQL connection
    const { MSSQLConnector } = require('../services/connectors');
    const connector = new MSSQLConnector();

    const result = await connector.connect({
      ...config.connectionParams,
      ...credentials,
    });

    if (result.success) {
      await connector.disconnect();
    }

    res.json({
      success: result.success,
      serverName: result.serverName,
      databaseName: result.databaseName,
      version: result.version,
      error: result.error
    });
  } catch (error) {
    console.error('[Domain API] Test connection error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
