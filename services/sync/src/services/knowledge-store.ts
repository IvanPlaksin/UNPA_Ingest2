/**
 * Knowledge Store - центральный сервис для работы со знаниями
 * Объединяет Qdrant (векторный поиск) и Memgraph (граф знаний)
 *
 * Расширенная версия с поддержкой KnowledgeQuantum схемы
 */

import { v4 as uuidv4 } from "uuid";
import { QdrantService, type SearchResult } from "./qdrant.js";
import {
  MemgraphService,
  type GraphResult,
  type KnowledgeQuantum,
  KnowledgeType,
  SourceType,
  LifecycleState,
  ConfidenceLevel,
  Volatility,
  RelationType
} from "./memgraph.js";
import { EmbeddingService } from "./embedding.js";
import { createLogger } from "../utils/logger.js";
import { createEmptyQuantum, computeFingerprint } from "../types/knowledge-schema.js";

const logger = createLogger("knowledge-store");

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  type: string;
  source_type: "chat" | "artifact" | "document" | "instruction";
  tags?: string[];
  metadata?: Record<string, unknown>;
  created_at: string;
}

// Re-export types
export {
  KnowledgeQuantum,
  KnowledgeType,
  SourceType,
  LifecycleState,
  ConfidenceLevel,
  Volatility,
  RelationType
};

export interface Resource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface ResourceContent {
  mimeType: string;
  text: string;
}

export interface AddKnowledgeInput {
  content: string;
  title: string;
  type: string;
  tags?: string[];
  relations?: Array<{ target: string; type: string }>;
}

/**
 * Расширенный ввод для создания KnowledgeQuantum
 */
export interface AddQuantumInput {
  // Контент
  title: string;
  content: string;

  // Классификация
  knowledge_type: KnowledgeType;
  project?: string;
  component?: string;
  layer?: string;
  tags?: string[];
  domain?: string;
  volatility?: Volatility;
  abstraction_level?: "strategic" | "tactical" | "operational";

  // Происхождение
  source_type: SourceType;
  source_id: string;
  source_name?: string;
  extraction_cycle?: number;

  // Семантика
  keywords?: string[];
  entities?: Array<{ name: string; type: string; confidence: number }>;
  summary?: string;
  language?: string;

  // Связи
  relations?: Array<{
    type: RelationType;
    target_id: string;
    target_name?: string;
    confidence?: number;
  }>;

  // Качество
  confidence?: ConfidenceLevel;
}

export class KnowledgeStore {
  constructor(
    private qdrant: QdrantService,
    private memgraph: MemgraphService,
    private embedding: EmbeddingService
  ) {}

  /**
   * Семантический поиск по базе знаний
   */
  async semanticSearch(
    query: string,
    limit: number = 5,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    try {
      // Генерируем эмбеддинг запроса
      const queryVector = await this.embedding.embed(query);
      
      // Поиск в Qdrant
      const results = await this.qdrant.search(queryVector, limit, filter);
      
      logger.info({ query, resultsCount: results.length }, "Semantic search completed");
      
      return results;
    } catch (error) {
      logger.error({ error, query }, "Semantic search failed");
      throw error;
    }
  }

  /**
   * Поиск связанных сущностей в графе
   */
  async findRelated(
    entity: string,
    relationType?: string,
    depth: number = 2
  ): Promise<GraphResult> {
    try {
      const results = await this.memgraph.findRelated(entity, relationType, depth);
      
      logger.info({ entity, nodesCount: results.nodes.length }, "Related entities found");
      
      return results;
    } catch (error) {
      logger.error({ error, entity }, "Find related failed");
      throw error;
    }
  }

  /**
   * Получение контекста проекта
   */
  async getProjectContext(options: {
    include_instructions?: boolean;
    include_architecture?: boolean;
    include_conventions?: boolean;
  } = {}): Promise<string> {
    const {
      include_instructions = true,
      include_architecture = true,
      include_conventions = true
    } = options;

    try {
      const context = await this.memgraph.getProjectContext();
      const parts: string[] = [];

      if (include_instructions && context.instructions.length > 0) {
        parts.push("## Инструкции проекта\n");
        context.instructions.forEach((inst, i) => {
          parts.push(`${i + 1}. ${inst}\n`);
        });
      }

      if (include_architecture && context.architecture.length > 0) {
        parts.push("\n## Архитектурные решения\n");
        context.architecture.forEach(arch => {
          parts.push(`### ${arch.title}\n`);
          parts.push(`${arch.content}\n`);
          if (arch.relations && Array.isArray(arch.relations) && arch.relations.length > 0) {
            parts.push("Связи: ");
            parts.push(arch.relations.map((r: { type: string; target: string }) => 
              `${r.type} → ${r.target}`
            ).join(", "));
            parts.push("\n");
          }
        });
      }

      if (include_conventions && context.conventions.length > 0) {
        parts.push("\n## Конвенции и стандарты\n");
        context.conventions.forEach(conv => {
          parts.push(`- ${conv}\n`);
        });
      }

      return parts.join("");
    } catch (error) {
      logger.error({ error }, "Failed to get project context");
      return "Контекст проекта недоступен.";
    }
  }

  /**
   * Поиск артефактов
   */
  async findArtifacts(
    query?: string,
    type?: string,
    language?: string
  ): Promise<SearchResult[]> {
    const filter: Record<string, unknown> = {
      source_type: "artifact"
    };

    if (type) {
      filter.artifact_type = type;
    }

    if (language) {
      filter.language = language;
    }

    if (query) {
      return this.semanticSearch(query, 10, filter);
    }

    // Без запроса - просто фильтруем
    // Используем нулевой вектор для получения случайных результатов
    const zeroVector = new Array(1024).fill(0);
    return this.qdrant.search(zeroVector, 20, filter);
  }

  /**
   * Поиск по истории чатов
   */
  async searchChatHistory(
    query: string,
    dateRange?: { from?: string; to?: string },
    includeContext: boolean = true
  ): Promise<SearchResult[]> {
    const filter: Record<string, unknown> = {
      source_type: "chat"
    };

    if (dateRange?.from) {
      filter.date_from = dateRange.from;
    }

    if (dateRange?.to) {
      filter.date_to = dateRange.to;
    }

    const results = await this.semanticSearch(query, includeContext ? 10 : 5, filter);

    if (includeContext) {
      // Расширяем контекст - добавляем соседние сообщения
      // (упрощённая реализация - в production нужен более сложный алгоритм)
      return results.map(r => ({
        ...r,
        metadata: {
          ...r.metadata,
          context_included: true
        }
      }));
    }

    return results;
  }

  /**
   * Добавление нового знания (legacy метод)
   */
  async addKnowledge(input: AddKnowledgeInput): Promise<string> {
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      // 1. Генерируем эмбеддинг
      const vector = await this.embedding.embedDocument(input.content);

      // 2. Сохраняем в Qdrant
      await this.qdrant.upsert([{
        id,
        vector,
        payload: {
          title: input.title,
          content: input.content,
          type: input.type,
          source_type: "document",
          tags: input.tags || [],
          created_at: now,
          updated_at: now
        }
      }]);

      // 3. Создаём ноду в графе
      await this.memgraph.createKnowledgeNode({
        id,
        title: input.title,
        content: input.content,
        type: input.type,
        tags: input.tags
      });

      // 4. Создаём связи
      if (input.relations) {
        for (const rel of input.relations) {
          // Находим целевую сущность по имени
          const targetResults = await this.memgraph.query(
            `MATCH (t) WHERE t.title = $target OR t.name = $target RETURN t.id as id LIMIT 1`,
            { target: rel.target }
          );

          if (targetResults.length > 0) {
            await this.memgraph.createRelation(
              id,
              targetResults[0].id as string,
              rel.type.toUpperCase().replace(/\s+/g, "_")
            );
          }
        }
      }

      logger.info({ id, title: input.title }, "Knowledge added");

      return id;
    } catch (error) {
      logger.error({ error, input }, "Failed to add knowledge");
      throw error;
    }
  }

  /**
   * Добавление KnowledgeQuantum с полными метаданными
   */
  async addQuantum(input: AddQuantumInput): Promise<string> {
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      // 1. Создаём базовый квант
      const quantum = createEmptyQuantum(id);

      // 2. Заполняем identity
      quantum.identity.fingerprint = computeFingerprint(input.content);
      quantum.identity.lifecycle = LifecycleState.ACTIVE;
      quantum.identity.created_at = now;
      quantum.identity.updated_at = now;

      // 3. Заполняем provenance
      quantum.provenance = {
        source_type: input.source_type,
        source_id: input.source_id,
        source_name: input.source_name || input.source_id,
        extraction_cycle: input.extraction_cycle || 1,
        extracted_by: "knowledge-store",
        extracted_at: now
      };

      // 4. Заполняем classification
      quantum.classification = {
        knowledge_type: input.knowledge_type,
        project: input.project,
        component: input.component,
        layer: input.layer,
        tags: input.tags || [],
        domain: input.domain,
        volatility: input.volatility || Volatility.STABLE,
        abstraction_level: input.abstraction_level
      };

      // 5. Заполняем semantic
      quantum.semantic = {
        keywords: input.keywords || [],
        entities: input.entities || [],
        summary: input.summary,
        language: input.language || "ru"
      };

      // 6. Заполняем relationships
      if (input.relations) {
        quantum.relationships.explicit = input.relations.map(rel => ({
          type: rel.type,
          target_id: rel.target_id,
          target_name: rel.target_name,
          confidence: rel.confidence || 1.0,
          established_by: "user",
          established_at: now
        }));
      }

      // 7. Заполняем quality
      quantum.quality = {
        confidence: input.confidence || ConfidenceLevel.MEDIUM,
        completeness: this.estimateCompleteness(input),
        freshness: 1.0,
        relevance: 0.5,
        usage_count: 0
      };

      // 8. Заполняем content
      quantum.content = {
        title: input.title,
        body: input.content
      };

      // 9. Генерируем эмбеддинг
      const vector = await this.embedding.embedDocument(input.content);

      // 10. Сохраняем в Qdrant с расширенными метаданными
      await this.qdrant.upsert([{
        id,
        vector,
        payload: {
          // Core
          title: quantum.content.title,
          content: quantum.content.body,
          fingerprint: quantum.identity.fingerprint,
          version: quantum.identity.version,
          lifecycle: quantum.identity.lifecycle,

          // Provenance
          source_type: quantum.provenance.source_type,
          source_id: quantum.provenance.source_id,
          extraction_cycle: quantum.provenance.extraction_cycle,

          // Classification
          knowledge_type: quantum.classification.knowledge_type,
          project: quantum.classification.project,
          component: quantum.classification.component,
          layer: quantum.classification.layer,
          tags: quantum.classification.tags,
          volatility: quantum.classification.volatility,
          domain: quantum.classification.domain,

          // Semantic
          keywords: quantum.semantic.keywords,
          language: quantum.semantic.language,

          // Quality
          confidence: quantum.quality.confidence,
          completeness: quantum.quality.completeness,

          // Timestamps
          created_at: quantum.identity.created_at,
          updated_at: quantum.identity.updated_at
        }
      }]);

      // 11. Сохраняем в Memgraph
      await this.memgraph.createKnowledgeQuantum(quantum);

      logger.info({
        id,
        title: input.title,
        type: input.knowledge_type,
        project: input.project
      }, "Knowledge quantum added");

      return id;
    } catch (error) {
      logger.error({ error, input }, "Failed to add knowledge quantum");
      throw error;
    }
  }

  /**
   * Оценка полноты данных
   */
  private estimateCompleteness(input: AddQuantumInput): number {
    let score = 0;
    let maxScore = 0;

    // Обязательные поля (weight 1)
    maxScore += 3;
    if (input.title) score += 1;
    if (input.content) score += 1;
    if (input.knowledge_type) score += 1;

    // Важные поля (weight 0.5)
    maxScore += 3;
    if (input.project) score += 0.5;
    if (input.tags && input.tags.length > 0) score += 0.5;
    if (input.keywords && input.keywords.length > 0) score += 0.5;
    if (input.summary) score += 0.5;
    if (input.domain) score += 0.5;
    if (input.entities && input.entities.length > 0) score += 0.5;

    return Math.min(score / maxScore, 1);
  }

  /**
   * Получить квант знаний по ID
   */
  async getQuantum(id: string): Promise<KnowledgeQuantum | null> {
    // Обновляем метрики использования
    await this.memgraph.updateUsageMetrics(id);
    return this.memgraph.getKnowledgeQuantum(id);
  }

  /**
   * Поиск квантов по классификации
   */
  async findQuantums(filters: {
    knowledge_type?: KnowledgeType;
    project?: string;
    component?: string;
    tags?: string[];
    lifecycle?: LifecycleState;
    confidence?: ConfidenceLevel;
  }, limit: number = 50): Promise<KnowledgeQuantum[]> {
    return this.memgraph.findByClassification(filters, limit);
  }

  /**
   * Получить статистику по типам знаний
   */
  async getKnowledgeTypeStats(): Promise<Record<string, number>> {
    return this.memgraph.getKnowledgeTypeStats();
  }

  /**
   * Получение списка ресурсов для MCP
   */
  async listResources(): Promise<Resource[]> {
    try {
      // Получаем список документов из графа
      const docs = await this.memgraph.query(`
        MATCH (d:Knowledge)
        WHERE d.type IN ['document', 'instruction', 'architecture', 'convention']
        RETURN d.id as id, d.title as title, d.type as type, d.content as content
        LIMIT 100
      `);

      // Получаем артефакты
      const artifacts = await this.memgraph.query(`
        MATCH (a:Artifact)
        RETURN a.id as id, a.title as title, a.artifact_type as type, a.language as language
        LIMIT 100
      `);

      const resources: Resource[] = [];

      // Добавляем документы
      for (const doc of docs) {
        resources.push({
          uri: `project://knowledge/${doc.id}`,
          name: doc.title as string || `Document ${doc.id}`,
          description: `${doc.type}: ${(doc.content as string || "").substring(0, 100)}...`,
          mimeType: "text/markdown"
        });
      }

      // Добавляем артефакты
      for (const artifact of artifacts) {
        const mimeType = this.getMimeTypeForArtifact(artifact.type as string);
        resources.push({
          uri: `project://artifacts/${artifact.id}`,
          name: artifact.title as string || `Artifact ${artifact.id}`,
          description: `${artifact.type}${artifact.language ? ` (${artifact.language})` : ""}`,
          mimeType
        });
      }

      // Специальные ресурсы
      resources.unshift({
        uri: "project://context",
        name: "Project Context",
        description: "Полный контекст проекта: инструкции, архитектура, конвенции",
        mimeType: "text/markdown"
      });

      return resources;
    } catch (error) {
      logger.error({ error }, "Failed to list resources");
      return [];
    }
  }

  /**
   * Чтение ресурса
   */
  async readResource(uri: string): Promise<ResourceContent> {
    try {
      // project://context
      if (uri === "project://context") {
        const context = await this.getProjectContext({
          include_instructions: true,
          include_architecture: true,
          include_conventions: true
        });
        return {
          mimeType: "text/markdown",
          text: context
        };
      }

      // project://knowledge/{id}
      if (uri.startsWith("project://knowledge/")) {
        const id = uri.replace("project://knowledge/", "");
        const results = await this.memgraph.query(
          `MATCH (d:Knowledge {id: $id}) RETURN d.content as content, d.title as title`,
          { id }
        );

        if (results.length === 0) {
          throw new Error(`Knowledge not found: ${id}`);
        }

        return {
          mimeType: "text/markdown",
          text: `# ${results[0].title}\n\n${results[0].content}`
        };
      }

      // project://artifacts/{id}
      if (uri.startsWith("project://artifacts/")) {
        const id = uri.replace("project://artifacts/", "");
        const results = await this.memgraph.query(
          `MATCH (a:Artifact {id: $id}) RETURN a.content as content, a.artifact_type as type`,
          { id }
        );

        if (results.length === 0) {
          throw new Error(`Artifact not found: ${id}`);
        }

        return {
          mimeType: this.getMimeTypeForArtifact(results[0].type as string),
          text: results[0].content as string
        };
      }

      throw new Error(`Unknown resource URI: ${uri}`);
    } catch (error) {
      logger.error({ error, uri }, "Failed to read resource");
      throw error;
    }
  }

  /**
   * Получение статистики
   */
  async getStats(): Promise<{
    qdrant: { vectors_count: number; indexed_vectors_count: number };
    memgraph: { nodes: number; relationships: number };
  }> {
    const [qdrantStats, memgraphStats] = await Promise.all([
      this.qdrant.getStats(),
      this.memgraph.getStats()
    ]);

    return {
      qdrant: qdrantStats,
      memgraph: memgraphStats
    };
  }

  private getMimeTypeForArtifact(type: string): string {
    const mimeTypes: Record<string, string> = {
      code: "text/plain",
      react: "text/jsx",
      html: "text/html",
      svg: "image/svg+xml",
      mermaid: "text/plain",
      diagram: "text/plain",
      document: "text/markdown"
    };

    return mimeTypes[type] || "text/plain";
  }
}
