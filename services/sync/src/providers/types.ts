/**
 * Data Provider Interface
 * 
 * Абстракция для получения данных из различных источников:
 * - FileProvider: локальные файлы (экспорт из Claude.ai)
 * - ClaudeApiProvider: неофициальный API Claude.ai
 * - Возможны другие провайдеры в будущем
 */

export interface ChatMessage {
  id: string;
  text: string;
  sender: "human" | "assistant";
  createdAt: Date;
  attachments?: Attachment[];
}

export interface Attachment {
  fileName: string;
  fileType: string;
  content?: string;
}

export interface Conversation {
  id: string;
  name: string;
  projectId?: string;
  projectName?: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatMessage[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Типы артефактов (упрощённые)
 */
export type ArtifactType = "code" | "react" | "html" | "svg" | "mermaid" | "document" | "text";

/**
 * MIME типы артефактов Claude
 */
export type ArtifactMimeType =
  | "text/markdown"
  | "text/plain"
  | "text/html"
  | "application/vnd.ant.react"
  | "application/vnd.ant.code"
  | "application/vnd.ant.mermaid"
  | "image/svg+xml";

export interface Artifact {
  /** Уникальный идентификатор артефакта */
  id: string;
  /** Заголовок/название артефакта */
  title: string;
  /** Упрощённый тип артефакта */
  type: ArtifactType;
  /** MIME тип (для нативных артефактов Claude) */
  mimeType?: ArtifactMimeType;
  /** Содержимое артефакта */
  content: string;
  /** Язык программирования (для code артефактов) */
  language?: string;
  /** ID разговора-источника */
  conversationId?: string;
  /** Название разговора-источника */
  conversationName?: string;
  /** Версия артефакта */
  version?: string;
  /** Флаг нативного артефакта Claude */
  isNative?: boolean;
  /** Дата создания */
  createdAt: Date;
}

/**
 * Фильтры для поиска артефактов
 */
export interface ArtifactFilter {
  /** Фильтр по типу */
  type?: ArtifactType;
  /** Фильтр по MIME типу */
  mimeType?: ArtifactMimeType;
  /** Фильтр по языку */
  language?: string;
  /** Поиск по заголовку */
  titleSearch?: string;
  /** ID разговора */
  conversationId?: string;
  /** Только нативные артефакты */
  nativeOnly?: boolean;
}

export interface KnowledgeDocument {
  id: string;
  name: string;
  content: string;
  projectId: string;
  createdAt: Date;
}

export interface SyncResult {
  conversations: number;
  messages: number;
  artifacts: number;
  documents: number;
  errors: string[];
}

export interface ProviderConfig {
  type: string;
  enabled: boolean;
  options: Record<string, unknown>;
}

/**
 * Базовый интерфейс провайдера данных
 */
export interface DataProvider {
  /** Название провайдера */
  readonly name: string;
  
  /** Тип провайдера */
  readonly type: string;
  
  /** Инициализация провайдера */
  initialize(): Promise<void>;
  
  /** Проверка доступности */
  isAvailable(): Promise<boolean>;
  
  /** Получение списка проектов */
  getProjects(): Promise<Project[]>;
  
  /** Получение проекта по ID */
  getProject(projectId: string): Promise<Project | null>;
  
  /** Получение разговоров проекта */
  getConversations(projectId?: string): Promise<Conversation[]>;
  
  /** Получение конкретного разговора */
  getConversation(conversationId: string): Promise<Conversation | null>;
  
  /** Получение артефактов */
  getArtifacts(conversationId?: string): Promise<Artifact[]>;
  
  /** Получение документов проекта (knowledge base) */
  getKnowledgeDocuments(projectId: string): Promise<KnowledgeDocument[]>;
  
  /** Синхронизация данных (для провайдеров с кэшированием) */
  sync(): Promise<SyncResult>;
  
  /** Закрытие соединений */
  close(): Promise<void>;
}

/**
 * Фабрика провайдеров
 */
export type ProviderFactory = (config: ProviderConfig) => DataProvider;
