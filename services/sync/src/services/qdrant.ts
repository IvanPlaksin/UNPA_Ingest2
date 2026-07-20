/**
 * Qdrant Service - семантический поиск
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import { createLogger } from "../utils/logger.js";
import type { QdrantConfig } from "../config/index.js";

const logger = createLogger("qdrant-service");

export interface SearchResult {
  id: string;
  score: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export class QdrantService {
  private client: QdrantClient;
  private collection: string;
  private connected: boolean = false;
  
  constructor(config: QdrantConfig) {
    this.client = new QdrantClient({ url: config.url });
    this.collection = config.collection;
  }
  
  async initialize(): Promise<void> {
    try {
      // Проверяем существование коллекции
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collection);

      if (!exists) {
        // Создаём коллекцию для E5-large (1024 dimensions)
        await this.client.createCollection(this.collection, {
          vectors: {
            size: 1024, // multilingual-e5-large dimension
            distance: "Cosine"
          },
          optimizers_config: {
            indexing_threshold: 10000
          }
        });

        logger.info({ collection: this.collection }, "Collection created");
      }

      // Создаём/обновляем индексы для расширенной фильтрации
      await this.ensurePayloadIndexes();

      this.connected = true;
      logger.info("Qdrant initialized with extended indexes");
    } catch (error) {
      logger.error({ error }, "Failed to initialize Qdrant");
      throw error;
    }
  }

  /**
   * Создание индексов для расширенной схемы метаданных
   */
  private async ensurePayloadIndexes(): Promise<void> {
    const keywordIndexes = [
      "source_type",
      "knowledge_type",
      "lifecycle",
      "project",
      "component",
      "layer",
      "domain",
      "volatility",
      "confidence",
      "language"
    ];

    const textIndexes = [
      "title",
      "fingerprint"
    ];

    const integerIndexes = [
      "version",
      "extraction_cycle"
    ];

    const floatIndexes = [
      "completeness"
    ];

    // Keyword индексы
    for (const field of keywordIndexes) {
      try {
        await this.client.createPayloadIndex(this.collection, {
          field_name: field,
          field_schema: "keyword"
        });
      } catch {
        // Индекс уже существует
      }
    }

    // Text индексы
    for (const field of textIndexes) {
      try {
        await this.client.createPayloadIndex(this.collection, {
          field_name: field,
          field_schema: "text"
        });
      } catch {
        // Индекс уже существует
      }
    }

    // Integer индексы
    for (const field of integerIndexes) {
      try {
        await this.client.createPayloadIndex(this.collection, {
          field_name: field,
          field_schema: "integer"
        });
      } catch {
        // Индекс уже существует
      }
    }

    // Float индексы
    for (const field of floatIndexes) {
      try {
        await this.client.createPayloadIndex(this.collection, {
          field_name: field,
          field_schema: "float"
        });
      } catch {
        // Индекс уже существует
      }
    }

    // Datetime индекс
    try {
      await this.client.createPayloadIndex(this.collection, {
        field_name: "created_at",
        field_schema: "datetime"
      });
    } catch {
      // Индекс уже существует
    }

    // Keyword array индекс для tags
    try {
      await this.client.createPayloadIndex(this.collection, {
        field_name: "tags",
        field_schema: "keyword"
      });
    } catch {
      // Индекс уже существует
    }

    // Keyword array индекс для keywords
    try {
      await this.client.createPayloadIndex(this.collection, {
        field_name: "keywords",
        field_schema: "keyword"
      });
    } catch {
      // Индекс уже существует
    }
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  async search(
    vector: number[],
    limit: number = 5,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    try {
      const searchParams: Parameters<typeof this.client.search>[1] = {
        vector,
        limit,
        with_payload: true
      };
      
      if (filter) {
        searchParams.filter = this.buildFilter(filter);
      }
      
      const results = await this.client.search(this.collection, searchParams);
      
      return results.map(r => ({
        id: String(r.id),
        score: r.score,
        content: (r.payload?.content as string) || "",
        metadata: r.payload as Record<string, unknown>
      }));
    } catch (error) {
      logger.error({ error }, "Search failed");
      throw error;
    }
  }
  
  async upsert(points: VectorPoint[]): Promise<void> {
    try {
      await this.client.upsert(this.collection, {
        wait: true,
        points: points.map(p => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload
        }))
      });
      
      logger.info({ count: points.length }, "Points upserted");
    } catch (error) {
      logger.error({ error }, "Upsert failed");
      throw error;
    }
  }
  
  async delete(ids: string[]): Promise<void> {
    try {
      await this.client.delete(this.collection, {
        wait: true,
        points: ids
      });
      
      logger.info({ count: ids.length }, "Points deleted");
    } catch (error) {
      logger.error({ error }, "Delete failed");
      throw error;
    }
  }
  
  async getStats(): Promise<{ vectors_count: number; indexed_vectors_count: number }> {
    const info = await this.client.getCollection(this.collection);
    return {
      vectors_count: (info as any).vectors_count || info.points_count || 0,
      indexed_vectors_count: info.indexed_vectors_count || 0
    };
  }
  
  private buildFilter(filter: Record<string, unknown>): Record<string, unknown> {
    const must: Array<Record<string, unknown>> = [];

    // Keyword фильтры
    const keywordFields = [
      "source_type",
      "knowledge_type",
      "lifecycle",
      "project",
      "component",
      "layer",
      "domain",
      "volatility",
      "confidence",
      "language"
    ];

    for (const field of keywordFields) {
      if (filter[field]) {
        must.push({
          key: field,
          match: { value: filter[field] }
        });
      }
    }

    // Date range filter
    if (filter.date_from || filter.date_to) {
      const range: Record<string, unknown> = {};
      if (filter.date_from) range.gte = filter.date_from;
      if (filter.date_to) range.lte = filter.date_to;

      must.push({
        key: "created_at",
        range
      });
    }

    // Tags filter (any match)
    if (filter.tags && Array.isArray(filter.tags)) {
      must.push({
        key: "tags",
        match: { any: filter.tags }
      });
    }

    // Keywords filter (any match)
    if (filter.keywords && Array.isArray(filter.keywords)) {
      must.push({
        key: "keywords",
        match: { any: filter.keywords }
      });
    }

    // Extraction cycle range
    if (filter.extraction_cycle_min || filter.extraction_cycle_max) {
      const range: Record<string, unknown> = {};
      if (filter.extraction_cycle_min) range.gte = filter.extraction_cycle_min;
      if (filter.extraction_cycle_max) range.lte = filter.extraction_cycle_max;

      must.push({
        key: "extraction_cycle",
        range
      });
    }

    // Completeness range
    if (filter.completeness_min !== undefined || filter.completeness_max !== undefined) {
      const range: Record<string, unknown> = {};
      if (filter.completeness_min !== undefined) range.gte = filter.completeness_min;
      if (filter.completeness_max !== undefined) range.lte = filter.completeness_max;

      must.push({
        key: "completeness",
        range
      });
    }

    // Text search (title)
    if (filter.title_contains) {
      must.push({
        key: "title",
        match: { text: filter.title_contains }
      });
    }

    return { must };
  }
}
