'use strict';

const fs = require('fs');

/**
 * Load configuration with precedence:
 *   CLI flags > config file (--config / UNPA_IMPORT_CONFIG) > env vars > defaults.
 * @param {object} options - commander options for the current command
 * @returns {object} resolved config
 */
function loadConfig(options = {}) {
    let fileConfig = {};
    const configPath = options.config || process.env.UNPA_IMPORT_CONFIG;
    if (configPath) {
        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found: ${configPath}`);
        }
        fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    const pick = (flag, fileVal, envVal, def) =>
        flag !== undefined ? flag : (fileVal !== undefined ? fileVal : (envVal !== undefined && envVal !== '' ? envVal : def));

    return {
        memgraph: {
            uri: pick(options.memgraphUri, fileConfig.memgraph?.uri, process.env.MEMGRAPH_URI, 'bolt://localhost:7687'),
            user: pick(options.memgraphUser, fileConfig.memgraph?.user, process.env.MEMGRAPH_USER, ''),
            password: pick(options.memgraphPassword, fileConfig.memgraph?.password, process.env.MEMGRAPH_PASSWORD, ''),
        },
        qdrant: {
            url: pick(options.qdrantUrl, fileConfig.qdrant?.url, process.env.QDRANT_URL, 'http://localhost:6333'),
            apiKey: pick(options.qdrantApiKey, fileConfig.qdrant?.apiKey, process.env.QDRANT_API_KEY, ''),
        },
        targetApi: {
            url: pick(options.targetApiUrl, fileConfig.targetApi?.url, process.env.TARGET_API_URL, ''),
            token: pick(options.targetApiToken, fileConfig.targetApi?.token, process.env.TARGET_API_TOKEN, ''),
        },
        conflict: pick(options.conflict, fileConfig.conflict, process.env.UNPA_IMPORT_CONFLICT, 'skip'),
        batchSize: parseInt(pick(options.batchSize, fileConfig.batchSize, process.env.UNPA_IMPORT_BATCH_SIZE, '1000'), 10),
        skipVectors: options.skipVectors || fileConfig.skipVectors || false,
        catalogChannel: pick(options.catalogChannel, fileConfig.catalogChannel, process.env.UNPA_IMPORT_CATALOG_CHANNEL, 'refuse'),
    };
}

module.exports = { loadConfig };
