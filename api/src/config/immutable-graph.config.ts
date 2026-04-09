/**
 * Immutable Graph Configuration
 * UN ProjectAdvisor - Production configuration for bi-temporal versioned graph
 */

export interface ImmutableGraphConfig {
  memgraph: {
    uri: string;
    username: string;
    password: string;
    database: string;
    maxConnectionPoolSize: number;
    connectionTimeout: number;
  };
  godMode: {
    sessionDurationMinutes: number;
    inactivityTimeoutMinutes: number;
    deletionConfirmDelaySeconds: number;
    tombstoneRetentionDays: number;
    auditRetentionDays: number;
  };
  versioning: {
    initialEpoch: number;
    hashAlgorithm: 'sha256' | 'sha512';
    enableChainVerification: boolean;
  };
  extraction: {
    batchSize: number;
    maxConcurrentJobs: number;
    retryAttempts: number;
    retryDelayMs: number;
  };
  sse: {
    heartbeatIntervalMs: number;
    maxConnections: number;
    connectionTimeoutMs: number;
  };
  cache: {
    enabled: boolean;
    ttlSeconds: number;
    maxSize: number;
  };
}

const defaultConfig: ImmutableGraphConfig = {
  memgraph: {
    uri: 'bolt://localhost:7687',
    username: '',
    password: '',
    database: 'memgraph',
    maxConnectionPoolSize: 50,
    connectionTimeout: 30000
  },
  godMode: {
    sessionDurationMinutes: 30,
    inactivityTimeoutMinutes: 5,
    deletionConfirmDelaySeconds: 5,
    tombstoneRetentionDays: 30,
    auditRetentionDays: 365
  },
  versioning: {
    initialEpoch: 9000,
    hashAlgorithm: 'sha256',
    enableChainVerification: true
  },
  extraction: {
    batchSize: 100,
    maxConcurrentJobs: 5,
    retryAttempts: 3,
    retryDelayMs: 1000
  },
  sse: {
    heartbeatIntervalMs: 30000,
    maxConnections: 1000,
    connectionTimeoutMs: 300000
  },
  cache: {
    enabled: true,
    ttlSeconds: 60,
    maxSize: 10000
  }
};

export function loadConfig(): ImmutableGraphConfig {
  return {
    memgraph: {
      uri: process.env.MEMGRAPH_URI || defaultConfig.memgraph.uri,
      username: process.env.MEMGRAPH_USER || defaultConfig.memgraph.username,
      password: process.env.MEMGRAPH_PASSWORD || defaultConfig.memgraph.password,
      database: process.env.MEMGRAPH_DATABASE || defaultConfig.memgraph.database,
      maxConnectionPoolSize: parseInt(process.env.MEMGRAPH_POOL_SIZE || '') || defaultConfig.memgraph.maxConnectionPoolSize,
      connectionTimeout: parseInt(process.env.MEMGRAPH_TIMEOUT || '') || defaultConfig.memgraph.connectionTimeout
    },
    godMode: {
      sessionDurationMinutes: parseInt(process.env.GOD_MODE_DURATION || '') || defaultConfig.godMode.sessionDurationMinutes,
      inactivityTimeoutMinutes: parseInt(process.env.GOD_MODE_INACTIVITY || '') || defaultConfig.godMode.inactivityTimeoutMinutes,
      deletionConfirmDelaySeconds: parseInt(process.env.GOD_MODE_DELETE_DELAY || '') || defaultConfig.godMode.deletionConfirmDelaySeconds,
      tombstoneRetentionDays: parseInt(process.env.TOMBSTONE_RETENTION || '') || defaultConfig.godMode.tombstoneRetentionDays,
      auditRetentionDays: parseInt(process.env.AUDIT_RETENTION || '') || defaultConfig.godMode.auditRetentionDays
    },
    versioning: {
      initialEpoch: parseInt(process.env.INITIAL_EPOCH || '') || defaultConfig.versioning.initialEpoch,
      hashAlgorithm: (process.env.HASH_ALGORITHM as 'sha256' | 'sha512') || defaultConfig.versioning.hashAlgorithm,
      enableChainVerification: process.env.ENABLE_CHAIN_VERIFICATION !== 'false'
    },
    extraction: {
      batchSize: parseInt(process.env.EXTRACTION_BATCH_SIZE || '') || defaultConfig.extraction.batchSize,
      maxConcurrentJobs: parseInt(process.env.EXTRACTION_MAX_JOBS || '') || defaultConfig.extraction.maxConcurrentJobs,
      retryAttempts: parseInt(process.env.EXTRACTION_RETRY_ATTEMPTS || '') || defaultConfig.extraction.retryAttempts,
      retryDelayMs: parseInt(process.env.EXTRACTION_RETRY_DELAY || '') || defaultConfig.extraction.retryDelayMs
    },
    sse: {
      heartbeatIntervalMs: parseInt(process.env.SSE_HEARTBEAT || '') || defaultConfig.sse.heartbeatIntervalMs,
      maxConnections: parseInt(process.env.SSE_MAX_CONNECTIONS || '') || defaultConfig.sse.maxConnections,
      connectionTimeoutMs: parseInt(process.env.SSE_TIMEOUT || '') || defaultConfig.sse.connectionTimeoutMs
    },
    cache: {
      enabled: process.env.CACHE_ENABLED !== 'false',
      ttlSeconds: parseInt(process.env.CACHE_TTL || '') || defaultConfig.cache.ttlSeconds,
      maxSize: parseInt(process.env.CACHE_MAX_SIZE || '') || defaultConfig.cache.maxSize
    }
  };
}

export function validateConfig(config: ImmutableGraphConfig): string[] {
  const errors: string[] = [];

  if (!config.memgraph.uri) {
    errors.push('MEMGRAPH_URI is required');
  }

  if (config.godMode.sessionDurationMinutes < 1 || config.godMode.sessionDurationMinutes > 120) {
    errors.push('GOD_MODE_DURATION must be between 1 and 120 minutes');
  }

  if (config.godMode.deletionConfirmDelaySeconds < 5) {
    errors.push('GOD_MODE_DELETE_DELAY must be at least 5 seconds');
  }

  if (config.versioning.initialEpoch < 1000) {
    errors.push('INITIAL_EPOCH must be at least 1000');
  }

  return errors;
}

export default loadConfig;
