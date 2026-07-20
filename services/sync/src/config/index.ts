/**
 * Configuration - загрузка конфигурации из env переменных
 */

export interface QdrantConfig {
  url: string;
  collection: string;
}

export interface MemgraphConfig {
  uri: string;
  user: string;
  password: string;
}

export interface TEIConfig {
  url: string;
}

export interface MCPConfig {
  serverName: string;
  serverVersion: string;
  transport: "stdio" | "sse";
  port: number;
}

export interface HTTPConfig {
  port: number;
}

export interface SyncConfig {
  intervalMs: number;
  knowledgePath: string;
  artifactsPath: string;
  projectFilter: string | null; // Фильтр по имени проекта (null = все проекты)
}

export interface ClaudeMessagingConfig {
  sessionKey: string;
  organizationId: string;
  projectId: string;
  baseUrl: string;
}

export interface ClaudeApiConfig {
  apiKey: string | null;
  model: string;
  enabled: boolean;
}

export interface GeminiApiConfig {
  apiKey: string | null;
  model: string;
  enabled: boolean;
}

export interface Config {
  qdrant: QdrantConfig;
  memgraph: MemgraphConfig;
  tei: TEIConfig;
  mcp: MCPConfig;
  http: HTTPConfig;
  sync: SyncConfig;
  claudeMessaging: ClaudeMessagingConfig;
  claudeApi: ClaudeApiConfig;
  geminiApi: GeminiApiConfig;
  logLevel: string;
  nodeEnv: string;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for environment variable: ${key}`);
  }
  return parsed;
}

export const config: Config = {
  qdrant: {
    url: getEnv("QDRANT_URL", "http://localhost:6333"),
    collection: getEnv("QDRANT_COLLECTION", "project_knowledge")
  },

  memgraph: {
    uri: getEnv("MEMGRAPH_URI", "bolt://localhost:7687"),
    user: getEnv("MEMGRAPH_USER", "memgraph"),
    password: getEnv("MEMGRAPH_PASSWORD", "secret_password_123")
  },

  tei: {
    url: getEnv("TEI_URL", "http://localhost:8081")
  },

  mcp: {
    serverName: getEnv("MCP_SERVER_NAME", "project-knowledge"),
    serverVersion: getEnv("MCP_SERVER_VERSION", "1.0.0"),
    transport: (getEnv("MCP_TRANSPORT", "stdio") as "stdio" | "sse"),
    port: getEnvInt("MCP_PORT", 8811)
  },

  http: {
    port: getEnvInt("HTTP_PORT", 3000)
  },

  sync: {
    intervalMs: getEnvInt("SYNC_INTERVAL_MS", 300000), // 5 минут
    knowledgePath: getEnv("KNOWLEDGE_SOURCE_PATH", "/app/knowledge"),
    artifactsPath: getEnv("ARTIFACTS_PATH", "/app/artifacts"),
    projectFilter: process.env.PROJECT_FILTER || null // Фильтр по имени проекта
  },

  claudeMessaging: {
    sessionKey: getEnv("CLAUDE_SESSION_KEY", ""),
    organizationId: getEnv("CLAUDE_ORGANIZATION_ID", ""),
    projectId: getEnv("CLAUDE_PROJECT_ID", ""),
    baseUrl: getEnv("CLAUDE_BASE_URL", "https://claude.ai/api")
  },

  claudeApi: {
    apiKey: process.env.ANTHROPIC_API_KEY || null,
    model: getEnv("CLAUDE_API_MODEL", "claude-3-5-sonnet-20241022"),
    enabled: !!process.env.ANTHROPIC_API_KEY
  },

  geminiApi: {
    apiKey: process.env.GOOGLE_AI_API_KEY || null,
    model: getEnv("GEMINI_API_MODEL", "gemini-2.0-flash-exp"),
    enabled: !!process.env.GOOGLE_AI_API_KEY
  },

  logLevel: getEnv("LOG_LEVEL", "info"),
  nodeEnv: getEnv("NODE_ENV", "development")
};
