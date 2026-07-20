/**
 * Provider Manager
 * 
 * Управляет множеством провайдеров данных:
 * - Загрузка конфигурации
 * - Инициализация провайдеров
 * - Агрегация данных из всех провайдеров
 * - Приоритизация источников
 */

import * as fs from "fs/promises";
import * as path from "path";
import { createLogger } from "../utils/logger.js";
import type {
  DataProvider,
  ProviderConfig,
  Project,
  Conversation,
  Artifact,
  KnowledgeDocument,
  SyncResult
} from "./types.js";
import { FileProvider } from "./file-provider.js";
import { ClaudeApiProvider } from "./claude-api-provider.js";

const logger = createLogger("provider-manager");

export interface ProvidersConfiguration {
  /** Активный провайдер по умолчанию */
  defaultProvider: string;
  /** Конфигурация провайдеров */
  providers: Record<string, ProviderConfig>;
  /** Настройки синхронизации */
  sync: {
    /** Интервал синхронизации в мс */
    intervalMs: number;
    /** Автоматическая синхронизация при старте */
    syncOnStart: boolean;
  };
}

type ProviderConstructor = new (config: ProviderConfig) => DataProvider;

export class ProviderManager {
  private providers: Map<string, DataProvider> = new Map();
  private config: ProvidersConfiguration;
  private syncInterval: NodeJS.Timeout | null = null;

  // Реестр доступных провайдеров
  private static readonly PROVIDER_REGISTRY: Record<string, ProviderConstructor> = {
    "file": FileProvider,
    "claude-api": ClaudeApiProvider
  };

  constructor(config: ProvidersConfiguration) {
    this.config = config;
  }

  /**
   * Загрузка конфигурации из файла
   */
  static async loadConfig(configPath: string): Promise<ProvidersConfiguration> {
    try {
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content) as ProvidersConfiguration;
      
      logger.info({ configPath }, "Configuration loaded");
      return config;
    } catch (error) {
      logger.warn({ error, configPath }, "Failed to load config, using defaults");
      return ProviderManager.getDefaultConfig();
    }
  }

  /**
   * Конфигурация по умолчанию
   */
  static getDefaultConfig(): ProvidersConfiguration {
    return {
      defaultProvider: "file",
      providers: {
        file: {
          type: "file",
          enabled: true,
          options: {
            dataPath: process.env.KNOWLEDGE_SOURCE_PATH || "/app/knowledge",
            artifactsPath: process.env.ARTIFACTS_PATH || "/app/artifacts",
            watchEnabled: true
          }
        }
      },
      sync: {
        intervalMs: parseInt(process.env.SYNC_INTERVAL_MS || "300000"),
        syncOnStart: true
      }
    };
  }

  /**
   * Создание конфигурации из env переменных
   */
  static configFromEnv(): ProvidersConfiguration {
    const config = ProviderManager.getDefaultConfig();

    // Проверяем, указан ли Claude API
    const sessionKey = process.env.CLAUDE_SESSION_KEY;
    if (sessionKey) {
      config.providers["claude-api"] = {
        type: "claude-api",
        enabled: true,
        options: {
          sessionKey,
          organizationId: process.env.CLAUDE_ORGANIZATION_ID,
          projectId: process.env.CLAUDE_PROJECT_ID,
          userAgent: process.env.CLAUDE_USER_AGENT,
          requestDelay: parseInt(process.env.CLAUDE_REQUEST_DELAY || "1000")
        }
      };
      
      // Если есть Claude API, делаем его основным
      config.defaultProvider = "claude-api";
    }

    return config;
  }

  /**
   * Инициализация всех провайдеров
   */
  async initialize(): Promise<void> {
    for (const [name, providerConfig] of Object.entries(this.config.providers)) {
      if (!providerConfig.enabled) {
        logger.info({ provider: name }, "Provider disabled, skipping");
        continue;
      }

      const ProviderClass = ProviderManager.PROVIDER_REGISTRY[providerConfig.type];
      if (!ProviderClass) {
        logger.error({ provider: name, type: providerConfig.type }, "Unknown provider type");
        continue;
      }

      try {
        const provider = new ProviderClass(providerConfig);
        await provider.initialize();
        
        if (await provider.isAvailable()) {
          this.providers.set(name, provider);
          logger.info({ provider: name, type: providerConfig.type }, "Provider initialized");
        } else {
          logger.warn({ provider: name }, "Provider not available");
        }
      } catch (error) {
        logger.error({ error, provider: name }, "Failed to initialize provider");
      }
    }

    // Синхронизация при старте
    if (this.config.sync.syncOnStart) {
      await this.syncAll();
    }

    // Запуск периодической синхронизации
    if (this.config.sync.intervalMs > 0) {
      this.startPeriodicSync();
    }

    logger.info({ 
      providers: Array.from(this.providers.keys()) 
    }, "Provider manager initialized");
  }

  /**
   * Получение провайдера по имени
   */
  getProvider(name?: string): DataProvider | null {
    const providerName = name || this.config.defaultProvider;
    return this.providers.get(providerName) || null;
  }

  /**
   * Получение всех активных провайдеров
   */
  getAllProviders(): DataProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Запуск периодической синхронизации
   */
  private startPeriodicSync(): void {
    this.syncInterval = setInterval(async () => {
      await this.syncAll();
    }, this.config.sync.intervalMs);

    logger.info({ 
      intervalMs: this.config.sync.intervalMs 
    }, "Periodic sync started");
  }

  /**
   * Синхронизация всех провайдеров
   */
  async syncAll(): Promise<Map<string, SyncResult>> {
    const results = new Map<string, SyncResult>();

    for (const [name, provider] of this.providers) {
      try {
        const result = await provider.sync();
        results.set(name, result);
        logger.info({ provider: name, result }, "Provider synced");
      } catch (error) {
        logger.error({ error, provider: name }, "Provider sync failed");
        results.set(name, {
          conversations: 0,
          messages: 0,
          artifacts: 0,
          documents: 0,
          errors: [String(error)]
        });
      }
    }

    return results;
  }

  // ============================================================
  // Агрегированные методы (объединяют данные из всех провайдеров)
  // ============================================================

  async getProjects(): Promise<Project[]> {
    const projects = new Map<string, Project>();

    for (const provider of this.providers.values()) {
      const providerProjects = await provider.getProjects();
      for (const project of providerProjects) {
        // Приоритет последнего провайдера
        projects.set(project.id, project);
      }
    }

    return Array.from(projects.values());
  }

  async getProject(projectId: string): Promise<Project | null> {
    for (const provider of this.providers.values()) {
      const project = await provider.getProject(projectId);
      if (project) return project;
    }
    return null;
  }

  async getConversations(projectId?: string): Promise<Conversation[]> {
    const conversations = new Map<string, Conversation>();

    for (const provider of this.providers.values()) {
      const providerConversations = await provider.getConversations(projectId);
      for (const conv of providerConversations) {
        conversations.set(conv.id, conv);
      }
    }

    return Array.from(conversations.values());
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    for (const provider of this.providers.values()) {
      const conv = await provider.getConversation(conversationId);
      if (conv) return conv;
    }
    return null;
  }

  async getArtifacts(conversationId?: string): Promise<Artifact[]> {
    const artifacts = new Map<string, Artifact>();

    for (const provider of this.providers.values()) {
      const providerArtifacts = await provider.getArtifacts(conversationId);
      for (const artifact of providerArtifacts) {
        artifacts.set(artifact.id, artifact);
      }
    }

    return Array.from(artifacts.values());
  }

  async getKnowledgeDocuments(projectId: string): Promise<KnowledgeDocument[]> {
    const documents = new Map<string, KnowledgeDocument>();

    for (const provider of this.providers.values()) {
      const providerDocs = await provider.getKnowledgeDocuments(projectId);
      for (const doc of providerDocs) {
        documents.set(doc.id, doc);
      }
    }

    return Array.from(documents.values());
  }

  /**
   * Получение статистики по всем провайдерам
   */
  async getStats(): Promise<Record<string, {
    available: boolean;
    projects: number;
    conversations: number;
    artifacts: number;
    documents: number;
  }>> {
    const stats: Record<string, {
      available: boolean;
      projects: number;
      conversations: number;
      artifacts: number;
      documents: number;
    }> = {};

    for (const [name, provider] of this.providers) {
      try {
        const projects = await provider.getProjects();
        const conversations = await provider.getConversations();
        const artifacts = await provider.getArtifacts();
        
        let documents = 0;
        for (const project of projects) {
          const docs = await provider.getKnowledgeDocuments(project.id);
          documents += docs.length;
        }

        stats[name] = {
          available: await provider.isAvailable(),
          projects: projects.length,
          conversations: conversations.length,
          artifacts: artifacts.length,
          documents
        };
      } catch (error) {
        stats[name] = {
          available: false,
          projects: 0,
          conversations: 0,
          artifacts: 0,
          documents: 0
        };
      }
    }

    return stats;
  }

  /**
   * Закрытие всех провайдеров
   */
  async close(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    for (const [name, provider] of this.providers) {
      try {
        await provider.close();
        logger.info({ provider: name }, "Provider closed");
      } catch (error) {
        logger.error({ error, provider: name }, "Failed to close provider");
      }
    }

    this.providers.clear();
    logger.info("Provider manager closed");
  }
}
