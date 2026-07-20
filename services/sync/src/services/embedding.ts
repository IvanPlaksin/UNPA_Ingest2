/**
 * Embedding Service - генерация векторных представлений через TEI
 */

import { createLogger } from "../utils/logger.js";
import type { TEIConfig } from "../config/index.js";

const logger = createLogger("embedding-service");

export class EmbeddingService {
  private url: string;
  
  constructor(config: TEIConfig) {
    this.url = config.url;
  }
  
  /**
   * Генерация эмбеддинга для одного текста
   */
  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }
  
  /**
   * Генерация эмбеддингов для батча текстов
   * TEI поддерживает батчинг для эффективности
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      // E5 модели требуют префикс для лучшего качества
      const prefixedTexts = texts.map(t => `query: ${t}`);
      
      const response = await fetch(`${this.url}/embed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: prefixedTexts,
          normalize: true,
          truncate: true
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`TEI error: ${response.status} - ${error}`);
      }
      
      const embeddings = await response.json() as number[][];
      
      logger.debug({ count: texts.length, dimensions: embeddings[0]?.length }, "Embeddings generated");
      
      return embeddings;
    } catch (error) {
      logger.error({ error }, "Failed to generate embeddings");
      throw error;
    }
  }
  
  /**
   * Генерация эмбеддинга для документа (с префиксом passage)
   */
  async embedDocument(text: string): Promise<number[]> {
    try {
      // E5 использует разные префиксы для запросов и документов
      const prefixedText = `passage: ${text}`;
      
      const response = await fetch(`${this.url}/embed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: [prefixedText],
          normalize: true,
          truncate: true
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`TEI error: ${response.status} - ${error}`);
      }
      
      const embeddings = await response.json() as number[][];
      return embeddings[0];
    } catch (error) {
      logger.error({ error }, "Failed to generate document embedding");
      throw error;
    }
  }
  
  /**
   * Batch эмбеддинг документов
   */
  async embedDocumentBatch(texts: string[]): Promise<number[][]> {
    try {
      const prefixedTexts = texts.map(t => `passage: ${t}`);
      
      const response = await fetch(`${this.url}/embed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs: prefixedTexts,
          normalize: true,
          truncate: true
        })
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`TEI error: ${response.status} - ${error}`);
      }
      
      return await response.json() as number[][];
    } catch (error) {
      logger.error({ error }, "Failed to generate document embeddings");
      throw error;
    }
  }
  
  /**
   * Проверка здоровья сервиса
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
  
  /**
   * Получение информации о модели
   */
  async getModelInfo(): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(`${this.url}/info`);
      if (!response.ok) {
        throw new Error(`TEI info error: ${response.status}`);
      }
      return await response.json() as Record<string, unknown>;
    } catch (error) {
      logger.error({ error }, "Failed to get model info");
      throw error;
    }
  }
}
