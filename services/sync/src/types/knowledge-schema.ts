/**
 * Knowledge Quantum Schema - расширенная схема метаданных для квантов знаний
 *
 * Структура разработана для:
 * - Полной трассировки происхождения информации
 * - Спиральной модели накопления знаний
 * - Контекстно-зависимой переклассификации
 * - Автоматизированного анализа и извлечения информации
 */

// ============================================================================
// ENUMS - Перечисления для классификации
// ============================================================================

/**
 * Тип знания - основная классификация контента
 */
export enum KnowledgeType {
  // Бизнес-уровень
  BUSINESS_RULE = "business_rule",
  BUSINESS_PROCESS = "business_process",
  DOMAIN_CONCEPT = "domain_concept",

  // Технический уровень
  ARCHITECTURE = "architecture",
  DESIGN_DECISION = "design_decision",
  IMPLEMENTATION = "implementation",
  API_CONTRACT = "api_contract",
  DATA_MODEL = "data_model",

  // Документация
  REQUIREMENT = "requirement",
  SPECIFICATION = "specification",
  INSTRUCTION = "instruction",
  CONVENTION = "convention",

  // Операционный уровень
  INCIDENT = "incident",
  SOLUTION = "solution",
  WORKAROUND = "workaround",
  KNOWN_ISSUE = "known_issue",

  // Особые типы
  ANOMALY = "anomaly",
  ORPHAN = "orphan",
  DEPRECATED = "deprecated",
  REFERENCE = "reference"
}

/**
 * Тип источника данных
 */
export enum SourceType {
  CHAT = "chat",
  ARTIFACT = "artifact",
  DOCUMENT = "document",
  CODE = "code",
  EMAIL = "email",
  TICKET = "ticket",
  MEETING = "meeting",
  EXTERNAL = "external"
}

/**
 * Волатильность - как часто информация меняется
 */
export enum Volatility {
  STATIC = "static",           // Редко меняется (архитектура, бизнес-правила)
  STABLE = "stable",           // Изменяется при релизах
  MODERATE = "moderate",       // Может меняться в течение спринта
  VOLATILE = "volatile",       // Часто меняется
  EPHEMERAL = "ephemeral"      // Временная информация
}

/**
 * Состояние жизненного цикла
 */
export enum LifecycleState {
  DRAFT = "draft",
  ACTIVE = "active",
  REVIEW = "review",
  DEPRECATED = "deprecated",
  ARCHIVED = "archived"
}

/**
 * Уровень достоверности
 */
export enum ConfidenceLevel {
  VERIFIED = "verified",       // Подтверждено экспертом
  HIGH = "high",               // Высокая уверенность
  MEDIUM = "medium",           // Средняя уверенность
  LOW = "low",                 // Низкая уверенность
  UNCERTAIN = "uncertain"      // Требует проверки
}

/**
 * Типы связей в графе
 */
export enum RelationType {
  // Структурные связи
  PART_OF = "PART_OF",
  CONTAINS = "CONTAINS",
  BELONGS_TO = "BELONGS_TO",

  // Зависимости
  DEPENDS_ON = "DEPENDS_ON",
  REQUIRES = "REQUIRES",
  BLOCKS = "BLOCKS",

  // Семантические связи
  IMPLEMENTS = "IMPLEMENTS",
  EXTENDS = "EXTENDS",
  OVERRIDES = "OVERRIDES",

  // Ссылочные связи
  REFERENCES = "REFERENCES",
  MENTIONS = "MENTIONS",
  RELATES_TO = "RELATES_TO",

  // Причинно-следственные
  CAUSES = "CAUSES",
  RESOLVES = "RESOLVES",
  SUPERSEDES = "SUPERSEDES",

  // Временные связи
  PRECEDED_BY = "PRECEDED_BY",
  FOLLOWED_BY = "FOLLOWED_BY",

  // Авторские связи
  CREATED_BY = "CREATED_BY",
  MODIFIED_BY = "MODIFIED_BY",
  OWNED_BY = "OWNED_BY"
}

// ============================================================================
// INTERFACES - Основные интерфейсы схемы
// ============================================================================

/**
 * Идентификация кванта знаний
 */
export interface CoreIdentity {
  /** Уникальный идентификатор (UUID v4) */
  id: string;

  /** Fingerprint для дедупликации (hash контента) */
  fingerprint: string;

  /** Версия кванта */
  version: number;

  /** Предыдущие версии */
  revisions: string[];

  /** Состояние жизненного цикла */
  lifecycle: LifecycleState;

  /** Дата создания */
  created_at: string;

  /** Дата последнего обновления */
  updated_at: string;
}

/**
 * Происхождение информации - полная трассировка
 */
export interface Provenance {
  /** Тип источника */
  source_type: SourceType;

  /** Идентификатор источника (URI, ID чата, путь к файлу) */
  source_id: string;

  /** Человекочитаемое имя источника */
  source_name: string;

  /** Номер цикла экстракции (спиральная модель) */
  extraction_cycle: number;

  /** Идентификатор задачи экстракции */
  extraction_job_id?: string;

  /** Стратегия/метод экстракции */
  extraction_strategy?: string;

  /** Кто/что извлекло информацию */
  extracted_by: string;

  /** Timestamp экстракции */
  extracted_at: string;

  /** Оригинальный контекст (для воспроизводимости) */
  original_context?: {
    conversation_id?: string;
    message_ids?: string[];
    file_path?: string;
    line_range?: { start: number; end: number };
  };
}

/**
 * Классификация и организация
 */
export interface Classification {
  /** Организация (верхний уровень иерархии) */
  organization?: string;

  /** Проект */
  project?: string;

  /** Компонент/модуль */
  component?: string;

  /** Слой архитектуры (frontend, backend, db, infra) */
  layer?: string;

  /** Основной тип знания */
  knowledge_type: KnowledgeType;

  /** Дополнительные типы (может быть несколько) */
  secondary_types?: KnowledgeType[];

  /** Технологический стек */
  tech_stack?: string[];

  /** Волатильность информации */
  volatility: Volatility;

  /** Теги для категоризации */
  tags: string[];

  /** Домен/область знаний */
  domain?: string;

  /** Уровень абстракции (strategic, tactical, operational) */
  abstraction_level?: "strategic" | "tactical" | "operational";
}

/**
 * Семантический контекст - для поиска и анализа
 */
export interface SemanticContext {
  /** ID вектора в Qdrant */
  embedding_id?: string;

  /** Ключевые слова (извлечённые) */
  keywords: string[];

  /** Извлечённые именованные сущности */
  entities: ExtractedEntity[];

  /** Краткое описание (саммари) */
  summary?: string;

  /** Язык контента */
  language: string;

  /** Темы/топики (topic modeling) */
  topics?: string[];
}

/**
 * Извлечённая сущность
 */
export interface ExtractedEntity {
  /** Имя сущности */
  name: string;

  /** Тип сущности (Person, Technology, Component, etc.) */
  type: string;

  /** Уверенность в извлечении (0-1) */
  confidence: number;

  /** Позиция в тексте */
  position?: { start: number; end: number };
}

/**
 * Связи с другими квантами
 */
export interface Relationships {
  /** Явные связи (из источника) */
  explicit: RelationshipEntry[];

  /** Выведенные связи (наш анализ) */
  inferred: RelationshipEntry[];
}

/**
 * Запись о связи
 */
export interface RelationshipEntry {
  /** Тип связи */
  type: RelationType;

  /** ID целевой сущности */
  target_id: string;

  /** Имя целевой сущности (для читаемости) */
  target_name?: string;

  /** Уверенность в связи (для inferred) */
  confidence?: number;

  /** Кем/чем установлена связь */
  established_by?: string;

  /** Когда установлена */
  established_at?: string;

  /** Дополнительные свойства связи */
  properties?: Record<string, unknown>;
}

/**
 * Метрики качества
 */
export interface QualityMetrics {
  /** Уровень достоверности */
  confidence: ConfidenceLevel;

  /** Оценка полноты (0-1) */
  completeness: number;

  /** Оценка актуальности (0-1) */
  freshness: number;

  /** Оценка релевантности (0-1) */
  relevance: number;

  /** Человеческая валидация */
  human_validation?: {
    validated_by: string;
    validated_at: string;
    is_valid: boolean;
    comments?: string;
  };

  /** Флаги проблем */
  issues?: QualityIssue[];

  /** Количество использований в запросах */
  usage_count: number;

  /** Последнее использование */
  last_used_at?: string;
}

/**
 * Проблема качества
 */
export interface QualityIssue {
  /** Тип проблемы */
  type: "outdated" | "incomplete" | "conflicting" | "duplicate" | "unclear";

  /** Описание проблемы */
  description: string;

  /** Когда обнаружена */
  detected_at: string;

  /** Решена ли */
  resolved: boolean;
}

/**
 * Контекст обработки
 */
export interface ProcessingContext {
  /** История решений системы */
  decision_log: ProcessingDecision[];

  /** Статистика запросов */
  query_stats?: {
    total_queries: number;
    avg_relevance_score: number;
    last_query_at: string;
  };
}

/**
 * Решение при обработке
 */
export interface ProcessingDecision {
  /** Тип решения */
  decision_type: string;

  /** Описание */
  description: string;

  /** Когда принято */
  decided_at: string;

  /** Чем/кем принято */
  decided_by: string;

  /** Причина */
  reason?: string;
}

/**
 * Контроль доступа
 */
export interface AccessControl {
  /** Уровень доступа */
  access_level: "public" | "internal" | "confidential" | "restricted";

  /** Владелец */
  owner?: string;

  /** Разрешённые роли */
  allowed_roles?: string[];

  /** Аудит доступа */
  access_log?: AccessLogEntry[];
}

/**
 * Запись аудита доступа
 */
export interface AccessLogEntry {
  /** Кто получил доступ */
  accessor: string;

  /** Тип действия */
  action: "read" | "update" | "delete";

  /** Когда */
  timestamp: string;
}

// ============================================================================
// MAIN TYPE - Полный квант знаний
// ============================================================================

/**
 * Полная структура кванта знаний
 */
export interface KnowledgeQuantum {
  /** Идентификация */
  identity: CoreIdentity;

  /** Происхождение */
  provenance: Provenance;

  /** Классификация */
  classification: Classification;

  /** Семантический контекст */
  semantic: SemanticContext;

  /** Связи */
  relationships: Relationships;

  /** Метрики качества */
  quality: QualityMetrics;

  /** Контекст обработки */
  processing: ProcessingContext;

  /** Контроль доступа */
  access?: AccessControl;

  /** Основной контент */
  content: {
    /** Заголовок */
    title: string;

    /** Основной текст */
    body: string;

    /** Структурированные данные (если есть) */
    structured_data?: Record<string, unknown>;

    /** Вложения/артефакты */
    attachments?: Attachment[];
  };
}

/**
 * Вложение/артефакт
 */
export interface Attachment {
  /** ID вложения */
  id: string;

  /** Тип */
  type: "code" | "diagram" | "image" | "document" | "data";

  /** MIME тип */
  mime_type: string;

  /** Контент или ссылка */
  content?: string;

  /** URI если хранится отдельно */
  uri?: string;

  /** Метаданные вложения */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// GRAPH NODE LABELS - Метки узлов для Memgraph
// ============================================================================

/**
 * Метки узлов в графе знаний
 */
export const GraphNodeLabels = {
  // Основные сущности знаний
  KNOWLEDGE: "Knowledge",
  ARTIFACT: "Artifact",
  CONCEPT: "Concept",
  ENTITY: "Entity",

  // Организационная структура
  ORGANIZATION: "Organization",
  PROJECT: "Project",
  COMPONENT: "Component",

  // Источники
  CHAT: "Chat",
  DOCUMENT: "Document",
  CODE_FILE: "CodeFile",

  // Процессы
  EXTRACTION_JOB: "ExtractionJob",
  PROCESSING_CYCLE: "ProcessingCycle",

  // Пользователи и роли
  USER: "User",
  ROLE: "Role"
} as const;

export type GraphNodeLabel = typeof GraphNodeLabels[keyof typeof GraphNodeLabels];

// ============================================================================
// FACTORY FUNCTIONS - Функции создания
// ============================================================================

/**
 * Создать пустой квант знаний с дефолтными значениями
 */
export function createEmptyQuantum(id: string): KnowledgeQuantum {
  const now = new Date().toISOString();

  return {
    identity: {
      id,
      fingerprint: "",
      version: 1,
      revisions: [],
      lifecycle: LifecycleState.DRAFT,
      created_at: now,
      updated_at: now
    },
    provenance: {
      source_type: SourceType.DOCUMENT,
      source_id: "",
      source_name: "",
      extraction_cycle: 1,
      extracted_by: "system",
      extracted_at: now
    },
    classification: {
      knowledge_type: KnowledgeType.REFERENCE,
      volatility: Volatility.STABLE,
      tags: []
    },
    semantic: {
      keywords: [],
      entities: [],
      language: "ru"
    },
    relationships: {
      explicit: [],
      inferred: []
    },
    quality: {
      confidence: ConfidenceLevel.MEDIUM,
      completeness: 0,
      freshness: 1,
      relevance: 0.5,
      usage_count: 0
    },
    processing: {
      decision_log: []
    },
    content: {
      title: "",
      body: ""
    }
  };
}

/**
 * Вычислить fingerprint контента
 */
export function computeFingerprint(content: string): string {
  // Простая реализация - в production использовать crypto.createHash
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `fp_${Math.abs(hash).toString(16)}`;
}
