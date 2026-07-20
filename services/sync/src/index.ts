/**
 * Project Knowledge MCP Server
 *
 * Обеспечивает доступ Claude Code к знаниям проекта через:
 * - Семантический поиск (Qdrant)
 * - Графовые запросы (Memgraph)
 * - Ресурсы проекта (документы, артефакты, чаты)
 */

import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { createLogger } from "./utils/logger.js";
import { QdrantService } from "./services/qdrant.js";
import { MemgraphService } from "./services/memgraph.js";
import { EmbeddingService } from "./services/embedding.js";
import { KnowledgeStore } from "./services/knowledge-store.js";
import { ClaudeMessagingService } from "./services/claude-messaging-service.js";
import { ClaudeApiMessagingService } from "./services/claude-api-messaging-service.js";
import { GeminiMessagingService } from "./services/gemini-messaging-service.js";
import { MessagingProviderManager } from "./services/messaging-provider-manager.js";
import { getMessagingToolDefinitions, handleMessagingToolCall } from "./tools/messaging-tools.js";
import { getPipelineToolDefinitions, handlePipelineToolCall } from "./tools/pipeline-tools.js";
import { getFlowdeskAdminToolDefinitions, handleFlowdeskAdminToolCall } from "./tools/flowdesk-admin-tools.js";
import { config } from "./config/index.js";
import { LlamaProvider } from "./providers/llama-provider.js";
import { GeminiProvider } from "./providers/gemini-provider.js";
import { ClaudeProvider } from "./providers/claude-provider.js";
import { ClaudeApiProvider } from "./providers/claude-api-provider.js";
import { ModelRouterService } from "./services/model-router.js";

const logger = createLogger("mcp-server");

// Инициализация сервисов
const qdrantService = new QdrantService(config.qdrant);
const memgraphService = new MemgraphService(config.memgraph);
const embeddingService = new EmbeddingService(config.tei);
const knowledgeStore = new KnowledgeStore(qdrantService, memgraphService, embeddingService);

// Initialize messaging service manager
const messagingManager = new MessagingProviderManager('claude');

// 1. Claude Provider (API or Web)
// Prefer Web API when a session key is configured, regardless of inherited ANTHROPIC_API_KEY.
const preferWebApi = !!config.claudeMessaging.sessionKey;
const useAnthropicApi = !preferWebApi && config.claudeApi.enabled && !!config.claudeApi.apiKey;
const claudeService = useAnthropicApi
  ? new ClaudeApiMessagingService({
    apiKey: config.claudeApi.apiKey!,
    model: config.claudeApi.model
  })
  : new ClaudeMessagingService(config.claudeMessaging);

messagingManager.registerProvider('claude', claudeService);

// 2. Gemini Provider
if (config.geminiApi.enabled && config.geminiApi.apiKey) {
  const geminiService = new GeminiMessagingService({
    apiKey: config.geminiApi.apiKey,
    model: config.geminiApi.model
  });
  messagingManager.registerProvider('gemini', geminiService);
  logger.info({ model: config.geminiApi.model }, 'Gemini messaging provider registered');
}

logger.info({
  messagingType: useAnthropicApi ? 'Anthropic API' : 'Web API',
  claudeModel: useAnthropicApi ? config.claudeApi.model : 'N/A',
  geminiEnabled: config.geminiApi.enabled
}, 'Messaging services initialized');

// Initialize Claude API provider for artifact reading (uses Web API)
let claudeApiProvider: ClaudeApiProvider | null = null;
if (config.claudeMessaging.sessionKey && config.claudeMessaging.organizationId) {
  claudeApiProvider = new ClaudeApiProvider({
    type: 'claude-api',
    enabled: true,
    options: {
      sessionKey: config.claudeMessaging.sessionKey,
      organizationId: config.claudeMessaging.organizationId,
      projectId: config.claudeMessaging.projectId
    }
  });
  logger.info('Claude API provider initialized for artifact reading');
}

// Инициализация LLM-провайдеров
const llmProviders = [
  new LlamaProvider(),
  new GeminiProvider(),
  new ClaudeProvider()
];

// Инициализация маршрутизатора моделей
const modelRouter = new ModelRouterService(llmProviders);

// Создание MCP сервера
const server = new Server(
  {
    name: config.mcp.serverName,
    version: config.mcp.serverVersion,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ============================================================
// TOOLS - Инструменты для Claude Code
// ============================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Get messaging tools
  // Пример использования маршрутизатора моделей
  // const provider = await modelRouter.routeTask({ type: 'generation', text: 'Hello', complexity: 'low' });
  // const result = await provider.generate('Hello');
  const messagingTools = getMessagingToolDefinitions();
  const pipelineTools = getPipelineToolDefinitions();
  const flowdeskAdminTools = getFlowdeskAdminToolDefinitions();

  return {
    tools: [
      // Messaging tools for inter-agent communication
      ...messagingTools,

      // Pipeline + Entity Store tools
      ...pipelineTools,

      // FlowDesk Chat Admin tools (Chat V2 ↔ Altiora session observability)
      ...flowdeskAdminTools,

      // Knowledge base tools
      // 1. Семантический поиск по знаниям
      {
        name: "search_knowledge",
        description: `Семантический поиск по базе знаний проекта. 
          Используй для поиска релевантной информации по смыслу, а не по ключевым словам.
          Возвращает наиболее релевантные фрагменты с указанием источника.`,
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Поисковый запрос на естественном языке"
            },
            limit: {
              type: "number",
              description: "Максимальное количество результатов (по умолчанию 5)",
              default: 5
            },
            filter: {
              type: "object",
              description: "Фильтр по метаданным",
              properties: {
                source_type: {
                  type: "string",
                  enum: ["chat", "artifact", "document", "instruction"],
                  description: "Тип источника"
                },
                date_from: {
                  type: "string",
                  description: "Дата от (ISO format)"
                },
                date_to: {
                  type: "string",
                  description: "Дата до (ISO format)"
                }
              }
            }
          },
          required: ["query"]
        }
      },

      // 2. Поиск связанных сущностей в графе
      {
        name: "find_related",
        description: `Поиск связанных сущностей через граф знаний.
          Используй для нахождения связей между концепциями, компонентами, решениями.`,
        inputSchema: {
          type: "object",
          properties: {
            entity: {
              type: "string",
              description: "Название сущности для поиска связей"
            },
            relation_type: {
              type: "string",
              description: "Тип связи (опционально)",
              enum: ["DEPENDS_ON", "IMPLEMENTS", "REFERENCES", "RELATES_TO", "PART_OF"]
            },
            depth: {
              type: "number",
              description: "Глубина обхода графа (по умолчанию 2)",
              default: 2
            }
          },
          required: ["entity"]
        }
      },

      // 3. Получение контекста проекта
      {
        name: "get_project_context",
        description: `Получить общий контекст проекта: инструкции, ключевые концепции, архитектурные решения.
          Используй в начале работы для понимания проекта.`,
        inputSchema: {
          type: "object",
          properties: {
            include_instructions: {
              type: "boolean",
              description: "Включить инструкции проекта",
              default: true
            },
            include_architecture: {
              type: "boolean",
              description: "Включить архитектурные решения",
              default: true
            },
            include_conventions: {
              type: "boolean",
              description: "Включить конвенции и стандарты",
              default: true
            }
          }
        }
      },

      // 4. Поиск артефактов
      {
        name: "find_artifacts",
        description: `Поиск артефактов (код, диаграммы, документы), созданных в Claude.ai проекте.`,
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Поисковый запрос"
            },
            type: {
              type: "string",
              enum: ["code", "diagram", "document", "react", "html", "svg", "mermaid"],
              description: "Тип артефакта"
            },
            language: {
              type: "string",
              description: "Язык программирования (для code)"
            }
          }
        }
      },

      // 5. Поиск по истории чатов
      {
        name: "search_chat_history",
        description: `Поиск по истории чатов проекта.
          Полезно для нахождения предыдущих обсуждений и решений.`,
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Поисковый запрос"
            },
            date_range: {
              type: "object",
              properties: {
                from: { type: "string" },
                to: { type: "string" }
              }
            },
            include_context: {
              type: "boolean",
              description: "Включить окружающий контекст сообщений",
              default: true
            }
          },
          required: ["query"]
        }
      },

      // 6. Cypher запросы к графу (для продвинутых случаев)
      {
        name: "query_knowledge_graph",
        description: `Выполнить Cypher запрос к графу знаний.
          Используй для сложных запросов к связям между сущностями.
          ВНИМАНИЕ: только для чтения, модифицирующие запросы отклоняются.`,
        inputSchema: {
          type: "object",
          properties: {
            cypher: {
              type: "string",
              description: "Cypher запрос (только MATCH, без CREATE/DELETE/SET)"
            }
          },
          required: ["cypher"]
        }
      },

      // 7. Добавление знаний (для обновления базы)
      {
        name: "add_knowledge",
        description: `Добавить новое знание в базу.
          Используй когда нужно сохранить важное решение или информацию.`,
        inputSchema: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "Содержимое знания"
            },
            title: {
              type: "string",
              description: "Заголовок"
            },
            type: {
              type: "string",
              enum: ["decision", "concept", "solution", "note", "reference"],
              description: "Тип знания"
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Теги для категоризации"
            },
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  target: { type: "string" },
                  type: { type: "string" }
                }
              },
              description: "Связи с другими сущностями"
            }
          },
          required: ["content", "title", "type"]
        }
      },

      // 8. Чтение артефактов из Claude.ai через неофициальный API
      {
        name: "read_artifact",
        description: `Прочитать артефакт из Claude.ai через неофициальный API.
          Поддерживает нативные артефакты Claude (MD файлы, код, React компоненты, SVG и др.).
          Можно искать по ID, типу или заголовку.`,
        inputSchema: {
          type: "object",
          properties: {
            artifact_id: {
              type: "string",
              description: "ID артефакта (если известен)"
            },
            conversation_id: {
              type: "string",
              description: "ID разговора для поиска артефакта"
            },
            type_filter: {
              type: "string",
              enum: [
                "text/markdown",
                "application/vnd.ant.react",
                "application/vnd.ant.code",
                "text/html",
                "image/svg+xml",
                "application/vnd.ant.mermaid",
                "document",
                "code",
                "react",
                "html",
                "svg",
                "mermaid"
              ],
              description: "Фильтр по типу артефакта (MIME тип или простой тип)"
            },
            title_search: {
              type: "string",
              description: "Поиск по заголовку артефакта (частичное совпадение)"
            },
            include_content: {
              type: "boolean",
              description: "Включить полное содержимое артефактов (по умолчанию true)",
              default: true
            },
            limit: {
              type: "number",
              description: "Максимальное количество результатов (по умолчанию 10)",
              default: 10
            }
          }
        }
      },

      // 9. Список артефактов из Claude.ai
      {
        name: "list_artifacts",
        description: `Получить список всех артефактов из Claude.ai разговоров.
          Возвращает метаданные артефактов без полного содержимого.`,
        inputSchema: {
          type: "object",
          properties: {
            conversation_id: {
              type: "string",
              description: "ID разговора (опционально, для фильтрации)"
            },
            type_filter: {
              type: "string",
              enum: ["document", "code", "react", "html", "svg", "mermaid"],
              description: "Фильтр по типу артефакта"
            },
            native_only: {
              type: "boolean",
              description: "Только нативные артефакты Claude (исключить код-блоки)",
              default: false
            }
          }
        }
      },

      // ── DevCollector tools ──────────────────────────────────────────────────

      // 10. Отчёт DevCollector: ранжированный список незавершённых задач
      {
        name: "devcollector_get_report",
        description: `Get the DevCollector open-tasks priority report.
          Returns the ranked list of all open/incomplete development tasks across all
          dialogue sessions, with importance rationale and inter-task dependencies.
          Use this to understand the current open work backlog and priorities.`,
        inputSchema: {
          type: "object",
          properties: {
            include_tasks: {
              type: "boolean",
              description: "Include full ranked task list (default true)",
              default: true
            }
          }
        }
      },

      // 11. Контекст конкретной сессии для задачи
      {
        name: "devcollector_get_session_context",
        description: `Get the full context of a dialogue session that a DevCollector task came from.
          Returns session metadata, goals, entities, and summary.
          Use the sessionId from a devcollector_get_report task entry.`,
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Session ID (from devcollector task.sessionId)"
            }
          },
          required: ["sessionId"]
        }
      },

      // 12. Список только открытых задач без полного отчёта
      {
        name: "devcollector_list_open_tasks",
        description: `Get a compact list of open development tasks from all sessions.
          Lighter than devcollector_get_report — returns just title, rank, sessionId, category, status.
          Useful for quick overview or when you need to pick which task to work on.`,
        inputSchema: {
          type: "object",
          properties: {
            status_filter: {
              type: "string",
              enum: ["in_progress", "pending", "blocked", "all"],
              description: "Filter by task status (default: all open)",
              default: "all"
            },
            limit: {
              type: "number",
              description: "Max tasks to return (default 20)",
              default: 20
            }
          }
        }
      },

      // 13. Получить pending-запрос анализа (данные для Claude Code)
      {
        name: "devcollector_get_analysis_request",
        description: `Get the current pending DevCollector analysis request.
          Returns the formatted session+task data that Claude Code should analyze and rank.
          After analyzing, call devcollector_submit_analysis with the result.
          Returns null if no pending request exists.`,
        inputSchema: { type: "object", properties: {} }
      },

      // 14. Отправить результат анализа от Claude Code
      {
        name: "devcollector_submit_analysis",
        description: `Submit the DevCollector analysis result produced by Claude Code.
          Saves the ranked task list and summary to Memgraph as the active report.
          Call this after devcollector_get_analysis_request and your own analysis.`,
        inputSchema: {
          type: "object",
          properties: {
            summary: {
              type: "string",
              description: "2-4 sentence overall summary of open tasks, themes, blockers, priorities"
            },
            tasks: {
              type: "array",
              description: "Ranked task list",
              items: {
                type: "object",
                properties: {
                  rank:            { type: "number" },
                  title:           { type: "string" },
                  description:     { type: "string" },
                  importance:      { type: "string" },
                  order_rationale: { type: "string" },
                  dependencies:    { type: "array", items: { type: "string" } },
                  sessionId:       { type: "string" },
                  sessionTitle:    { type: "string" },
                  category:        { type: "string", enum: ["bug_fix","feature","task","research","decision","analysis"] },
                  status:          { type: "string", enum: ["in_progress","pending","blocked"] }
                },
                required: ["rank","title","sessionId","category","status"]
              }
            },
            sessionCount:  { type: "number", description: "Number of sessions analyzed" },
            openTaskCount: { type: "number", description: "Total open tasks found" }
          },
          required: ["summary", "tasks"]
        }
      }
    ]
  };
});

// Обработчик вызовов инструментов
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  logger.info({ tool: name, args }, "Tool called");

  if (!args) {
    throw new Error("Missing required arguments");
  }

  try {
    // Handle messaging tools
    const messagingToolNames = ['send_agent_task', 'get_agent_task', 'list_agent_tasks', 'get_conversation', 'list_conversations', 'send_message_to_chat', 'get_messages_from_chat'];
    if (messagingToolNames.includes(name)) {
      return await handleMessagingToolCall(name, args, messagingManager);
    }

    // Handle pipeline + Entity Store tools
    const pipelineToolNames = ['pipeline_enqueue', 'pipeline_get_stats', 'pipeline_get_job_status', 'es_get_unprocessed_docrefs', 'es_get_stats'];
    if (pipelineToolNames.includes(name)) {
      return await handlePipelineToolCall(name, args as Record<string, unknown>, memgraphService);
    }

    // Handle FlowDesk Chat Admin tools (prefix-matched: ~28 endpoints)
    if (name.startsWith('flowdesk_admin_')) {
      return await handleFlowdeskAdminToolCall(name, args as Record<string, unknown>);
    }

    // Handle knowledge base tools
    switch (name) {
      case "search_knowledge": {
        const results = await knowledgeStore.semanticSearch(
          args.query as string,
          args.limit as number || 5,
          args.filter as Record<string, unknown>
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case "find_related": {
        const results = await knowledgeStore.findRelated(
          args.entity as string,
          args.relation_type as string,
          args.depth as number || 2
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case "get_project_context": {
        const context = await knowledgeStore.getProjectContext(
          args as { include_instructions?: boolean; include_architecture?: boolean; include_conventions?: boolean }
        );
        return {
          content: [
            {
              type: "text",
              text: context
            }
          ]
        };
      }

      case "find_artifacts": {
        const artifacts = await knowledgeStore.findArtifacts(
          args.query as string,
          args.type as string,
          args.language as string
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(artifacts, null, 2)
            }
          ]
        };
      }

      case "search_chat_history": {
        const history = await knowledgeStore.searchChatHistory(
          args.query as string,
          args.date_range as { from?: string; to?: string },
          args.include_context as boolean
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(history, null, 2)
            }
          ]
        };
      }

      case "query_knowledge_graph": {
        const cypher = args.cypher as string;
        // Безопасность: только MATCH запросы
        if (!/^\s*MATCH/i.test(cypher)) {
          throw new Error("Only MATCH queries are allowed for safety");
        }
        const results = await memgraphService.query(cypher);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      case "add_knowledge": {
        const id = await knowledgeStore.addKnowledge({
          content: args.content as string,
          title: args.title as string,
          type: args.type as string,
          tags: args.tags as string[],
          relations: args.relations as Array<{ target: string; type: string }>
        });
        return {
          content: [
            {
              type: "text",
              text: `Knowledge added with ID: ${id}`
            }
          ]
        };
      }

      case "read_artifact": {
        if (!claudeApiProvider) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Claude API provider not configured. Please set CLAUDE_SESSION_KEY and CLAUDE_ORGANIZATION_ID."
              }
            ],
            isError: true
          };
        }

        await claudeApiProvider.initialize();

        const artifactId = args.artifact_id as string | undefined;
        const conversationId = args.conversation_id as string | undefined;
        const typeFilter = args.type_filter as string | undefined;
        const titleSearch = args.title_search as string | undefined;
        const includeContent = args.include_content !== false;
        const limit = (args.limit as number) || 10;

        let artifacts: Awaited<ReturnType<typeof claudeApiProvider.getArtifacts>> = [];

        // Если указан ID артефакта - ищем конкретный
        if (artifactId) {
          const artifact = await claudeApiProvider.getArtifact(artifactId, conversationId);
          if (artifact) {
            artifacts = [artifact];
          }
        }
        // Если указан тип - фильтруем по типу
        else if (typeFilter) {
          artifacts = await claudeApiProvider.getArtifactsByType(
            typeFilter as any,
            conversationId
          );
        }
        // Если указан поиск по заголовку
        else if (titleSearch) {
          artifacts = await claudeApiProvider.searchArtifactsByTitle(
            titleSearch,
            conversationId
          );
        }
        // Иначе - получаем все
        else {
          artifacts = await claudeApiProvider.getArtifacts(conversationId);
        }

        // Применяем лимит
        artifacts = artifacts.slice(0, limit);

        // Форматируем результат
        const result = artifacts.map(a => ({
          id: a.id,
          title: a.title,
          type: a.type,
          mimeType: a.mimeType,
          language: a.language,
          conversationId: a.conversationId,
          conversationName: a.conversationName,
          isNative: a.isNative,
          createdAt: a.createdAt,
          content: includeContent ? a.content : undefined,
          contentLength: a.content?.length
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: result.length,
                artifacts: result
              }, null, 2)
            }
          ]
        };
      }

      case "list_artifacts": {
        if (!claudeApiProvider) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Claude API provider not configured. Please set CLAUDE_SESSION_KEY and CLAUDE_ORGANIZATION_ID."
              }
            ],
            isError: true
          };
        }

        await claudeApiProvider.initialize();

        const conversationId = args.conversation_id as string | undefined;
        const typeFilter = args.type_filter as string | undefined;
        const nativeOnly = args.native_only as boolean || false;

        let artifacts = await claudeApiProvider.getArtifacts(conversationId);

        // Фильтрация по типу
        if (typeFilter) {
          artifacts = artifacts.filter(a => a.type === typeFilter);
        }

        // Только нативные
        if (nativeOnly) {
          artifacts = artifacts.filter(a => a.isNative);
        }

        // Форматируем результат (без содержимого)
        const result = artifacts.map(a => ({
          id: a.id,
          title: a.title,
          type: a.type,
          mimeType: a.mimeType,
          language: a.language,
          conversationId: a.conversationId,
          conversationName: a.conversationName,
          isNative: a.isNative,
          createdAt: a.createdAt,
          contentLength: a.content?.length
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                count: result.length,
                artifacts: result
              }, null, 2)
            }
          ]
        };
      }

      // ── DevCollector tools ────────────────────────────────────────────────────

      case "devcollector_get_report": {
        const includeTasks = args.include_tasks !== false;
        const rows = await memgraphService.query(
          `MATCH (r:DevCollectorReport {reportId: 'open-tasks-v1'})
           RETURN r.summary AS summary, r.rankedTasks AS rankedTasks,
                  r.model AS model, r.analyzedAt AS analyzedAt,
                  r.sessionCount AS sessionCount, r.openTaskCount AS openTaskCount`,
          {}
        );
        if (!rows[0]) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              success: false,
              message: "No DevCollector report found. Run analysis first via the DevCollector UI."
            }) }]
          };
        }
        const row = rows[0];
        let tasks: unknown[] = [];
        try { tasks = JSON.parse(row.rankedTasks as string || "[]"); } catch {}
        const report = {
          summary:       row.summary,
          model:         row.model,
          analyzedAt:    row.analyzedAt,
          sessionCount:  row.sessionCount,
          openTaskCount: row.openTaskCount,
          tasks:         includeTasks ? tasks : `${(tasks as unknown[]).length} tasks (set include_tasks=true to see full list)`,
        };
        return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
      }

      case "devcollector_get_session_context": {
        const sessionId = args.sessionId as string;
        if (!sessionId) throw new Error("sessionId is required");
        const rows = await memgraphService.query(
          `MATCH (s:DialogueSession {sessionId: $sid})
           RETURN s.sessionId AS sessionId, s.title AS title, s.summary AS summary,
                  s.goals AS goals, s.goalsSummary AS goalsSummary,
                  s.goalsProgress AS goalsProgress,
                  s.entities AS entities, s.startedAt AS startedAt,
                  s.platform AS platform, s.messageCount AS messageCount,
                  s.sourceFile AS sourceFile`,
          { sid: sessionId }
        );
        if (!rows[0]) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "Session not found", sessionId }) }] };
        }
        const s = rows[0];
        let goals: unknown[] = [];
        let entities: unknown[] = [];
        try { goals   = JSON.parse(s.goals   as string || "[]"); } catch {}
        try { entities = JSON.parse(s.entities as string || "[]"); } catch {}
        const context = {
          sessionId:    s.sessionId,
          title:        s.title,
          summary:      s.summary,
          goalsSummary: s.goalsSummary,
          goalsProgress:s.goalsProgress,
          platform:     s.platform,
          messageCount: s.messageCount,
          startedAt:    s.startedAt,
          goals,
          entities,
        };
        return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
      }

      case "devcollector_list_open_tasks": {
        const statusFilter = (args.status_filter as string) || "all";
        const limit        = (args.limit as number) || 20;
        const rows = await memgraphService.query(
          `MATCH (r:DevCollectorReport {reportId: 'open-tasks-v1'})
           RETURN r.rankedTasks AS rankedTasks`,
          {}
        );
        if (!rows[0]) {
          return { content: [{ type: "text", text: JSON.stringify({ tasks: [], message: "No report available" }) }] };
        }
        let tasks: Record<string, unknown>[] = [];
        try { tasks = JSON.parse(rows[0].rankedTasks as string || "[]"); } catch {}
        if (statusFilter !== "all") {
          tasks = tasks.filter(t => t.status === statusFilter);
        }
        const compact = tasks.slice(0, limit).map(t => ({
          rank:         t.rank,
          title:        t.title,
          category:     t.category,
          status:       t.status,
          sessionId:    t.sessionId,
          sessionTitle: t.sessionTitle,
          importance:   t.importance,
        }));
        return { content: [{ type: "text", text: JSON.stringify({ count: compact.length, tasks: compact }, null, 2) }] };
      }

      case "devcollector_get_analysis_request": {
        const rows = await memgraphService.query(
          `MATCH (r:DevCollectorAnalysisRequest {requestId: 'current'})
           RETURN r.status AS status, r.formattedData AS formattedData,
                  r.sessionCount AS sessionCount, r.openTaskCount AS openTaskCount,
                  r.createdAt AS createdAt`,
          {}
        );
        if (!rows[0] || rows[0].status !== 'pending') {
          return { content: [{ type: "text", text: JSON.stringify({ request: null, message: "No pending analysis request" }) }] };
        }
        const r = rows[0];
        return { content: [{ type: "text", text: JSON.stringify({
          requestId:     'current',
          status:        r.status,
          sessionCount:  r.sessionCount,
          openTaskCount: r.openTaskCount,
          createdAt:     r.createdAt,
          formattedData: r.formattedData,
          instructions: [
            "1. Read formattedData — it contains all sessions with open tasks.",
            "2. Analyze and rank ALL tasks by priority (importance + dependencies + urgency).",
            "3. Call devcollector_submit_analysis with: summary (2-4 sentences), tasks[] (ranked list), sessionCount, openTaskCount.",
            "4. Each task needs: rank, title, description, importance, order_rationale, dependencies[], sessionId, sessionTitle, category, status."
          ]
        }, null, 2) }] };
      }

      case "devcollector_submit_analysis": {
        const { summary, tasks, sessionCount, openTaskCount } = args as any;
        if (!summary || !Array.isArray(tasks)) throw new Error('"summary" and "tasks" are required');

        const validCategories = new Set(['bug_fix','feature','task','research','decision','analysis']);
        const validStatuses   = new Set(['in_progress','pending','blocked']);
        const normalizedTasks = (tasks as any[]).map((t: any, i: number) => ({
          rank:            t.rank            || i + 1,
          title:           t.title           || '',
          description:     t.description     || '',
          importance:      t.importance      || '',
          order_rationale: t.order_rationale || '',
          dependencies:    Array.isArray(t.dependencies) ? t.dependencies : [],
          sessionId:       t.sessionId       || '',
          sessionTitle:    t.sessionTitle    || '',
          category:        validCategories.has(t.category) ? t.category : 'task',
          status:          validStatuses.has(t.status) ? t.status : 'pending',
        }));

        const analyzedAt   = new Date().toISOString();
        const rankedTasks  = JSON.stringify(normalizedTasks);
        const sCount       = sessionCount || 0;
        const oCount       = openTaskCount || normalizedTasks.length;

        await memgraphService.query(
          `MERGE (r:DevCollectorReport {reportId: 'open-tasks-v1'})
           SET r.namespace      = 'CORE',
               r.section        = 'DevCollector',
               r.summary        = $summary,
               r.rankedTasks    = $rankedTasks,
               r.model          = 'claude-code',
               r.analyzedAt     = $analyzedAt,
               r.sessionCount   = $sessionCount,
               r.openTaskCount  = $openTaskCount`,
          { summary, rankedTasks, analyzedAt, sessionCount: sCount, openTaskCount: oCount }
        );
        // Mark request as done
        await memgraphService.query(
          `MATCH (r:DevCollectorAnalysisRequest {requestId: 'current'}) SET r.status = 'done'`,
          {}
        ).catch(() => {});

        return { content: [{ type: "text", text: JSON.stringify({
          success:   true,
          analyzedAt,
          taskCount: normalizedTasks.length,
          message:   `Saved ${normalizedTasks.length} ranked tasks. Report is now active in DevCollector UI.`
        }, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error({ error, tool: name }, "Tool execution failed");
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
});

// ============================================================
// RESOURCES - Ресурсы проекта (для @ mentions в Claude Code)
// ============================================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resources = await knowledgeStore.listResources();

  return {
    resources: resources.map(r => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType
    }))
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  logger.info({ uri }, "Resource requested");

  const content = await knowledgeStore.readResource(uri);

  return {
    contents: [
      {
        uri,
        mimeType: content.mimeType,
        text: content.text
      }
    ]
  };
});

// ============================================================
// PROMPTS - Готовые промпты для типичных задач
// ============================================================

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "analyze_codebase",
        description: "Анализ кодовой базы проекта с учётом контекста",
        arguments: [
          {
            name: "focus_area",
            description: "Область фокуса анализа",
            required: false
          }
        ]
      },
      {
        name: "continue_from_chat",
        description: "Продолжить работу с контекстом из чата Claude.ai",
        arguments: [
          {
            name: "chat_query",
            description: "Запрос для поиска релевантного чата",
            required: true
          }
        ]
      },
      {
        name: "implement_from_artifact",
        description: "Реализовать код на основе артефакта из Claude.ai",
        arguments: [
          {
            name: "artifact_query",
            description: "Запрос для поиска артефакта",
            required: true
          }
        ]
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "analyze_codebase": {
      const context = await knowledgeStore.getProjectContext({
        include_instructions: true,
        include_architecture: true,
        include_conventions: true
      });

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Проанализируй кодовую базу проекта.

## Контекст проекта:
${context}

## Фокус анализа:
${args?.focus_area || "Общий анализ архитектуры и качества кода"}

Предоставь детальный анализ с рекомендациями.`
            }
          }
        ]
      };
    }

    case "continue_from_chat": {
      const chatHistory = await knowledgeStore.searchChatHistory(
        args?.chat_query as string || "",
        undefined,
        true
      );

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Продолжи работу с учётом предыдущего обсуждения.

## Релевантная история чата:
${JSON.stringify(chatHistory, null, 2)}

Учти контекст обсуждения и продолжи работу.`
            }
          }
        ]
      };
    }

    case "implement_from_artifact": {
      const artifacts = await knowledgeStore.findArtifacts(
        args?.artifact_query as string || "",
        undefined,
        undefined
      );

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Реализуй функциональность на основе артефакта.

## Найденные артефакты:
${JSON.stringify(artifacts, null, 2)}

Создай production-ready реализацию на основе этого прототипа.`
            }
          }
        ]
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// ============================================================
// ТРАНСПОРТ И ЗАПУСК
// ============================================================

async function main() {
  // Инициализация сервисов
  await qdrantService.initialize();
  await memgraphService.initialize();

  logger.info("Services initialized");

  const transport = config.mcp.transport;

  if (transport === "stdio") {
    // STDIO транспорт для локального запуска
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    logger.info("MCP Server running on STDIO");
  } else if (transport === "sse") {
    // SSE транспорт для Docker/remote
    const app = express();

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        services: {
          qdrant: qdrantService.isConnected(),
          memgraph: memgraphService.isConnected()
        }
      });
    });

    // SSE endpoint для MCP
    app.get("/sse", async (req, res) => {
      const sseTransport = new SSEServerTransport("/message", res);
      await server.connect(sseTransport);
    });

    app.post("/message", express.json(), async (req, res) => {
      // Handle incoming messages
      res.json({ received: true });
    });

    const port = config.mcp.port;
    app.listen(port, () => {
      logger.info({ port }, "MCP Server running on SSE");
    });

    // HTTP API на отдельном порту для мониторинга
    const httpApp = express();
    httpApp.use(express.json());

    // Enable CORS for React dashboard
    httpApp.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // 1. Health check endpoint
    httpApp.get("/health", async (req, res) => {
      try {
        const qdrantHealthy = qdrantService.isConnected();
        const memgraphHealthy = memgraphService.isConnected();

        // Check LLM providers health
        const providersHealth = await Promise.all(
          llmProviders.map(async (p) => {
            try {
              const healthy = await p.healthCheck?.() || false;
              return { name: p.name, healthy };
            } catch {
              return { name: p.name, healthy: false };
            }
          })
        );

        const allHealthy = qdrantHealthy && memgraphHealthy &&
          providersHealth.every(p => p.healthy);

        res.json({
          status: allHealthy ? "healthy" : "degraded",
          timestamp: new Date().toISOString(),
          services: {
            qdrant: qdrantHealthy,
            memgraph: memgraphHealthy,
            providers: providersHealth
          }
        });
      } catch (error) {
        res.status(500).json({
          status: "unhealthy",
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 2. Knowledge base statistics
    httpApp.get("/api/stats", async (req, res) => {
      try {
        const stats = await knowledgeStore.getStats();
        res.json(stats);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 3. Model router metrics
    httpApp.get("/api/metrics", async (req, res) => {
      try {
        const metrics = modelRouter.getMetrics();
        const totalCost = modelRouter.getTotalCost();
        const costByModel = modelRouter.getCostByModel();
        const taskDistribution = modelRouter.getTaskDistribution();

        res.json({
          totalTasks: metrics.length,
          totalCost,
          costByModel,
          taskDistribution,
          recentTasks: metrics.slice(-50) // Last 50 tasks
        });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 4. Clear metrics
    httpApp.post("/api/metrics/clear", (req, res) => {
      try {
        modelRouter.clearMetrics();
        res.json({ success: true, message: 'Metrics cleared' });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 5. Provider capabilities
    httpApp.get("/api/providers", async (req, res) => {
      try {
        const providersInfo = await Promise.all(
          llmProviders.map(async (p) => {
            const capabilities = await p.getCapabilities();
            return {
              name: p.name,
              capabilities
            };
          })
        );

        res.json({ providers: providersInfo });
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // 6. Queue status (placeholder for future worker queue)
    httpApp.get("/api/queue", (req, res) => {
      // TODO: Implement actual queue monitoring when worker queue is added
      res.json({
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        queue: []
      });
    });

    // 7. Recent logs/events stream (simple in-memory buffer)
    const recentEvents: Array<{ type: string, message: string, timestamp: string }> = [];
    const MAX_EVENTS = 100;

    // Helper to add events
    const addEvent = (type: string, message: string) => {
      recentEvents.push({
        type,
        message,
        timestamp: new Date().toISOString()
      });
      if (recentEvents.length > MAX_EVENTS) {
        recentEvents.shift();
      }
    };

    httpApp.get("/api/events", (req, res) => {
      res.json({ events: recentEvents });
    });

    // Log server start event
    addEvent('info', 'HTTP API server started');

    httpApp.listen(config.http.port, () => {
      logger.info({ port: config.http.port }, "HTTP API running");
      addEvent('info', `HTTP API listening on port ${config.http.port}`);
    });
  }
}

main().catch((error) => {
  logger.error({ error }, "Failed to start server");
  process.exit(1);
});
