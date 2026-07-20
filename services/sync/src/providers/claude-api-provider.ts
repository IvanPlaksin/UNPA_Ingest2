/**
 * Claude API Provider
 * 
 * Неофициальный провайдер для получения данных из Claude.ai
 * через cookie-based аутентификацию.
 * 
 * ВНИМАНИЕ: Этот провайдер использует неофициальный API и может
 * перестать работать при изменениях на стороне Anthropic.
 */

import { createLogger } from "../utils/logger.js";
import { CloudflareBypasser, describeHttpError } from "../utils/cloudflare-bypasser.js";
import {
  parseArtifactsFromText,
  parseArtifactsFromSSE,
  mapMimeTypeToArtifactType,
  type ClaudeNativeArtifact
} from "../utils/artifact-parser.js";
import type {
  DataProvider,
  ProviderConfig,
  Project,
  Conversation,
  ChatMessage,
  Artifact,
  ArtifactType,
  ArtifactMimeType,
  KnowledgeDocument,
  SyncResult
} from "./types.js";

const logger = createLogger("claude-api-provider");

interface ClaudeApiConfig {
  /** Cookie значение sessionKey из claude.ai */
  sessionKey: string;
  /** Organization ID (опционально, будет получен автоматически) */
  organizationId?: string;
  /** User Agent браузера */
  userAgent?: string;
  /** Базовый URL API */
  baseUrl?: string;
  /** ID проекта для фильтрации (опционально) */
  projectId?: string;
  /** Интервал между запросами (мс) для rate limiting */
  requestDelay?: number;
}

interface ClaudeOrganization {
  uuid: string;
  name: string;
}

interface ClaudeProject {
  uuid: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_private: boolean;
  prompt_template?: string;
}

interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  project_uuid?: string;
}

interface ClaudeMessage {
  uuid: string;
  text: string;
  sender: "human" | "assistant";
  created_at: string;
  attachments?: Array<{
    id: string;
    file_name: string;
    file_type: string;
    extracted_content?: string;
  }>;
  content?: Array<{
    type: string;
    text?: string;
  }>;
}

interface ClaudeArtifact {
  identifier: string;
  title: string;
  type: string;
  language?: string;
  content: string;
  created_at: string;
}

export class ClaudeApiProvider implements DataProvider {
  readonly name = "Claude.ai API";
  readonly type = "claude-api";

  private config: ClaudeApiConfig;
  private organizationId: string | null = null;
  private headers: Record<string, string> = {};
  private initialized = false;
  private lastRequestTime = 0;
  private bypasser: CloudflareBypasser | null = null;

  constructor(providerConfig: ProviderConfig) {
    const options = providerConfig.options as Partial<ClaudeApiConfig>;

    if (!options.sessionKey) {
      throw new Error("ClaudeApiProvider requires sessionKey in config");
    }

    this.config = {
      sessionKey: options.sessionKey,
      organizationId: options.organizationId,
      userAgent: options.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      baseUrl: options.baseUrl || "https://claude.ai/api",
      projectId: options.projectId,
      requestDelay: options.requestDelay || 1000 // 1 секунда между запросами
    };

    // Инициализируем CloudflareBypasser
    this.bypasser = new CloudflareBypasser({
      sessionKey: this.config.sessionKey,
      userAgent: this.config.userAgent,
      baseReferer: this.config.projectId
        ? `https://claude.ai/project/${this.config.projectId}`
        : 'https://claude.ai',
      timeout: 30000
    });

    logger.info('ClaudeApiProvider initialized with Cloudflare bypasser');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Получаем organization ID если не указан
    if (!this.config.organizationId) {
      const orgs = await this.getOrganizations();
      if (orgs.length === 0) {
        throw new Error("No organizations found. Check your sessionKey.");
      }
      this.organizationId = orgs[0].uuid;
      logger.info({ organizationId: this.organizationId }, "Organization ID obtained");
    } else {
      this.organizationId = this.config.organizationId;
    }

    this.initialized = true;
    logger.info("Claude API provider initialized");
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.initialize();

      // Если organizationId указан, пробуем получить проекты
      if (this.organizationId) {
        const projects = await this.getProjects();
        return projects.length >= 0; // Возвращаем true даже если проектов нет
      }

      // Иначе проверяем organizations
      const orgs = await this.getOrganizations();
      return orgs.length > 0;
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "Claude API not available");
      return false;
    }
  }

  private async rateLimitedFetch(url: string, options?: RequestInit): Promise<Response> {
    if (!this.bypasser) {
      throw new Error('CloudflareBypasser not initialized');
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.requestDelay!) {
      await new Promise(resolve =>
        setTimeout(resolve, this.config.requestDelay! - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();

    // Используем CloudflareBypasser вместо обычного fetch
    const method = options?.method?.toUpperCase() || 'GET';

    try {
      if (method === 'POST') {
        const body = options?.body ? JSON.parse(options.body as string) : undefined;
        const response = await this.bypasser.post(url, body);

        if (response.statusCode >= 400) {
          throw new Error(describeHttpError(response.statusCode, response.body, url));
        }

        const cleanHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof key === 'string' && typeof value === 'string') {
            cleanHeaders[key] = value;
          }
        }

        return {
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          statusText: response.statusCode === 200 ? 'OK' : 'Error',
          headers: new Headers(cleanHeaders),
          json: async () => JSON.parse(response.body),
          text: async () => response.body,
        } as Response;
      } else {
        const response = await this.bypasser.get(url);

        if (response.statusCode >= 400) {
          throw new Error(describeHttpError(response.statusCode, response.body, url));
        }

        const cleanHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof key === 'string' && typeof value === 'string') {
            cleanHeaders[key] = value;
          }
        }

        return {
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          statusText: response.statusCode === 200 ? 'OK' : 'Error',
          headers: new Headers(cleanHeaders),
          json: async () => JSON.parse(response.body),
          text: async () => response.body,
        } as Response;
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        url,
        method
      }, 'Request failed via CloudflareBypasser');
      throw error;
    }
  }

  private async getOrganizations(): Promise<ClaudeOrganization[]> {
    const response = await this.rateLimitedFetch(
      `${this.config.baseUrl}/organizations`
    );
    return await response.json() as ClaudeOrganization[];
  }

  async getProjects(): Promise<Project[]> {
    await this.initialize();

    try {
      const response = await this.rateLimitedFetch(
        `${this.config.baseUrl}/organizations/${this.organizationId}/projects`
      );
      
      const projects = await response.json() as ClaudeProject[];
      
      return projects.map(p => ({
        id: p.uuid,
        name: p.name,
        description: p.description,
        instructions: p.prompt_template,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at)
      }));
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, "Failed to get projects");
      return [];
    }
  }

  async getProject(projectId: string): Promise<Project | null> {
    await this.initialize();

    try {
      const response = await this.rateLimitedFetch(
        `${this.config.baseUrl}/organizations/${this.organizationId}/projects/${projectId}`
      );
      
      const p = await response.json() as ClaudeProject;
      
      return {
        id: p.uuid,
        name: p.name,
        description: p.description,
        instructions: p.prompt_template,
        createdAt: new Date(p.created_at),
        updatedAt: new Date(p.updated_at)
      };
    } catch (error) {
      logger.error({ error, projectId }, "Failed to get project");
      return null;
    }
  }

  async getConversations(projectId?: string): Promise<Conversation[]> {
    await this.initialize();

    const targetProjectId = projectId || this.config.projectId;

    try {
      let url = `${this.config.baseUrl}/organizations/${this.organizationId}/chat_conversations`;
      
      if (targetProjectId) {
        url += `?project_uuid=${targetProjectId}`;
      }

      const response = await this.rateLimitedFetch(url);
      const conversations = await response.json() as ClaudeConversation[];

      // Фильтруем по проекту если указан
      const filtered = targetProjectId 
        ? conversations.filter(c => c.project_uuid === targetProjectId)
        : conversations;

      // Получаем сообщения для каждого разговора
      const result: Conversation[] = [];
      
      for (const conv of filtered) {
        const messages = await this.getConversationMessages(conv.uuid);
        
        result.push({
          id: conv.uuid,
          name: conv.name,
          projectId: conv.project_uuid,
          createdAt: new Date(conv.created_at),
          updatedAt: new Date(conv.updated_at),
          messages
        });
      }

      logger.info({ count: result.length, projectId: targetProjectId }, "Conversations fetched");
      return result;
    } catch (error) {
      logger.error({ error }, "Failed to get conversations");
      return [];
    }
  }

  private async getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
    try {
      const response = await this.rateLimitedFetch(
        `${this.config.baseUrl}/organizations/${this.organizationId}/chat_conversations/${conversationId}`
      );
      
      const data = await response.json() as { chat_messages: ClaudeMessage[] };
      
      return data.chat_messages.map(m => {
        // Извлекаем текст из content array если есть
        let text = m.text;
        if (!text && m.content) {
          text = m.content
            .filter(c => c.type === "text")
            .map(c => c.text || "")
            .join("\n");
        }

        return {
          id: m.uuid,
          text,
          sender: m.sender,
          createdAt: new Date(m.created_at),
          attachments: m.attachments?.map(a => ({
            fileName: a.file_name,
            fileType: a.file_type,
            content: a.extracted_content
          }))
        };
      });
    } catch (error) {
      logger.error({ error, conversationId }, "Failed to get messages");
      return [];
    }
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    await this.initialize();

    try {
      const response = await this.rateLimitedFetch(
        `${this.config.baseUrl}/organizations/${this.organizationId}/chat_conversations/${conversationId}`
      );
      
      const data = await response.json() as ClaudeConversation & { chat_messages: ClaudeMessage[] };
      
      const messages = data.chat_messages.map(m => ({
        id: m.uuid,
        text: m.text,
        sender: m.sender,
        createdAt: new Date(m.created_at),
        attachments: m.attachments?.map(a => ({
          fileName: a.file_name,
          fileType: a.file_type,
          content: a.extracted_content
        }))
      }));

      return {
        id: data.uuid,
        name: data.name,
        projectId: data.project_uuid,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        messages
      };
    } catch (error) {
      logger.error({ error, conversationId }, "Failed to get conversation");
      return null;
    }
  }

  async getArtifacts(conversationId?: string): Promise<Artifact[]> {
    await this.initialize();

    const artifacts: Artifact[] = [];

    try {
      const conversations = conversationId
        ? [await this.getConversation(conversationId)].filter(Boolean) as Conversation[]
        : await this.getConversations();

      for (const conv of conversations) {
        for (const msg of conv.messages) {
          if (msg.sender === "assistant") {
            // Извлекаем артефакты из текста сообщения
            const extracted = this.extractArtifactsFromMessage(
              msg.text,
              conv.id,
              conv.name,
              msg.createdAt
            );
            artifacts.push(...extracted);
          }
        }
      }

      logger.info({
        count: artifacts.length,
        native: artifacts.filter(a => a.isNative).length,
        codeBlocks: artifacts.filter(a => !a.isNative).length
      }, "Artifacts extracted");

      return artifacts;
    } catch (error) {
      logger.error({ error }, "Failed to get artifacts");
      return [];
    }
  }

  /**
   * Получить артефакт по ID
   */
  async getArtifact(artifactId: string, conversationId?: string): Promise<Artifact | null> {
    const artifacts = await this.getArtifacts(conversationId);
    return artifacts.find(a => a.id === artifactId) || null;
  }

  /**
   * Получить артефакты определённого типа
   */
  async getArtifactsByType(
    type: ArtifactType | ArtifactMimeType,
    conversationId?: string
  ): Promise<Artifact[]> {
    const artifacts = await this.getArtifacts(conversationId);
    return artifacts.filter(a =>
      a.type === type ||
      a.mimeType === type ||
      (a.mimeType && mapMimeTypeToArtifactType(a.mimeType) === type)
    );
  }

  /**
   * Поиск артефактов по заголовку
   */
  async searchArtifactsByTitle(
    query: string,
    conversationId?: string
  ): Promise<Artifact[]> {
    const artifacts = await this.getArtifacts(conversationId);
    const lowerQuery = query.toLowerCase();
    return artifacts.filter(a =>
      a.title.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Извлечение артефактов из текста сообщения
   * Поддерживает как нативные артефакты Claude (<antArtifact>), так и код-блоки
   */
  private extractArtifactsFromMessage(
    text: string,
    conversationId: string,
    conversationName?: string,
    messageCreatedAt?: Date
  ): Artifact[] {
    const artifacts: Artifact[] = [];
    const createdAt = messageCreatedAt || new Date();

    // 1. Парсим нативные артефакты Claude (<antArtifact> теги)
    const parseResult = parseArtifactsFromText(text);

    for (const nativeArtifact of parseResult.artifacts) {
      artifacts.push(this.convertNativeArtifact(
        nativeArtifact,
        conversationId,
        conversationName,
        createdAt
      ));
    }

    // 2. Парсим код-блоки из оставшегося текста (для обратной совместимости)
    const textWithoutArtifacts = parseResult.textWithoutArtifacts;
    const codeBlocks = this.extractCodeBlocks(
      textWithoutArtifacts,
      conversationId,
      conversationName,
      createdAt
    );
    artifacts.push(...codeBlocks);

    return artifacts;
  }

  /**
   * Конвертация нативного артефакта Claude в общий формат
   */
  private convertNativeArtifact(
    native: ClaudeNativeArtifact,
    conversationId: string,
    conversationName?: string,
    createdAt?: Date
  ): Artifact {
    return {
      id: native.identifier,
      title: native.title,
      type: mapMimeTypeToArtifactType(native.type) as ArtifactType,
      mimeType: native.type as ArtifactMimeType,
      content: native.content,
      language: native.language,
      conversationId,
      conversationName,
      version: native.version,
      isNative: true,
      createdAt: createdAt || new Date()
    };
  }

  /**
   * Извлечение код-блоков из текста (legacy метод)
   */
  private extractCodeBlocks(
    text: string,
    conversationId: string,
    conversationName?: string,
    createdAt?: Date
  ): Artifact[] {
    const artifacts: Artifact[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    let index = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const language = match[1] || "text";
      const content = match[2];

      // Определяем тип артефакта по языку
      let type: ArtifactType = "code";
      if (language === "jsx" || language === "tsx") type = "react";
      else if (language === "html") type = "html";
      else if (language === "svg") type = "svg";
      else if (language === "mermaid") type = "mermaid";
      else if (language === "markdown" || language === "md") type = "document";

      artifacts.push({
        id: `${conversationId}_codeblock_${index}`,
        title: `Code block ${index + 1} (${language})`,
        type,
        content,
        language,
        conversationId,
        conversationName,
        isNative: false,
        createdAt: createdAt || new Date()
      });

      index++;
    }

    return artifacts;
  }

  async getKnowledgeDocuments(projectId: string): Promise<KnowledgeDocument[]> {
    await this.initialize();

    try {
      const response = await this.rateLimitedFetch(
        `${this.config.baseUrl}/organizations/${this.organizationId}/projects/${projectId}/docs`
      );
      
      const docs = await response.json() as Array<{
        uuid: string;
        file_name: string;
        content: string;
        created_at: string;
      }>;

      return docs.map(d => ({
        id: d.uuid,
        name: d.file_name,
        content: d.content,
        projectId,
        createdAt: new Date(d.created_at)
      }));
    } catch (error) {
      logger.error({ error, projectId }, "Failed to get knowledge documents");
      return [];
    }
  }

  async sync(): Promise<SyncResult> {
    await this.initialize();

    const result: SyncResult = {
      conversations: 0,
      messages: 0,
      artifacts: 0,
      documents: 0,
      errors: []
    };

    try {
      // Синхронизируем проекты
      const projects = await this.getProjects();
      
      for (const project of projects) {
        // Фильтруем по projectId если указан
        if (this.config.projectId && project.id !== this.config.projectId) {
          continue;
        }

        try {
          // Получаем документы проекта
          const docs = await this.getKnowledgeDocuments(project.id);
          result.documents += docs.length;

          // Получаем разговоры проекта
          const conversations = await this.getConversations(project.id);
          result.conversations += conversations.length;

          for (const conv of conversations) {
            result.messages += conv.messages.length;
          }

          // Получаем артефакты
          const artifacts = await this.getArtifacts();
          result.artifacts += artifacts.length;

        } catch (error) {
          const msg = `Failed to sync project ${project.id}: ${error}`;
          result.errors.push(msg);
          logger.error({ error, projectId: project.id }, msg);
        }
      }

      logger.info({ result }, "Sync completed");
    } catch (error) {
      const msg = `Sync failed: ${error}`;
      result.errors.push(msg);
      logger.error({ error }, msg);
    }

    return result;
  }

  async close(): Promise<void> {
    this.initialized = false;
    logger.info("Claude API provider closed");
  }
}
