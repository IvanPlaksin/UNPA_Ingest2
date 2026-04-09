/**
 * Configuration module exports
 */

const enums = require('./enums');
const namespaceConfig = require('./namespace.config');

module.exports = {
    // Enums
    KnowledgeNamespace: enums.KnowledgeNamespace,
    UserRole: enums.UserRole,
    LifecycleState: enums.LifecycleState,

    // Namespace configuration
    NAMESPACE_CONFIGS: namespaceConfig.NAMESPACE_CONFIGS,
    getNamespaceConfig: namespaceConfig.getNamespaceConfig,
    getStoragePaths: namespaceConfig.getStoragePaths,
    getQdrantCollectionName: namespaceConfig.getQdrantCollectionName,
    getRedisPrefix: namespaceConfig.getRedisPrefix,
    listEnabledNamespaces: namespaceConfig.listEnabledNamespaces,
    isLabelAllowed: namespaceConfig.isLabelAllowed
};
