/**
 * File Provider
 * 
 * Провайдер для работы с локальными файлами:
 * - JSON экспорты из Claude.ai
 * - Markdown документы
 * - Артефакты (HTML, React, SVG, Mermaid)
 */

import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import matter from "gray-matter";
import { watch, FSWatcher } from "chokidar";
import { createLogger } from "../utils/logger.js";
import {
  parseArtifactsFromText,
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

const logger = createLogger("file-provider");

interface FileProviderConfig {
  /** Путь к директории с данными */
  dataPath: string;
  /** Путь к директории с артефактами */
  artifactsPath?: string;
  /** Включить watch режим */
  watchEnabled?: boolean;
  /** Паттерны файлов для игнорирования */
  ignorePatterns?: string[];
}

interface ClaudeExportMessage {
  uuid: string;
  text: string;
  sender: "human" | "assistant";
  created_at: string;
  attachments?: Array<{
    file_name: string;
    file_type: string;
    extracted_content?: string;
  }>;
}

interface ClaudeExportConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  chat_messages: ClaudeExportMessage[];
  project?: {
    uuid: string;
    name: string;
  };
}

interface ClaudeExport {
  conversations: ClaudeExportConversation[];
}

export class FileProvider implements DataProvider {
  readonly name = "Local Files";
  readonly type = "file";

  private config: FileProviderConfig;
  private watcher: FSWatcher | null = null;
  private cache: {
    projects: Map<string, Project>;
    conversations: Map<string, Conversation>;
    artifacts: Map<string, Artifact>;
    documents: Map<string, KnowledgeDocument>;
  };
  private initialized = false;

  constructor(providerConfig: ProviderConfig) {
    const options = providerConfig.options as Partial<FileProviderConfig>;

    if (!options.dataPath) {
      throw new Error("FileProvider requires dataPath in config");
    }

    this.config = {
      dataPath: options.dataPath,
      artifactsPath: options.artifactsPath || path.join(options.dataPath, "artifacts"),
      watchEnabled: options.watchEnabled ?? true,
      ignorePatterns: options.ignorePatterns || ["node_modules", ".git", "*.log"]
    };

    this.cache = {
      projects: new Map(),
      conversations: new Map(),
      artifacts: new Map(),
      documents: new Map()
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Проверяем существование директорий
    try {
      await fs.access(this.config.dataPath);
    } catch {
      await fs.mkdir(this.config.dataPath, { recursive: true });
      logger.info({ path: this.config.dataPath }, "Created data directory");
    }

    try {
      await fs.access(this.config.artifactsPath!);
    } catch {
      await fs.mkdir(this.config.artifactsPath!, { recursive: true });
      logger.info({ path: this.config.artifactsPath }, "Created artifacts directory");
    }

    // Первичная загрузка
    await this.loadAllData();

    // Запускаем watcher если включен
    if (this.config.watchEnabled) {
      this.startWatcher();
    }

    this.initialized = true;
    logger.info("File provider initialized");
  }

  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.config.dataPath);
      return true;
    } catch {
      return false;
    }
  }

  private startWatcher(): void {
    this.watcher = watch([
      this.config.dataPath,
      this.config.artifactsPath!
    ], {
      persistent: true,
      ignoreInitial: true,
      ignored: this.config.ignorePatterns,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    this.watcher.on("add", async (filePath) => {
      logger.info({ file: filePath }, "File added");
      await this.processFile(filePath);
    });

    this.watcher.on("change", async (filePath) => {
      logger.info({ file: filePath }, "File changed");
      await this.processFile(filePath);
    });

    this.watcher.on("unlink", (filePath) => {
      logger.info({ file: filePath }, "File removed");
      this.removeFromCache(filePath);
    });

    logger.info("File watcher started");
  }

  private async loadAllData(): Promise<void> {
    // Загружаем JSON экспорты
    const jsonFiles = await glob(path.join(this.config.dataPath, "**/*.json"));
    for (const file of jsonFiles) {
      await this.processJsonFile(file);
    }

    // Загружаем Markdown документы
    const mdFiles = await glob(path.join(this.config.dataPath, "**/*.md"));
    for (const file of mdFiles) {
      await this.processMarkdownFile(file);
    }

    // Загружаем артефакты
    const artifactFiles = await glob(path.join(this.config.artifactsPath!, "**/*.*"));
    for (const file of artifactFiles) {
      await this.processArtifactFile(file);
    }

    logger.info({
      projects: this.cache.projects.size,
      conversations: this.cache.conversations.size,
      artifacts: this.cache.artifacts.size,
      documents: this.cache.documents.size
    }, "Data loaded");
  }

  private async processFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === ".json") {
        await this.processJsonFile(filePath);
      } else if (ext === ".md") {
        await this.processMarkdownFile(filePath);
      } else if (filePath.startsWith(this.config.artifactsPath!)) {
        await this.processArtifactFile(filePath);
      }
    } catch (error) {
      logger.error({ error, file: filePath }, "Failed to process file");
    }
  }

  private async processJsonFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, "utf-8");
    let data: unknown;

    try {
      data = JSON.parse(content);
    } catch {
      logger.warn({ file: filePath }, "Invalid JSON file");
      return;
    }

    // Проверяем, это ли Claude.ai экспорт
    if (this.isClaudeExport(data)) {
      await this.processClaudeExport(data as ClaudeExport);
    }
  }

  private isClaudeExport(data: unknown): boolean {
    return (
      typeof data === "object" &&
      data !== null &&
      "conversations" in data &&
      Array.isArray((data as ClaudeExport).conversations)
    );
  }

  private async processClaudeExport(exportData: ClaudeExport): Promise<void> {
    for (const conv of exportData.conversations) {
      // Создаём проект если указан
      if (conv.project) {
        if (!this.cache.projects.has(conv.project.uuid)) {
          this.cache.projects.set(conv.project.uuid, {
            id: conv.project.uuid,
            name: conv.project.name,
            createdAt: new Date(conv.created_at),
            updatedAt: new Date(conv.updated_at)
          });
        }
      }

      // Конвертируем сообщения
      const messages: ChatMessage[] = conv.chat_messages.map(m => ({
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

      // Сохраняем разговор
      this.cache.conversations.set(conv.uuid, {
        id: conv.uuid,
        name: conv.name,
        projectId: conv.project?.uuid,
        projectName: conv.project?.name,
        createdAt: new Date(conv.created_at),
        updatedAt: new Date(conv.updated_at),
        messages
      });

      // Извлекаем артефакты из сообщений
      for (const msg of messages) {
        if (msg.sender === "assistant") {
          const artifacts = this.extractArtifactsFromMessage(
            msg.text,
            conv.uuid,
            conv.name,
            msg.createdAt
          );
          for (const artifact of artifacts) {
            this.cache.artifacts.set(artifact.id, artifact);
          }
        }
      }
    }

    logger.info({ 
      conversations: exportData.conversations.length 
    }, "Claude export processed");
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

    // 2. Парсим код-блоки из оставшегося текста
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

  private async processMarkdownFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, "utf-8");
    const { data: frontmatter, content: body } = matter(content);

    const id = frontmatter.id || path.basename(filePath, ".md");
    const projectId = frontmatter.projectId || "default";

    // Создаём проект если нужен
    if (!this.cache.projects.has(projectId)) {
      this.cache.projects.set(projectId, {
        id: projectId,
        name: frontmatter.projectName || "Default Project",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Сохраняем как документ
    this.cache.documents.set(id, {
      id,
      name: frontmatter.title || path.basename(filePath, ".md"),
      content: body,
      projectId,
      createdAt: new Date(frontmatter.createdAt || Date.now())
    });

    logger.debug({ id, file: filePath }, "Markdown processed");
  }

  private async processArtifactFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    const supportedExtensions = [".html", ".jsx", ".tsx", ".svg", ".mermaid", ".mmd"];

    if (!supportedExtensions.includes(ext)) {
      return;
    }

    const content = await fs.readFile(filePath, "utf-8");
    const id = path.basename(filePath, ext);
    const type = this.getArtifactType(ext);

    this.cache.artifacts.set(id, {
      id,
      title: id,
      type,
      content,
      language: ext.replace(".", ""),
      createdAt: new Date()
    });

    logger.debug({ id, type, file: filePath }, "Artifact processed");
  }

  private getArtifactType(ext: string): Artifact["type"] {
    const types: Record<string, Artifact["type"]> = {
      ".html": "html",
      ".jsx": "react",
      ".tsx": "react",
      ".svg": "svg",
      ".mermaid": "mermaid",
      ".mmd": "mermaid"
    };
    return types[ext] || "code";
  }

  private removeFromCache(filePath: string): void {
    const id = path.basename(filePath, path.extname(filePath));
    
    this.cache.documents.delete(id);
    this.cache.artifacts.delete(id);
    
    // Для разговоров нужна более сложная логика
    // (пока не удаляем, так как JSON может содержать много разговоров)
  }

  // ============================================================
  // DataProvider interface implementation
  // ============================================================

  async getProjects(): Promise<Project[]> {
    await this.initialize();
    return Array.from(this.cache.projects.values());
  }

  async getProject(projectId: string): Promise<Project | null> {
    await this.initialize();
    return this.cache.projects.get(projectId) || null;
  }

  async getConversations(projectId?: string): Promise<Conversation[]> {
    await this.initialize();
    
    const conversations = Array.from(this.cache.conversations.values());
    
    if (projectId) {
      return conversations.filter(c => c.projectId === projectId);
    }
    
    return conversations;
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    await this.initialize();
    return this.cache.conversations.get(conversationId) || null;
  }

  async getArtifacts(conversationId?: string): Promise<Artifact[]> {
    await this.initialize();
    
    const artifacts = Array.from(this.cache.artifacts.values());
    
    if (conversationId) {
      return artifacts.filter(a => a.conversationId === conversationId);
    }
    
    return artifacts;
  }

  async getKnowledgeDocuments(projectId: string): Promise<KnowledgeDocument[]> {
    await this.initialize();
    
    return Array.from(this.cache.documents.values())
      .filter(d => d.projectId === projectId);
  }

  async sync(): Promise<SyncResult> {
    await this.initialize();
    
    // Перезагружаем все данные
    this.cache.projects.clear();
    this.cache.conversations.clear();
    this.cache.artifacts.clear();
    this.cache.documents.clear();
    
    await this.loadAllData();

    return {
      conversations: this.cache.conversations.size,
      messages: Array.from(this.cache.conversations.values())
        .reduce((sum, c) => sum + c.messages.length, 0),
      artifacts: this.cache.artifacts.size,
      documents: this.cache.documents.size,
      errors: []
    };
  }

  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.initialized = false;
    logger.info("File provider closed");
  }
}
