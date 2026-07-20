/**
 * Artifact Parser
 *
 * Парсер для извлечения нативных артефактов Claude из ответов API.
 * Поддерживает формат <antArtifact> и различные типы контента.
 */

import { createLogger } from "./logger.js";

const logger = createLogger("artifact-parser");

/**
 * Типы артефактов Claude
 */
export type ArtifactMimeType =
  | "text/markdown"
  | "text/plain"
  | "text/html"
  | "application/vnd.ant.react"
  | "application/vnd.ant.code"
  | "application/vnd.ant.mermaid"
  | "image/svg+xml";

/**
 * Нативный артефакт Claude
 */
export interface ClaudeNativeArtifact {
  /** Уникальный идентификатор артефакта */
  identifier: string;
  /** MIME тип артефакта */
  type: ArtifactMimeType;
  /** Заголовок/название артефакта */
  title: string;
  /** Содержимое артефакта */
  content: string;
  /** Язык программирования (для code артефактов) */
  language?: string;
  /** Версия артефакта (если указана) */
  version?: string;
}

/**
 * Результат парсинга
 */
export interface ParseResult {
  /** Найденные артефакты */
  artifacts: ClaudeNativeArtifact[];
  /** Текст без артефактов */
  textWithoutArtifacts: string;
  /** Были ли найдены артефакты */
  hasArtifacts: boolean;
}

/**
 * Маппинг MIME типов в простые типы артефактов
 */
export function mapMimeTypeToArtifactType(mimeType: string): string {
  const mapping: Record<string, string> = {
    "text/markdown": "document",
    "text/plain": "text",
    "text/html": "html",
    "application/vnd.ant.react": "react",
    "application/vnd.ant.code": "code",
    "application/vnd.ant.mermaid": "mermaid",
    "image/svg+xml": "svg"
  };
  return mapping[mimeType] || "code";
}

/**
 * Определение языка из MIME типа или контента
 */
export function detectLanguage(mimeType: string, content: string): string | undefined {
  // Для React компонентов
  if (mimeType === "application/vnd.ant.react") {
    return content.includes("tsx") || content.includes(": React") ? "tsx" : "jsx";
  }

  // Для Mermaid
  if (mimeType === "application/vnd.ant.mermaid") {
    return "mermaid";
  }

  // Для SVG
  if (mimeType === "image/svg+xml") {
    return "svg";
  }

  // Для HTML
  if (mimeType === "text/html") {
    return "html";
  }

  // Для Markdown
  if (mimeType === "text/markdown") {
    return "markdown";
  }

  // Для кода - пытаемся определить по содержимому
  if (mimeType === "application/vnd.ant.code") {
    return detectCodeLanguage(content);
  }

  return undefined;
}

/**
 * Определение языка программирования по содержимому кода
 */
function detectCodeLanguage(content: string): string {
  const firstLine = content.split("\n")[0].trim();

  // Shebang
  if (firstLine.startsWith("#!")) {
    if (firstLine.includes("python")) return "python";
    if (firstLine.includes("node")) return "javascript";
    if (firstLine.includes("bash") || firstLine.includes("sh")) return "bash";
  }

  // TypeScript/JavaScript
  if (content.includes("interface ") || content.includes(": string") || content.includes(": number")) {
    return "typescript";
  }
  if (content.includes("const ") || content.includes("function ") || content.includes("=>")) {
    return "javascript";
  }

  // Python
  if (content.includes("def ") || content.includes("import ") && content.includes(":")) {
    return "python";
  }

  // Go
  if (content.includes("package ") && content.includes("func ")) {
    return "go";
  }

  // Rust
  if (content.includes("fn ") && content.includes("let ") && content.includes("->")) {
    return "rust";
  }

  // Java/Kotlin
  if (content.includes("public class ") || content.includes("private ")) {
    return "java";
  }

  // SQL
  if (content.toUpperCase().includes("SELECT ") || content.toUpperCase().includes("INSERT ")) {
    return "sql";
  }

  // YAML
  if (content.includes(": ") && !content.includes("{") && content.includes("\n  ")) {
    return "yaml";
  }

  // JSON
  if (content.trim().startsWith("{") || content.trim().startsWith("[")) {
    try {
      JSON.parse(content);
      return "json";
    } catch {
      // Not JSON
    }
  }

  return "text";
}

/**
 * Парсинг артефактов из текста ответа Claude
 *
 * Поддерживаемые форматы:
 * 1. <antArtifact identifier="..." type="..." title="...">content</antArtifact>
 * 2. <artifact identifier="..." type="..." title="...">content</artifact>
 * 3. Вложенные теги с атрибутами в разном порядке
 */
export function parseArtifactsFromText(text: string): ParseResult {
  const artifacts: ClaudeNativeArtifact[] = [];
  let textWithoutArtifacts = text;

  // Регулярное выражение для antArtifact тегов
  // Поддерживает атрибуты в любом порядке
  const antArtifactRegex = /<antArtifact([^>]*)>([\s\S]*?)<\/antArtifact>/gi;

  // Также проверяем формат <artifact> (альтернативный)
  const artifactRegex = /<artifact([^>]*)>([\s\S]*?)<\/artifact>/gi;

  // Парсим antArtifact теги
  let match;
  while ((match = antArtifactRegex.exec(text)) !== null) {
    const attributesStr = match[1];
    const content = match[2].trim();

    const artifact = parseArtifactAttributes(attributesStr, content);
    if (artifact) {
      artifacts.push(artifact);
      textWithoutArtifacts = textWithoutArtifacts.replace(match[0], "");
    }
  }

  // Парсим artifact теги (fallback)
  while ((match = artifactRegex.exec(text)) !== null) {
    const attributesStr = match[1];
    const content = match[2].trim();

    const artifact = parseArtifactAttributes(attributesStr, content);
    if (artifact) {
      // Избегаем дубликатов
      if (!artifacts.some(a => a.identifier === artifact.identifier)) {
        artifacts.push(artifact);
        textWithoutArtifacts = textWithoutArtifacts.replace(match[0], "");
      }
    }
  }

  if (artifacts.length > 0) {
    logger.debug({ count: artifacts.length }, "Artifacts parsed from text");
  }

  return {
    artifacts,
    textWithoutArtifacts: textWithoutArtifacts.trim(),
    hasArtifacts: artifacts.length > 0
  };
}

/**
 * Парсинг атрибутов артефакта из строки
 */
function parseArtifactAttributes(attributesStr: string, content: string): ClaudeNativeArtifact | null {
  // Извлекаем атрибуты
  const identifierMatch = /identifier\s*=\s*["']([^"']+)["']/i.exec(attributesStr);
  const typeMatch = /type\s*=\s*["']([^"']+)["']/i.exec(attributesStr);
  const titleMatch = /title\s*=\s*["']([^"']+)["']/i.exec(attributesStr);
  const languageMatch = /language\s*=\s*["']([^"']+)["']/i.exec(attributesStr);
  const versionMatch = /version\s*=\s*["']([^"']+)["']/i.exec(attributesStr);

  // identifier обязателен
  if (!identifierMatch) {
    logger.warn({ attributes: attributesStr }, "Artifact missing identifier");
    return null;
  }

  const identifier = identifierMatch[1];
  const type = (typeMatch?.[1] || "text/plain") as ArtifactMimeType;
  const title = titleMatch?.[1] || `Artifact ${identifier}`;
  const language = languageMatch?.[1] || detectLanguage(type, content);
  const version = versionMatch?.[1];

  return {
    identifier,
    type,
    title,
    content,
    language,
    version
  };
}

/**
 * Парсинг артефактов из SSE потока Claude
 *
 * Claude может отправлять артефакты в SSE событиях:
 * - content_block_start с типом "artifact"
 * - content_block_delta с контентом
 * - content_block_stop
 */
export function parseArtifactsFromSSE(sseData: string): ParseResult {
  const artifacts: ClaudeNativeArtifact[] = [];
  const textParts: string[] = [];

  const lines = sseData.split("\n");
  let currentArtifact: Partial<ClaudeNativeArtifact> | null = null;
  let artifactContent: string[] = [];

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;

    try {
      const data = JSON.parse(line.substring(6));

      // Начало блока артефакта
      if (data.type === "content_block_start" && data.content_block?.type === "artifact") {
        currentArtifact = {
          identifier: data.content_block.id || `artifact_${Date.now()}`,
          type: data.content_block.artifact_type || "text/plain",
          title: data.content_block.title || "Untitled"
        };
        artifactContent = [];
      }

      // Дельта контента артефакта
      else if (data.type === "content_block_delta" && currentArtifact) {
        if (data.delta?.artifact_content) {
          artifactContent.push(data.delta.artifact_content);
        } else if (data.delta?.text && currentArtifact) {
          artifactContent.push(data.delta.text);
        }
      }

      // Конец блока артефакта
      else if (data.type === "content_block_stop" && currentArtifact) {
        const content = artifactContent.join("");
        artifacts.push({
          identifier: currentArtifact.identifier!,
          type: currentArtifact.type as ArtifactMimeType,
          title: currentArtifact.title!,
          content,
          language: detectLanguage(currentArtifact.type!, content)
        });
        currentArtifact = null;
        artifactContent = [];
      }

      // Обычный текст
      else if (data.type === "content_block_delta" && data.delta?.text && !currentArtifact) {
        textParts.push(data.delta.text);
      }

    } catch {
      // Пропускаем невалидные JSON строки
    }
  }

  // Также парсим текст на наличие встроенных артефактов
  const fullText = textParts.join("");
  const textParseResult = parseArtifactsFromText(fullText);

  // Объединяем результаты
  const allArtifacts = [...artifacts, ...textParseResult.artifacts];

  // Удаляем дубликаты по identifier
  const uniqueArtifacts = allArtifacts.filter((artifact, index, self) =>
    index === self.findIndex(a => a.identifier === artifact.identifier)
  );

  return {
    artifacts: uniqueArtifacts,
    textWithoutArtifacts: textParseResult.textWithoutArtifacts,
    hasArtifacts: uniqueArtifacts.length > 0
  };
}

/**
 * Извлечение артефактов из JSON ответа Claude API
 *
 * Проверяет различные форматы хранения артефактов в ответе
 */
export function parseArtifactsFromApiResponse(response: unknown): ClaudeNativeArtifact[] {
  const artifacts: ClaudeNativeArtifact[] = [];

  if (!response || typeof response !== "object") {
    return artifacts;
  }

  const data = response as Record<string, unknown>;

  // Проверяем массив content
  if (Array.isArray(data.content)) {
    for (const block of data.content) {
      if (typeof block === "object" && block !== null) {
        const blockData = block as Record<string, unknown>;

        // Блок типа "artifact"
        if (blockData.type === "artifact") {
          artifacts.push({
            identifier: (blockData.id || blockData.identifier || `artifact_${Date.now()}`) as string,
            type: (blockData.artifact_type || blockData.mime_type || "text/plain") as ArtifactMimeType,
            title: (blockData.title || "Untitled") as string,
            content: (blockData.content || blockData.text || "") as string,
            language: blockData.language as string | undefined
          });
        }

        // Блок типа "text" - проверяем на встроенные артефакты
        else if (blockData.type === "text" && typeof blockData.text === "string") {
          const parsed = parseArtifactsFromText(blockData.text);
          artifacts.push(...parsed.artifacts);
        }
      }
    }
  }

  // Проверяем поле text напрямую
  if (typeof data.text === "string") {
    const parsed = parseArtifactsFromText(data.text);
    artifacts.push(...parsed.artifacts);
  }

  // Проверяем поле artifacts
  if (Array.isArray(data.artifacts)) {
    for (const artifact of data.artifacts) {
      if (typeof artifact === "object" && artifact !== null) {
        const a = artifact as Record<string, unknown>;
        artifacts.push({
          identifier: (a.identifier || a.id || `artifact_${Date.now()}`) as string,
          type: (a.type || a.mime_type || "text/plain") as ArtifactMimeType,
          title: (a.title || "Untitled") as string,
          content: (a.content || "") as string,
          language: a.language as string | undefined
        });
      }
    }
  }

  return artifacts;
}

/**
 * Фильтрация артефактов по типу
 */
export function filterArtifactsByType(
  artifacts: ClaudeNativeArtifact[],
  typeFilter: string
): ClaudeNativeArtifact[] {
  return artifacts.filter(a => {
    // Точное совпадение MIME типа
    if (a.type === typeFilter) return true;

    // Совпадение по простому типу
    const simpleType = mapMimeTypeToArtifactType(a.type);
    if (simpleType === typeFilter) return true;

    // Частичное совпадение (например "markdown" для "text/markdown")
    if (a.type.includes(typeFilter)) return true;

    return false;
  });
}

/**
 * Поиск артефактов по заголовку
 */
export function searchArtifactsByTitle(
  artifacts: ClaudeNativeArtifact[],
  searchQuery: string
): ClaudeNativeArtifact[] {
  const query = searchQuery.toLowerCase();
  return artifacts.filter(a =>
    a.title.toLowerCase().includes(query)
  );
}
