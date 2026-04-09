/**
 * Domain Module
 * Domain context management and credential storage
 *
 * @module services/domain
 */

const { DomainService } = require('./domain.service');
const { CredentialStore } = require('./credential.store');

// ═══════════════════════════════════════════════════════════════════════
// Shared singleton — ensures ONE CredentialStore key across all modules
// ═══════════════════════════════════════════════════════════════════════

let _instance = null;

const getDomainService = () => {
  if (!_instance) {
    const memgraphService = require('../memgraph.service');
    const qdrantService = require('../qdrant.service');
    const redisService = require('../redis.service');

    const redisClient = redisService.getClient ? redisService.getClient() : redisService;
    const credentialStore = new CredentialStore(redisClient);
    _instance = new DomainService(memgraphService, qdrantService, credentialStore);
  }
  return _instance;
};

module.exports = {
  DomainService,
  CredentialStore,
  getDomainService,
};
