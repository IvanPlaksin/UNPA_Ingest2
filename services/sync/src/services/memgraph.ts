/**
 * Memgraph Service - графовые запросы
 * Расширенная версия с поддержкой KnowledgeQuantum схемы
 */

import neo4j, { Driver, Session, Result } from "neo4j-driver";
import { createLogger } from "../utils/logger.js";
import type { MemgraphConfig } from "../config/index.js";
import {
  type KnowledgeQuantum,
  type RelationshipEntry,
  GraphNodeLabels,
  RelationType,
  KnowledgeType,
  SourceType,
  LifecycleState,
  ConfidenceLevel,
  Volatility
} from "../types/knowledge-schema.js";

const logger = createLogger("memgraph-service");

export interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface GraphRelation {
  id: string;
  type: string;
  startNode: string;
  endNode: string;
  properties: Record<string, unknown>;
}

export interface GraphResult {
  nodes: GraphNode[];
  relations: GraphRelation[];
}

// Re-export types for convenience
export {
  KnowledgeQuantum,
  RelationshipEntry,
  GraphNodeLabels,
  RelationType,
  KnowledgeType,
  SourceType,
  LifecycleState,
  ConfidenceLevel,
  Volatility
};

export class MemgraphService {
  private driver: Driver;
  private connected: boolean = false;
  
  constructor(config: MemgraphConfig) {
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
      {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 часа
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 минуты
      }
    );
  }
  
  async initialize(): Promise<void> {
    try {
      // Проверка подключения
      const session = this.driver.session();
      await session.run("RETURN 1");
      await session.close();
      
      // Создание индексов и ограничений
      await this.setupSchema();
      
      this.connected = true;
      logger.info("Memgraph initialized");
    } catch (error) {
      logger.error({ error }, "Failed to initialize Memgraph");
      throw error;
    }
  }
  
  private async setupSchema(): Promise<void> {
    const session = this.driver.session();

    try {
      // Расширенные индексы для KnowledgeQuantum схемы
      const indexes = [
        // Основные сущности
        "CREATE INDEX ON :Knowledge(id)",
        "CREATE INDEX ON :Knowledge(fingerprint)",
        "CREATE INDEX ON :Knowledge(title)",
        "CREATE INDEX ON :Knowledge(knowledge_type)",
        "CREATE INDEX ON :Knowledge(lifecycle)",
        "CREATE INDEX ON :Knowledge(source_type)",
        "CREATE INDEX ON :Knowledge(project)",
        "CREATE INDEX ON :Knowledge(component)",

        // Артефакты
        "CREATE INDEX ON :Artifact(id)",
        "CREATE INDEX ON :Artifact(type)",
        "CREATE INDEX ON :Artifact(language)",

        // Чаты и документы
        "CREATE INDEX ON :Chat(id)",
        "CREATE INDEX ON :Document(id)",
        "CREATE INDEX ON :CodeFile(path)",

        // Сущности и концепции
        "CREATE INDEX ON :Entity(name)",
        "CREATE INDEX ON :Entity(type)",
        "CREATE INDEX ON :Concept(name)",

        // Организационная структура
        "CREATE INDEX ON :Organization(name)",
        "CREATE INDEX ON :Project(name)",
        "CREATE INDEX ON :Component(name)",

        // Процессы экстракции
        "CREATE INDEX ON :ExtractionJob(id)",
        "CREATE INDEX ON :ProcessingCycle(number)",

        // Временные индексы
        "CREATE INDEX ON :Knowledge(created_at)",
        "CREATE INDEX ON :Knowledge(updated_at)",

        // Качество и доступ
        "CREATE INDEX ON :Knowledge(confidence)",
        "CREATE INDEX ON :Knowledge(access_level)"
      ];

      for (const idx of indexes) {
        try {
          await session.run(idx);
        } catch {
          // Индекс уже существует - игнорируем
        }
      }

      logger.info("Extended schema setup complete");
    } finally {
      await session.close();
    }
  }
  
  isConnected(): boolean {
    return this.connected;
  }
  
  async query(cypher: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(cypher, params);
      return result.records.map(record => {
        const obj: Record<string, unknown> = {};
        record.keys.forEach(key => {
          obj[key as string] = this.convertNeo4jValue(record.get(key));
        });
        return obj;
      });
    } finally {
      await session.close();
    }
  }
  
  async findRelated(
    entityName: string,
    relationType?: string,
    depth: number = 2
  ): Promise<GraphResult> {
    const session = this.driver.session();
    
    try {
      const relationFilter = relationType ? `:${relationType}` : "";
      const cypher = `
        MATCH (start)
        WHERE start.name = $entityName OR start.title = $entityName
        CALL {
          WITH start
          MATCH path = (start)-[r${relationFilter}*1..${depth}]-(related)
          RETURN path, relationships(path) as rels, nodes(path) as pathNodes
          LIMIT 100
        }
        RETURN DISTINCT pathNodes, rels
      `;
      
      const result = await session.run(cypher, { entityName });
      
      const nodesMap = new Map<string, GraphNode>();
      const relationsMap = new Map<string, GraphRelation>();
      
      for (const record of result.records) {
        const pathNodes = record.get("pathNodes");
        const rels = record.get("rels");
        
        // Собираем ноды
        for (const node of pathNodes) {
          const id = node.identity.toString();
          if (!nodesMap.has(id)) {
            nodesMap.set(id, {
              id,
              labels: node.labels,
              properties: this.convertNeo4jValue(node.properties) as Record<string, unknown>
            });
          }
        }
        
        // Собираем связи
        for (const rel of rels) {
          const id = rel.identity.toString();
          if (!relationsMap.has(id)) {
            relationsMap.set(id, {
              id,
              type: rel.type,
              startNode: rel.start.toString(),
              endNode: rel.end.toString(),
              properties: this.convertNeo4jValue(rel.properties) as Record<string, unknown>
            });
          }
        }
      }
      
      return {
        nodes: Array.from(nodesMap.values()),
        relations: Array.from(relationsMap.values())
      };
    } finally {
      await session.close();
    }
  }
  
  /**
   * Создание узла знаний (legacy метод для обратной совместимости)
   */
  async createKnowledgeNode(knowledge: {
    id: string;
    title: string;
    content: string;
    type: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const session = this.driver.session();

    try {
      const cypher = `
        MERGE (k:Knowledge {id: $id})
        SET k.title = $title,
            k.content = $content,
            k.type = $type,
            k.knowledge_type = $type,
            k.tags = $tags,
            k.lifecycle = 'active',
            k.version = 1,
            k.created_at = datetime(),
            k.updated_at = datetime()
      `;

      await session.run(cypher, {
        id: knowledge.id,
        title: knowledge.title,
        content: knowledge.content,
        type: knowledge.type,
        tags: knowledge.tags || []
      });

      logger.info({ id: knowledge.id }, "Knowledge node created");
    } finally {
      await session.close();
    }
  }

  /**
   * Создание полного узла KnowledgeQuantum с расширенными метаданными
   */
  async createKnowledgeQuantum(quantum: KnowledgeQuantum): Promise<void> {
    const session = this.driver.session();

    try {
      // Создаём основной узел Knowledge
      const cypher = `
        MERGE (k:Knowledge {id: $id})
        SET k.fingerprint = $fingerprint,
            k.version = $version,
            k.lifecycle = $lifecycle,
            k.created_at = datetime($created_at),
            k.updated_at = datetime($updated_at),

            // Provenance
            k.source_type = $source_type,
            k.source_id = $source_id,
            k.source_name = $source_name,
            k.extraction_cycle = $extraction_cycle,
            k.extracted_by = $extracted_by,
            k.extracted_at = datetime($extracted_at),

            // Classification
            k.organization = $organization,
            k.project = $project,
            k.component = $component,
            k.layer = $layer,
            k.knowledge_type = $knowledge_type,
            k.volatility = $volatility,
            k.tags = $tags,
            k.domain = $domain,
            k.abstraction_level = $abstraction_level,

            // Semantic
            k.keywords = $keywords,
            k.summary = $summary,
            k.language = $language,

            // Quality
            k.confidence = $confidence,
            k.completeness = $completeness,
            k.freshness = $freshness,
            k.relevance = $relevance,
            k.usage_count = $usage_count,

            // Content
            k.title = $title,
            k.content = $content

        RETURN k
      `;

      await session.run(cypher, {
        id: quantum.identity.id,
        fingerprint: quantum.identity.fingerprint,
        version: quantum.identity.version,
        lifecycle: quantum.identity.lifecycle,
        created_at: quantum.identity.created_at,
        updated_at: quantum.identity.updated_at,

        source_type: quantum.provenance.source_type,
        source_id: quantum.provenance.source_id,
        source_name: quantum.provenance.source_name,
        extraction_cycle: quantum.provenance.extraction_cycle,
        extracted_by: quantum.provenance.extracted_by,
        extracted_at: quantum.provenance.extracted_at,

        organization: quantum.classification.organization || null,
        project: quantum.classification.project || null,
        component: quantum.classification.component || null,
        layer: quantum.classification.layer || null,
        knowledge_type: quantum.classification.knowledge_type,
        volatility: quantum.classification.volatility,
        tags: quantum.classification.tags,
        domain: quantum.classification.domain || null,
        abstraction_level: quantum.classification.abstraction_level || null,

        keywords: quantum.semantic.keywords,
        summary: quantum.semantic.summary || null,
        language: quantum.semantic.language,

        confidence: quantum.quality.confidence,
        completeness: quantum.quality.completeness,
        freshness: quantum.quality.freshness,
        relevance: quantum.quality.relevance,
        usage_count: quantum.quality.usage_count,

        title: quantum.content.title,
        content: quantum.content.body
      });

      // Создаём связи с организационной структурой
      if (quantum.classification.project) {
        await this.ensureProjectHierarchy(
          session,
          quantum.identity.id,
          quantum.classification.organization,
          quantum.classification.project,
          quantum.classification.component
        );
      }

      // Создаём извлечённые сущности как отдельные узлы
      for (const entity of quantum.semantic.entities) {
        await this.createEntityNode(session, quantum.identity.id, entity);
      }

      // Создаём явные связи
      for (const rel of quantum.relationships.explicit) {
        await this.createRelationshipFromEntry(session, quantum.identity.id, rel, false);
      }

      // Создаём выведенные связи
      for (const rel of quantum.relationships.inferred) {
        await this.createRelationshipFromEntry(session, quantum.identity.id, rel, true);
      }

      logger.info({ id: quantum.identity.id, type: quantum.classification.knowledge_type },
        "Knowledge quantum created");
    } finally {
      await session.close();
    }
  }

  /**
   * Обеспечить иерархию Organization -> Project -> Component
   */
  private async ensureProjectHierarchy(
    session: Session,
    knowledgeId: string,
    organization?: string,
    project?: string,
    component?: string
  ): Promise<void> {
    if (organization) {
      await session.run(`
        MERGE (o:Organization {name: $org})
        WITH o
        MATCH (k:Knowledge {id: $kid})
        MERGE (k)-[:BELONGS_TO]->(o)
      `, { org: organization, kid: knowledgeId });
    }

    if (project) {
      await session.run(`
        MERGE (p:Project {name: $project})
        WITH p
        MATCH (k:Knowledge {id: $kid})
        MERGE (k)-[:PART_OF]->(p)
        ${organization ? `
        WITH p
        MATCH (o:Organization {name: $org})
        MERGE (p)-[:BELONGS_TO]->(o)
        ` : ""}
      `, { project, kid: knowledgeId, org: organization });
    }

    if (component) {
      await session.run(`
        MERGE (c:Component {name: $component})
        WITH c
        MATCH (k:Knowledge {id: $kid})
        MERGE (k)-[:PART_OF]->(c)
        ${project ? `
        WITH c
        MATCH (p:Project {name: $project})
        MERGE (c)-[:PART_OF]->(p)
        ` : ""}
      `, { component, kid: knowledgeId, project });
    }
  }

  /**
   * Создать узел сущности и связать с квантом знаний
   */
  private async createEntityNode(
    session: Session,
    knowledgeId: string,
    entity: { name: string; type: string; confidence: number }
  ): Promise<void> {
    await session.run(`
      MERGE (e:Entity {name: $name, type: $type})
      WITH e
      MATCH (k:Knowledge {id: $kid})
      MERGE (k)-[r:MENTIONS]->(e)
      SET r.confidence = $confidence
    `, {
      name: entity.name,
      type: entity.type,
      kid: knowledgeId,
      confidence: entity.confidence
    });
  }

  /**
   * Создать связь из RelationshipEntry
   */
  private async createRelationshipFromEntry(
    session: Session,
    sourceId: string,
    rel: RelationshipEntry,
    isInferred: boolean
  ): Promise<void> {
    const cypher = `
      MATCH (source:Knowledge {id: $sourceId})
      MATCH (target {id: $targetId})
      MERGE (source)-[r:${rel.type}]->(target)
      SET r.confidence = $confidence,
          r.established_by = $established_by,
          r.established_at = datetime($established_at),
          r.is_inferred = $isInferred
    `;

    await session.run(cypher, {
      sourceId,
      targetId: rel.target_id,
      confidence: rel.confidence || 1.0,
      established_by: rel.established_by || "system",
      established_at: rel.established_at || new Date().toISOString(),
      isInferred
    });
  }

  /**
   * Получить квант знаний по ID
   */
  async getKnowledgeQuantum(id: string): Promise<KnowledgeQuantum | null> {
    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH (k:Knowledge {id: $id})
        OPTIONAL MATCH (k)-[r]->(related)
        RETURN k, collect({type: type(r), target: related, props: properties(r)}) as relations
      `, { id });

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      const node = record.get("k");
      const relations = record.get("relations");
      const props = this.convertNeo4jValue(node.properties) as Record<string, unknown>;

      // Преобразуем в KnowledgeQuantum
      return this.nodeToQuantum(props, relations);
    } finally {
      await session.close();
    }
  }

  /**
   * Преобразовать узел графа в KnowledgeQuantum
   */
  private nodeToQuantum(
    props: Record<string, unknown>,
    relations: Array<{ type: string; target: unknown; props: Record<string, unknown> }>
  ): KnowledgeQuantum {
    const explicit: RelationshipEntry[] = [];
    const inferred: RelationshipEntry[] = [];

    for (const rel of relations) {
      if (!rel.target) continue;

      const targetProps = this.convertNeo4jValue((rel.target as any).properties) as Record<string, unknown>;
      const entry: RelationshipEntry = {
        type: rel.type as RelationType,
        target_id: targetProps.id as string,
        target_name: (targetProps.title || targetProps.name) as string,
        confidence: rel.props?.confidence as number,
        established_by: rel.props?.established_by as string,
        established_at: rel.props?.established_at as string
      };

      if (rel.props?.is_inferred) {
        inferred.push(entry);
      } else {
        explicit.push(entry);
      }
    }

    return {
      identity: {
        id: props.id as string,
        fingerprint: (props.fingerprint as string) || "",
        version: (props.version as number) || 1,
        revisions: [],
        lifecycle: (props.lifecycle as LifecycleState) || LifecycleState.ACTIVE,
        created_at: String(props.created_at || new Date().toISOString()),
        updated_at: String(props.updated_at || new Date().toISOString())
      },
      provenance: {
        source_type: (props.source_type as SourceType) || SourceType.DOCUMENT,
        source_id: (props.source_id as string) || "",
        source_name: (props.source_name as string) || "",
        extraction_cycle: (props.extraction_cycle as number) || 1,
        extracted_by: (props.extracted_by as string) || "system",
        extracted_at: String(props.extracted_at || new Date().toISOString())
      },
      classification: {
        organization: props.organization as string,
        project: props.project as string,
        component: props.component as string,
        layer: props.layer as string,
        knowledge_type: (props.knowledge_type as KnowledgeType) || KnowledgeType.REFERENCE,
        volatility: (props.volatility as Volatility) || Volatility.STABLE,
        tags: (props.tags as string[]) || [],
        domain: props.domain as string,
        abstraction_level: props.abstraction_level as "strategic" | "tactical" | "operational"
      },
      semantic: {
        keywords: (props.keywords as string[]) || [],
        entities: [],
        summary: props.summary as string,
        language: (props.language as string) || "ru"
      },
      relationships: { explicit, inferred },
      quality: {
        confidence: (props.confidence as ConfidenceLevel) || ConfidenceLevel.MEDIUM,
        completeness: (props.completeness as number) || 0,
        freshness: (props.freshness as number) || 1,
        relevance: (props.relevance as number) || 0.5,
        usage_count: (props.usage_count as number) || 0
      },
      processing: { decision_log: [] },
      content: {
        title: (props.title as string) || "",
        body: (props.content as string) || ""
      }
    };
  }

  /**
   * Поиск квантов по классификации
   */
  async findByClassification(filters: {
    knowledge_type?: KnowledgeType;
    project?: string;
    component?: string;
    tags?: string[];
    lifecycle?: LifecycleState;
    confidence?: ConfidenceLevel;
  }, limit: number = 50): Promise<KnowledgeQuantum[]> {
    const session = this.driver.session();

    try {
      const conditions: string[] = [];
      const params: Record<string, unknown> = { limit };

      if (filters.knowledge_type) {
        conditions.push("k.knowledge_type = $knowledge_type");
        params.knowledge_type = filters.knowledge_type;
      }
      if (filters.project) {
        conditions.push("k.project = $project");
        params.project = filters.project;
      }
      if (filters.component) {
        conditions.push("k.component = $component");
        params.component = filters.component;
      }
      if (filters.lifecycle) {
        conditions.push("k.lifecycle = $lifecycle");
        params.lifecycle = filters.lifecycle;
      }
      if (filters.confidence) {
        conditions.push("k.confidence = $confidence");
        params.confidence = filters.confidence;
      }
      if (filters.tags && filters.tags.length > 0) {
        conditions.push("any(tag IN $tags WHERE tag IN k.tags)");
        params.tags = filters.tags;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const result = await session.run(`
        MATCH (k:Knowledge)
        ${whereClause}
        OPTIONAL MATCH (k)-[r]->(related)
        RETURN k, collect({type: type(r), target: related, props: properties(r)}) as relations
        LIMIT $limit
      `, params);

      return result.records.map(record => {
        const node = record.get("k");
        const relations = record.get("relations");
        const props = this.convertNeo4jValue(node.properties) as Record<string, unknown>;
        return this.nodeToQuantum(props, relations);
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Обновить метрики использования
   */
  async updateUsageMetrics(id: string): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run(`
        MATCH (k:Knowledge {id: $id})
        SET k.usage_count = COALESCE(k.usage_count, 0) + 1,
            k.last_used_at = datetime()
      `, { id });
    } finally {
      await session.close();
    }
  }

  /**
   * Получить статистику по типам знаний
   */
  async getKnowledgeTypeStats(): Promise<Record<string, number>> {
    const session = this.driver.session();

    try {
      const result = await session.run(`
        MATCH (k:Knowledge)
        RETURN k.knowledge_type as type, count(*) as count
        ORDER BY count DESC
      `);

      const stats: Record<string, number> = {};
      for (const record of result.records) {
        const type = record.get("type");
        const count = record.get("count");
        if (type) {
          stats[type] = this.convertNeo4jValue(count) as number;
        }
      }
      return stats;
    } finally {
      await session.close();
    }
  }
  
  async createRelation(
    fromId: string,
    toId: string,
    relationType: string,
    properties?: Record<string, unknown>
  ): Promise<void> {
    const session = this.driver.session();
    
    try {
      const cypher = `
        MATCH (from {id: $fromId})
        MATCH (to {id: $toId})
        MERGE (from)-[r:${relationType}]->(to)
        SET r += $properties
      `;
      
      await session.run(cypher, {
        fromId,
        toId,
        properties: properties || {}
      });
      
      logger.info({ fromId, toId, type: relationType }, "Relation created");
    } finally {
      await session.close();
    }
  }
  
  async getProjectContext(): Promise<{
    instructions: string[];
    architecture: Record<string, unknown>[];
    conventions: string[];
  }> {
    const session = this.driver.session();
    
    try {
      // Инструкции проекта
      const instructionsResult = await session.run(`
        MATCH (i:Knowledge {type: 'instruction'})
        RETURN i.content as content
        ORDER BY i.priority DESC
      `);
      
      // Архитектурные решения
      const architectureResult = await session.run(`
        MATCH (a:Knowledge {type: 'architecture'})
        OPTIONAL MATCH (a)-[r]->(related)
        RETURN a, collect(DISTINCT {type: type(r), target: related.title}) as relations
      `);
      
      // Конвенции
      const conventionsResult = await session.run(`
        MATCH (c:Knowledge {type: 'convention'})
        RETURN c.content as content
      `);
      
      return {
        instructions: instructionsResult.records.map(r => r.get("content")),
        architecture: architectureResult.records.map(r => {
          const props = this.convertNeo4jValue(r.get("a").properties);
          return {
            ...(typeof props === 'object' && props !== null ? props as Record<string, unknown> : {}),
            relations: r.get("relations")
          };
        }),
        conventions: conventionsResult.records.map(r => r.get("content"))
      };
    } finally {
      await session.close();
    }
  }
  
  async getStats(): Promise<{ nodes: number; relationships: number }> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(`
        MATCH (n)
        OPTIONAL MATCH ()-[r]->()
        RETURN count(DISTINCT n) as nodes, count(DISTINCT r) as relationships
      `);
      
      const record = result.records[0];
      return {
        nodes: record.get("nodes").toNumber(),
        relationships: record.get("relationships").toNumber()
      };
    } finally {
      await session.close();
    }
  }
  
  private convertNeo4jValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }
    
    if (neo4j.isInt(value)) {
      return value.toNumber();
    }
    
    if (neo4j.isDate(value) || neo4j.isDateTime(value) || neo4j.isLocalDateTime(value)) {
      return value.toString();
    }
    
    if (Array.isArray(value)) {
      return value.map(v => this.convertNeo4jValue(v));
    }
    
    if (typeof value === "object" && value !== null) {
      const converted: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        converted[k] = this.convertNeo4jValue(v);
      }
      return converted;
    }
    
    return value;
  }
  
  async close(): Promise<void> {
    await this.driver.close();
  }
}
