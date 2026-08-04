/**
 * REST controller for workspace retrieval connectors.
 *
 * @module controllers/connector
 */

'use strict';

let _service = null;
function connectors() {
  if (!_service) {
    _service = require('../services/radix/connector/connector.service').getConnectorService();
  }
  return _service;
}

function userId(req) {
  return req.user?.id || req.headers['x-user-id'] || 'anonymous';
}

/**
 * Maps a service error onto an HTTP status.
 *
 * Validation failures and unknown ids are the caller's problem, not the
 * server's — returning 500 for them tells a client to retry something that will
 * never succeed.
 *
 * @param {Error} error
 * @returns {number|null} status, or null to delegate to the error middleware
 */
function statusFor(error) {
  const message = error.message || '';
  if (/^Invalid connector/.test(message)) return 400;
  if (/No valid fields/.test(message)) return 400;
  if (/is required/.test(message)) return 400;
  if (/not found/i.test(message)) return 404;
  return null;
}

class ConnectorController {
  /** GET /api/v1/workspaces/:id/connectors */
  async list(req, res, next) {
    try {
      const items = await connectors().list(req.params.id, {
        enabledOnly: req.query.enabledOnly === 'true'
      });
      return res.json({ success: true, data: items });
    } catch (error) {
      return next(error);
    }
  }

  /** POST /api/v1/workspaces/:id/connectors */
  async create(req, res, next) {
    try {
      const created = await connectors().create(req.params.id, req.body || {});
      return res.status(201).json({ success: true, data: created });
    } catch (error) {
      const status = statusFor(error);
      if (status) return res.status(status).json({ success: false, error: error.message });
      return next(error);
    }
  }

  /** GET /api/v1/workspaces/:id/connectors/:connectorId */
  async get(req, res, next) {
    try {
      const item = await connectors().get(req.params.id, req.params.connectorId);
      if (!item) {
        return res.status(404).json({
          success: false,
          error: `Connector not found: ${req.params.connectorId}`
        });
      }
      return res.json({ success: true, data: item });
    } catch (error) {
      return next(error);
    }
  }

  /** PATCH /api/v1/workspaces/:id/connectors/:connectorId */
  async update(req, res, next) {
    try {
      const updated = await connectors().update(
        req.params.id, req.params.connectorId, req.body || {}
      );
      return res.json({ success: true, data: updated });
    } catch (error) {
      const status = statusFor(error);
      if (status) return res.status(status).json({ success: false, error: error.message });
      return next(error);
    }
  }

  /** DELETE /api/v1/workspaces/:id/connectors/:connectorId */
  async remove(req, res, next) {
    try {
      const removed = await connectors().delete(req.params.id, req.params.connectorId);
      if (!removed) {
        return res.status(404).json({
          success: false,
          error: `Connector not found: ${req.params.connectorId}`
        });
      }
      return res.json({ success: true, data: { id: req.params.connectorId, deletedBy: userId(req) } });
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new ConnectorController();
module.exports.statusFor = statusFor;
