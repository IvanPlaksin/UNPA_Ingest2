/**
 * Sync Worker v2
 * 
 * Воркер для синхронизации знаний с использованием ProviderManager.
 * Поддерживает множество источников данных через конфигурацию.
 */

import { v4 as uuidv4 } from "uuid";
import { QdrantService } from "../services/qdrant.js";
import { MemgraphService } from "../services/memgraph.js";
import { EmbeddingService } from "../services/embedding.js";
import { ProviderManager, type ProvidersConfiguration } from "../providers/index.js";
import type { Conversation, Artifact, KnowledgeDocument, Project } from "../providers/types.js";
import { createLogger } from "../utils/logger.js";
import { config } from "../config/index.js";

const logger = createLogger("sync-worker");

class SyncWorker {
  private qdrant: QdrantService;
  private memgraph: MemgraphService;
  private embedding: EmbeddingService;
  private providerManager: ProviderManager;
  private processing = false;

  constructor(providersConfig: ProvidersConfiguration) {
    this.qdrant = new QdrantService(config.qdrant);
    this.memgraph = new MemgraphService(config.memgraph);
    this.embedding = new EmbeddingService(config.tei);
    this.providerManager = new ProviderManager(providersConfig);
  }

  async initialize(): Promise<void> {
    await this.qdrant.initialize();
    await this.memgraph.initialize();
    await this.providerManager.initialize();
    
    logger.info("Sync worker initialized with providers");
  }

  async start(): Promise<void> {
    await this.initialize();

    // Первичная полная синхронизация
    await this.fullSync();

    // Периодическая синхронизация
    const syncInterval = config.sync.intervalMs;
    setInterval(async () => {
      if (!this.processing) {
        await this.fullSync();
      }
    }, syncInterval);

    logger.info({ syncInterval }, "Sync worker started");
  }

  async fullSync(): Promise<void> {
    if (this.processing) {
      logger.info("Sync already in progress, skipping");
      return;
    }

    this.processing = true;
    logger.info("Starting full sync");

    try {
      // Получаем статистику провайдеров
      const providerStats = await this.providerManager.getStats();
      logger.info({ providerStats }, "Provider stats");

      // Синхронизируем проекты
      const projects = await this.providerManager.getProjects();
      for (const project of projects) {
        await this.indexProject(project);
      }

      // Синхронизируем разговоры
      const conversations = await this.providerManager.getConversations();
      for (const conversation of conversations) {
        await this.indexConversation(conversation);
      }

      // Синхронизируем артефакты
      const artifacts = await this.providerManager.getArtifacts();
      for (const artifact of artifacts) {
        await this.indexArtifact(artifact);
      }

      // Синхронизируем документы проектов
      for (const project of projects) {
        const documents = await this.providerManager.getKnowledgeDocuments(project.id);
        for (const doc of documents) {
          await this.indexDocument(doc);
        }
      }

      logger.info({
        projects: projects.length,
        conversations: conversations.length,
        artifacts: artifacts.length
      }, "Full sync completed");

    } catch (error) {
      logger.error({ error }, "Full sync failed");
    } finally {
      this.processing = false;
    }
  }

  private async indexProject(project: Project): Promise<void> {
    try {
      // Создаём ноду проекта в графе
      await this.memgraph.query(`
        MERGE (p:Project {id: $id})
        SET p.name = $name,
            p.description = $description,
            p.instructions = $instructions,
            p.created_at = datetime($createdAt),
            p.updated_at = datetime($updatedAt)
      `, {
        id: project.id,
        name: project.name,
        description: project.description || "",
        instructions: project.instructions || "",
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString()
      });

      // Индексируем инструкции если есть
      if (project.instructions) {
        const vector = await this.embedding.embedDocument(project.instructions);
        
        await this.qdrant.upsert([{
          id: `project_instructions_${project.id}`,
          vector,
          payload: {
            content: project.instructions,
            source_type: "instruction",
            project_id: project.id,
            project_name: project.name,
            type: "project_instructions",
            created_at: project.createdAt.toISOString()
          }
        }]);
      }

      logger.debug({ projectId: project.id }, "Project indexed");
    } catch (error) {
      logger.error({ error, projectId: project.id }, "Failed to index project");
    }
  }

  private async indexConversation(conversation: Conversation): Promise<void> {
    try {
      // Создаём ноду разговора в графе
      await this.memgraph.query(`
        MERGE (c:Chat {id: $id})
        SET c.name = $name,
            c.project_id = $projectId,
            c.created_at = datetime($createdAt),
            c.updated_at = datetime($updatedAt)
      `, {
        id: conversation.id,
        name: conversation.name,
        projectId: conversation.projectId || "",
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString()
      });

      // Связываем с проектом если есть
      if (conversation.projectId) {
        await this.memgraph.query(`
          MATCH (c:Chat {id: $chatId})
          MATCH (p:Project {id: $projectId})
          MERGE (c)-[:BELONGS_TO]->(p)
        `, {
          chatId: conversation.id,
          projectId: conversation.projectId
        });
      }

      // Индексируем сообщения
      for (const message of conversation.messages) {
        if (!message.text || message.text.length < 50) {
          continue;
        }

        const chunks = this.chunkText(message.text, 512, 50);

        for (let i = 0; i < chunks.length; i++) {
          const chunkId = `${message.id}_chunk_${i}`;
          const vector = await this.embedding.embedDocument(chunks[i]);

          await this.qdrant.upsert([{
            id: chunkId,
            vector,
            payload: {
              content: chunks[i],
              source_type: "chat",
              chat_id: conversation.id,
              chat_name: conversation.name,
              message_id: message.id,
              sender: message.sender,
              project_id: conversation.projectId || "",
              project_name: conversation.projectName || "",
              created_at: message.createdAt.toISOString(),
              chunk_index: i,
              total_chunks: chunks.length
            }
          }]);
        }

        // Индексируем вложения
        if (message.attachments) {
          for (const attachment of message.attachments) {
            if (attachment.content) {
              const attachmentId = `${message.id}_attachment_${attachment.fileName}`;
              const vector = await this.embedding.embedDocument(attachment.content);

              await this.qdrant.upsert([{
                id: attachmentId,
                vector,
                payload: {
                  content: attachment.content,
                  source_type: "document",
                  file_name: attachment.fileName,
                  file_type: attachment.fileType,
                  chat_id: conversation.id,
                  project_id: conversation.projectId || "",
                  created_at: message.createdAt.toISOString()
                }
              }]);
            }
          }
        }
      }

      logger.debug({ 
        chatId: conversation.id, 
        messages: conversation.messages.length 
      }, "Conversation indexed");
    } catch (error) {
      logger.error({ error, chatId: conversation.id }, "Failed to index conversation");
    }
  }

  private async indexArtifact(artifact: Artifact): Promise<void> {
    try {
      // Создаём ноду артефакта в графе
      await this.memgraph.query(`
        MERGE (a:Artifact {id: $id})
        SET a.title = $title,
            a.type = $type,
            a.language = $language,
            a.conversation_id = $conversationId,
            a.created_at = datetime($createdAt)
      `, {
        id: artifact.id,
        title: artifact.title,
        type: artifact.type,
        language: artifact.language || "",
        conversationId: artifact.conversationId || "",
        createdAt: artifact.createdAt.toISOString()
      });

      // Связываем с разговором если есть
      if (artifact.conversationId) {
        await this.memgraph.query(`
          MATCH (a:Artifact {id: $artifactId})
          MATCH (c:Chat {id: $chatId})
          MERGE (a)-[:CREATED_IN]->(c)
        `, {
          artifactId: artifact.id,
          chatId: artifact.conversationId
        });
      }

      // Индексируем в Qdrant
      const vector = await this.embedding.embedDocument(artifact.content);

      await this.qdrant.upsert([{
        id: artifact.id,
        vector,
        payload: {
          content: artifact.content,
          source_type: "artifact",
          artifact_type: artifact.type,
          title: artifact.title,
          language: artifact.language || "",
          conversation_id: artifact.conversationId || "",
          created_at: artifact.createdAt.toISOString()
        }
      }]);

      logger.debug({ artifactId: artifact.id, type: artifact.type }, "Artifact indexed");
    } catch (error) {
      logger.error({ error, artifactId: artifact.id }, "Failed to index artifact");
    }
  }

  private async indexDocument(doc: KnowledgeDocument): Promise<void> {
    try {
      // Создаём ноду документа в графе
      await this.memgraph.query(`
        MERGE (d:Knowledge {id: $id})
        SET d.name = $name,
            d.type = 'document',
            d.project_id = $projectId,
            d.created_at = datetime($createdAt)
      `, {
        id: doc.id,
        name: doc.name,
        projectId: doc.projectId,
        createdAt: doc.createdAt.toISOString()
      });

      // Связываем с проектом
      await this.memgraph.query(`
        MATCH (d:Knowledge {id: $docId})
        MATCH (p:Project {id: $projectId})
        MERGE (d)-[:BELONGS_TO]->(p)
      `, {
        docId: doc.id,
        projectId: doc.projectId
      });

      // Разбиваем на чанки и индексируем
      const chunks = this.chunkText(doc.content, 512, 50);

      for (let i = 0; i < chunks.length; i++) {
        const chunkId = `${doc.id}_chunk_${i}`;
        const vector = await this.embedding.embedDocument(chunks[i]);

        await this.qdrant.upsert([{
          id: chunkId,
          vector,
          payload: {
            content: chunks[i],
            source_type: "document",
            document_id: doc.id,
            document_name: doc.name,
            project_id: doc.projectId,
            chunk_index: i,
            total_chunks: chunks.length,
            created_at: doc.createdAt.toISOString()
          }
        }]);
      }

      logger.debug({ docId: doc.id }, "Document indexed");
    } catch (error) {
      logger.error({ error, docId: doc.id }, "Failed to index document");
    }
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    let currentChunk = "";

    for (const sentence of sentences) {
      if ((currentChunk + " " + sentence).length <= chunkSize) {
        currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(c => c.length > 0);
  }

  async close(): Promise<void> {
    await this.providerManager.close();
    await this.memgraph.close();
    logger.info("Sync worker closed");
  }
}

// ============================================================
// Запуск воркера
// ============================================================

async function main() {
  // Загружаем конфигурацию провайдеров
  const configPath = process.env.PROVIDERS_CONFIG || "/app/config/providers.json";
  
  let providersConfig: ProvidersConfiguration;
  
  try {
    providersConfig = await ProviderManager.loadConfig(configPath);
  } catch {
    // Если файла нет, используем конфигурацию из env
    providersConfig = ProviderManager.configFromEnv();
  }

  logger.info({ 
    configPath,
    defaultProvider: providersConfig.defaultProvider,
    providers: Object.keys(providersConfig.providers)
  }, "Starting sync worker");

  const worker = new SyncWorker(providersConfig);
  
  // Graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("Received SIGTERM, shutting down");
    await worker.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("Received SIGINT, shutting down");
    await worker.close();
    process.exit(0);
  });

  await worker.start();
}

main().catch((error) => {
  logger.error({ error }, "Worker failed to start");
  process.exit(1);
});
